/**
 * The share picture's art (`CardRenderer.image`): the shield as one text-free SVG at its rest pose,
 * and every text it carries as a run the picture draws on its canvas with the card's faces. No
 * stylesheet and no `<text>`: an SVG drawn as an image loads no font and no picture.
 *
 * The art is the card's own 100 x 136.6 drawing with room for the emblem that hangs off the side
 * (the view box runs from -8 to 108), scaled to 820 px wide. The autograph is a run in the card's
 * signature faces (`face: "signature"`), in one colour of its foil; the foil's slide, the glare and
 * the sheen are the live card's and are not drawn. The serial is not drawn (it is data). The club's
 * crest is handed back as `crest` for the canvas to draw over the initials disc once it has loaded.
 */
import type { CardImageArt, CardImageCrest, TextRun } from "../renderer";
import type { CardProfile, CardStrings } from "../types";
import { STAT_CODES } from "../types";
import {
  EMBLEM_DIAMOND,
  EMBLEM_GLYPH,
  FACE_SCALE,
  FACE_SCALE_THICK,
  SHIELD,
  SWASH_ECHO,
  SWASH_MAIN,
  inset,
} from "./geometry";
import { uid } from "./ids";
import { editionStill } from "./image-editions";
import {
  fitSignature,
  initialsOf,
  measureEm,
  monogramSize,
  scriptOf,
  type MeasureEm,
} from "./name";
import { shieldDefs } from "./token";
import { crestColours, makeView, mix, ovrText, statText, tierWord } from "./view";

/** The view box: the card (0 to 100 by 0 to 136.6) with the emblem's overhang each side. */
const VB = { x: -8, y: -1, w: 116, h: 139.6 } as const;
export const IMAGE_WIDTH = 820;
const SCALE = IMAGE_WIDTH / VB.w;
export const IMAGE_HEIGHT = Math.round(VB.h * SCALE);

/** Card units to image pixels. */
const X = (x: number): number => Math.round((x - VB.x) * SCALE * 10) / 10;
const Y = (y: number): number => Math.round((y - VB.y) * SCALE * 10) / 10;
const S = (size: number): number => Math.round(size * SCALE * 10) / 10;

const ARABIC = /\p{Script=Arabic}/u;

/** The crest slot's centre and radius, in card units. */
const CREST = { cx: 50, cy: 117.6, r: 5.2 } as const;

export function cardImage(
  profile: CardProfile,
  strings: CardStrings,
  measure: MeasureEm = measureEm,
): CardImageArt {
  const v = makeView(profile, strings);
  const { p, s, m, ar } = v;
  const id = uid();
  const still = editionStill(v.edition, id);
  const faceScale = m.thick ? FACE_SCALE_THICK : FACE_SCALE;
  // the card's x, mirrored in Arabic (the layout is drawn left to right and mirrored as a whole)
  const mx = (x: number): number => (ar ? 100 - x : x);
  const runs: TextRun[] = [];

  const face = `url(#${id}-face)`;
  let art = `<defs>${shieldDefs(id, m)}<clipPath id="${id}-in"><path d="${SHIELD}" transform="${inset(faceScale[0], faceScale[1])}"/></clipPath>`;
  art += `<linearGradient id="${id}-sig" x1="0" y1="0" x2="1" y2="0">${m.sig.map((c, i) => `<stop offset="${(i / (m.sig.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join("")}</linearGradient>`;
  art += `<radialGradient id="${id}-glow" cx="${mx(78)}" cy="19" r="60" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${m.dark ? "#ffffff" : "#ffffff"}" stop-opacity="${m.dark ? 0.16 : 0.35}"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs>`;

  // the card's thickness under its point, the frame, the face
  art += `<path d="${SHIELD}" fill="${mix(m.frame[3], "#000000", 0.55)}" transform="translate(0 1.4)"/>`;
  art += `<path d="${SHIELD}" fill="${m.checker ? `url(#${id}-chk)` : m.holo ? `url(#${id}-foil)` : `url(#${id}-metal)`}"/>`;
  art += `<g clip-path="url(#${id}-in)">`;
  art += `<rect x="0" y="0" width="100" height="136.6" fill="${face}"/>`;
  art += `<rect x="0" y="0" width="100" height="136.6" fill="url(#${id}-glow)"/>`;
  // the wedge in the upper corner and the ribbon across
  const wedge = ar ? "48,0 0,0 0,71 14,41" : "52,0 100,0 100,71 86,41";
  art += `<polygon points="${wedge}" fill="${m.dark ? "#ffffff" : "#ffffff"}" fill-opacity="${m.dark ? 0.08 : 0.28}"/>`;
  if (m.holo) {
    art += `<rect x="0" y="0" width="100" height="136.6" fill="url(#${id}-foil)" fill-opacity=".16"/>`;
  }
  // the band under the art
  art += `<rect x="0" y="88.2" width="100" height="48.4" fill="#ffffff" fill-opacity="${m.dark ? 0.06 : 0.3}"/>`;
  art += `<rect x="0" y="88.2" width="100" height="0.35" fill="${m.dark ? "#ffffff" : "#ffffff"}" fill-opacity="${m.dark ? 0.35 : 0.85}"/>`;
  art += still.under;
  art += `</g>`;
  // rim, bevel, inner line
  art += `<path d="${SHIELD}" fill="none" stroke="#000000" stroke-opacity=".5" stroke-width=".35"/>`;
  art += `<path d="${SHIELD}" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width=".25" transform="${inset(0.993, 0.996)}"/>`;
  art += `<path d="${SHIELD}" fill="none" stroke="${m.line}" stroke-width=".4" transform="${inset(faceScale[0], faceScale[1])}"/>`;

  art += still.over;

  // the emblem off the side
  const ex = ar ? 100 + 2.3 - 12 : -2.3;
  art += `<g transform="translate(${ex} 71) scale(0.3)" color="${m.embLine}" fill="${m.embLine}"><path d="${EMBLEM_DIAMOND}" fill="${m.emb}" stroke="${m.embLine}" stroke-width="3" stroke-linejoin="round"/>${EMBLEM_GLYPH[v.key].replace(/stroke-width="([\d.]+)"/, 'stroke="currentColor" stroke-width="$1"')}</g>`;

  // the rating column
  const rateX = mx(15);
  const number = ovrText(v);
  runs.push(
    run(number, rateX, 23.4, 15.5, 800, "display", "middle", "ltr", m.num ? m.num[1] : m.ink),
  );
  if (p.ovr != null) {
    runs.push(
      run(
        s.ovr,
        mx(ar ? 15 - 9.4 : 15 + 9.4),
        13.6,
        3.7,
        800,
        "display",
        ar ? "end" : "start",
        "ltr",
        m.ink2,
        0.15,
      ),
    );
  }
  if (p.tier && (p.ovr != null || p.ladder)) {
    const word = tierWord(p.tier, s);
    const arabicWord = ARABIC.test(word);
    const size = arabicWord
      ? Math.min(7.6, 34 / Math.max(1, [...word].length * 0.5))
      : Math.min(7.2, 33 / Math.max(1, [...word].length * 0.64));
    runs.push(
      run(
        word,
        rateX,
        32.2,
        size,
        800,
        arabicWord ? "arabic" : "display",
        "middle",
        arabicWord ? "rtl" : "ltr",
        m.ink,
      ),
    );
  }

  // the monogram (one flat colour, faint) and the autograph
  const fit = fitSignature(p.name, measure);
  if (fit) {
    const initials = initialsOf(p.name);
    if (initials) {
      const script = scriptOf(initials);
      runs.push(
        run(
          initials,
          mx(65),
          28.5,
          monogramSize(initials, script),
          800,
          script === "arabic" ? "arabic" : "display",
          "middle",
          script === "arabic" ? "rtl" : "ltr",
          mix(m.sigSolid, m.faceStops[1]!, 0.68),
        ),
      );
    }
    const rotate = fit.script === "arabic" ? 6 : -7;
    const lineGap = fit.size * 1.05;
    const first = 57 - (fit.lines.length - 1) * lineGap * 0.5;
    fit.lines.forEach((line, i) => {
      runs.push({
        ...run(
          line,
          50,
          first + i * lineGap,
          fit.size,
          400,
          "signature",
          "middle",
          fit.script === "arabic" ? "rtl" : "ltr",
          m.sigSolid,
        ),
        rotate,
      });
    });
    // the pen's swash under it
    const sx = 50 - 36;
    const sy = first + (fit.lines.length - 1) * lineGap + 4;
    const flip = fit.script === "arabic";
    art += `<g transform="translate(${flip ? sx + 72 : sx} ${sy}) rotate(${flip ? 5 : -5}) scale(${flip ? -0.36 : 0.36} 0.24)" fill="none" stroke="url(#${id}-sig)" stroke-linecap="round"><path d="${SWASH_MAIN}" stroke-width="3.4"/><path d="${SWASH_ECHO}" stroke-width="1.7" opacity=".8"/></g>`;
  }

  // the club, the stats
  if (p.club) {
    const name = p.club.name[ar ? "ar" : "fr"] || p.club.name.fr;
    const arabic = ARABIC.test(name);
    runs.push({
      ...run(
        arabic ? name : name.toLocaleUpperCase("fr"),
        50,
        94.2,
        arabic ? 6 : 5.4,
        800,
        arabic ? "arabic" : "display",
        "middle",
        arabic ? "rtl" : "ltr",
        m.ink,
        arabic ? undefined : 0.43,
      ),
      fitWidth: 82,
    });
  }
  STAT_CODES.forEach((code, i) => {
    const cx = mx(17.75 + i * 21.5);
    const word = s.stats[code];
    const arabic = ARABIC.test(word);
    runs.push(
      run(
        arabic ? word : word.toLocaleUpperCase("fr"),
        cx,
        102.4,
        arabic ? 4.2 : 4.4,
        800,
        arabic ? "arabic" : "display",
        "middle",
        arabic ? "rtl" : "ltr",
        m.ink,
        arabic ? undefined : 0.09,
      ),
    );
    runs.push(run(statText(p.stats[code]), cx, 110.4, 7.4, 800, "display", "middle", "ltr", m.ink));
  });

  // the crest slot: a disc with the club's initials (the picture draws the crest over it)
  let crest: CardImageCrest | undefined;
  const founderShift = p.founder ? 9 : 0;
  const crestX = mx(CREST.cx - founderShift);
  if (p.club) {
    const c = crestColours(p.club.primary);
    art += `<circle cx="${crestX}" cy="${CREST.cy}" r="${CREST.r}" fill="${c.ground}" stroke="${c.ring}" stroke-width=".7"/>`;
    runs.push({
      ...run(
        p.club.initials.slice(0, 4),
        crestX,
        CREST.cy + 1.5,
        3.9,
        800,
        "display",
        "middle",
        "ltr",
        c.ink,
      ),
      part: "clubInitials",
    });
    if (p.club.crest) {
      crest = {
        href: p.club.crest,
        cx: X(crestX),
        cy: Y(CREST.cy),
        r: S(CREST.r),
        plate: "#f4f6f9",
        ring: p.club.primary,
        ringR: S(CREST.r - 0.35),
        ringW: S(0.7),
        box: S(CREST.r * 1.3),
        clipR: S(CREST.r - 0.7),
      };
    }
  }
  if (p.founder) {
    const fx = mx(CREST.cx + (p.club ? founderShift : 0));
    art += `<rect x="${fx - 8}" y="${CREST.cy - 3.6}" width="16" height="7.2" rx="3.6" fill="${m.chip}" stroke="${m.chipLine}" stroke-width=".45"/>`;
    runs.push(
      run(String(p.founder), fx, CREST.cy + 1.45, 3.9, 800, "display", "middle", "ltr", m.chipLine),
    );
  }
  if (p.sample) {
    runs.push(
      run(
        s.sample,
        mx(86),
        16.6,
        3.4,
        700,
        ar ? "arabic" : "body",
        "middle",
        ar ? "rtl" : "ltr",
        m.ink2,
      ),
    );
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}">` +
    art +
    `</svg>`;
  return {
    svg,
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    texts: runs,
    ...(crest ? { crest } : {}),
  };
}

function run(
  text: string,
  x: number,
  y: number,
  size: number,
  weight: TextRun["weight"],
  face: TextRun["face"],
  anchor: TextRun["anchor"],
  dir: TextRun["dir"],
  colour: string,
  trackingEm?: number,
): TextRun {
  return {
    text,
    x: X(x),
    y: Y(y),
    size: S(size),
    weight,
    face,
    anchor,
    dir,
    colour,
    ...(trackingEm && dir === "ltr" ? { tracking: S(size * trackingEm) } : {}),
  };
}
