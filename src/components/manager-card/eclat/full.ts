/**
 * The full card, its share-image art and its founder detail: the parts of the renderer that put a
 * drawing inside the root element a screen mounts (plan 3 and 12.1).
 *
 * One build, three outputs. `buildParts` draws the five layers from the profile; `fullCard` stacks
 * them under a root with the rims and the foil overlay, `founderDetail` crops the flat card to the
 * cut corner, and `cardImage` flattens them into one text-free SVG at the rest pose and hands every
 * text back as a run the share picture draws on a canvas.
 */
import type { CardImageArt, CardImageCrest, RenderOptions, TextRun } from "../renderer";
import type { BeatName, CardProfile, CardStrings } from "../types";
import { BEAT_MS } from "./beats";
import { makeCtx, type Ctx } from "./ctx";
import { baseLayer, fieldDefs, plateBase } from "./field";
import { ASPECT, CREST, CREST_PLATE, DISC, VIEW_BOX, mirror, mx } from "./geometry";
import { holoLayer } from "./holo";
import { uid } from "./ids";
import { flatten, stack, type Parts } from "./layers";
import { measureText, type Measure } from "./measure";
import { numberDefs, numberLayer, numberSpecs, printOf } from "./number";
import { frameDefs, frameShapes, plaqueClip } from "./ornament";
import { plaqueOf, type Plaque } from "./plaque";
import { plate, type Plate } from "./plate";
import { shirtDefs, shirtLayer, shirtRimDef } from "./shirt";
import { textEl, toRun } from "./text";
import { esc, labelAttr, makeView, type View } from "./view";

/** The beats a card can show, and the cases each one has something to light in. */
export function appliedBeat(v: View, beat: BeatName | undefined): BeatName | "" {
  if (!beat || !Object.hasOwn(BEAT_MS, beat)) return "";
  const { p } = v;
  switch (beat) {
    case "legend":
      return p.tier === "legend" && p.ovr != null ? "legend" : "";
    case "tier":
      // LEGEND's own moment is the `legend` beat
      return p.tier && p.tier !== "legend" && p.ovr != null ? "tier" : "";
    case "founder":
      return p.founder ? "founder" : "";
    case "first":
    case "tick": {
      // something counted: a mark to fill while forming, a number to light once it exists
      const counted = p.ovr != null || (p.counted ?? 0) > 0;
      return counted ? beat : "";
    }
    default:
      return beat;
  }
}

export interface Built {
  parts: Parts;
  plaque: Plaque;
  plate: Plate;
  c: Ctx;
}

/** The five layers of a card. `flat` writes the travelling parts at their rest pose. */
export function buildParts(c: Ctx): Built {
  const { v, id } = c;
  const { F, p, ar } = v;
  const shirtO = { compact: c.compact, colours: c.colours };
  const fieldO = { compact: c.compact, darkShirt: c.colours.dark, flat: c.flat };
  const plaque = plaqueOf(c);
  const pl = plate(c, plaque);
  const seed = p.serial ?? `${p.name}|${p.season}`;
  const defs = `<defs>${frameDefs(F, id)}${fieldDefs(F, id, seed, c.flat)}${shirtDefs(id, shirtO)}${shirtRimDef(F, id)}${numberDefs(id)}</defs>`;
  const print = printOf(p.ovr, c.measure);
  const num = c.runs
    ? ""
    : numberLayer({
        id,
        print,
        colours: c.colours,
        compact: c.compact,
        label: !c.compact && p.ovr != null ? v.s.ovr : null,
      });
  const frame =
    plaqueClip(c, plaque) +
    mirror(frameShapes(c, plaque), ar) +
    pl.shapes +
    (c.runs ? "" : pl.texts.map(textEl).join(""));
  return {
    parts: {
      defs,
      base: mirror(baseLayer(F, id, fieldO), ar),
      shirt: mirror(shirtLayer(p.club, id, shirtO), ar),
      num,
      frame,
      holo: holoLayer(c, plaque),
    },
    plaque,
    plate: pl,
    c,
  };
}

/** height ÷ width of the full card: one shape for every card. */
export const cardAspect = (): number => ASPECT;

/** The full card: one root element, role="img", the label, dir from the interface language. */
export function fullCard(
  profile: CardProfile,
  options: RenderOptions,
  measure: Measure = measureText,
): string {
  const v = makeView(profile, options.strings);
  const beat = appliedBeat(v, options.beat);
  const c = makeCtx(v, {
    id: uid(),
    theme: options.theme,
    compact: options.compact,
    beat,
    measure,
  });
  const { parts } = buildParts(c);
  return stack(v, parts, {
    theme: options.theme,
    beat,
    compact: c.compact,
    label: labelAttr(profile, options.strings),
    extra: ` data-mc-tier="${v.tierKey}"${beat ? ` data-mc-beat="${beat}"` : ""}`,
  });
}

/** The share art's width in image pixels (the card is drawn 707 × 1144, the band the picture allows). */
export const IMAGE_WIDTH = 707;

/**
 * The card as a text-free SVG at its rest pose (no stylesheet needed) and the text runs it left
 * out, in image pixels. The sheen and the HTML foil overlay are not drawn; the foil in the cells, on
 * the edge and in LEGEND's plaque is, at its rest position.
 */
export function cardImage(
  profile: CardProfile,
  strings: CardStrings,
  measure: Measure = measureText,
): CardImageArt {
  // the art is drawn with the initials disc; a crest is handed to the canvas to draw over it
  const withCrest = makeView(profile, strings);
  const crestOf = withCrest.p.club?.crest;
  const v = crestOf ? makeView(withoutCrest(profile), strings) : withCrest;
  // the share ground is Tunnel Navy: the card takes its lit edge
  const c = makeCtx(v, { id: uid(), theme: "dark", flat: true, runs: true, measure });
  const { parts, plate: pl } = buildParts(c);
  const scale = IMAGE_WIDTH / 1000;
  const height = Math.round(1618 * scale);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${height}" viewBox="${VIEW_BOX}">` +
    flatten(parts) +
    `</svg>`;
  const print = printOf(v.p.ovr, measure);
  const specs = [
    ...pl.texts.filter((t) => !t.noImage),
    ...numberSpecs({
      id: c.id,
      print,
      colours: c.colours,
      compact: false,
      label: v.p.ovr != null ? v.s.ovr : null,
    }),
  ];
  const texts: TextRun[] = specs.map((t) => ({
    ...toRun(t, scale),
    ...(t.data?.meta === "initials" ? { part: "clubInitials" as const } : {}),
  }));
  const club = withCrest.p.club;
  const crest: CardImageCrest | undefined =
    crestOf && club
      ? {
          href: crestOf,
          cx: mx(DISC.cx, v.ar) * scale,
          cy: DISC.cy * scale,
          r: CREST.r * scale,
          plate: CREST_PLATE.dark,
          ring: club.primary,
          ringR: CREST.ringR * scale,
          ringW: CREST.ringW * scale,
          box: CREST.box * scale,
          clipR: CREST.clipR * scale,
        }
      : undefined;
  return { svg, width: IMAGE_WIDTH, height, texts, ...(crest ? { crest } : {}) };
}

/** The profile without its club's crest (the share picture's art: the initials disc). */
function withoutCrest(profile: CardProfile): CardProfile {
  if (!profile.club?.crest) return profile;
  const { crest: _crest, ...club } = profile.club;
  return { ...profile, club };
}

/**
 * The founder's mark on its own: the cut corner of the flat card with the capsule, the serial's end
 * and the stats' last columns (viewBox 560 1100 440 518; mirrored in Arabic). The same drawing as
 * the card, so the detail is the part of it a screen shows larger. Null for anyone who is not a
 * founder.
 */
export function founderDetail(
  profile: CardProfile,
  options: RenderOptions,
  measure: Measure = measureText,
): string | null {
  const v = makeView(profile, options.strings);
  if (!v.p.founder) return null;
  const beat = options.beat === "founder" ? "founder" : "";
  const c = makeCtx(v, { id: uid(), theme: options.theme, flat: true, measure });
  const { parts } = buildParts(c);
  // only what the crop can show: the plate, the frame (with its text), the foil on the edge
  const body = parts.defs + mirror(plateBase(v.F), v.ar) + parts.frame + parts.holo;
  const box = v.ar ? "0 1100 440 518" : "560 1100 440 518";
  return (
    `<div class="mc-eclat mc-eclat--${v.tierKey} mc-eclat--${options.theme} mc-eclat--detail${v.F.holo ? " mc-holo" : ""}${beat ? ` mc-eclat--beat-${beat}` : ""}" dir="${v.ar ? "rtl" : "ltr"}" role="img" aria-label="${esc(options.strings.founderLine)}" data-mc-tier="${v.tierKey}"${beat ? ` data-mc-beat="${beat}"` : ""}>` +
    `<svg viewBox="${box}" aria-hidden="true" focusable="false" style="direction:ltr">${body}</svg>` +
    `</div>`
  );
}
