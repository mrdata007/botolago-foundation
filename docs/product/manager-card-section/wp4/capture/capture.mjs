// WP4 captures: the moments on Gradins' home (through the capture host), the share sheet and its
// 1080 x 1920 picture, the replay sheet, and the t = 0 / mid-beat frames, with the numbers measured.
//
//   node capture.mjs <job> [--fixture=rated] [--lang=fr|ar] [--theme=light|dark] [--w=390] [--h=844]
//                    [--host=team] [--share] [--replay=<index>] [--at=<ms>] [--reduced] [--out=<name>]
//
// jobs:  hero      the page with its hero, motion settled (waits for the beat to end)
//        frame     a frozen frame of the beat at --at ms (0 = the first frame), with the number measured
//        share     the share sheet open
//        picture   the 1080 x 1920 share picture itself (drawn by the real module in the page)
//        replay    the replay sheet at --replay=<index>
//        (--plain: hero, with no hero to wait for)
//        probe     console errors, failed requests, element rectangles, tap sizes, contrast inputs
//
// Env: BASE (default http://127.0.0.1:4184), PW_CORE, CHROME, OUT_DIR, STATE (a login state file).
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const PW_CORE =
  process.env.PW_CORE ??
  "/tmp/claude-0/-home-user-botolago-foundation/09f7cd8f-a9f8-5b6b-ae49-c115e311665e/scratchpad/tools/node_modules/playwright-core/index.mjs";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE ?? "http://127.0.0.1:4184";
const OUT = process.env.OUT_DIR ?? new URL("..", import.meta.url).pathname;
const STATE =
  process.env.STATE ??
  "/tmp/claude-0/-home-user-botolago-foundation/09f7cd8f-a9f8-5b6b-ae49-c115e311665e/scratchpad/wp4/state.json";

const args = process.argv.slice(2);
const job = args.find((a) => !a.startsWith("--")) ?? "hero";
const flag = (name, fallback) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? fallback;
const has = (name) => args.includes(`--${name}`);

const fixture = flag("fixture", "rated");
const lang = flag("lang", "fr");
const theme = flag("theme", "light");
const w = Number(flag("w", 390));
const h = Number(flag("h", 844));
const host = flag("host", "");
const at = Number(flag("at", 0));
const replay = flag("replay", "");
const reduced = has("reduced");
const name = flag(
  "out",
  `${job}-${fixture}${host ? `-${host}` : ""}${job === "frame" ? `-t${at}` : ""}-${lang}-${theme}-${w}`,
);

const pw = await import(PW_CORE);
const browser = await pw.chromium.launch({ executablePath: CHROME });

async function loginState() {
  if (existsSync(STATE)) return STATE;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr" });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("botolago.welcomed", "1");
    localStorage.setItem("botolago.prizes.welcome.v1", "1");
    localStorage.setItem("botolago.language", "fr");
    sessionStorage.setItem("botolago.splashShown", "1");
  });
  await page.goto(`${BASE}/auth/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/e-?mail/i).fill("demo@botolago.ma");
  await page.locator('input[type="password"]').fill("demo1234");
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(2500);
  await ctx.storageState({ path: STATE });
  await ctx.close();
  return STATE;
}

const state = await loginState();
const context = await browser.newContext({
  storageState: state,
  viewport: { width: w, height: h },
  deviceScaleFactor: w < 800 ? 2 : 1,
  colorScheme: theme,
  locale: lang === "ar" ? "ar" : "fr",
  reducedMotion: reduced ? "reduce" : "no-preference",
});
const page = await context.newPage();
await page.addInitScript(
  ([lang, theme, frozen]) => {
    localStorage.setItem("botolago.welcomed", "1");
    localStorage.setItem("botolago.prizes.welcome.v1", "1");
    localStorage.setItem("botolago.language", lang);
    localStorage.setItem("botolago.theme", theme);
    sessionStorage.setItem("botolago.splashShown", "1");
    if (frozen) {
      // Every animation holds its first frame until the capture moves it.
      const style = document.createElement("style");
      style.textContent = "*,*::before,*::after{animation-play-state:paused !important}";
      // `ManagerCard` drops a beat's class after the beat's length, by a timer: hold that timer too,
      // or the card jumps to its finished state while the frame is being taken.
      const timer = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...rest) =>
        timer(
          fn,
          typeof fn === "function" && String(fn).includes("setPlayed") ? 600000 : ms,
          ...rest,
        );
      const add = () => (document.head ?? document.documentElement).append(style);
      if (document.documentElement) add();
      else document.addEventListener("DOMContentLoaded", add);
    }
  },
  [lang, theme, job === "frame"],
);
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror ${String(e).slice(0, 200)}`));
page.on(
  "console",
  (m) => m.type() === "error" && problems.push(`console ${m.text().slice(0, 200)}`),
);
page.on("requestfailed", (r) => problems.push(`requestfailed ${r.url().slice(0, 120)}`));
page.on(
  "response",
  (r) => r.status() >= 400 && problems.push(`http ${r.status()} ${r.url().slice(0, 120)}`),
);

// A fixture the section ships does not cover (the arrival-forming panel needs `card_created` pending
// on a card with one counted journée): the capture rewrites the served fixtures module in flight,
// leaving the repository's file as it is.
if (has("arrival")) {
  await page.route("**/src/backend/manager-card/fixtures.ts*", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /("Forming, 1 of 3",\s*card\(\{)/,
      "$1 moments: [cardCreated()],",
    );
    await route.fulfill({ response, body });
  });
}

const query = new URLSearchParams({ mc: fixture });
if (host) query.set("host", host);
if (has("share")) query.set("share", "1");
if (replay !== "") query.set("replay", replay);
await page.goto(`${BASE}/gradins?${query}`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-mc-ready="1"]', { timeout: 20000 }).catch(() => {});
mkdirSync(OUT, { recursive: true });

async function numberProbe() {
  return await page.evaluate(() => {
    const el = document.querySelector('[data-mc="ovr"]');
    if (!el) return { found: false };
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const top = document.elementFromPoint(cx, cy);
    let opacity = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      opacity *= Number(getComputedStyle(n).opacity);
    }
    return {
      found: true,
      rect: [
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height),
      ],
      opacity,
      onTop: !!top && (el === top || el.contains(top)),
      visibility: getComputedStyle(el).visibility,
    };
  });
}

let extra = {};
if (job === "hero") {
  await page
    .waitForSelector('[data-testid="moment-hero"], [data-testid="card-born-panel"]', {
      timeout: 8000,
    })
    .catch(() => {});
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${name}.png` });
} else if (job === "frame") {
  await page
    .waitForSelector('[data-testid="moment-hero"], [data-testid="card-born-panel"]', {
      timeout: 8000,
    })
    .catch(() => {});
  // The beat starts when the card is drawn with it: wait for its class, then hold it where asked.
  await page.waitForSelector('.mc-echarpe[class*="--beat-"]', { timeout: 8000 }).catch(() => {});
  const count = await page.evaluate((at) => {
    const all = document.getAnimations();
    for (const a of all) {
      a.pause();
      a.currentTime = at;
    }
    return all.length;
  }, at);
  await page.waitForTimeout(150);
  extra = { animations: count, at, number: await numberProbe() };
  await page.screenshot({ path: `${OUT}/${name}.png` });
} else if (job === "share") {
  await page
    .waitForSelector('[data-testid="card-share-image"]', { timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
} else if (job === "replay") {
  await page.waitForSelector('[data-testid="replay-sheet"]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
} else if (job === "picture") {
  await page
    .waitForSelector('[data-testid="card-share-image"]', { timeout: 15000 })
    .catch(() => {});
  const dataUrl = await page.evaluate(async () => {
    const img = document.querySelector('[data-testid="card-share-image"]');
    if (!img) return null;
    const blob = await (await fetch(img.src)).blob();
    return await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(blob);
    });
  });
  if (dataUrl) writeFileSync(`${OUT}/${name}.png`, Buffer.from(dataUrl.split(",")[1], "base64"));
  else problems.push("no share image");
}

if (job === "probe" || has("probe")) {
  extra = {
    ...extra,
    animations: await page.evaluate(() => document.getAnimations().length),
    taps: await page.evaluate(() =>
      [...document.querySelectorAll("button, a[href]")]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0)
        .filter(({ el, r }) => (r.width < 44 || r.height < 44) && !el.closest("[inert]"))
        .map(
          ({ el, r }) =>
            `${el.tagName} ${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`,
        ),
    ),
    outside: await page.evaluate(
      (vw) =>
        [...document.querySelectorAll("main *, [data-testid]")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > vw + 1 || r.left < -1);
          })
          .slice(0, 8)
          .map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`),
      w,
    ),
  };
}

console.log(
  JSON.stringify({ job, name, url: page.url(), problems: problems.slice(0, 6), ...extra }),
);
await context.close();
await browser.close();
