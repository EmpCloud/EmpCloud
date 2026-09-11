import { describe, expect, it } from "vitest";
import { assistantTextForSpeech, splitSpeechText, voiceLanguage } from "./assistant-voice";

describe("assistant voice helpers", () => {
  it("turns formatted assistant output into natural speech text", () => {
    const speech = assistantTextForSpeech([
      "## Attendance report",
      "",
      "- **Employee:** Karan Tiwari",
      "- [Open profile](https://example.com/employee/323)",
      "",
      "| Date | Check in | Check out |",
      "| --- | --- | --- |",
      "| 11 Sep | 09:00 | 18:00 |",
    ].join("\n"));

    expect(speech).toBe("Attendance report Employee: Karan Tiwari Open profile Date , Check in , Check out 11 Sep , 09:00 , 18:00");
    expect(speech).not.toMatch(/[*#|`]/);
  });

  it("splits long replies into bounded chunks for reliable browser playback", () => {
    const chunks = splitSpeechText(
      "Attendance is available for September. The employee checked in at nine and checked out at six.",
      48,
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 48)).toBe(true);
    expect(chunks.join(" ")).toContain("The employee checked in");
  });

  it("maps EmpCloud interface languages to speech locales", () => {
    expect(voiceLanguage("en")).toBe("en-IN");
    expect(voiceLanguage("hi")).toBe("hi-IN");
    expect(voiceLanguage("fr-FR")).toBe("fr-FR");
    expect(voiceLanguage("unknown")).toBe("en-IN");
  });
});
