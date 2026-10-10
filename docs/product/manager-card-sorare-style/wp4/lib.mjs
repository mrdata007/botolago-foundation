/**
 * Shared helpers of the WP4 measurement scripts (Manager Card collectible, plan 13): the browser,
 * a seeded context, and the pixel contrast functions. Every script takes its server from `BASE`
 * (no default that could silently attach to another worktree's server) and uses the sandbox's
 * Chromium. Nothing here touches a database: the server must be a development server started in
 * the mock data modes.
 */
import { chromium } from "@playwright/test";
import sharp from "sharp";

const BASE_ENV = process.env.BASE;
if (!BASE_ENV) {
  throw new Error(
    "set BASE to a development server you started yourself, e.g. http://127.0.0.1:4194",
  );
}
export const BASE = BASE_ENV.replace(/\/$/, "");
export const CHROMIUM =
  process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
export const launch = () => chromium.launch({ executablePath: CHROMIUM });

export const FIXED_TIME = new Date(process.env.CAPTURE_TIME ?? "2026-10-08T20:00:00Z");

export const DEMO = (lang) => ({
  id: "usr_demo",
  email: "demo@botolago.ma",
  displayName: "Rachid Demo",
  username: "rachid_demo",
  language: lang,
  notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
  profileComplete: true,
  createdAt: "2026-09-01T00:00:00Z",
  verified: true,
  provider: "email",
  favoriteClubId: "war",
  passwordDigest: "x",
});

/**
 * A browser context with the language, theme, splash and welcome flags seeded, and (unless
 * `signedIn: false`) the mock demo account. `reduced` asks for `prefers-reduced-motion: reduce`;
 * playwright's context option is applied AND `page.emulateMedia` is called by `go`, because the
 * option alone has been seen not to reach pages in this sandbox (WP3b note).
 */
export async function ctxFor(
  browser,
  {
    lang = "fr",
    theme = "light",
    width = 390,
    height = 844,
    dpr = 2,
    reduced = false,
    signedIn = true,
    touch = false,
  } = {},
) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    colorScheme: theme,
    reducedMotion: reduced ? "reduce" : "no-preference",
    hasTouch: touch,
    isMobile: touch,
  });
  await ctx.addInitScript(
    ([lang, theme, signedIn, demo]) => {
      localStorage.setItem("botolago.welcomed", "1");
      localStorage.setItem("botolago.prizes.welcome.v1", "1");
      localStorage.setItem("botolago.language", lang);
      localStorage.setItem("botolago.theme", theme);
      sessionStorage.setItem("botolago.splashShown", "1");
      sessionStorage.setItem("botolago.card.hero_session.v1", "1");
      if (signedIn) {
        localStorage.setItem("botolago.auth.users", JSON.stringify([demo]));
        localStorage.setItem(
          "botolago.auth.session",
          JSON.stringify({ kind: "user", userId: demo.id, createdAt: demo.createdAt }),
        );
      }
    },
    [lang, theme, signedIn, DEMO(lang)],
  );
  ctx.__opts = { reduced, theme, lang };
  return ctx;
}

/** Collects console errors, page errors and failed or 4xx/5xx responses of a page. */
export function watch(page) {
  const problems = [];
  page.on(
    "console",
    (m) => m.type() === "error" && problems.push(`console: ${m.text().slice(0, 200)}`),
  );
  page.on("pageerror", (e) => problems.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  page.on("requestfailed", (r) =>
    problems.push(`requestfailed: ${r.url().slice(0, 120)} ${r.failure()?.errorText}`),
  );
  page.on(
    "response",
    (r) => r.status() >= 400 && problems.push(`http ${r.status()} ${r.url().slice(0, 120)}`),
  );
  return problems;
}

export async function go(page, path, lang, { ready = true, clock = true } = {}) {
  const reduced = page.context().__opts?.reduced;
  if (reduced !== undefined) {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  }
  // a fixed clock freezes `Date.now()`, which the tilt's easing reads: motion scripts pass `clock: false`
  if (clock) await page.clock.setFixedTime(FIXED_TIME);
  await page.goto(BASE + path, { waitUntil: "load" });
  await page.waitForFunction((l) => document.documentElement.dataset.lang === l, lang, {
    timeout: 30000,
  });
  if (ready)
    await page.waitForSelector('[data-mc-ready="1"]', { timeout: 60000, state: "attached" });
}

/* ------------------------------------------------------------------ colour */

const f = (v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
export const lum = (r, g, b) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
export const ratio = (a, b) => {
  const [h, l] = a > b ? [a, b] : [b, a];
  return (h + 0.05) / (l + 0.05);
};
export const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

export async function raw(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * The contrast-probe's method (scripts/qa/contrast-probe.mjs, VERIFY_MANY): the commonest
 * luminance bin of the box is the backdrop, the furthest bin that holds at least 0.4 % of the
 * pixels is the ink. Null when the box holds only one tone.
 */
export async function histContrast(buf) {
  const { data } = await raw(buf);
  const BINS = 64;
  const MIN_INK = 0.004;
  const hist = new Array(BINS).fill(0);
  let total = 0;
  for (let i = 0; i < data.length; i += 3) {
    hist[Math.min(BINS - 1, Math.floor(lum(data[i], data[i + 1], data[i + 2]) * BINS))]++;
    total++;
  }
  let mode = 0;
  for (let i = 1; i < BINS; i++) if (hist[i] > hist[mode]) mode = i;
  let ink = null;
  let best = -1;
  for (let i = 0; i < BINS; i++) {
    if (hist[i] / total < MIN_INK) continue;
    const d = Math.abs(i - mode);
    if (d > best) {
      best = d;
      ink = i;
    }
  }
  if (ink === null || best < 1) return null;
  const L = (b) => (b + 0.5) / BINS;
  return round2(ratio(L(ink), L(mode)));
}

/** The 2nd and 98th percentile luminance pair (the OVR label against its halo). */
export async function percentileContrast(buf) {
  const { data } = await raw(buf);
  const L = [];
  for (let i = 0; i < data.length; i += 3) L.push(lum(data[i], data[i + 1], data[i + 2]));
  L.sort((a, b) => a - b);
  const q = (k) => L[Math.floor(k * (L.length - 1))];
  return round2(ratio(q(0.98), q(0.02)));
}

export const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

export const log = (...parts) => console.log(...parts);
