// WP4 measurements on the moments, from the rendered page (CLAUDE.md "Evidence": element rectangles,
// never scrollWidth; contrast from rasterised pixels, never from the token's oklch).
//
//   node probe.mjs [--fixtures=rated,born0Serial,...] [--langs=fr,ar] [--themes=light,dark] [--w=390]
//                  [--host=team] [--reduced] [--out=file.json]
//
// For each fixture x language x theme, with the capture host in place, it reports:
//   - every button and link of the hero and the born panel: its rectangle, and whether it is >= 44 x 44
//   - every element of the block whose rectangle leaves the 390 px viewport (by rectangle)
//   - contrast of every text of the block: its colour (painted on a canvas to resolve oklch) against the
//     pixels behind it in a screenshot of the page (median of the box's edge pixels), 4.5:1 floor,
//     3:1 for text of 24 px or more
//   - the heading level of the hero label, and that no heading holds the manager's name
//   - the number: opacity, visibility and elementFromPoint at its centre, at the page's first frame
//   - document.getAnimations() after the page has settled (must be empty with reduced motion)
import { writeFileSync } from "node:fs";

const PW_CORE =
  process.env.PW_CORE ??
  "/tmp/claude-0/-home-user-botolago-foundation/09f7cd8f-a9f8-5b6b-ae49-c115e311665e/scratchpad/tools/node_modules/playwright-core/index.mjs";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE ?? "http://127.0.0.1:4184";
const STATE =
  process.env.STATE ??
  "/tmp/claude-0/-home-user-botolago-foundation/09f7cd8f-a9f8-5b6b-ae49-c115e311665e/scratchpad/wp4/state.json";
const args = process.argv.slice(2);
const flag = (n, d) =>
  args
    .find((a) => a.startsWith(`--${n}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? d;
const fixtures = flag(
  "fixtures",
  "born0Serial,rated,launchArrival,returning,tierUp,legend,founder,seasonClosed",
).split(",");
const langs = flag("langs", "fr,ar").split(",");
const themes = flag("themes", "light,dark").split(",");
const w = Number(flag("w", 390));
const h = Number(flag("h", 844));
const reduced = args.includes("--reduced");
const host = flag("host", "");
const out = flag("out", "");

const pw = await import(PW_CORE);
const browser = await pw.chromium.launch({ executablePath: CHROME });
const report = [];

for (const fixture of fixtures) {
  for (const lang of langs) {
    for (const theme of themes) {
      const context = await browser.newContext({
        storageState: STATE,
        viewport: { width: w, height: h },
        deviceScaleFactor: 1,
        colorScheme: theme,
        reducedMotion: reduced ? "reduce" : "no-preference",
      });
      const page = await context.newPage();
      await page.addInitScript(
        ([lang, theme]) => {
          localStorage.setItem("botolago.welcomed", "1");
          localStorage.setItem("botolago.prizes.welcome.v1", "1");
          localStorage.setItem("botolago.language", lang);
          localStorage.setItem("botolago.theme", theme);
          sessionStorage.setItem("botolago.splashShown", "1");
        },
        [lang, theme],
      );
      const problems = [];
      page.on("pageerror", (e) => problems.push(`pageerror ${String(e).slice(0, 160)}`));
      page.on(
        "console",
        (m) => m.type() === "error" && problems.push(`console ${m.text().slice(0, 160)}`),
      );
      await page.goto(`${BASE}/gradins?mc=${fixture}${host ? `&host=${host}` : ""}`, {
        waitUntil: "networkidle",
      });
      await page
        .waitForSelector('[data-testid="moment-hero"], [data-testid="card-born-panel"]', {
          timeout: 8000,
        })
        .catch(() => {});
      await page.waitForTimeout(900);
      const shot = (await page.screenshot({ fullPage: true })).toString("base64");
      const measured = await page.evaluate(
        async ({ shot, vw }) => {
          const block = document.querySelector(
            '[data-testid="moment-hero"], [data-testid="card-born-panel"]',
          );
          if (!block) return { block: false };
          const img = new Image();
          await new Promise((res) => {
            img.onload = res;
            img.src = `data:image/png;base64,${shot}`;
          });
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const paint = (css) => {
            const c = document
              .createElement("canvas")
              .getContext("2d", { willReadFrequently: true });
            c.canvas.width = c.canvas.height = 1;
            c.fillStyle = "#000";
            c.fillRect(0, 0, 1, 1);
            c.fillStyle = css;
            c.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = c.getImageData(0, 0, 1, 1).data;
            return [r, g, b, a];
          };
          const lum = ([r, g, b]) => {
            const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
          };
          const ratio = (a, b) => {
            const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
            return (l1 + 0.05) / (l2 + 0.05);
          };
          const behind = (rect, pill) => {
            // A pill's corners are the page behind it: read its ends, inside the curve, instead.
            if (pill) {
              const midY = Math.round((rect.top + rect.bottom) / 2);
              const inset = Math.round(rect.height / 2) + 2;
              const ends = [
                [Math.round(rect.left) + inset, midY],
                [Math.round(rect.right) - inset, midY],
                [Math.round(rect.left) + inset, midY - 8],
                [Math.round(rect.right) - inset, midY + 8],
              ].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
              const med = (i) =>
                ends.map((p) => p[i]).sort((a, b) => a - b)[Math.floor(ends.length / 2)];
              return [med(0), med(1), med(2)];
            }
            // The box's border pixels, one pixel outside the text's own ink where it can be had.
            const pts = [];
            const x0 = Math.max(0, Math.floor(rect.left));
            const x1 = Math.min(img.width - 1, Math.ceil(rect.right) - 1);
            const y0 = Math.max(0, Math.floor(rect.top));
            const y1 = Math.min(img.height - 1, Math.ceil(rect.bottom) - 1);
            for (let x = x0; x <= x1; x += Math.max(1, Math.floor((x1 - x0) / 12))) {
              pts.push([x, y0], [x, y1]);
            }
            for (let y = y0; y <= y1; y += Math.max(1, Math.floor((y1 - y0) / 6))) {
              pts.push([x0, y], [x1, y]);
            }
            const px = pts.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
            const med = (i) => px.map((p) => p[i]).sort((a, b) => a - b)[Math.floor(px.length / 2)];
            return [med(0), med(1), med(2)];
          };
          const texts = [];
          for (const el of block.querySelectorAll("h2, p, button, a")) {
            if (el.closest("[inert]")) continue;
            const own =
              [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) ||
              el.matches("button, a");
            const label = (el.textContent ?? "").trim();
            if (!own && !label) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const cs = getComputedStyle(el);
            const fg = paint(cs.color).slice(0, 3);
            const bg = behind(
              r,
              el.matches("button, a") && getComputedStyle(el).borderRadius !== "0px",
            );
            const px = parseFloat(cs.fontSize);
            texts.push({
              text: label.slice(0, 40),
              tag: el.tagName.toLowerCase(),
              size: px,
              ratio: Math.round(ratio(fg, bg) * 100) / 100,
              floor: px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700) ? 3 : 4.5,
              onGradient: !!cs.backgroundImage && cs.backgroundImage !== "none",
            });
          }
          const taps = [...block.querySelectorAll("button, a[href]")]
            .filter((el) => !el.closest("[inert]"))
            .map((el) => {
              const r = el.getBoundingClientRect();
              return {
                name: el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 24),
                w: Math.round(r.width),
                h: Math.round(r.height),
              };
            });
          const outside = [...block.querySelectorAll("*")]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5);
            })
            .slice(0, 6)
            .map(
              (el) => `${el.tagName}.${String(el.className.baseVal ?? el.className).slice(0, 30)}`,
            );
          const heading = block.querySelector("h2");
          const ovr = document.querySelector('[data-mc="ovr"]');
          let number = null;
          if (ovr) {
            const r = ovr.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            let opacity = 1;
            for (let n = ovr; n && n.nodeType === 1; n = n.parentElement)
              opacity *= Number(getComputedStyle(n).opacity);
            number = {
              opacity,
              onTop: !!top && (top === ovr || ovr.contains(top)),
              visibility: getComputedStyle(ovr).visibility,
            };
          }
          return {
            block: true,
            heading: heading ? { level: heading.tagName, text: heading.textContent.trim() } : null,
            texts,
            taps,
            outside,
            number,
            animations: document.getAnimations().length,
            dir: document.documentElement.dir,
          };
        },
        { shot, vw: w },
      );
      report.push({ fixture, lang, theme, problems, ...measured });
      await context.close();
    }
  }
}
await browser.close();

let failures = 0;
for (const r of report) {
  if (!r.block) {
    console.log(`${r.fixture} ${r.lang} ${r.theme}: NO BLOCK`);
    failures += 1;
    continue;
  }
  const lowText = r.texts.filter((t) => t.ratio < t.floor);
  const smallTaps = r.taps.filter((t) => t.w < 44 || t.h < 44);
  const bad =
    lowText.length +
    smallTaps.length +
    r.outside.length +
    r.problems.length +
    (r.number && (r.number.opacity !== 1 || !r.number.onTop) ? 1 : 0);
  failures += bad ? 1 : 0;
  const worst = r.texts.length ? Math.min(...r.texts.map((t) => t.ratio)) : null;
  console.log(
    `${r.fixture} ${r.lang} ${r.theme}: texts=${r.texts.length} worst=${worst} taps=${r.taps.map((t) => `${t.w}x${t.h}`).join(",")} outside=${r.outside.length} anim=${r.animations} number=${JSON.stringify(r.number)} heading=${r.heading?.level}${bad ? "  <-- " + JSON.stringify({ lowText, smallTaps, outside: r.outside, problems: r.problems }) : ""}`,
  );
}
console.log(failures === 0 ? "PROBE OK" : `PROBE FINDINGS: ${failures}`);
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
