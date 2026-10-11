// Drives the built single page (dist/onboarding.html) through every control of its toolbar at 390
// and 1440 wide, in a real Chromium, opened from disk (file://), with motion left on so the card
// beats play. After each change it waits for the grid to finish and reports:
//   - console errors, page errors and "[onboarding]" warnings, and any request that is not a data: URL
//   - `.onb-missing` boxes (a direction or screen that failed to render)
//   - elements whose box leaves the page width, unless a clipping ancestor keeps them inside
//   - the variant count in the status line against the registry
// Every direction x language x theme x motion with "All screens", and every screen in the Screen
// select for every direction (Arabic, dark, motion on). Run `node design-lab/manager-cards-claude/build.mjs`
// first.
//
//   PW_CORE=/path/to/playwright-core/index.mjs CHROME=/path/to/chrome \
//   node design-lab/manager-cards-claude/tools/check-built-onboarding.mjs [--file=<built page>] [--widths=390,1440]
//
// Prints one JSON object (states checked, problems) and exits 1 when there is a problem.
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const flag = (name) =>
  process.argv
    .slice(2)
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
const file = resolve(flag("file") || resolve(here, "../dist/onboarding.html"));
const widths = (flag("widths") || "390,1440").split(",").map(Number);
if (!existsSync(file)) {
  console.error(`no built page at ${file}: run build.mjs first`);
  process.exit(2);
}

const pw = await import(process.env.PW_CORE || "playwright-core");
const browser = await pw.chromium.launch({ executablePath: process.env.CHROME || undefined });
const problems = [];
let states = 0;

/** Elements that leave [0, width], unless an ancestor that clips stays inside. In the page. */
const escaping = () => {
  const W = document.documentElement.clientWidth;
  const out = [];
  const within = (r) => r.left >= -1 && r.right <= W + 1;
  for (const e of document.querySelectorAll("body *")) {
    // the parts of an SVG are clipped by the SVG's own box (unless it sets overflow: visible)
    const svg = e.ownerSVGElement;
    if (svg && getComputedStyle(svg).overflow !== "visible") continue;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || within(r)) continue;
    let kept = false;
    for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (
        (cs.overflowX !== "visible" || cs.overflowY !== "visible") &&
        within(n.getBoundingClientRect())
      ) {
        kept = true;
        break;
      }
    }
    if (!kept)
      out.push(
        `${e.tagName.toLowerCase()}.${String((e.className && e.className.baseVal) ?? e.className).split(" ")[0]} ${Math.round(r.left)}..${Math.round(r.right)}`,
      );
    if (out.length > 6) break;
  }
  return { W, out, missing: document.querySelectorAll(".onb-missing").length };
};

for (const width of widths) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    colorScheme: "light",
  });
  let where = "load";
  const note = (kind, text) => problems.push({ width, where, kind, text: text.slice(0, 200) });
  page.on("pageerror", (e) => note("pageerror", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") note("console.error", m.text());
    else if (m.type() === "warning" && m.text().startsWith("[onboarding]"))
      note("console.warn", m.text());
  });
  page.on("request", (r) => {
    if (!r.url().startsWith("data:") && r.url() !== pathToFileURL(file).href)
      note("request", r.url());
  });
  await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1", null, {
    timeout: 60000,
  });
  const registry = await page.evaluate(() =>
    window.MC.ONB.SCREENS.filter((s) => s.id !== "S00").map((s) => [s.id, s.variants.length]),
  );
  const total = registry.reduce((n, [, k]) => n + k, 0);
  const dirs = await page.$$eval("#onbt-dir option", (o) => o.map((x) => x.value));
  const screens = await page.$$eval("#onbt-screen option", (o) => o.map((x) => x.value));

  // Run one toolbar change, wait for the grid to settle, measure.
  const settle = async (label, expectVariants) => {
    where = label;
    await page.waitForFunction(
      () => !document.getElementById("out").hasAttribute("aria-busy"),
      null,
      {
        timeout: 60000,
      },
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(60);
    const m = await page.evaluate(escaping);
    const status = await page.textContent("#onbt-status");
    states++;
    if (m.out.length) note("escapes", m.out.join("; "));
    if (m.missing) note("missing", `${m.missing} .onb-missing boxes`);
    if (expectVariants != null && !status.endsWith(`: ${expectVariants} variants`))
      note("status", `${status} (expected ${expectVariants} variants)`);
  };
  const press = async (key, value, label, expectVariants) => {
    const b = page.locator(`#toolbar button[data-key="${key}"][data-value="${value}"]`);
    if ((await b.getAttribute("aria-pressed")) !== "true") {
      const before = await page.textContent("#onbt-status");
      await b.click();
      await page.waitForFunction(
        (t) => document.getElementById("onbt-status").textContent !== t,
        before,
        {
          timeout: 60000,
        },
      );
    }
    await settle(label, expectVariants);
  };
  const choose = async (id, value, label, expectVariants) => {
    if ((await page.inputValue(`#${id}`)) === value) return settle(label, expectVariants);
    const before = await page.textContent("#onbt-status");
    await page.selectOption(`#${id}`, value);
    await page.waitForFunction(
      (t) => document.getElementById("onbt-status").textContent !== t,
      before,
      {
        timeout: 60000,
      },
    );
    await settle(label, expectVariants);
  };
  await settle("first render", total);

  // 1. every direction x language x theme x motion, all screens
  await choose("onbt-screen", "all", "screen all", total);
  for (const dir of dirs) {
    await choose("onbt-dir", dir, `${dir}`, total);
    for (const lang of ["fr", "ar"])
      for (const scheme of ["light", "dark"])
        for (const motion of [false, true]) {
          await press("lang", lang, `${dir} ${lang}`, total);
          await press("scheme", scheme, `${dir} ${lang} ${scheme}`, total);
          await press("motion", motion, `${dir} ${lang} ${scheme} motion ${motion}`, total);
        }
  }
  // 2. every screen in the Screen select, every direction, Arabic, dark, motion on
  await press("lang", "ar", "ar", total);
  await press("scheme", "dark", "dark", total);
  await press("motion", true, "motion on", total);
  for (const dir of dirs) {
    await choose("onbt-dir", dir, `${dir}`, null);
    for (const sc of screens.filter((s) => s !== "all"))
      await choose(
        "onbt-screen",
        sc,
        `${dir} ${sc}`,
        registry.find(([id]) => id === sc)?.[1] ?? null,
      );
    await choose("onbt-screen", "all", `${dir} all`, total);
  }
  await page.close();
}
await browser.close();
console.log(JSON.stringify({ file, widths, states, problems }, null, 1));
process.exit(problems.length ? 1 : 0);
