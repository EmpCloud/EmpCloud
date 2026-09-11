import { describe, expect, it } from "vitest";
import { buildAssistantReportPdf } from "./assistant-report";

describe("assistant PDF report", () => {
  it("builds a branded PDF with a stable descriptive filename", async () => {
    const report = await buildAssistantReportPdf({
      question: "Get timesheet of Karan Tiwari for September 2026",
      answer: "## Timesheet\n\n- **September 11, 2026:** 4 hours, 8 minutes",
      generatedAt: new Date("2026-09-11T05:00:00Z"),
    });

    expect(report.filename).toBe("empcloud-get-timesheet-of-karan-tiwari-2026-09-11.pdf");
    expect(report.bytes.byteLength).toBeGreaterThan(1_000);
    expect(new TextDecoder().decode(report.bytes.slice(0, 8))).toBe("%PDF-1.3");
  });
});
