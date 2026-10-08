/**
 * WP2's captures of the Écharpe card through `/gradins` (plan 8.4): the stage with the fixtures
 * `rated`, `forming1`, `founder`, `legend`, `longNameLatin`, `arabicName` and `clubNull`, at
 * 390 x 844 (1x), in French and Arabic, light and dark; and, with motion on, the first frame (t = 0)
 * and the middle of the beat for `rated` (« first ») and `founder` (« founder »), with the probes
 * of plan 9, item 14: the number's element is there at t = 0, opaque, and the thing under its
 * centre.
 *
 *   VITE_MANAGER_CARD_PREVIEW=1 VITE_MANAGER_CARD_DATA_MODE=mock VITE_AUTH_MODE=mock \
 *   VITE_FANTASY_DATA_MODE=mock VITE_FOOTBALL_DATA_MODE=mock VITE_PEPITES_DATA_MODE=mock \
 *     bun run dev -- --host 127.0.0.1 --port 4188 --strictPort      # in the worktree, own port
 *   E2E_BASE_URL=http://127.0.0.1:4188 bun docs/product/manager-card-section/wp2/capture.ts
 *
 * Environment: E2E_BASE_URL (default http://127.0.0.1:4188), CHROMIUM (default the sandbox's
 * Chromium), OUT (default the folder of this file). The mock sign-in is the demo account of
 * `src/services/auth-mock.ts`. The stub G1 passes no beat to the card, so the beat frames replace
 * the stage's markup with the renderer's own markup for that beat, in the real page (fonts, theme,
 * layout), and pause every animation at the stated time.
 */
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4188";
const OUT = process.env.OUT ?? dirname(fileURLToPath(import.meta.url));
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const FIXTURES = [
  "rated",
  "forming1",
  "founder",
  "legend",
  "longNameLatin",
  "arabicName",
  "clubNull",
] as const;
const LANGS = ["fr", "ar"] as const;
const THEMES = ["light", "dark"] as const;
/**
 * The plan's two (`rated`, `founder`, at t = 0 and through the beat) and the others of plan 5.4.
 * `counted` shows the card as it is when the beat plays: the first rating is shown at 3 of 3.
 */
const BEAT_CASES: readonly {
  fixture: string;
  beat: string;
  times: readonly number[];
  counted?: number;
  tag?: string;
}[] = [
  { fixture: "rated", beat: "first", times: [0, 250, 490] },
  { fixture: "rated", beat: "first", times: [0, 250, 490], counted: 3, tag: "-at-3-of-3" },
  { fixture: "founder", beat: "founder", times: [0, 300, 600] },
  { fixture: "born0Serial", beat: "make", times: [0, 200, 450, 700] },
  { fixture: "forming1", beat: "tick", times: [0, 200, 360], counted: 2, tag: "-at-2-of-3" },
  { fixture: "tierUp", beat: "tier", times: [0, 300, 600] },
  { fixture: "legend", beat: "legend", times: [0, 270, 540] },
  { fixture: "seasonClosed", beat: "castoff", times: [0, 200, 380] },
];

const log: string[] = [];
const problems: string[] = [];

async function context(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  lang: string,
  theme: string,
  reducedMotion: "reduce" | "no-preference",
): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    // 1x: the card is a knit texture, which PNG cannot squeeze; the review set stays small
    deviceScaleFactor: 1,
    reducedMotion,
  });
  await ctx.addInitScript(
    ([language, mode]) => {
      window.localStorage.setItem("botolago.welcomed", "1");
      window.localStorage.setItem("botolago.prizes.welcome.v1", "1");
      window.localStorage.setItem("botolago.language", language);
      window.localStorage.setItem("botolago.theme", mode);
      window.sessionStorage.setItem("botolago.splashShown", "1");
    },
    [lang, theme],
  );
  return ctx;
}

function watch(page: Page, label: string) {
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`${label}: console error: ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => problems.push(`${label}: page error: ${e.message.slice(0, 200)}`));
  page.on("requestfailed", (r) => {
    if (!(r.failure()?.errorText ?? "").includes("ERR_ABORTED"))
      problems.push(`${label}: request failed: ${r.url().slice(0, 120)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`${label}: ${r.status()} ${r.url().slice(0, 120)}`);
  });
}

async function signIn(page: Page) {
  await page.goto(`${BASE}/auth/login`);
  await page.waitForSelector("html[data-lang]");
  await page.waitForTimeout(1500);
  await page.locator("form input:not([type=password])").first().fill("demo@botolago.ma");
  await page.locator('input[type="password"]').fill("demo1234");
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith("/auth/login"), { timeout: 30_000 });
}

async function openStage(page: Page, fixture: string) {
  await page.goto(`${BASE}/gradins?mc=${fixture}`);
  await page.waitForSelector("[data-testid=gradins-stage][data-mc-ready='1']", { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

/** What the number is at this instant: found, opaque, and what a pointer finds at its centre. */
function probeNumber() {
  const g = document.querySelector('[data-testid=gradins-stage] [data-mc="ovr"]');
  if (!g) return null;
  const r = g.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  let opacity = 1;
  for (let n: Element | null = g; n && n !== document.body; n = n.parentElement)
    opacity *= parseFloat(getComputedStyle(n).opacity);
  return {
    value: g.getAttribute("data-ovr"),
    opacity,
    width: Math.round(r.width),
    height: Math.round(r.height),
    hitIsNumber: !!hit && g.contains(hit),
  };
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
  const files: string[] = [];

  // the stage, every fixture, both languages, both themes (reduced motion: the finished card)
  for (const lang of LANGS)
    for (const theme of THEMES) {
      const ctx = await context(browser, lang, theme, "reduce");
      const page = await ctx.newPage();
      watch(page, `${lang}-${theme}`);
      await signIn(page);
      for (const fixture of FIXTURES) {
        await openStage(page, fixture);
        const file = `stage-${fixture}-${lang}-${theme}-390.png`;
        await page.screenshot({ path: join(OUT, file) });
        const animations = await page.evaluate(() => document.getAnimations().length);
        const number = await page.evaluate(probeNumber);
        files.push(file);
        log.push(
          `| ${file} | ${fixture} | ${lang} | ${theme} | ${animations} | ${number ? `${number.value ?? "dash"} (${number.width}x${number.height}, opacity ${number.opacity}, hit ${number.hitIsNumber})` : "none"} |`,
        );
      }
      await ctx.close();
    }

  // the beats, motion on: the first frame, the middle, the end
  const beatRows: string[] = [];
  for (const lang of LANGS) {
    const ctx = await context(browser, lang, "light", "no-preference");
    const page = await ctx.newPage();
    watch(page, `beat-${lang}`);
    await signIn(page);
    for (const { fixture, beat, times, counted, tag = "" } of BEAT_CASES) {
      await openStage(page, fixture);
      await page.evaluate(
        async ([id, beatName, language, counted]) => {
          const R = (await import("/src/components/manager-card/echarpe/index.ts")).echarpeRenderer;
          const { FIXTURES: FX } = await import("/src/backend/manager-card/fixtures.ts");
          const { fromMyCard } = await import("/src/components/manager-card/to-profile.ts");
          const { cardStrings } = await import("/src/components/manager-card/copy.ts");
          const { dictionaries } = await import("/src/i18n/dictionaries.ts");
          const dict = (dictionaries as Record<string, Record<string, string>>)[language];
          const strings = cardStrings((key: string) => dict[key] ?? key, language);
          const card = (FX as Record<string, { card: unknown }>)[id].card;
          const base = fromMyCard(card as never, { sample: true });
          const profile = counted == null ? base : { ...base, counted: counted as number };
          const root = document.querySelector("[data-testid=gradins-stage] .mc-echarpe");
          if (!root) throw new Error("no card");
          root.outerHTML = R.full(profile, { strings, theme: "light", beat: beatName as never });
        },
        [fixture, beat, lang, counted ?? null] as const,
      );
      const count = await page.evaluate(() => document.getAnimations().length);
      for (const t of times) {
        await page.evaluate((time) => {
          for (const a of document.getAnimations()) {
            a.pause();
            a.currentTime = time;
          }
        }, t);
        const number = await page.evaluate(probeNumber);
        const file = `beat-${beat}-${fixture}${tag}-t${t}-${lang}-light-390.png`;
        // the beat frames are the stage alone, with a margin for the fringe and the rail
        const box = await page.locator("[data-testid=gradins-stage]").boundingBox();
        if (!box) throw new Error("no stage");
        await page.screenshot({
          path: join(OUT, file),
          clip: {
            x: Math.max(0, box.x - 20),
            y: Math.max(0, box.y - 12),
            width: Math.min(390, box.width + 40),
            height: box.height + 40,
          },
        });
        files.push(file);
        beatRows.push(
          `| ${file} | ${beat} | ${t} ms | ${count} | ${number ? `${number.value ?? "dash"}, opacity ${number.opacity}, hit ${number.hitIsNumber}` : "none"} |`,
        );
      }
    }
    await ctx.close();
  }
  await browser.close();

  writeFileSync(
    join(OUT, "capture-results.md"),
    [
      "| File | Fixture | Language | Theme | Running animations | The number |",
      "| --- | --- | --- | --- | --- | --- |",
      ...log,
      "",
      "| File | Beat | At | Animations paused | The number |",
      "| --- | --- | --- | --- | --- |",
      ...beatRows,
      "",
      problems.length
        ? `Problems:\n${problems.map((p) => `- ${p}`).join("\n")}`
        : "No console error, page error, failed request or 4xx/5xx response on any capture.",
      "",
    ].join("\n"),
  );
  console.log(`${files.length} files; ${problems.length} problems`);
  if (problems.length) console.log(problems.join("\n"));
}

void main();
