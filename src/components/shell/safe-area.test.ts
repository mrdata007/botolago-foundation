import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/**
 * BG-0151 — `viewport-fit=cover` and the safe-area treatments it depends on.
 *
 * The phone app (Capacitor) shows the site in a web view that fills the whole
 * screen. Only with `viewport-fit=cover` does iOS report the real
 * `env(safe-area-inset-*)` values (without it they are all 0), and only with
 * it does Capacitor's Android `SystemBars` draw the page edge to edge with the
 * insets passed through. Every inset is 0 on a screen without one, so the
 * `max(env(...), fallback)` padding keeps today's spacing there.
 *
 * Nothing pinned the meta before this file, and the Landing page's sticky
 * button showed how quietly a safe-area class can go missing: it had
 * `ui.safe.bottom` followed by `pb-3` in one `cn()`, and class merging kept
 * only the later `pb-3`. These are source-level pins: `bun test` has no
 * browser, and Chromium could not prove the iOS gate anyway (it applies
 * emulated insets whatever the meta says).
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("BG-0151: the root viewport meta", () => {
  const root = read("src/routes/__root.tsx");
  const viewports = [...root.matchAll(/name:\s*"viewport",\s*content:\s*"([^"]*)"/g)].map(
    (m) => m[1],
  );

  it("is declared once, in the root route", () => {
    expect(viewports).toHaveLength(1);
  });

  it("asks for viewport-fit=cover, keeping device width and initial scale 1", () => {
    const parts = (viewports[0] ?? "").split(",").map((part) => part.trim());
    expect(parts).toContain("viewport-fit=cover");
    expect(parts).toContain("width=device-width");
    expect(parts).toContain("initial-scale=1");
  });

  it("is not overridden by any other route", () => {
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

  it("pads body on both sides by the larger side inset, so it is symmetric in Arabic too", () => {
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

    // Every treatment, with the variant it applies at.
    const treatments: Array<{ index: number; variant: string }> = [];
    items.forEach((item, index) => {
      if (item.safeToken) treatments.push({ index, variant: "" });
      for (const token of item.tokens) {
        if (isSafeBottomClass(token))
          treatments.push({ index, variant: splitVariant(token).variant });
      }
    });
    if (treatments.length === 0) {
      findings.push({ ...where, problem: "no safe-area-inset-bottom treatment" });
      continue;
    }
    for (const { index, variant } of treatments) {
      const later = items
        .slice(index + 1)
        .flatMap((item) => item.tokens)
        .filter(
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

  it("flags a pinned bar with no treatment", () => {
    expect(judge(`<div className="fixed inset-x-0 bottom-0 pb-3" />`)).toEqual([
      "no safe-area-inset-bottom treatment",
    ]);
    expect(
      judge(`<div className="fixed bottom-[var(--bottomnav-h)] md:bottom-0 md:pb-4" />`),
    ).toHaveLength(1);
  });

  it("accepts ui.safe.bottom and a pb-[max(env(safe-area-inset-bottom),…)] class", () => {
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

  it("flags the merge drop the Landing button had", () => {
    expect(
      judge(`<div className={cn("fixed inset-x-0 bottom-0", ui.safe.bottom, "pb-3 sm:hidden")} />`),
    ).toEqual(["safe-area padding overridden by a later pb-3 (class merging keeps the last)"]);
  });

  it("skips a bottom-0 inside a positioned box, and never reads comments", () => {
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

  it("judges the bars it is meant to judge", () => {
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

  it("every one carries ui.safe.bottom or a safe-area-inset-bottom padding", () => {
    const offenders = findings
      .filter((f) => !exceptionFor(f))
      .map((f) => `${f.file}:${f.line} ${f.problem}: "${f.classes}"`);
    expect(offenders).toEqual([]);
  });

  for (const exception of EXCEPTIONS) {
    it(`exception still holds: ${exception.file} (${exception.reason})`, () => {
      const hit = judged.find((j) => exceptionFor(j) === exception);
      const holds = exception.holds(sources.get(exception.file) ?? "");
      expect({ found: Boolean(hit), holds }).toEqual({ found: true, holds: true });
    });
  }
});
