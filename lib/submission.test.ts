import { describe, expect, it } from "vitest";
import {
  sanitizeAttachmentName,
  submissionMaxMb,
  submissionSchema,
} from "./submission";

describe("submission", () => {
  it("normalizza i nomi degli allegati", () => {
    expect(sanitizeAttachmentName("  foto gita è\r\n.jpg", 0)).toBe(
      "foto-gita-e-.jpg",
    );
    expect(sanitizeAttachmentName("...", 2)).toBe("allegato-3");
  });

  it("limita la configurazione delle dimensioni", () => {
    expect(submissionMaxMb("18")).toBe(18);
    expect(submissionMaxMb("0")).toBe(15);
    expect(submissionMaxMb("100")).toBe(15);
  });

  it("accetta solo una pubblicazione completa", () => {
    expect(
      submissionSchema.safeParse({
        title: "Laboratorio di scienze",
        text: "Un testo sufficientemente lungo per la pubblicazione.",
        platform: "both",
        tone: "coinvolgente",
      }).success,
    ).toBe(true);
    expect(
      submissionSchema.safeParse({
        title: "No",
        text: "troppo corto",
        platform: "altro",
        tone: "coinvolgente",
      }).success,
    ).toBe(false);
  });
});
