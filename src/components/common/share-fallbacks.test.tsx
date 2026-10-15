import { afterAll, describe, expect, it, mock } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

// `useI18n` answers in the language under test (the way the ranking's render
// test does it), so the Arabic render is really Arabic. The module is put back
// once the file is done (src/test-isolation.test.ts).
const realI18n = { ...(await import("@/i18n/provider")) };
let language: Language = "fr";
mock.module("@/i18n/provider", () => ({
  ...realI18n,
  useI18n: () => {
    const real = realI18n.useI18n();
    return {
      ...real,
      lang: language,
      dir: language === "ar" ? "rtl" : "ltr",
      t: (key: TranslationKey) => dictionaries[language][key],
    };
  },
}));
afterAll(() => {
  mock.module("@/i18n/provider", () => realI18n);
});

const { ManualCopyField } = await import("./ManualCopyField");
const { I18nProvider } = realI18n;

/**
 * D5 — every way of sharing says what happened. The tests have no DOM, so the
 * wiring is pinned at the source, like the other share tests; the helpers'
 * behaviour is in `src/lib/copy-text.test.ts`.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const SRC = join(ROOT, "src");

function code(path: string): string {
  return readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("the clipboard", () => {
  it("is reached only through copyText (the 2FA secret field aside, which is on screen)", () => {
    const direct = walk(SRC)
      .filter((file) => readFileSync(file, "utf8").includes("navigator.clipboard"))
      .map((file) => relative(SRC, file));
    expect(direct.sort()).toEqual(["lib/copy-text.ts", "routes/profile.security.tsx"]);
  });

  it("never shows 'copied' before the clipboard answered (the league code button)", () => {
    const source = code("src/components/fantasy/LeagueInviteCode.tsx");
    expect(source).not.toContain("void navigator");
    expect(source).toContain('if (await copyText(code)) toast.success(t("fpl.copied"));');
    expect(source).toContain('toast.error(t("fpl.copy_failed"))');
  });
});

describe("a copy that fails is said, with the text to copy by hand where it is not on screen", () => {
  const invites = [
    "src/components/fantasy/CreateLeagueInvite.tsx",
    "src/components/manager-card/moments/InviteFriends.tsx",
    "src/components/predictions/leagues/InviteLinkShare.tsx",
    "src/components/predictions/PredictionsShareButton.tsx",
    "src/components/common/ShareImageSheet.tsx",
    "src/components/manager-card/moments/ShareCardSheet.tsx",
  ];
  for (const path of invites) {
    it(`${path} shows ManualCopyField when copying fails`, () => {
      const source = code(path);
      expect(source).toContain("<ManualCopyField");
      expect(source).toContain("copyText(");
      // A refused clipboard is not a connection error, nor "une erreur".
      expect(source).not.toContain("predictions.save.offline");
    });
  }

  it("the picture sheets show the field's own sentence, not a toast as well", () => {
    for (const path of [
      "src/components/common/ShareImageSheet.tsx",
      "src/components/manager-card/moments/ShareCardSheet.tsx",
    ]) {
      expect(code(path)).not.toContain('toast.error(t("pepites.share.copy_failed"))');
    }
  });

  it("the page-level share buttons no longer swallow a failed copy", () => {
    for (const path of [
      "src/routes/news.$articleId.tsx",
      "src/routes/matches.$matchId.tsx",
      "src/components/fantasy-lists/ShareButton.tsx",
    ]) {
      const source = code(path);
      expect(source).toContain("shareLink(");
      expect(source).toContain('toast.error(t("pepites.share.copy_failed"))');
      expect(source).not.toContain("user cancelled or blocked");
    }
  });

  it("the Fantasy share button does not call a clipboard failure a connection error", () => {
    expect(code("src/components/fantasy-lists/ShareButton.tsx")).not.toContain(
      "fantasy.error.network",
    );
  });
});

describe("a shared page's address", () => {
  it("is the page without the sharer's campaign tags or fragment", () => {
    for (const path of [
      "src/routes/matches.$matchId.tsx",
      "src/components/fantasy-lists/ShareButton.tsx",
      "src/components/pepites/PepitesComparePage.tsx",
    ]) {
      expect(code(path)).toContain("shareablePageUrl(");
    }
  });
});

describe("the gameweek recap picture", () => {
  it("shows the alias the manager chose once the recap is public", () => {
    const source = code("src/components/fantasy/GameweekRecapCard.tsx");
    expect(source).toContain("teamName: publication?.alias ?? recap.teamName");
    expect(source).toContain("publication?.alias");
  });
});

describe("ManualCopyField", () => {
  const html = (lang: Language, value: string) => {
    language = lang;
    try {
      return renderToStaticMarkup(
        <I18nProvider>
          <ManualCopyField value={value} />
        </I18nProvider>,
      ).replace(/<!-- -->/g, "");
    } finally {
      language = "fr";
    }
  };
  const LINK = "https://botolago.com/pronostics/ligues/rejoindre#code=ABC";

  it("shows the sentence and a read-only field (direction follows the text) holding the text", () => {
    const out = html("fr", LINK);
    expect(out).toContain('data-testid="manual-copy"');
    expect(out).toContain(dictionaries.fr["pepites.share.copy_manual"]);
    expect(out).toMatch(/<input[^>]*readOnly=""|<input[^>]*readonly=""/);
    expect(out).toContain('dir="auto"');
    expect(out).toContain(LINK);
    expect(out).toContain(`aria-label="${dictionaries.fr["pepites.share.copy_manual_label"]}"`);
  });

  it("renders in Arabic: the Arabic sentence and label, not the French ones", () => {
    const out = html("ar", LINK);
    expect(out).toContain(dictionaries.ar["pepites.share.copy_manual"]);
    expect(out).toContain(`aria-label="${dictionaries.ar["pepites.share.copy_manual_label"]}"`);
    expect(out).not.toContain(dictionaries.fr["pepites.share.copy_manual"]);
    expect(out).toContain(LINK);
  });

  it("scrolls itself into view in a sheet that scrolls", () => {
    expect(code("src/components/common/ManualCopyField.tsx")).toContain(
      'field.scrollIntoView?.({ block: "nearest" })',
    );
  });

  it("has Arabic for every string it shows", () => {
    for (const key of [
      "pepites.share.copy_manual",
      "pepites.share.copy_manual_label",
      "fpl.copy_failed",
    ] as const) {
      expect(dictionaries.ar[key]).toBeTruthy();
      expect(dictionaries.ar[key]).not.toBe(dictionaries.fr[key]);
      expect(dictionaries.ar[key]).toMatch(/\p{Script=Arabic}/u);
    }
  });
});
