import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";

import { ManualCopyField } from "./ManualCopyField";

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
  const html = (lang: "fr" | "ar", value: string) =>
    renderToStaticMarkup(
      <I18nProvider>
        <ManualCopyField value={value} />
      </I18nProvider>,
    ).replace(/<!-- -->/g, "") + lang;

  it("shows the sentence and a read-only field (direction follows the text) holding the text", () => {
    const out = html("fr", "https://botolago.com/pronostics/ligues/rejoindre#code=ABC");
    expect(out).toContain('data-testid="manual-copy"');
    expect(out).toContain(dictionaries.fr["pepites.share.copy_manual"]);
    expect(out).toMatch(/<input[^>]*readOnly=""|<input[^>]*readonly=""/);
    expect(out).toContain('dir="auto"');
    expect(out).toContain("https://botolago.com/pronostics/ligues/rejoindre#code=ABC");
    expect(out).toContain(`aria-label="${dictionaries.fr["pepites.share.copy_manual_label"]}"`);
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
