import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { ui } from "@/components/ui-kit";

import { STATUS_BAR_INK, StatusBarStrip } from "./StatusBarStrip";

/**
 * With `viewport-fit=cover` an iPhone draws the page under the status bar and
 * the home indicator, so everything pinned to those edges has to pad by
 * `env(safe-area-inset-*)`. Only with `cover` does iOS report the real insets
 * (without it they are all 0), and only with it does Capacitor's Android
 * `SystemBars` draw the page edge to edge with the insets passed through.
 * Every inset is 0 on a screen without one, so the `max(env(...), fallback)`
 * padding keeps today's spacing there.
 *
 * Source-shape, because env() is 0 in every test browser; the measured checks
 * (Chromium's safe-area override) are in
 * docs/engineering/briefs/store-readiness-in-app.md and
 * docs/engineering/tasks/BG-0151/screen-brief.md. Chromium could not prove the
 * iOS gate anyway: it applies emulated insets whatever the meta says.
 *
 * The Landing page's sticky button showed how quietly a safe-area class can
 * go missing: it had `ui.safe.bottom` followed by `pb-3` in one `cn()`, and
 * class merging kept only the later `pb-3`. The bottom-edge scanner below
 * (BG-0151) catches that for every bar pinned to the bottom edge.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("safe areas", () => {
  test("the viewport covers the whole screen", () => {
    expect(read("src/routes/__root.tsx")).toContain(
      'content: "width=device-width, initial-scale=1, viewport-fit=cover"',
    );
  });

  test.each([
    // The shell's own bars, which already padded before this change.
    ["src/components/shell/TopBar.tsx", "ui.safe.top"],
    ["src/components/shell/BottomNav.tsx", "ui.safe.bottom"],
    ["src/components/ui-kit/primitives.tsx", "ui.safe.top"],
    // What this change added.
    ["src/components/ui/sonner.tsx", "calc(env(safe-area-inset-top, 0px) + 16px)"],
    ["src/components/common/ReadingProgress.tsx", "top-[env(safe-area-inset-top,0px)]"],
    ["src/routes/fantasy.players.$playerId.tsx", "pb-[max(env(safe-area-inset-bottom),0.75rem)]"],
    ["src/components/pepites/PepitesReveal.tsx", "pb-[max(env(safe-area-inset-bottom),1.5rem)]"],
    [
      "src/components/fpl/SquadBuilderScreen.tsx",
      "md:pb-[max(env(safe-area-inset-bottom),0.75rem)]",
    ],
    [
      "src/components/fpl/TransferConfirmScreen.tsx",
      "md:pb-[max(env(safe-area-inset-bottom),0.75rem)]",
    ],
    [
      "src/components/predictions/PredictionsStickyBar.tsx",
      "md:pb-[max(env(safe-area-inset-bottom),1rem)]",
    ],
    ["src/routes/fantasy.team.tsx", "md:pb-[max(env(safe-area-inset-bottom),1rem)]"],
    ["src/routes/fantasy.fixtures.tsx", "md:bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"],
  ])("%s pads by %s", (file, token) => {
    expect(read(file)).toContain(token);
  });

  test("sonner gets the inset on phones too, where it reads mobileOffset", () => {
    const sonner = read("src/components/ui/sonner.tsx");
    expect(sonner).toContain("offset={TOAST_OFFSET}");
    expect(sonner).toContain("mobileOffset={TOAST_OFFSET}");
  });
});

describe("BG-0151: the root viewport meta", () => {
  const root = read("src/routes/__root.tsx");
  const viewports = [...root.matchAll(/name:\s*"viewport",\s*content:\s*"([^"]*)"/g)].map(
    (m) => m[1],
  );

  test("is declared once, in the root route", () => {
    expect(viewports).toHaveLength(1);
    expect(viewports[0]).toBe("width=device-width, initial-scale=1, viewport-fit=cover");
  });

  test("is not overridden by any other route", () => {
    const glob = new Bun.Glob("**/*.tsx");
    const others = [...glob.scanSync({ cwd: join(ROOT, "src", "routes") })]
      .filter((file) => file !== "__root.tsx" && !file.includes(".test."))
      .filter((file) => /name:\s*"viewport"/.test(read(join("src", "routes", file))));
    expect(others).toEqual([]);
  });
});

describe("BG-0151: the landscape side letterbox", () => {
  const css = read("src/styles.css");
  const body = /\n {2}body \{([^}]*)\}/.exec(css)?.[1] ?? "";

  test("pads body on both sides by the larger side inset, so it is symmetric in Arabic too", () => {
    expect(body).toContain(
      "padding-inline: max(env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px));",
    );
    expect(body).not.toMatch(/padding-(left|right|inline-start|inline-end)\s*:/);
  });
});

/* ------------------------------------------------------------------------ */
/* Scanner: every element pinned to the bottom edge clears the home         */
/* indicator.                                                               */
/* ------------------------------------------------------------------------ */

/** A class token with its variant prefix split off (`md:pb-4` -> `md:`, `pb-4`). */
const splitVariant = (token: string) => {
  const at = token.lastIndexOf(":");
  return at === -1
    ? { variant: "", utility: token }
    : { variant: token.slice(0, at + 1), utility: token.slice(at + 1) };
};
const tokens = (text: string) => text.split(/\s+/).filter(Boolean);
const isBottom0 = (token: string) => splitVariant(token).utility === "bottom-0";
const isAbsolute = (token: string) => splitVariant(token).utility === "absolute";
const isSafeBottomClass = (token: string) =>
  /^p[by]?-\[.*safe-area-inset-bottom.*\]$/.test(splitVariant(token).utility);
/** A padding utility that would override a bottom padding written before it. */
const isBottomPadding = (token: string) => /^(pb|py|p)-/.test(splitVariant(token).utility);

/** One class "item" in source order: a string literal's tokens, or `ui.safe.bottom`. */
type Item = { pos: number; tokens: string[]; safeToken: boolean };

type Judged = { file: string; line: number; classes: string };
type Finding = Judged & { problem: string };

/**
 * Find every `bottom-0` class in a TSX source and judge the element it sits on.
 *
 * The element's classes are its `className` attribute (all of a `cn()` call's
 * arguments), or, outside an attribute, the enclosing `cn()`/`clsx()` call, or
 * the string itself (a `cva` variant). A group that says `absolute` is inside a
 * positioned box, not on the screen edge, and is skipped. Every other group
 * is treated as pinned — `fixed` or `sticky`, though the position may come
 * from elsewhere (a `cva` base, a wrapper) — and must carry `ui.safe.bottom` or
 * a `pb-[…safe-area-inset-bottom…]` class, with no later bottom padding in the
 * same variant to override it.
 */
function scanBottomEdge(file: string, source: string): { judged: Judged[]; findings: Finding[] } {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const groups = new Map<ts.Node, ts.Node[]>();

  const groupOf = (node: ts.Node): ts.Node => {
    let call: ts.Node | null = null;
    for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
      if (ts.isJsxAttribute(p)) {
        return p.name.getText() === "className" && p.initializer ? p.initializer : node;
      }
      if (
        !call &&
        ts.isCallExpression(p) &&
        ["cn", "clsx", "twMerge"].includes(p.expression.getText())
      ) {
        call = p;
      }
      if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isFunctionLike(p)) break;
    }
    return call ?? node;
  };

  const visit = (node: ts.Node) => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      tokens(node.text).some(isBottom0)
    ) {
      const group = groupOf(node);
      groups.set(group, [...(groups.get(group) ?? []), node]);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);

  const judged: Judged[] = [];
  const findings: Finding[] = [];
  for (const [group, hits] of groups) {
    const items: Item[] = [];
    const collect = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        items.push({ pos: node.getStart(), tokens: tokens(node.text), safeToken: false });
      } else if (ts.isPropertyAccessExpression(node) && node.getText() === "ui.safe.bottom") {
        items.push({ pos: node.getStart(), tokens: [], safeToken: true });
      }
      ts.forEachChild(node, collect);
    };
    collect(group);
    items.sort((a, b) => a.pos - b.pos);

    const all = items.flatMap((item) => item.tokens);
    if (all.some(isAbsolute)) continue;

    const first = hits[0] as ts.StringLiteral;
    const where = {
      file,
      line: tree.getLineAndCharacterOfPosition(first.getStart()).line + 1,
      classes: first.text,
    };
    judged.push(where);

    // Every treatment, with the variant it applies at and where it sits.
    const treatments: Array<{ index: number; at: number; variant: string }> = [];
    items.forEach((item, index) => {
      if (item.safeToken) treatments.push({ index, at: -1, variant: "" });
      item.tokens.forEach((token, at) => {
        if (isSafeBottomClass(token))
          treatments.push({ index, at, variant: splitVariant(token).variant });
      });
    });
    if (treatments.length === 0) {
      findings.push({ ...where, problem: "no safe-area-inset-bottom treatment" });
      continue;
    }
    for (const { index, at, variant } of treatments) {
      // Later in the same class string counts too: class merging keeps the last.
      const later = [
        ...items[index].tokens.slice(at + 1),
        ...items.slice(index + 1).flatMap((item) => item.tokens),
      ].filter(
        (token) =>
          isBottomPadding(token) &&
          !isSafeBottomClass(token) &&
          splitVariant(token).variant === variant,
      );
      if (later.length > 0) {
        findings.push({
          ...where,
          problem: `safe-area padding overridden by a later ${later.join(" ")} (class merging keeps the last)`,
        });
      }
    }
  }
  return { judged, findings };
}

/**
 * Pinned to the bottom edge without a treatment of their own, on purpose.
 * Each exception names why, and `holds` re-checks that reason in the file, so
 * the exception lapses (and the test fails) if the reason stops being true.
 */
const EXCEPTIONS: ReadonlyArray<{
  file: string;
  classes: string;
  reason: string;
  holds: (source: string) => boolean;
}> = [
  {
    file: "components/ui-kit/primitives.tsx",
    classes: "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh]",
    reason:
      "UiSheet's panel meets the bottom edge on purpose, its surface running under the home indicator; the scrolling body (no footer) and the footer each carry ui.safe.bottom.",
    holds: (source) =>
      source.includes("!footer && ui.safe.bottom") &&
      source.includes("ui.rule.blockStart, ui.safe.bottom"),
  },
  {
    file: "components/matches/GoalMoment.tsx",
    classes: "fixed inset-x-0 bottom-0 top-[var(--topbar-h)]",
    reason:
      "The goal takeover is a full-screen, tap-to-dismiss layer: its content is centred, so nothing sits on the home indicator.",
    holds: (source) => source.includes('"flex h-full flex-col items-center justify-center'),
  },
];

describe("BG-0151: the bottom-edge scanner itself", () => {
  const judge = (jsx: string) =>
    scanBottomEdge("sample.tsx", `const A = () => (${jsx});`).findings.map((f) => f.problem);

  test("flags a pinned bar with no treatment", () => {
    expect(judge(`<div className="fixed inset-x-0 bottom-0 pb-3" />`)).toEqual([
      "no safe-area-inset-bottom treatment",
    ]);
    expect(
      judge(`<div className="fixed bottom-[var(--bottomnav-h)] md:bottom-0 md:pb-4" />`),
    ).toHaveLength(1);
  });

  test("accepts ui.safe.bottom and a pb-[max(env(safe-area-inset-bottom),…)] class", () => {
    expect(judge(`<div className={cn("fixed inset-x-0 bottom-0", ui.safe.bottom)} />`)).toEqual([]);
    expect(
      judge(`<div className="sticky bottom-0 pb-[max(env(safe-area-inset-bottom),0.75rem)]" />`),
    ).toEqual([]);
    expect(
      judge(
        `<div className="fixed md:bottom-0 md:pb-[max(env(safe-area-inset-bottom),1rem)] pb-2.5" />`,
      ),
    ).toEqual([]);
  });

  test("flags the merge drop the Landing button had", () => {
    expect(
      judge(`<div className={cn("fixed inset-x-0 bottom-0", ui.safe.bottom, "pb-3 sm:hidden")} />`),
    ).toEqual(["safe-area padding overridden by a later pb-3 (class merging keeps the last)"]);
  });

  test("flags an override later in the same class string", () => {
    expect(
      judge(
        `<div className="fixed bottom-0 pb-[max(env(safe-area-inset-bottom),0.75rem)] pb-3" />`,
      ),
    ).toEqual(["safe-area padding overridden by a later pb-3 (class merging keeps the last)"]);
    expect(
      judge(
        `<div className={cn("fixed bottom-0 pb-[max(env(safe-area-inset-bottom),0.75rem)] pb-3")} />`,
      ),
    ).toHaveLength(1);
    // An earlier plain padding is the one that loses, so that is fine.
    expect(
      judge(
        `<div className="fixed bottom-0 pb-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]" />`,
      ),
    ).toEqual([]);
  });

  test("skips a bottom-0 inside a positioned box, and never reads comments", () => {
    expect(judge(`<span className="absolute inset-x-0 bottom-0 h-1" />`)).toEqual([]);
    expect(judge(`<div>{/* a "fixed bottom-0" note */}</div>`)).toEqual([]);
  });
});

describe("BG-0151: every element pinned to the bottom edge clears the home indicator", () => {
  const SRC = join(ROOT, "src");
  const files = [...new Bun.Glob("**/*.tsx").scanSync({ cwd: SRC })].filter(
    (file) => !file.includes(".test."),
  );
  const sources = new Map(files.map((file) => [file, readFileSync(join(SRC, file), "utf8")]));
  const results = files.map((file) => scanBottomEdge(file, sources.get(file)!));
  const judged = results.flatMap((r) => r.judged);
  const findings = results.flatMap((r) => r.findings);
  const exceptionFor = (f: Judged) =>
    EXCEPTIONS.find((e) => e.file === f.file && f.classes.startsWith(e.classes));

  test("judges the bars it is meant to judge", () => {
    // A scanner that finds nothing passes everything, so hold it to the bars
    // known when it was written (BG-0151). Drop a file from this list only
    // when its bar is gone.
    const known = [
      "components/shell/BottomNav.tsx",
      "components/ui/sheet.tsx",
      "components/ui-kit/primitives.tsx",
      "components/landing/LandingPage.tsx",
      "components/matches/GoalMoment.tsx",
      "components/predictions/PredictionsStickyBar.tsx",
      "components/fpl/SquadBuilderScreen.tsx",
      "components/fpl/TransferConfirmScreen.tsx",
      "routes/fantasy.team.tsx",
      "routes/fantasy.players.$playerId.tsx",
    ];
    const seen = new Set(judged.map((j) => j.file));
    expect(known.filter((file) => !seen.has(file))).toEqual([]);
    // And it does catch a real bar losing its treatment.
    const nav = sources.get("components/shell/BottomNav.tsx")!;
    expect(nav).toContain("ui.safe.bottom,");
    const stripped = scanBottomEdge("BottomNav.tsx", nav.replace("ui.safe.bottom,", ""));
    expect(stripped.findings.map((f) => f.problem)).toEqual([
      "no safe-area-inset-bottom treatment",
    ]);
  });

  test("every one carries ui.safe.bottom or a safe-area-inset-bottom padding", () => {
    const offenders = findings
      .filter((f) => !exceptionFor(f))
      .map((f) => `${f.file}:${f.line} ${f.problem}: "${f.classes}"`);
    expect(offenders).toEqual([]);
  });

  for (const exception of EXCEPTIONS) {
    test(`exception still holds: ${exception.file} (${exception.reason})`, () => {
      const hit = judged.find((j) => exceptionFor(j) === exception);
      const holds = exception.holds(sources.get(exception.file) ?? "");
      expect({ found: Boolean(hit), holds }).toEqual({ found: true, holds: true });
    });
  }
});

/* ------------------------------------------------------------------------ */
/* BG-0154: a status-bar strip on the screens whose top does not stick.     */
/* ------------------------------------------------------------------------ */

/** Every `<StatusBarStrip …/>` in a TSX source: its props as source text, and the element it sits in. */
function stripsIn(file: string, source: string) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Array<{
    props: Record<string, string>;
    firstChild: boolean;
    parentProps: Record<string, string>;
    siblings: string[];
  }> = [];
  const propsOf = (attributes: ts.JsxAttributes) =>
    Object.fromEntries(
      attributes.properties.filter(ts.isJsxAttribute).map((a) => {
        const init = a.initializer;
        const value = !init
          ? "true"
          : ts.isStringLiteral(init)
            ? init.text
            : (init.expression?.getText() ?? "");
        return [a.name.getText(), value];
      }),
    );
  const tagOf = (node: ts.JsxChild) =>
    ts.isJsxElement(node)
      ? node.openingElement.tagName.getText()
      : ts.isJsxSelfClosingElement(node)
        ? node.tagName.getText()
        : null;
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === "StatusBarStrip") {
      const parent = node.parent;
      if (ts.isJsxElement(parent) || ts.isJsxFragment(parent)) {
        const elements = parent.children.filter((child) => tagOf(child) !== null);
        found.push({
          props: propsOf(node.attributes),
          firstChild: elements[0] === node,
          parentProps: ts.isJsxElement(parent) ? propsOf(parent.openingElement.attributes) : {},
          siblings: elements.map((child) => tagOf(child) ?? ""),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

describe("BG-0154: a status-bar strip where nothing at the top sticks", () => {
  test("is a zero-height sticky host with a strip exactly as tall as the top inset", () => {
    const html = renderToStaticMarkup(createElement(StatusBarStrip, { surface: "bg-x" }));
    expect(html).toBe(
      '<div aria-hidden="true" class="pointer-events-none sticky top-0 z-30 h-0">' +
        '<div class="absolute inset-x-0 top-0 h-[env(safe-area-inset-top,0px)] bg-x"></div></div>',
    );
  });

  test("renders on Fantasy inner screens exactly the markup BG-0151 wrote inline", () => {
    // FantasyFrame before the strip was shared, verbatim.
    const inline =
      '<div aria-hidden="true" class="pointer-events-none sticky top-0 z-30 h-0 md:hidden">' +
      `<div class="absolute inset-x-0 top-0 h-[env(safe-area-inset-top,0px)] ${ui.surface.bar}"></div></div>`;
    expect(
      renderToStaticMarkup(
        createElement(StatusBarStrip, { surface: ui.surface.bar, className: "md:hidden" }),
      ),
    ).toBe(inline);
    const [strip, ...more] = stripsIn(
      "FantasyFrame.tsx",
      read("src/components/fpl/FantasyFrame.tsx"),
    );
    expect(more).toEqual([]);
    expect(strip.props).toEqual({ surface: "ui.surface.bar", className: "md:hidden" });
  });

  test("the sign-in screens on a phone: the band's ink-deep, first in the column that holds the band and the sheet", () => {
    const strips = stripsIn("AuthShell.tsx", read("src/components/auth/AuthShell.tsx"));
    expect(strips).toHaveLength(2);
    const phone = strips.find((strip) => strip.props.surface === "STATUS_BAR_INK");
    expect(phone?.props).toEqual({
      surface: "STATUS_BAR_INK",
      revealOnScroll: "true",
      className: "md:hidden",
    });
    expect(phone?.firstChild).toBe(true);
    expect(phone?.siblings).toEqual(["StatusBarStrip", "header", "main"]);
  });

  test("the sign-in screens from md: the flat page's own surface, fixed over the raised card", () => {
    // From md the column is a raised card that clips (`md:overflow-hidden`,
    // so a sticky strip inside it never moves) in a flex row (so a sticky
    // strip beside it is laid out as a flex item): the strip is fixed, in the
    // surface of the page under the clock, and shown only from md.
    const strips = stripsIn("AuthShell.tsx", read("src/components/auth/AuthShell.tsx"));
    const wide = strips.find((strip) => strip.props.surface === "ui.surface.page");
    expect(wide?.props).toEqual({
      surface: "ui.surface.page",
      className: "hidden md:fixed md:inset-x-0 md:block",
    });
    expect(wide?.siblings).toEqual(["PageBackground", "StatusBarStrip", "div"]);
    const html = renderToStaticMarkup(
      createElement(StatusBarStrip, {
        surface: ui.surface.page,
        className: "hidden md:fixed md:inset-x-0 md:block",
      }),
    );
    // Class merging keeps the phone `sticky` and the `md:fixed` side by side.
    expect(html).toContain(
      'class="pointer-events-none sticky top-0 z-30 h-0 hidden md:fixed md:inset-x-0 md:block"',
    );
    expect(html).toContain(`h-[env(safe-area-inset-top,0px)] ${ui.surface.page}`);
  });

  test("revealOnScroll: clear at rest, opaque after 24px of scroll, opaque where unsupported", () => {
    // The sign-in band: at rest the photograph runs on under the clock (a flat
    // strip there cut a line across it); the strip is there before the
    // header row, let alone the sheet, reaches the clock.
    const html = renderToStaticMarkup(
      createElement(StatusBarStrip, { surface: "bg-x", revealOnScroll: true }),
    );
    expect(html).toContain(
      '<div class="absolute inset-x-0 top-0 h-[env(safe-area-inset-top,0px)] bg-x status-bar-reveal"></div>',
    );
    const css = read("src/styles.css");
    const utility = /@utility status-bar-reveal \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    // Everything inside @supports: where scroll-driven animations are not
    // supported the strip keeps its full opacity, as before.
    expect(utility.trim().startsWith("@supports (animation-timeline: scroll()) {")).toBe(true);
    // Own opacity 0: a screen that cannot scroll has an inactive timeline, the
    // animation does not apply, and the strip stays clear.
    expect(utility).toContain("opacity: 0;");
    expect(utility).toContain("animation: status-bar-reveal linear both;");
    // The timeline after the shorthand, which would reset it.
    expect(utility.indexOf("animation-timeline: scroll(root block);")).toBeGreaterThan(
      utility.indexOf("animation: status-bar-reveal"),
    );
    expect(utility).toContain("animation-range: 0 24px;");
    // Both ends in the keyframes, since the strip's own opacity is 0.
    expect(css).toMatch(
      /@keyframes status-bar-reveal \{\s*from \{\s*opacity: 0;\s*\}\s*to \{\s*opacity: 1;\s*\}\s*\}/,
    );
  });

  test("Jouer: the hero's ink-deep, first in the page's outer element, at every width", () => {
    const strips = stripsIn("LandingPage.tsx", read("src/components/landing/LandingPage.tsx"));
    expect(strips).toHaveLength(1);
    const [strip] = strips;
    expect(strip.props).toEqual({ surface: "STATUS_BAR_INK" });
    expect(strip.firstChild).toBe(true);
    expect(strip.parentProps["data-testid"]).toBe("landing-page");
  });

  test("the ink is the dark bands' own token", () => {
    expect(STATUS_BAR_INK).toBe("bg-[color:var(--ui-ink-deep)]");
    // The two bands it stands for are drawn in it.
    expect(read("src/components/landing/LandingPage.tsx")).toContain(
      '"bg-[color:var(--ui-ink-deep)]"',
    );
    expect(read("src/components/auth/AuthShell.tsx")).toContain("var(--ui-ink-deep)");
  });
});

/* ------------------------------------------------------------------------ */
/* BG-0154: the Fantasy player bar sticks from md too (a phone sideways).   */
/* ------------------------------------------------------------------------ */

describe("BG-0154: the Fantasy player page's action bar sticks at every width", () => {
  const frame = read("src/components/fpl/FantasyFrame.tsx");
  const player = read("src/routes/fantasy.players.$playerId.tsx");

  /** The class list of FantasyFrame's `<main>`: every string and expression in its `cn(…)`. */
  const columnClasses = () => {
    const tree = ts.createSourceFile(
      "FantasyFrame.tsx",
      frame,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let call: ts.CallExpression | null = null;
    const visit = (node: ts.Node) => {
      if (
        ts.isJsxOpeningElement(node) &&
        node.tagName.getText() === "main" &&
        node.attributes.properties.some(
          (a) => ts.isJsxAttribute(a) && a.name.getText() === "className",
        )
      ) {
        const attr = node.attributes.properties.find(
          (a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === "className",
        );
        const init = attr?.initializer;
        if (
          init &&
          ts.isJsxExpression(init) &&
          init.expression &&
          ts.isCallExpression(init.expression)
        )
          call = init.expression;
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
    expect(call).not.toBeNull();
    return (call as unknown as ts.CallExpression).arguments.map((arg) => arg.getText());
  };

  test("the column clips with overflow: clip (no scroll container) when a screen asks for it", () => {
    const args = columnClasses();
    // `hidden` makes the column the sticky bar's scroll container; `clip`
    // clips the same rounded corners without one, and `flow-root` keeps the
    // block formatting context `hidden` gave.
    expect(args).toContain(
      'stickyBottomBar ? "md:flow-root md:overflow-clip" : "md:overflow-hidden"',
    );
    // No unconditional `overflow-hidden` left to win over it.
    const unconditional = args.filter((arg) => !arg.includes("?") && /overflow-hidden/.test(arg));
    expect(unconditional).toEqual([]);
    expect(frame).toContain("stickyBottomBar = false,");
  });

  test("the player page asks for it, and is the only screen that does so far", () => {
    expect(player).toContain("<FantasyFrame stickyBottomBar>");
    const SRC = join(ROOT, "src");
    const askers = [...new Bun.Glob("**/*.tsx").scanSync({ cwd: SRC })]
      .filter((file) => !file.includes(".test."))
      .filter((file) =>
        /<FantasyFrame\b[^>]*\bstickyBottomBar\b/.test(readFileSync(join(SRC, file), "utf8")),
      );
    expect(askers).toEqual(["routes/fantasy.players.$playerId.tsx"]);
  });

  test("the bar is a child of the column itself, so it can travel up past the hero", () => {
    // A sticky box only travels inside its parent. Inside the wrapper under
    // the hero, at 844x390 the bar could rise only to the wrapper's top and
    // hung 43px below the window at the top of the page.
    const tree = ts.createSourceFile(
      "player.tsx",
      player,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const bars: ts.JsxElement[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isJsxElement(node) &&
        node.openingElement.attributes.properties.some(
          (a) =>
            ts.isJsxAttribute(a) &&
            a.name.getText() === "className" &&
            a.initializer !== undefined &&
            ts.isStringLiteral(a.initializer) &&
            /(^|\s)sticky\s+bottom-0(\s|$)/.test(a.initializer.text),
        )
      ) {
        bars.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
    expect(bars).toHaveLength(1);
    const [bar] = bars;
    // Its parent is the page's top-level fragment, which FantasyFrame puts
    // straight into the column.
    expect(ts.isJsxFragment(bar.parent)).toBe(true);
    const fn = (() => {
      for (let p: ts.Node | undefined = bar.parent; p; p = p.parent)
        if (ts.isFunctionDeclaration(p)) return p.name?.getText();
      return null;
    })();
    expect(fn).toBe("PlayerDetailPage");
    // The wrapper's old bottom padding moved onto the bar, so the spacing holds.
    const classes = (
      bar.openingElement.attributes.properties.find(
        (a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === "className",
      )?.initializer as ts.StringLiteral
    ).text;
    expect(classes.split(/\s+/)).toEqual(expect.arrayContaining(["mb-6", "mt-2", "pt-6"]));
  });
});
