import { describe, expect, it } from "vitest";
import {
  buildSocialPrompt,
  composeOriginalPost,
  ensureMandatoryHashtags,
  mandatoryHashtagsForSchool,
  MIN_SOCIAL_BODY_CHARACTERS,
  normalizeHashtags,
  suggestedHashtagsForSchool,
} from "./social-prompt";

describe("social prompt", () => {
  it("normalizes and deduplicates mandatory hashtags", () => {
    expect(normalizeHashtags("Scuola, #Inclusione Scuola !male")).toEqual([
      "#Scuola",
      "#Inclusione",
    ]);
  });

  it("adds the institute and selected school hashtags", () => {
    expect(
      mandatoryHashtagsForSchool("infanzia", [
        "#ICBadiaTrecenta",
        "#scuolaprimaria",
        "#scuola",
      ]),
    ).toEqual(["#icbadiatrecenta", "#scuoladellinfanzia", "#scuola"]);
    expect(suggestedHashtagsForSchool("primaria")).toEqual([
      "#didattica",
      "#studenti",
      "#progetti",
      "#scuola",
    ]);
  });

  it("keeps title, description and school guidance", () => {
    const prompt = buildSocialPrompt({
      title: "Laboratorio",
      description: "Gli alunni hanno lavorato insieme.",
      schoolType: "primaria",
      tone: "coinvolgente",
      mandatoryHashtags: ["#icbadiatrecenta", "#scuolaprimaria"],
      preferredHashtags: ["#didattica", "#studenti"],
    });
    expect(prompt).toContain("Titolo: Laboratorio");
    expect(prompt).toContain("#icbadiatrecenta");
    expect(prompt).toContain("#scuolaprimaria");
    expect(prompt).toContain("#didattica #studenti");
    expect(prompt).toContain("Scuola primaria");
    expect(prompt).toContain("Facebook e Instagram");
    expect(prompt).toContain("una sola idea centrale");
    expect(prompt).toContain("Evita hashtag poco ricercati");
    expect(prompt).toContain("feedback e enhancedText");
    expect(prompt).toContain(
      `corpo descrittivo deve contenere almeno ${MIN_SOCIAL_BODY_CHARACTERS} caratteri`,
    );
    expect(prompt).toContain(
      "Nel conteggio non considerare il titolo né il blocco finale degli hashtag",
    );
  });

  it("appends only mandatory hashtags omitted by the model", () => {
    expect(
      ensureMandatoryHashtags("Una bella giornata! #Scuola", [
        "#Scuola",
        "#ICBadiaTrecenta",
      ]),
    ).toBe("Una bella giornata! #Scuola\n\n#ICBadiaTrecenta");
  });

  it("prepares the original text for submission without an AI response", () => {
    expect(
      composeOriginalPost(
        " Laboratorio ",
        " Gli alunni hanno lavorato insieme. ",
        ["#icbadiatrecenta", "#scuolaprimaria"],
        "#didattica #didattica",
      ),
    ).toBe(
      "Laboratorio\n\nGli alunni hanno lavorato insieme.\n\n#icbadiatrecenta #scuolaprimaria #didattica",
    );
  });
});
