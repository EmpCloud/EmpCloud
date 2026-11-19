type Translate = (key: string, options?: Record<string, unknown>) => string;

const DEFAULT_CATEGORY_NAMES: Record<string, string> = {
  general: "general",
  questions: "questions",
  ideas: "ideas",
  announcements: "announcements",
};

const DEFAULT_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "general discussions and conversations": "general",
  "ask questions and get answers from colleagues": "questions",
  "share ideas and suggestions for improvement": "ideas",
  "important announcements and updates": "announcements",
};

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en") : "";
}

export function localizeForumCategoryName(name: unknown, t: Translate) {
  const fallback = typeof name === "string" ? name : "";
  const key = DEFAULT_CATEGORY_NAMES[normalized(name)];
  return key ? t(`forum.defaultCategories.${key}.name`) : fallback;
}

export function localizeForumCategoryDescription(description: unknown, t: Translate) {
  const fallback = typeof description === "string" ? description : "";
  const key = DEFAULT_CATEGORY_DESCRIPTIONS[normalized(description)];
  return key ? t(`forum.defaultCategories.${key}.description`) : fallback;
}
