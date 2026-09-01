import { describe, expect, it } from "vitest";
import {
  buildSocialPrompt,
  ensureMandatoryHashtags,
  normalizeHashtags,
} from "./social-prompt";

describe("social prompt", () => {
  it("normalizes and deduplicates mandatory hashtags", () => {
    expect(normalizeHashtags("Scuola, #Inclusione Scuola !male")).toEqual([
      "#Scuola",
      "#Inclusione",
    ]);
  });

  it("keeps title, description and mandatory hashtags", () => {
    const prompt = buildSocialPrompt({
      title: "Laboratorio",
      description: "Gli alunni hanno lavorato insieme.",
      platform: "both",
      tone: "coinvolgente",
      mandatoryHashtags: ["#ICBadiaTrecenta"],
    });
    expect(prompt).toContain("Titolo: Laboratorio");
    expect(prompt).toContain("#ICBadiaTrecenta");
    expect(prompt).toContain("Facebook e Instagram");
  });

  it("appends only mandatory hashtags omitted by the model", () => {
    expect(
      ensureMandatoryHashtags("Una bella giornata! #Scuola", [
        "#Scuola",
        "#ICBadiaTrecenta",
      ]),
    ).toBe("Una bella giornata! #Scuola\n\n#ICBadiaTrecenta");
  });
});
