import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

// The pitch's touchlines are drawn 3% in from each side of the turf (an SVG
// rect at x=3, width 94, in a 100-wide viewBox stretched to the turf). The
// rows of plates used to be padded by a flat 4px. A row of five plates is
// wider than a phone's pitch, so its slots shrank to fill the whole width and
// the outer plates sat 4px from the turf edge, across the line.
//
// Measured in Chromium on the squad builder (two rows of five) before this was
// pinned: at 390px the outer name plates crossed each line by 6.7px and the
// warning disc by 8.7px; at 402px (the owner's iPhone) by 7.1px and 9.1px.
// Arabic mirrored it exactly. Rows of four reached the line up to 390px.
// Nothing caught it: the plates stay inside the pitch card, so no overflow
// check sees them, and `html, body { overflow-x: clip }` hides overflow anyway.
//
// This is a source-level pin with a layout model, because `bun test` has no
// browser. It reads the real numbers out of `UiPitchSurface` and
// `UiPlayerPlate`, then lays out every row size at every common width the way
// flexbox does, and checks each outer plate and its corner disc against the
// touchline's inner edge. The measured before/after runs are in
// docs/engineering/briefs/ios-zoom-and-pitch-lines.md.

const source = readFileSync(new URL("./primitives.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile(
  "primitives.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function functionBody(name: string): ts.FunctionDeclaration {
  let found: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(tree);
  expect(found).toBeDefined();
  return found!;
}

/** Every string literal inside a node, joined. Comments are excluded, so the
 * explanations in the source cannot satisfy an assertion. */
function literals(node: ts.Node): string[] {
  const parts: string[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) {
      parts.push(child.text);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return parts;
}

/** The value of `attribute` on every JSX element named `tag` inside `node`. */
function attributeValues(node: ts.Node, tag: string, attribute: string): string[][] {
  const found: string[][] = [];
  const visit = (child: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) &&
      child.tagName.getText() === tag
    ) {
      for (const property of child.attributes.properties) {
        if (
          ts.isJsxAttribute(property) &&
          property.name.getText() === attribute &&
          property.initializer
        ) {
          found.push(literals(property.initializer));
        }
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

/** The literal attributes of every `<tag>` inside `node`, as name → text. */
function elements(node: ts.Node, tag: string): Record<string, string>[] {
  const found: Record<string, string>[] = [];
  const visit = (child: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) &&
      child.tagName.getText() === tag
    ) {
      const attributes: Record<string, string> = {};
      for (const property of child.attributes.properties) {
        if (
          ts.isJsxAttribute(property) &&
          property.initializer &&
          ts.isStringLiteral(property.initializer)
        ) {
          attributes[property.name.getText()] = property.initializer.text;
        }
      }
      found.push(attributes);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

/** Property names of the `style={{...}}` object on the turf div. */
function turfStyleKeys(): string[] {
  const keys: string[][] = [];
  const visit = (child: ts.Node) => {
    if (ts.isJsxOpeningElement(child) && child.tagName.getText() === "div") {
      const attributes = child.attributes.properties.filter(ts.isJsxAttribute);
      const className = attributes.find((a) => a.name.getText() === "className");
      const style = attributes.find((a) => a.name.getText() === "style");
      if (
        className?.initializer &&
        ts.isStringLiteral(className.initializer) &&
        className.initializer.text === "relative overflow-hidden" &&
        style?.initializer &&
        ts.isJsxExpression(style.initializer) &&
        style.initializer.expression &&
        ts.isObjectLiteralExpression(style.initializer.expression)
      ) {
        keys.push(style.initializer.expression.properties.map((p) => p.name?.getText() ?? "…"));
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(surface);
  expect(keys).toHaveLength(1);
  return keys[0]!;
}

const surface = functionBody("UiPitchSurface");
const plate = functionBody("UiPlayerPlate");
const divClasses = attributeValues(surface, "div", "className").map((parts) => parts.join(" "));

// The touchlines: the rect centred across the turf over its full height, and
// the stroke on its group.
const touchline = elements(surface, "rect").find(
  (rect) => 2 * Number(rect.x) + Number(rect.width) === 100 && rect.height === "150",
);
const strokeWidth = Number(elements(surface, "g").find((g) => g.strokeWidth)?.strokeWidth);
/** Inner edge of the line, as a fraction of the turf width. */
const LINE = (Number(touchline?.x) + strokeWidth / 2) / 100;

const rowsContainer = divClasses.find((classes) => classes.includes("flex flex-col gap-3"));
// `_` is Tailwind's space, so `calc(3.3%_+_6px)` is the same class.
const inset = /(?:^|\s)(px-\[calc\(([\d.]+)%_?\+_?([\d.]+)px\)\])(?:\s|$)/.exec(
  rowsContainer ?? "",
);
const INSET_PCT = Number(inset?.[2]) / 100;
const INSET_PX = Number(inset?.[3]);

/** The gap between plates in a pitch row, in px (Tailwind's 4px step). */
const pitchRow = divClasses.find((classes) => classes.includes("stagger flex items-start"));
const GAP = Number(/(?:^|\s)gap-([\d.]+)(?:\s|$)/.exec(pitchRow ?? "")?.[1]) * 4;

/** The 2px the warning disc (`-start-0.5`) and badge (`-end-0.5`) hang out. */
const plateLiterals = literals(plate).join(" ");
const CORNER = plateLiterals.includes("-start-0.5") && plateLiterals.includes("-end-0.5") ? 2 : NaN;
/** Air between a plate's furthest corner and the line. */
const AIR = 4;
const TAP_FLOOR = 44; // `ui.space.tap`

/** Pitch width at a viewport width. Fantasy: FantasyFrame's 672px column less
 * the FplPitch card's 16px gutters. Landing: the hero column, at most 27rem. */
const containers = {
  fantasy: (vw: number) => Math.min(vw, 672) - 32,
  landing: (vw: number) => Math.min(vw - 32, 432),
};
const WIDTHS = [320, 360, 375, 390, 393, 402, 414, 430, 440, 640, 768, 1024, 1280];

/** Flexbox for one row: shrinkable slots, `justify-evenly`. */
function layoutRow(turf: number, slots: number, basis: number) {
  const padding = INSET_PCT * turf + INSET_PX;
  const room = turf - 2 * padding;
  const free = room - slots * basis - (slots - 1) * GAP;
  const slot = free < 0 ? (room - (slots - 1) * GAP) / slots : basis;
  // `justify-evenly` puts equal space before, between and after the slots.
  const outerEdge = padding + Math.max(0, free) / (slots + 1);
  return { slot, outerEdge };
}

describe("the pitch keeps every plate inside the touchlines", () => {
  it("reads the touchline and the plate corners from the source", () => {
    expect(touchline).toEqual({ x: "3", y: "0", width: "94", height: "150" });
    expect(strokeWidth).toBe(0.6);
    expect(LINE).toBeCloseTo(0.033, 6);
    expect(CORNER).toBe(2);
  });

  it("insets the rows by a percentage of the turf, so the inset scales with the line", () => {
    expect(rowsContainer).toBeDefined();
    expect(inset).not.toBeNull();
    expect(INSET_PCT).toBeGreaterThanOrEqual(LINE);
    expect(INSET_PX).toBeGreaterThanOrEqual(CORNER + AIR);
    // No other horizontal padding on the rows container to fight it, at any
    // breakpoint or state.
    const others = (rowsContainer ?? "")
      .split(/\s+/)
      .filter((token) => token !== inset?.[1])
      .filter((token) => /^(?:[\w-]+:)*(?:p|px|ps|pe|pl|pr)-/.test(token));
    expect(others).toEqual([]);
  });

  it("keeps the turf box free of padding and border, so the % base is the SVG's box", () => {
    const turf = divClasses.find((classes) => classes === "relative overflow-hidden");
    expect(turf).toBeDefined();
    // Its inline style paints the turf and nothing else.
    expect(turfStyleKeys()).toEqual(["backgroundImage"]);
    expect(source).not.toContain("vector-effect");
    expect(source).not.toContain("vectorEffect");
  });

  // The bench has no touchlines, but four fixed 76px slots overflowed its
  // strip below ~364px and the card cut the last plate off. Shrinkable slots
  // fit any width the pitch rows fit.
  it("lets every slot shrink from the same basis, on the pitch and on the bench", () => {
    const slots = divClasses.filter((classes) => classes.includes("basis-["));
    // Pitch slots, bench labels and bench slots.
    expect(slots.length).toBeGreaterThanOrEqual(3);
    for (const classes of slots) {
      expect(classes).toContain("min-w-0 shrink grow-0 basis-[76px]");
      expect(classes).toContain("sm:basis-[84px]");
    }
    expect(divClasses.some((classes) => /(?:^|\s)(?:sm:)?w-\[(76|84)px\]/.test(classes))).toBe(
      false,
    );
    expect(pitchRow).toContain("justify-evenly");
    expect(GAP).toBeGreaterThan(0);
  });

  for (const [name, widthAt] of Object.entries(containers)) {
    for (const vw of WIDTHS) {
      it(`${name} pitch at ${vw}px: rows of 1 to 5 clear the line by ${AIR}px`, () => {
        const turf = widthAt(vw);
        const basis = vw >= 640 ? 84 : 76;
        for (let slots = 1; slots <= 5; slots++) {
          const { slot, outerEdge } = layoutRow(turf, slots, basis);
          // The same on both sides: the padding is logical, so Arabic mirrors it.
          // 1e-9 absorbs floating-point noise when a row lands exactly on AIR.
          expect(outerEdge - CORNER - LINE * turf).toBeGreaterThanOrEqual(AIR - 1e-9);
          expect(slot).toBeGreaterThanOrEqual(TAP_FLOOR);
        }
      });
    }
  }
});
