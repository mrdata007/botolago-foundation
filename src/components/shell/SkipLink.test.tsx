// Audit MOB-05 (Phase C, lane C4): a "skip to content" link is the first stop
// of the Tab order in every shell, and every shell's <main> is its target.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";

import { UiScreen } from "@/components/ui-kit";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { focusMainContent, MAIN_CONTENT_ID } from "@/lib/skip-link";
import { SkipLink } from "./SkipLink";

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function html(node: React.ReactNode): string {
  return renderToString(<I18nProvider>{node}</I18nProvider>).replace(/<!-- -->/g, "");
}

describe("the link", () => {
  const markup = html(<SkipLink />);

  it("is a link to the main target, in the reader's language", () => {
    expect(markup).toMatch(new RegExp(`<a[^>]*href="#${MAIN_CONTENT_ID}"`));
    expect(markup).toContain(dictionaries.fr["nav.skip_to_content"]);
  });

  it("is invisible until it has focus, then pinned without moving the layout", () => {
    expect(markup).toContain("sr-only");
    expect(markup).toContain("focus:not-sr-only");
    expect(markup).toContain("focus:fixed");
  });

  it("sits at the leading edge in both directions and clears the 44px floor", () => {
    expect(markup).toContain("focus:start-3");
    expect(markup).toContain("focus:min-h-[var(--ui-tap-min)]");
    expect(markup).not.toMatch(/(^|[\s"])(focus:)?(left|right|ml|mr|pl|pr)-/);
  });

  it("has the focus ring and a text colour that reads on its own surface", () => {
    expect(markup).toContain("focus-visible:ring-2");
    expect(markup).toContain("bg-[color:var(--ui-surface)]");
    expect(markup).toContain("text-[color:var(--ui-ink-fg)]");
  });

  it("has its words in both languages", () => {
    expect(dictionaries.fr["nav.skip_to_content"]).toBe("Aller au contenu");
    expect(dictionaries.ar["nav.skip_to_content"]).toBe("انتقل إلى المحتوى");
  });
});

describe("focusing the target", () => {
  it("focuses the element with the target id and says it did", () => {
    const asked: string[] = [];
    let focused = 0;
    const done = focusMainContent({
      getElementById: (id) => {
        asked.push(id);
        return { focus: () => (focused += 1) };
      },
    });
    expect(done).toBe(true);
    expect(asked).toEqual([MAIN_CONTENT_ID]);
    expect(focused).toBe(1);
  });

  it("leaves the link to its hash when the page has no target", () => {
    expect(focusMainContent({ getElementById: () => null })).toBe(false);
  });

  it("takes the click over only when there was something to focus", () => {
    const source = read("src/components/shell/SkipLink.tsx");
    expect(source).toContain("if (focusMainContent(document)) event.preventDefault();");
  });
});

describe("every shell has the link and the target", () => {
  it("the content column's <main> is focusable by script and not by Tab", () => {
    const markup = html(<UiScreen>page</UiScreen>);
    expect(markup).toMatch(new RegExp(`<main[^>]*id="${MAIN_CONTENT_ID}"[^>]*tabindex="-1"`));
  });

  it("does not draw a focus ring round the whole page when it is focused", () => {
    expect(html(<UiScreen>page</UiScreen>)).toContain("outline-none");
  });

  for (const [shell, file] of [
    ["AppShell", "src/components/shell/AppShell.tsx"],
    ["FantasyFrame", "src/components/fpl/FantasyFrame.tsx"],
    ["AuthShell", "src/components/auth/AuthShell.tsx"],
  ] as const) {
    it(`${shell} renders the link first, before its bars`, () => {
      const source = read(file);
      expect(source).toContain("<SkipLink />");
      // Before the first bar or background in the markup.
      const skip = source.indexOf("<SkipLink />");
      const next = Math.min(
        ...["<PageBackground", "<TopBar", "<StatusBarStrip"]
          .map((tag) => source.indexOf(tag, skip))
          .filter((at) => at > 0),
      );
      expect(skip).toBeGreaterThan(0);
      expect(next).toBeGreaterThan(skip);
    });
  }

  it("FantasyFrame's and AuthShell's <main> carry the same target", () => {
    for (const file of [
      "src/components/fpl/FantasyFrame.tsx",
      "src/components/auth/AuthShell.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("id={MAIN_CONTENT_ID}");
      expect(source).toContain("tabIndex={-1}");
    }
  });
});
