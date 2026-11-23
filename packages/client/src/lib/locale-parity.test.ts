import { describe, expect, it } from "vitest";

import ar from "@/locales/ar.json";
import de from "@/locales/de.json";
import en from "@/locales/en.json";
import es from "@/locales/es.json";
import fr from "@/locales/fr.json";
import hi from "@/locales/hi.json";
import ja from "@/locales/ja.json";
import pt from "@/locales/pt.json";
import zh from "@/locales/zh.json";

type TranslationCatalog = Record<string, unknown>;

const catalogs = { ar, de, es, fr, hi, ja, pt, zh } satisfies Record<
  string,
  TranslationCatalog
>;

function flattenCatalog(
  value: TranslationCatalog,
  prefix = "",
  result: Record<string, unknown> = {},
): Record<string, unknown> {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      flattenCatalog(child as TranslationCatalog, path, result);
    } else {
      result[path] = child;
    }
  }
  return result;
}

function interpolationVariables(value: unknown): string[] {
  if (typeof value !== "string") return [];

  return Array.from(
    new Set(Array.from(value.matchAll(/{{\s*([^,}\s]+)/g), (match) => match[1])),
  ).sort();
}

const english = flattenCatalog(en);

describe("translation catalog parity", () => {
  for (const [language, catalog] of Object.entries(catalogs)) {
    it(`${language} contains every English translation key`, () => {
      const translated = flattenCatalog(catalog);
      const missingKeys = Object.keys(english).filter((key) => !(key in translated));

      expect(missingKeys, `Missing ${language} translations`).toEqual([]);
    });

    it(`${language} preserves interpolation variables`, () => {
      const translated = flattenCatalog(catalog);
      const mismatches = Object.entries(english).flatMap(([key, value]) => {
        if (!(key in translated)) return [];

        const expected = interpolationVariables(value);
        const actual = interpolationVariables(translated[key]);
        return expected.join("|") === actual.join("|")
          ? []
          : [{ key, expected, actual }];
      });

      expect(mismatches, `Invalid ${language} interpolation variables`).toEqual([]);
    });
  }
});
