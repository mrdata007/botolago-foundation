/**
 * Regenerates `../metrics.ts`: the committed advance widths and ink boxes of the card's faces
 * (plan 4, "Measuring"). The browser draws with canvas `measureText`; the server and the unit tests,
 * which have no canvas, read this table, so a card is laid out the same everywhere.
 *
 *   bun src/components/manager-card/eclat/scripts/measure-faces.ts
 *
 * It starts a small static server for `public/fonts`, opens Chromium with Playwright (the
 * repository's own binary, `E2E_CHROMIUM_PATH` or /opt/pw-browsers/chromium-1194), loads the faces
 * the way the app does (`src/fonts.css` and `eclat.css`), measures at 1000 px (reported at 100) with `textAlign` left
 * and writes the table. It also reports how far the per-glyph estimate is from the canvas on the
 * fixtures' own names, which `README.md` quotes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../../..");
const CHROMIUM =
  process.env.E2E_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const FACES = {
  d: "800 1000px Changa",
  dl: "300 1000px Changa",
  s: '400 1000px "Instrument Serif"',
  a: '700 1000px "Noto Sans Arabic"',
} as const;
type Face = keyof typeof FACES;

/** Letters a cleaned name is set in: A-Z, À–Ü without ×, Œ, Ý, Ÿ, digits, space, - ' . and the dash. */
const CHARS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ...Array.from({ length: 0xdc - 0xc0 + 1 }, (_, i) => String.fromCharCode(0xc0 + i)).filter(
    (c) => c !== "×",
  ),
  "Œ",
  "Ý",
  "Ÿ",
  ..."0123456789",
  " ",
  "-",
  "'",
  ".",
  "—",
];

/** Strings whose box is committed whole (no kerning guess): every rating, the dictionary's words. */
const NUMBERS = [...Array.from({ length: 99 }, (_, i) => String(i + 1)), "—"];
const ARABIC_LABELS = ["القائد", "التشكيلة", "الانتقالات", "الثبات"];
const TIER_WORDS = [
  "LASTREET",
  "STADE",
  "PRO",
  "CHAMPION",
  "LEGEND",
  "ملعب",
  "محترف",
  "بطل",
  "أسطورة",
];
/** Names to compare the per-glyph estimate with the canvas on. */
const SAMPLES: [Face, string][] = [
  ["d", "ABDELKARIM"],
  ["s", "BENJELLOUN-ALAOUI"],
  ["d", "LES LIONS"],
  ["s", "DU DERB SIDI MAAROUF"],
  ["s", "MOHAMMEDABDELHAKIMALAOUI"],
  ["d", "YASMINE"],
  ["s", "ALAOUI"],
  ["d", "KARIM"],
  ["s", "BENNANI"],
  ["d", "ÉLODIE"],
  ["s", "AVATAR"],
  ["d", "TAYLOR"],
];
const ARABIC_SAMPLES: [Face, string][] = [
  ["d", "فاطمة"],
  ["dl", "الزهراء"],
  ["d", "عبد الرحمن"],
  ["dl", "بن جلون العلوي"],
  ["d", "سلمى"],
  ["d", "عبد"],
  ["dl", "الإدريسي"],
  ["d", "محمد"],
  ["dl", "عبد الرحيم بن علي"],
];

type Box = [w: number, x0: number, x1: number, a: number, d: number];

const server = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  const send = (type: string, body: string | Buffer, status = 200) => {
    res.writeHead(status, { "content-type": type });
    res.end(body);
  };
  if (path === "/")
    return send("text/html", "<!doctype html><link rel=stylesheet href=/f.css><body>");
  if (path === "/f.css")
    return send(
      "text/css",
      readFileSync(join(ROOT, "src/fonts.css"), "utf8") +
        readFileSync(join(HERE, "../eclat.css"), "utf8"),
    );
  if (path.startsWith("/fonts/") && !path.includes(".."))
    return send("font/woff2", readFileSync(join(ROOT, "public", path)));
  return send("text/plain", "not found", 404);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`);

const result = await page.evaluate(
  async ({ FACES, CHARS, NUMBERS, ARABIC_LABELS, TIER_WORDS, SAMPLES, ARABIC_SAMPLES }) => {
    const sample = "ABCDEFGHIJKLMNOPQRSTUVWXYZÀÉ0123456789 -'. ابتثجحخدذرزسشصضطظعغفقكلمنهوي";
    await Promise.all(Object.values(FACES).map((spec) => document.fonts.load(spec, sample)));
    await document.fonts.ready;
    const ctx = document.createElement("canvas").getContext("2d")!;
    // measured at 1000 px (canvas rounds an ink box to whole pixels), reported at size 100
    const r1 = (v: number) => Math.round(v) / 10;
    const box = (face: string, text: string) => {
      ctx.font = FACES[face as keyof typeof FACES];
      ctx.textAlign = "left";
      ctx.direction = "inherit";
      const m = ctx.measureText(text);
      return [
        r1(m.width),
        r1(-m.actualBoundingBoxLeft),
        r1(m.actualBoundingBoxRight),
        r1(m.actualBoundingBoxAscent),
        r1(m.actualBoundingBoxDescent),
      ] as [number, number, number, number, number];
    };
    const ok = Object.entries(FACES).every(([, spec]) => document.fonts.check(spec, sample));
    const glyphs: Record<string, Record<string, number[]>> = { d: {}, s: {} };
    for (const face of ["d", "s"]) for (const ch of CHARS) glyphs[face]![ch] = box(face, ch);
    const numbers: Record<string, number[]> = {};
    for (const t of NUMBERS) numbers[t] = box("d", t);
    const known: Record<string, number[]> = {};
    for (const t of ARABIC_LABELS) known[`a|${t}`] = box("a", t);
    for (const t of TIER_WORDS) known[`d|${t}`] = box("d", t);
    // kerning: the pair's advance less the two letters' own, among the capitals and the signs
    const kernSet = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ-'. "];
    const kern: Record<string, Record<string, number>> = { d: {}, s: {} };
    for (const face of ["d", "s"]) {
      const w = (t: string) => box(face, t)[0];
      for (const a of kernSet)
        for (const b of kernSet) {
          const delta = w(a + b) - w(a) - w(b);
          if (Math.abs(delta) >= 0.3) kern[face]![a + b] = Math.round(delta * 10) / 10;
        }
    }
    const samples = [...SAMPLES, ...ARABIC_SAMPLES].map(([face, text]) => ({
      face,
      text,
      box: box(face, text),
    }));
    // Arabic: width per letter and the tallest ink, over a set of names
    const arabic: Record<string, { em: number; a: number; d: number }> = {};
    for (const face of ["d", "dl"]) {
      let w = 0;
      let letters = 0;
      let a = 0;
      let d = 0;
      for (const [f, text] of ARABIC_SAMPLES) {
        if (f !== face) continue;
        const b = box(face, text);
        w += b[0];
        letters += [...text.replace(/ /g, "")].length;
        a = Math.max(a, b[3]);
        d = Math.max(d, b[4]);
      }
      arabic[face] = { em: w / 100 / letters, a: a / 100, d: d / 100 };
    }
    return { ok, glyphs, numbers, known, samples, arabic, kern };
  },
  { FACES, CHARS, NUMBERS, ARABIC_LABELS, TIER_WORDS, SAMPLES, ARABIC_SAMPLES },
);
await browser.close();
server.close();
if (!result.ok) throw new Error("the faces did not load; nothing written");

const fmt = (b: number[]) => `[${b.join(", ")}]`;
const table = (rows: Record<string, number[]>) =>
  Object.entries(rows)
    .map(([k, b]) => `  ${JSON.stringify(k)}: ${fmt(b)},`)
    .join("\n");

const kernTable = (rows: Record<string, number>) =>
  Object.entries(rows)
    .map(([k, v]) => `    ${JSON.stringify(k)}: ${v},`)
    .join("\n");

// the estimate against the canvas on the sample names (per-glyph sums, no kerning)
const lines: string[] = [];
for (const s of result.samples) {
  if (/\p{Script=Arabic}/u.test(s.text)) continue;
  const g = result.glyphs[s.face === "dl" ? "d" : s.face]!;
  const k = result.kern[s.face === "dl" ? "d" : s.face]!;
  const chars = [...s.text];
  const est = chars.reduce(
    (a, ch, i) => a + (g[ch]?.[0] ?? 60) + (i ? (k[chars[i - 1]! + ch] ?? 0) : 0),
    0,
  );
  lines.push(
    `${s.face} ${s.text}: canvas ${s.box[0]}, estimate ${est.toFixed(1)}, ${(((est - s.box[0]) / s.box[0]) * 100).toFixed(1)} %`,
  );
}
const arabicEm = (face: "d" | "dl") => result.arabic[face]!;

const out = `/**
 * Committed advance widths and ink boxes of the card's faces, measured once in Chromium at 100 px
 * (plan 4, "Measuring"). GENERATED by \`scripts/measure-faces.ts\`; do not edit by hand.
 *
 * A box is [advance, ink left, ink right, ink ascent, ink descent] at size 100, measured from the
 * text's origin (\`textAlign: left\`), so a string's ink spans x0 .. x1 and its centre is
 * (x0 + x1) / 2. The browser measures with canvas; the server and the unit tests have no canvas and
 * read this table, summing the advances of a name's letters and the pair kerning (the check below
 * says by how much that is still off).
 *
 *   Faces: d = Changa 800, s = Instrument Serif 400 (letters, digits, space, - ' . and the dash);
 *          a = Noto Sans Arabic 700 and d, for the dictionary's own words (KNOWN);
 *          NUMBERS = every rating 1-99 and the dash in Changa 800, whole (the number's fit).
 *
 * Per-glyph estimate against the canvas, on the sample names:
${lines.map((l) => ` *   ${l}`).join("\n")}
 */
export type GlyphBox = readonly [
  advance: number,
  x0: number,
  x1: number,
  ascent: number,
  descent: number,
];

export const GLYPHS: Readonly<Record<"d" | "s", Readonly<Record<string, GlyphBox>>>> = {
  d: {
${table(result.glyphs.d!).replace(/^/gm, "  ")}
  },
  s: {
${table(result.glyphs.s!).replace(/^/gm, "  ")}
  },
};

/** Pair kerning at size 100 (advance change when the second letter follows the first), |Δ| ≥ 0.3. */
export const KERN: Readonly<Record<"d" | "s", Readonly<Record<string, number>>>> = {
  d: {
${kernTable(result.kern.d!)}
  },
  s: {
${kernTable(result.kern.s!)}
  },
};

/** Every rating and the dash, in Changa 800, measured whole. */
export const NUMBERS: Readonly<Record<string, GlyphBox>> = {
${table(result.numbers)}
};

/** The dictionary's own strings, measured whole: "<face>|<text>". */
export const KNOWN: Readonly<Record<string, GlyphBox>> = {
${table(result.known)}
};

/**
 * Arabic names have no per-letter table (joining changes every advance): the width per letter in
 * em and the tallest ink over the sample names, for Changa 800 (d) and Changa 300 (dl).
 */
export const ARABIC: Readonly<Record<"d" | "dl", { em: number; ascent: number; descent: number }>> = {
  d: { em: ${arabicEm("d").em.toFixed(3)}, ascent: ${arabicEm("d").a.toFixed(3)}, descent: ${arabicEm("d").d.toFixed(3)} },
  dl: { em: ${arabicEm("dl").em.toFixed(3)}, ascent: ${arabicEm("dl").a.toFixed(3)}, descent: ${arabicEm("dl").d.toFixed(3)} },
};
`;
writeFileSync(join(HERE, "../metrics.ts"), out);
console.log(lines.join("\n"));
console.log("Arabic", JSON.stringify(result.arabic));
console.log("wrote metrics.ts");
