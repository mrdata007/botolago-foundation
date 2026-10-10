/**
 * The plate's furniture and text (plan 3.3, revision 3), centred under the shield: the tier word in
 * its plaque (or the forming marks), the name, the rule, the four stats, the serial; on the tab the
 * season and the club's initials; the sample pill, the founder's mark along the cut corner and the
 * rail's wordmark. Shapes (rules, dividers, marks, the pill, the star) come back as markup with x
 * already mirrored; every text comes back as a `TextSpec`, to be drawn as `<text>` or as a canvas
 * run. Nothing smaller than 30 units is drawn on the full card and nothing under 58 on the
 * face-à-face card.
 */
import { STAT_CODES } from "../types";
import type { Ctx } from "./ctx";
import { inkOn, mix } from "./foil";
import { CREST, DISC, RULE_Y, STAT_DIV, STAT_X, mx, n2, star } from "./geometry";
import { fitLabel, layoutName } from "./name";
import type { Plaque } from "./plaque";
import type { TextSpec } from "./text";
import { esc, serialLine } from "./view";

export interface Plate {
  /** Shapes, in card coordinates (not mirrored again). */
  shapes: string;
  texts: TextSpec[];
  /** The name's layout (the tests read it). */
  name: ReturnType<typeof layoutName>;
}

export function plate(c: Ctx, plaque: Plaque): Plate {
  const { p, s, ar, F } = c.v;
  const { compact } = c;
  const X = (x: number): number => mx(x, ar);
  let shapes = "";
  const texts: TextSpec[] = [];

  // the tab's crest, on the plate `tabDisc` draws: never mirrored (its x is), on both cards. The
  // share picture's art is built without it (`cardImage`): an SVG drawn as an image loads no
  // picture, so the canvas draws the crest over the initials disc itself when it can.
  const crest = p.club?.crest;
  if (crest) {
    const cx = X(DISC.cx);
    const half = CREST.box / 2;
    shapes +=
      `<defs><clipPath id="${c.id}-crest"><circle cx="${cx}" cy="${DISC.cy}" r="${CREST.clipR}"/></clipPath></defs>` +
      `<image href="${esc(crest)}" x="${cx - half}" y="${DISC.cy - half}" width="${CREST.box}" height="${CREST.box}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${c.id}-crest)" data-meta="crest"/>`;
  }

  // the tab: the season, the club's initials (not on the face-à-face card: the disc's colours stay;
  // not over a crest)
  if (!compact) {
    texts.push({
      text: p.season,
      x: X(103),
      y: 262,
      size: 30,
      face: "b",
      weight: 800,
      fill: "#fff",
      fillOpacity: 0.92,
      tabular: true,
      dir: "ltr",
      data: { meta: "season" },
    });
    if (p.club && !crest) {
      texts.push({
        text: p.club.initials,
        x: X(103),
        y: 146,
        size: 34,
        face: "d",
        fill: inkOn(p.club.primary),
        ...(ar ? {} : { tracking: 0.02 }),
        dir: "ltr",
        data: { meta: "initials" },
      });
    }
  }

  // a development fixture is labelled on the object
  if (p.sample) {
    const [pw, ph, fs] = compact ? [380, 84, 60] : [230, 50, 30];
    const pxl = ar ? 64 : 936 - pw;
    shapes += `<rect x="${pxl}" y="44" width="${pw}" height="${ph}" rx="${ph / 2}" fill="#000" fill-opacity=".55"/>`;
    texts.push({
      text: ar ? s.sample : s.sample.toLocaleUpperCase("fr"),
      x: pxl + pw / 2 + (ar ? 0 : 0.04 * fs),
      y: 44 + ph / 2 + fs * 0.36,
      size: fs,
      face: ar ? "a" : "b",
      weight: 800,
      fill: "#fff",
      ...(ar ? {} : { tracking: 0.08 }),
      dir: "ltr",
      data: { meta: "sample" },
    });
  }

  // the tier word, in its plaque
  if (plaque.word) {
    texts.push({
      text: plaque.word,
      x: plaque.latin ? 500 + 0.11 * plaque.fs : 500,
      y: compact ? 1127 : 1121,
      size: plaque.fs,
      face: "d",
      fill: F.wordInk ?? F.wordFill ?? "#fff",
      ...(plaque.latin ? { tracking: 0.22 } : {}),
      dir: plaque.latin ? "ltr" : "rtl",
      isolate: true,
      data: { tier: "1" },
    });
  }

  // the forming marks of a base card, in the plaque: filled from the reading side
  if (plaque.marksN) {
    const x0 = 500 - plaque.marksW / 2;
    const y0 = 1106 - plaque.mh / 2;
    const { mw, mh, mg } = plaque;
    for (let i = 0; i < plaque.marksN; i++) {
      const on = ar ? plaque.marksN - 1 - i < (p.counted ?? 0) : i < (p.counted ?? 0);
      const x = x0 + i * (mw + mg);
      // the newest filled mark is the one the tick beat lights (the leading one filled last in Arabic)
      const newest = ar ? i === plaque.marksN - (p.counted ?? 0) : i === (p.counted ?? 0) - 1;
      shapes += on
        ? `<g class="mc-mark${newest ? " mc-mark--new" : ""}" data-pip="on"><rect x="${n2(x)}" y="${n2(y0)}" width="${mw}" height="${mh}" rx="${mh / 2}" fill="#FFF2DA" opacity=".35" filter="url(#${c.id}-b5)"/><rect x="${n2(x)}" y="${n2(y0)}" width="${mw}" height="${mh}" rx="${mh / 2}" fill="#FFF2DA" stroke="${mix(F.plate, "#000000", 0.5)}" stroke-width="3"/></g>`
        : `<rect x="${n2(x + 2)}" y="${n2(y0 + 2)}" width="${mw - 4}" height="${mh - 4}" rx="${(mh - 4) / 2}" fill="${mix(F.plate, "#000000", 0.25)}" stroke="#FFF2DA" stroke-opacity=".8" stroke-width="4" data-pip="off"/>`;
    }
  }

  // the name, under the plaque
  const name = layoutName(p.name, { plaque: plaque.w > 0, compact, measure: c.measure });
  if (name.empty) {
    shapes += `<rect x="330" y="${name.emptyY}" width="340" height="2" fill="#fff" fill-opacity=".22"/>`;
  } else {
    for (const l of name.lines) {
      texts.push({
        text: l.text,
        x: 500,
        y: l.y,
        size: l.size,
        face: l.face,
        fill: "#fff",
        dir: name.rtl ? "rtl" : "ltr",
        isolate: true,
        ...(l.textLength !== undefined ? { textLength: l.textLength } : {}),
        data: { name: l.kind },
      });
    }
  }

  // the rule, the four stats and their dividers
  shapes += `<rect x="190" y="${RULE_Y}" width="620" height="1.4" fill="#fff" fill-opacity=".14" data-rule="1"/>`;
  const valY = compact ? 1515 : 1520;
  STAT_CODES.forEach((code, i) => {
    const x = X(STAT_X[i]!);
    if (!compact) {
      const label = s.stats[code];
      texts.push(
        ar
          ? {
              text: label,
              x,
              y: 1460,
              size: fitLabel(label, c.measure),
              face: "a",
              weight: 700,
              fill: F.label,
              dir: "rtl",
              data: { label: "1" },
            }
          : {
              text: label,
              x: x + 0.04 * 30,
              y: 1462,
              size: 30,
              face: "b",
              weight: 800,
              fill: F.label,
              tracking: 0.08,
              dir: "ltr",
              data: { label: "1" },
            },
      );
    }
    const value = p.stats[code];
    texts.push({
      text: value == null ? "—" : String(value),
      x,
      y: valY,
      size: compact ? 64 : 52,
      face: "b",
      weight: 800,
      fill: "#fff",
      tabular: true,
      dir: "ltr",
      data: { stat: "1" },
    });
  });
  for (const x of STAT_DIV) {
    shapes += compact
      ? `<rect x="${n2(X(x) - 0.7)}" y="1452" width="1.4" height="80" fill="#fff" fill-opacity=".14"/>`
      : `<rect x="${n2(X(x) - 0.7)}" y="1436" width="1.4" height="${valY + 6 - 1436}" fill="#fff" fill-opacity=".14"/>`;
  }

  // the serial (not on the face-à-face card)
  if (!compact) {
    texts.push({
      text: serialLine(s, p.serial),
      x: 500,
      y: 1584,
      size: 30,
      face: "b",
      weight: 600,
      fill: "#fff",
      fillOpacity: 0.8,
      tabular: true,
      tracking: 0.04,
      dir: "ltr",
      data: { meta: "serial" },
    });
  }

  // the founder's mark along the cut corner: a drawn star, and the last two digits of the year
  if (p.founder) {
    const rot = ar ? 45 : -45;
    const tx = X(872);
    shapes += `<g transform="translate(${tx} 1482) rotate(${rot})" data-meta="founder"><path d="${compact ? star(0, 0, 16) : star(-25, 0, 11)}" fill="#fff"/></g>`;
    if (!compact) {
      texts.push({
        text: String(p.founder).slice(-2),
        x: 12,
        y: 0,
        size: 30,
        face: "d",
        fill: "#fff",
        central: true,
        dir: "ltr",
        place: { tx, ty: 1482, rotate: rot },
        data: { meta: "founder-year" },
      });
    }
  }

  // the rail's wordmark: debossed, the card's one brand signature (not in the share picture)
  if (!compact) {
    const place = { tx: X(32), ty: 600, rotate: -90 };
    const wm = {
      text: "BOTOLAGO",
      x: 2.4,
      y: 0,
      size: 34,
      face: "d" as const,
      central: true,
      tracking: 0.14,
      dir: "ltr" as const,
      place,
      noImage: true as const,
    };
    texts.push({ ...wm, fill: "#000", fillOpacity: 0.5, dy: 1.5 });
    texts.push({ ...wm, fill: "#fff", fillOpacity: 0.78, data: { meta: "wordmark" } });
  }

  return { shapes, texts, name };
}
