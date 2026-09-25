import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { UiAlert, UiButton, UiIconButton } from "@/components/ui-kit";
import { fr } from "./dictionary-fr";
import { CHOOSER_ARABIC } from "./language-chooser-copy";
import { LanguageLoadNotice } from "./language-load-notice";

/**
 * The notice a returning reader gets when the Arabic dictionary did not
 * arrive (audit 2026-09-25, A10). The review of the first version found a
 * sonner toast that covered the whole top bar at 390px — the language
 * switcher included — with a 20px close button and a 24px action. Rendered
 * through `react-dom/server`; there is no DOM here.
 */

const draw = (retrying: boolean) =>
  renderToStaticMarkup(
    <LanguageLoadNotice retrying={retrying} onRetry={() => {}} onClose={() => {}} />,
  );

/** Copy as `react-dom/server` writes it into the markup. */
const escaped = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const classes = (tag: string) => new Set((attr(tag, "class") ?? "").split(/\s+/).filter(Boolean));
const buttons = (html: string) => html.match(/<button[^>]*>/g) ?? [];
/** The inside of the first element opened by `open`. */
const inside = (html: string, open: string) => {
  const start = html.indexOf(open);
  return start === -1 ? null : html.slice(start + open.length, html.indexOf("</div>", start));
};

describe("where the notice sits", () => {
  it("under the top bar and the live strip, not over them", () => {
    const outer = /^<div[^>]*>/.exec(draw(false))?.[0] ?? "";
    const outerClasses = classes(outer);
    expect(outerClasses.has("fixed")).toBe(true);
    expect(outerClasses.has("top-[calc(var(--topbar-h)+var(--livestrip-h)+0.5rem)]")).toBe(true);
    // Beside the card, the page takes the pointer.
    expect(outerClasses.has("pointer-events-none")).toBe(true);
  });
});

describe("the failure", () => {
  const html = draw(false);

  it("is an alert, in French and in Arabic, each in its own language", () => {
    const alert = inside(html, '<div role="alert">') ?? "";
    expect(alert).toContain(`lang="fr"`);
    expect(alert).toContain(escaped(fr["language.arabic_failed"]));
    expect(alert).toContain(`lang="ar"`);
    expect(alert).toContain(CHOOSER_ARABIC["language.arabic_failed"]);
    expect(inside(html, '<div role="status">')).toBe("");
  });

  it("offers Retry, named in both languages", () => {
    const retry = buttons(html)[0];
    expect(attr(retry, "aria-disabled")).toBeUndefined();
    const start = html.indexOf(retry) + retry.length;
    const label = html.slice(start, html.indexOf("</button>", start));
    expect(label).toContain(`<span lang="fr">${escaped(fr["state.retry"])}</span>`);
    expect(label).toContain(`<span lang="ar">${CHOOSER_ARABIC["state.retry"]}</span>`);
  });

  it("can be closed, the control named in both languages", () => {
    const close = buttons(html)[1];
    const start = html.indexOf(close) + close.length;
    const label = html.slice(start, html.indexOf("</button>", start));
    expect(label).toContain(`<span lang="fr">${escaped(fr["toast.close"])}</span>`);
    expect(label).toContain(`<span lang="ar">${CHOOSER_ARABIC["toast.close"]}</span>`);
  });
});

describe("the wait for a retry", () => {
  const html = draw(true);

  it("is a status in both languages, and the alert is emptied for the next failure", () => {
    const status = inside(html, '<div role="status">') ?? "";
    expect(status).toContain(escaped(fr["language.arabic_loading"]));
    expect(status).toContain(CHOOSER_ARABIC["language.arabic_loading"]);
    expect(inside(html, '<div role="alert">')).toBe("");
  });

  it("keeps Retry focusable but inert, rather than disabled", () => {
    const retry = buttons(html)[0];
    expect(attr(retry, "aria-disabled")).toBe("true");
    expect(retry).not.toMatch(/\sdisabled=""/);
  });
});

describe("the notice wears the kit, class for class", () => {
  // It cannot import the primitives (they import the provider that draws
  // it), so it copies their classes; these fail when the two drift. The
  // notice's buttons are never `disabled`, so those variants are left out.
  const kitClasses = (html: string, tag = /<button[^>]*>/) =>
    [...classes(tag.exec(html)?.[0] ?? "")].filter((name) => !name.startsWith("disabled:"));

  it('Retry is `UiButton variant="ink" size="sm"`, 44px on both axes', () => {
    const retry = classes(buttons(draw(false))[0]);
    const kit = kitClasses(
      renderToStaticMarkup(
        <UiButton variant="ink" size="sm">
          x
        </UiButton>,
      ),
    );
    expect(kit.filter((name) => !retry.has(name))).toEqual([]);
    expect(retry.has("min-h-[var(--ui-tap-min)]")).toBe(true);
    expect(retry.has("min-w-[var(--ui-tap-min)]")).toBe(true);
    expect(retry.has("focus-visible:ring-2")).toBe(true);
  });

  it('the close control is `UiIconButton variant="ghost"`, 44px on both axes', () => {
    const close = classes(buttons(draw(false))[1]);
    const kit = kitClasses(
      renderToStaticMarkup(
        <UiIconButton variant="ghost" aria-label="x">
          x
        </UiIconButton>,
      ),
    );
    expect(kit.filter((name) => !close.has(name))).toEqual([]);
    expect(close.has("min-h-[var(--ui-tap-min)]")).toBe(true);
    expect(close.has("min-w-[var(--ui-tap-min)]")).toBe(true);
  });

  it('the card is `UiAlert tone="negative"`', () => {
    const alert = renderToStaticMarkup(<UiAlert tone="negative">x</UiAlert>);
    const kitCard = /^<div[^>]*>/.exec(alert)?.[0] ?? "";
    const card = /^<div[^>]*><div[^>]*>/.exec(draw(false))?.[0].replace(/^<div[^>]*>/, "") ?? "";
    expect(attr(card, "style")).toBe(attr(kitCard, "style"));
    const cardClasses = classes(card);
    expect(kitClasses(alert, /^<div[^>]*>/).filter((name) => !cardClasses.has(name))).toEqual([]);
  });

  it("imports the kit's tokens, never its primitives", () => {
    const source = readFileSync(join(import.meta.dir, "language-load-notice.tsx"), "utf8");
    expect(source).toContain('from "@/components/ui-kit/tokens"');
    expect(source).not.toMatch(/from\s+["']@\/components\/ui-kit(?:\/primitives)?["']/);
  });
});
