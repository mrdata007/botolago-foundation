import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

import { cardCopy, curvaCopy, momentCopy } from "../copy";

/**
 * No banned word in anything this package renders (plan 2.5, both languages, the share picture and
 * the messages included): the dictionary values it reads, from the copy accessors it uses and from
 * the literal keys in its own sources.
 */

const BANNED_FR = [
  /\bpulls?\b/i,
  /\bpacks?\b/i,
  /level up/i,
  /monter de niveau/i,
  /d[ée]bloqu/i,
  /\btirages?\b/i,
  /\bchance\b/i,
  /r[ée]v[ée]lation/i,
  /\bofficiel/i,
  /\bsignature\b/i,
  /\bexclusi/i,
  /\brares?\b/i,
  /\blimit[é]e?s?\b/i,
  /\b[ée]ditions?\b/i,
  /\bvip\b/i,
  /derni[èe]re chance/i,
  /\bvite\b/i,
  /collectionn/i,
  /\bgagn/i,
  /classement des cartes/i,
  /meilleure carte/i,
  // The approved copy discipline: « terminées », never « jouées »; never « confirmée ».
  /journ[ée]es? jou[ée]es?/i,
  /confirm[ée]e?s?\b/i,
];
const BANNED_AR = [/رسمي/, /توقيع/, /محدود/, /حصري/, /نادر/, /مؤكَّد/, /مؤقت/];

/** Every key a copy accessor asks the dictionary for, by recording the calls. */
function keysOf(build: (t: (key: TranslationKey) => string) => unknown): Set<string> {
  const keys = new Set<string>();
  build((key) => {
    keys.add(key);
    return dictionaries.fr[key];
  });
  return keys;
}

const FILES = readdirSync(import.meta.dir).filter(
  (file) => /\.(ts|tsx)$/.test(file) && !/\.test\.|test-support/.test(file),
);
const literalKeys = (): Set<string> => {
  const keys = new Set<string>();
  for (const file of FILES) {
    const source = readFileSync(join(import.meta.dir, file), "utf8");
    for (const match of source.matchAll(/\bt\("([a-z0-9_.]+)"\)/g)) keys.add(match[1]!);
  }
  return keys;
};

function scanned(): Set<string> {
  const keys = new Set<string>();
  for (const set of [
    keysOf((t) => momentCopy(t)),
    keysOf((t) => cardCopy(t, "fr")),
    keysOf((t) => curvaCopy(t, "fr")),
    literalKeys(),
  ]) {
    for (const key of set) keys.add(key);
  }
  return keys;
}

describe("the words this package renders", () => {
  const keys = scanned();

  it("reads a real set of keys, all of them in both dictionaries", () => {
    expect(keys.size).toBeGreaterThan(80);
    for (const key of keys) {
      expect(key in dictionaries.fr).toBe(true);
      expect(key in dictionaries.ar).toBe(true);
    }
  });

  it("has no banned word in French", () => {
    const found: string[] = [];
    for (const key of keys) {
      const value = dictionaries.fr[key as TranslationKey];
      for (const pattern of BANNED_FR) if (pattern.test(value)) found.push(`${key}: ${value}`);
    }
    expect(found).toEqual([]);
  });

  it("has no banned word in Arabic", () => {
    const found: string[] = [];
    for (const key of keys) {
      const value = dictionaries.ar[key as TranslationKey];
      for (const pattern of BANNED_AR) if (pattern.test(value)) found.push(`${key}: ${value}`);
    }
    expect(found).toEqual([]);
  });

  it("promises nothing of a count, a rarity or a lock", () => {
    for (const lang of ["fr", "ar"] as const satisfies readonly Language[]) {
      for (const key of keys) {
        const value = dictionaries[lang][key as TranslationKey];
        expect(value).not.toMatch(/🔒|🔐|⏳/u);
      }
    }
  });
});

describe("the sources", () => {
  it("name no lock, padlock or sealed icon", () => {
    for (const file of FILES) {
      const source = readFileSync(join(import.meta.dir, file), "utf8");
      expect(source).not.toMatch(
        /\b(Lock|LockKeyhole|Padlock|HelpCircle|CircleHelp|Gift|Package)\b/,
      );
    }
  });
});
