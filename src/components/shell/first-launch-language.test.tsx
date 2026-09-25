import { describe, expect, it } from "bun:test";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { renderToStaticMarkup } from "react-dom/server";

import { fr } from "@/i18n/dictionary-fr";
import { CHOOSER_ARABIC } from "@/i18n/language-chooser-copy";
import type { Language } from "@/types/domain";
import { LanguageChoice } from "./FirstLaunchLanguage";

/**
 * The first-launch language chooser's markup (audit 2026-09-25, A10 and
 * A12): the choice is a radio group a screen reader can hear, and the gate
 * shows the wait for Arabic and its failure instead of closing on French.
 * Rendered through `react-dom/server` under a Radix dialog root (the portal
 * does not render on the server, so the gate's content is drawn directly).
 */

function draw(
  props: Partial<{ selected: Language; waiting: boolean; failed: boolean; rtl: boolean }> = {},
) {
  return renderToStaticMarkup(
    <DialogPrimitive.Root open>
      <LanguageChoice
        selected={props.selected ?? "fr"}
        onSelect={() => {}}
        waiting={props.waiting ?? false}
        failed={props.failed ?? false}
        rtl={props.rtl ?? false}
        onConfirm={() => {}}
      />
    </DialogPrimitive.Root>,
  );
}

/** Copy as `react-dom/server` writes it into the markup. */
const escaped = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
/** The opening tag of each radio, in document order. */
const radios = (html: string) => html.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

describe("the language chooser's selection semantics", () => {
  it("is one radio group named by the bilingual title", () => {
    const html = draw();
    const group = /<div[^>]*role="radiogroup"[^>]*>/.exec(html)?.[0] ?? "";
    expect(group).not.toBe("");
    const ids = attr(group, "aria-labelledby")?.split(" ") ?? [];
    expect(ids).toHaveLength(2);
    const named = ids.map((id) => new RegExp(`id="${id}">([^<]*)<`).exec(html)?.[1]);
    expect(named).toEqual([fr["language.choose_title"], CHOOSER_ARABIC["language.choose_title"]]);
  });

  it("checks the chosen tile and only it, and says so", () => {
    for (const selected of ["fr", "ar"] as const) {
      const tags = radios(draw({ selected }));
      expect(tags).toHaveLength(2);
      expect(tags.map((tag) => attr(tag, "aria-checked"))).toEqual(
        selected === "fr" ? ["true", "false"] : ["false", "true"],
      );
    }
  });

  it("puts the group's one tab stop on the chosen tile", () => {
    const tags = radios(draw({ selected: "ar" }));
    expect(tags.map((tag) => attr(tag, "tabindex"))).toEqual(["-1", "0"]);
  });

  it("tells a screen reader which language each tile is written in", () => {
    const tags = radios(draw());
    expect(tags.map((tag) => attr(tag, "lang"))).toEqual(["fr", "ar"]);
  });

  it("keeps the kit's visible focus ring on the tiles", () => {
    for (const tag of radios(draw())) {
      expect(attr(tag, "class")).toContain("focus-visible:ring-2");
    }
  });
});

describe("the language chooser while Arabic downloads, and when it fails", () => {
  const button = (html: string) => {
    const tags = html.match(/<button[^>]*>/g) ?? [];
    return tags.find((tag) => !tag.includes('role="radio"')) ?? "";
  };

  it("offers the plain choice when nothing is pending", () => {
    const html = draw({ selected: "ar" });
    expect(html).toContain(CHOOSER_ARABIC["language.continue"]);
    expect(html).not.toContain('role="alert"');
    expect(attr(button(html), "aria-disabled")).toBeUndefined();
    expect(html).toMatch(/<p role="status" class="sr-only"><\/p>/);
  });

  it("waits visibly and audibly, without dropping focus from the button", () => {
    const html = draw({ selected: "ar", waiting: true });
    const tag = button(html);
    expect(attr(tag, "aria-disabled")).toBe("true");
    expect(tag).not.toMatch(/\sdisabled=""/);
    expect(html).toContain(CHOOSER_ARABIC["language.arabic_loading"]);
    const status = /<p role="status"[^>]*>(.*?)<\/p>/.exec(html)?.[1] ?? "";
    expect(status).toContain(escaped(fr["language.arabic_loading"]));
    expect(status).toContain(CHOOSER_ARABIC["language.arabic_loading"]);
  });

  it("says Arabic failed in both languages and turns the button into a retry", () => {
    const html = draw({ selected: "ar", failed: true });
    const alert = /<div role="alert"[^>]*>([\s\S]*?)<\/div><\/div>/.exec(html)?.[1] ?? "";
    expect(alert).toContain(escaped(fr["language.arabic_failed"]));
    expect(alert).toContain(CHOOSER_ARABIC["language.arabic_failed"]);
    expect(alert).toContain('lang="ar"');
    expect(html).toContain(CHOOSER_ARABIC["state.retry"]);
    expect(html).not.toContain(CHOOSER_ARABIC["language.continue"]);
    expect(attr(button(html), "aria-disabled")).toBeUndefined();
  });

  it("names the retry in both languages, like the alert above it", () => {
    const html = draw({ selected: "ar", failed: true });
    const tag = button(html);
    // The button claims no language of its own; each word carries one.
    expect(attr(tag, "lang")).toBeUndefined();
    const start = html.indexOf(tag) + tag.length;
    const label = html.slice(start, html.indexOf("</button>", start));
    expect(label).toContain(`<span lang="fr">${escaped(fr["state.retry"])}</span>`);
    expect(label).toContain(`<span lang="ar">${CHOOSER_ARABIC["state.retry"]}</span>`);
  });

  it("speaks the chosen tile's language on the button", () => {
    expect(attr(button(draw({ selected: "fr" })), "lang")).toBe("fr");
    expect(button(draw({ selected: "fr" }))).toBeTruthy();
    expect(draw({ selected: "fr" })).toContain(fr["language.continue"]);
    expect(attr(button(draw({ selected: "ar" })), "lang")).toBe("ar");
  });
});
