import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

import { dictionaries } from "@/i18n/dictionaries";

/**
 * The two documents are only useful if a reader can reach them. Three places
 * have to link to them: the register consent checkbox, the login notice, and
 * the Profile page.
 *
 * The register and login sentences are rendered by `ConsentLine` from segments
 * built in `consent-segments.ts`, whose own test proves both languages produce
 * a `/terms` link and a `/privacy` link. What is left to pin here is the
 * wiring: that these routes actually use it, and that the flat single-string
 * consent keys it replaced are really gone — a leftover translation call on
 * one of those old keys would render the sentence with no links at all and
 * look entirely normal.
 */

function read(file: string): string {
  return readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
}

/** Every string literal in a file, so comments can never satisfy an assertion. */
function literals(file: string): string[] {
  const source = read(file);
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return out;
}

describe("the consent sentences are wired to the linking renderer", () => {
  it.each([
    ["auth.register.tsx", "registerConsentSegments"],
    ["auth.register.tsx", "noticeConsentSegments"],
    ["auth.login.tsx", "noticeConsentSegments"],
  ])("%s renders %s through ConsentLine", (file, builder) => {
    const source = read(file);
    expect(source).toContain("ConsentLine");
    expect(source).toContain(`${builder}(t)`);
  });

  it.each(["auth.register.tsx", "auth.login.tsx"])(
    "%s no longer renders a flat, unlinked consent string",
    (file) => {
      // The pre-split keys. If either comes back, the sentence renders as
      // plain text and the links quietly disappear.
      for (const dead of ["auth.register.accept_terms", "auth.terms_notice"]) {
        expect(literals(file)).not.toContain(dead);
      }
    },
  );

  it("removed those flat keys from both dictionaries rather than leaving them behind", () => {
    for (const lang of ["fr", "ar"] as const) {
      const keys = Object.keys(dictionaries[lang]);
      expect(keys).not.toContain("auth.register.accept_terms");
      expect(keys).not.toContain("auth.terms_notice");
    }
  });
});

describe("/profile links to both documents", () => {
  const source = read("profile.tsx");

  it("has a legal section using the same Group chrome as the sections above it", () => {
    expect(source).toContain('t("profile.section.legal")');
    // Rendered through the page's own `Group`, not a bespoke card, so it
    // matches the Personal / Preferences / Security sections.
    expect(source).toMatch(/<Group title=\{t\("profile\.section\.legal"\)\}>/);
  });

  it.each([
    ["/terms", "profile.legal.terms"],
    ["/privacy", "profile.legal.privacy"],
  ])("links to %s with a translated label", (to, labelKey) => {
    expect(source).toMatch(new RegExp(`to="${to}"`));
    expect(literals("profile.tsx")).toContain(labelKey);
    for (const lang of ["fr", "ar"] as const) {
      expect((dictionaries[lang] as Record<string, string>)[labelKey]?.trim()).toBeTruthy();
    }
  });
});

describe("the legal routes themselves", () => {
  it.each([
    ["terms.tsx", "/terms", "legal.terms"],
    ["privacy.tsx", "/privacy", "legal.privacy"],
  ])("%s is a public route with per-language metadata", (file, path, metaPrefix) => {
    const source = read(file);
    expect(source).toContain(`createFileRoute("${path}")`);

    // Public: no auth gate of any kind. `beforeLoad` redirects and `useAuth`
    // are the two ways one would get added.
    expect(source).not.toContain("beforeLoad");
    expect(source).not.toContain("useAuth");

    // Title and description exist in both languages, and `head()` emits the
    // French pair — the server always renders `fr`, so that is the honest SSR
    // default; the reader's own language is applied after mount.
    for (const suffix of ["meta_title", "meta_description"]) {
      const key = `${metaPrefix}.${suffix}`;
      for (const lang of ["fr", "ar"] as const) {
        expect((dictionaries[lang] as Record<string, string>)[key]?.trim()).toBeTruthy();
      }
      expect(source).toContain(`fr["${key}"]`);
    }
    // The French dictionary itself: the route no longer imports both
    // languages (the Arabic one is loaded on demand).
    expect(source).toContain('import { fr } from "@/i18n/dictionary-fr"');
    expect(source).toContain('name: "description"');
  });
});
