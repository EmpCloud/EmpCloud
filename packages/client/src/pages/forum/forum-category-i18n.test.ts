import { describe, expect, it } from "vitest";
import {
  localizeForumCategoryDescription,
  localizeForumCategoryName,
} from "./forum-category-i18n";

const spanish: Record<string, string> = {
  "forum.defaultCategories.general.name": "General",
  "forum.defaultCategories.general.description": "Debates y conversaciones generales",
  "forum.defaultCategories.questions.name": "Preguntas",
  "forum.defaultCategories.questions.description": "Haz preguntas y recibe respuestas de tus compañeros",
};

const t = (key: string) => spanish[key] || key;

describe("forum category localization", () => {
  it("localizes seeded category names and descriptions", () => {
    expect(localizeForumCategoryName("Questions", t)).toBe("Preguntas");
    expect(localizeForumCategoryDescription("Ask questions and get answers from colleagues", t)).toBe(
      "Haz preguntas y recibe respuestas de tus compañeros",
    );
  });

  it("preserves organization-defined category content", () => {
    expect(localizeForumCategoryName("Engineering Guild", t)).toBe("Engineering Guild");
    expect(localizeForumCategoryDescription("Architecture discussions", t)).toBe("Architecture discussions");
  });

  it("matches seeded content without depending on capitalization or surrounding whitespace", () => {
    expect(localizeForumCategoryName("  GENERAL  ", t)).toBe("General");
    expect(localizeForumCategoryDescription(" General discussions and conversations ", t)).toBe(
      "Debates y conversaciones generales",
    );
  });
});
