import { expect, test } from "@playwright/test";

const FRONTEND = process.env.PLAYWRIGHT_BASE_URL || "https://test-empcloud.empcloud.com";
const API = process.env.EMPCLOUD_API_URL || "https://test-empcloud-api.empcloud.com/api/v1";
const EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@technova.in";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Admin@123";

test.describe("AI assistant API", () => {
  test("authenticates through the real login page and validates assistant input", async ({ page, request }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);

    const authenticatedRequest = page.waitForRequest((req) =>
      req.url().includes("/api/v1/") && Boolean(req.headers()["authorization"]),
    );
    await page.click('button[type="submit"]');
    const browserRequest = await authenticatedRequest;
    const authorization = browserRequest.headers()["authorization"];
    expect(authorization).toMatch(/^Bearer /);

    const response = await request.post(`${API}/assistant`, {
      headers: { Authorization: authorization },
      data: { message: "" },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
  });

  test("uses PDF download and hands-free voice mode in the assistant UI", async ({ page }) => {
    await page.addInitScript(() => {
      const voiceTest = { spokenTexts: [] as string[] };
      (window as any).__assistantVoiceTest = voiceTest;
      let recognitionStarts = 0;

      class MockSpeechRecognition {
        continuous = false;
        interimResults = false;
        lang = "";
        onstart: (() => void) | null = null;
        onresult: ((event: any) => void) | null = null;
        onerror: ((event: any) => void) | null = null;
        onend: (() => void) | null = null;

        start() {
          recognitionStarts += 1;
          this.onstart?.();
          if (recognitionStarts !== 1) return;
          setTimeout(() => {
            const result = Object.assign([{ transcript: "What is my leave balance?" }], { isFinal: true });
            this.onresult?.({ results: [result] });
          }, 0);
        }

        stop() {
          setTimeout(() => this.onend?.(), 0);
        }

        abort() {
          this.onend = null;
        }
      }

      class MockSpeechSynthesisUtterance {
        lang = "";
        rate = 1;
        pitch = 1;
        voice: SpeechSynthesisVoice | null = null;
        onend: (() => void) | null = null;
        onerror: ((event: { error: string }) => void) | null = null;

        constructor(public text: string) {}
      }

      Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: MockSpeechRecognition });
      Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: MockSpeechSynthesisUtterance });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          cancel() {},
          getVoices() { return []; },
          speak(utterance: MockSpeechSynthesisUtterance) {
            voiceTest.spokenTexts.push(utterance.text);
            setTimeout(() => utterance.onend?.(), 0);
          },
        },
      });
    });
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.endsWith("/login"));

    await page.route("**/api/v1/assistant/stream", async (route) => {
      const request = route.request();
      expect(request.postDataJSON()).toMatchObject({ message: "What is my leave balance?" });
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache" },
        body: [
          'event: conversation\ndata: {"conversation_id":101}\n\n',
          'event: status\ndata: {"tool":"get_leave_balance","message":"Fetching leave balances…"}\n\n',
          'event: delta\ndata: {"text":"You have 12 days "}\n\n',
          'event: delta\ndata: {"text":"of leave available."}\n\n',
          'event: done\ndata: {"conversation_id":101,"tools_used":["get_leave_balance"]}\n\n',
        ].join(""),
      });
    });
    await page.route("**/api/v1/assistant/conversations**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/conversations/101")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: {
            id: 101,
            title: "Leave balance",
            message_count: 2,
            updated_at: "2026-07-20T10:00:00.000Z",
            messages: [
              { id: 1, role: "user", content: "What is my leave balance?" },
              { id: 2, role: "assistant", content: "You have 12 days available." },
            ],
          } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: [{ id: 101, title: "Leave balance", message_count: 2, updated_at: "2026-07-20T10:00:00.000Z" }] }),
      });
    });

    await page.goto(`${FRONTEND}/assistant`);
    await expect(page.getByRole("heading", { name: "HR Assistant" })).toBeVisible();
    await expect(page.getByText("Leave balance", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Rename Leave balance" }).click();
    await expect(page.getByRole("dialog")).toContainText("Rename conversation");
    await expect(page.getByLabel("Conversation title")).toHaveValue("Leave balance");
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Delete Leave balance" }).click();
    await expect(page.getByRole("dialog")).toContainText("Delete conversation?");
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByText("Leave balance", { exact: true }).click();
    await expect(page.getByText("You have 12 days available.")).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download response as PDF" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^empcloud-what-is-my-leave-balance-\d{4}-\d{2}-\d{2}\.pdf$/);
    await page.getByRole("button", { name: "New chat" }).first().click();
    await expect(page.getByText("How can I help?")).toBeVisible();
    await page.getByRole("button", { name: "Start voice mode" }).click();
    await expect(page.getByText("What is my leave balance?", { exact: true }).last()).toBeVisible();
    await expect(page.getByText("You have 12 days of leave available.")).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__assistantVoiceTest.spokenTexts.join(" ")))
      .toContain("You have 12 days of leave available.");
    await expect(page.getByRole("button", { name: "Stop voice mode" })).toBeVisible();
    await page.getByRole("button", { name: "Stop voice mode" }).click();
    await expect(page.getByRole("button", { name: "Start voice mode" })).toBeVisible();
    await expect(page.getByLabel("Message HR Assistant")).toBeVisible();
  });
});
