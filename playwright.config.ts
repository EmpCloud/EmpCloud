import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5174",
    screenshot: "on",
    trace: "off",
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  outputDir: "./e2e/screenshots",
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
