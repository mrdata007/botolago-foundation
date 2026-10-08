/**
 * WP6a capture script: the account path (register, profile setup), the Pépites home back pill
 * and the deletion line, as the browser draws them.
 *
 *   node docs/product/manager-card-section/wp6/capture.mjs [--tag before|after] [--only a,b]
 *
 * Environment:
 *   WP6_BASE       the dev server, default http://127.0.0.1:4186 (this package's own port; never
 *                  point it at another worktree's server)
 *   WP6_OUT        output folder, default the folder of this script
 *   WP6_CHROMIUM   Chromium executable, default /opt/pw-browsers/chromium-1194/chrome-linux/chrome
 *   WP6_PROBE=1    also print the element measures this package checks (see `measure`)
 *   WP6_SELFTEST=1 add a box past the right edge before measuring (the probe must then say so)
 *   WP6_CONTRAST=1 also read text contrast from rasterised pixels (see `contrastOf`)
 *
 * The server is started with the mock modes (see INDEX.md). Sessions are seeded into
 * `localStorage` the way `src/services/auth-mock.ts` reads them; nothing is written to a database.
 * File names: <scene>-<fr|ar>-<light|dark>-<390|1440>[-<tag>].png
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.WP6_BASE ?? "http://127.0.0.1:4186";
const OUT = process.env.WP6_OUT ?? here;
const CHROMIUM = process.env.WP6_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const args = process.argv.slice(2);
const argValue = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const TAG = argValue("--tag") ?? "";
const ONLY = (argValue("--only") ?? "").split(",").filter(Boolean);
const PROBE = process.env.WP6_PROBE === "1";
const CONTRAST = process.env.WP6_CONTRAST === "1";

const VIEWPORTS = {
  390: { width: 390, height: 844 },
  1440: { width: 1440, height: 900 },
};

/** The account the mock auth reads: a guest who has just registered (profile not complete). */
const NEW_ACCOUNT = {
  id: "usr_wp6_new",
  email: "karim@botolago.test",
  displayName: "Karim",
  username: "karim_k",
  profileComplete: false,
};
/** A finished account, for the profile page. */
const DONE_ACCOUNT = {
  id: "usr_wp6_done",
  email: "karim@botolago.test",
  displayName: "Karim",
  username: "karim_k",
  profileComplete: true,
  favoriteClubId: "war",
};

async function newContext(browser, { lang, theme, size, account }) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[size],
    deviceScaleFactor: 1,
    locale: lang === "ar" ? "ar-MA" : "fr-FR",
    colorScheme: theme,
  });
  await context.addInitScript(
    ({ lang, theme, account }) => {
      const ls = window.localStorage;
      ls.setItem("botolago.welcomed", "1");
      ls.setItem("botolago.prizes.welcome.v1", "1");
      ls.setItem("botolago.language", lang);
      ls.setItem("botolago.theme", theme);
      window.sessionStorage.setItem("botolago.splashShown", "1");
      if (account) {
        const user = {
          ...account,
          language: lang,
          notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
          createdAt: "2026-10-01T10:00:00.000Z",
          verified: true,
          provider: "email",
          passwordDigest: "mock:0",
        };
        ls.setItem("botolago.auth.users", JSON.stringify([user]));
        ls.setItem(
          "botolago.auth.session",
          JSON.stringify({ kind: "user", userId: user.id, createdAt: "2026-10-01T10:00:00.000Z" }),
        );
      }
    },
    { lang, theme, account },
  );
  return context;
}

/** What each scene does after the page has loaded. */
const SCENES = {
  register: {
    path: "/auth/register?next=/fantasy/create",
    account: null,
    fullPage: true,
    sizes: [390],
    contrast: ['[id$="-hint"]'],
  },
  "register-error": {
    path: "/auth/register?next=/fantasy/create",
    account: null,
    fullPage: true,
    sizes: [390],
    themes: ["light"],
    async act(page) {
      await page.getByRole("button", { name: /Créer mon compte|إنشاء حسابي/ }).click();
      await page.waitForTimeout(300);
    },
  },
  "setup-name": {
    contrast: ['[data-testid="auth-card-row"] p', "#displayName-hint"],
    path: "/auth/profile-setup?next=/fantasy/create",
    account: NEW_ACCOUNT,
    fullPage: true,
    async act(page) {
      const field = page.locator("#displayName");
      await field.waitFor();
      await field.fill("Karim");
      await page.waitForTimeout(250);
    },
  },
  "setup-name-arabic": {
    path: "/auth/profile-setup?next=/fantasy/create",
    account: NEW_ACCOUNT,
    fullPage: true,
    sizes: [390],
    themes: ["light"],
    langs: ["ar"],
    async act(page) {
      const field = page.locator("#displayName");
      await field.waitFor();
      await field.fill("كريم");
      await page.waitForTimeout(250);
    },
  },
  "setup-club": {
    contrast: ['[data-testid="auth-card-row"] p'],
    path: "/auth/profile-setup?next=/fantasy/create",
    account: NEW_ACCOUNT,
    fullPage: true,
    async act(page) {
      await page.locator("#displayName").waitFor();
      await page.getByRole("button", { name: /Suivant|التالي/ }).click();
      const rows = page.locator("button[aria-pressed][data-club]");
      await rows.nth(2).waitFor();
      await rows.nth(2).click();
      await page.waitForTimeout(300);
    },
  },
  "setup-club-none": {
    path: "/auth/profile-setup?next=/fantasy/create",
    account: NEW_ACCOUNT,
    fullPage: true,
    sizes: [390],
    themes: ["light"],
    async act(page) {
      await page.locator("#displayName").waitFor();
      await page.getByRole("button", { name: /Suivant|التالي/ }).click();
      await page.locator("button[aria-pressed][data-club]").nth(2).waitFor();
      await page.waitForTimeout(300);
    },
  },
  // No card yet (a new account): the server has not resolved a club, so a tapped club recolours
  // nothing and no hint promises a colour (owner decision 5).
  "setup-club-unresolved": {
    path: "/auth/profile-setup?next=/fantasy/create&mc=noCard",
    account: NEW_ACCOUNT,
    fullPage: true,
    sizes: [390],
    themes: ["light"],
    async act(page) {
      await page.locator("#displayName").waitFor();
      await page.getByRole("button", { name: /Suivant|التالي/ }).click();
      const rows = page.locator("button[aria-pressed][data-club]");
      await rows.nth(2).waitFor();
      await rows.nth(2).click();
      await page.waitForTimeout(300);
    },
  },
  "setup-no-next": {
    path: "/auth/profile-setup",
    account: NEW_ACCOUNT,
    fullPage: true,
    sizes: [390],
    themes: ["light"],
    async act(page) {
      await page.locator("#displayName").waitFor();
      await page.waitForTimeout(250);
    },
  },
  pepites: {
    path: "/pepites",
    account: null,
    fullPage: false,
    wait: "[data-testid=pepites-page]",
    contrast: ['[data-testid="pepites-back"]', '[data-testid="pepites-section-label"]'],
  },
  "profile-delete": {
    path: "/profile?mc=rated",
    account: DONE_ACCOUNT,
    fullPage: false,
    sizes: [390],
    contrast: ['[data-testid="deletion-card-line"]'],
    async act(page) {
      await page.getByRole("button", { name: /Supprimer mon compte|حذف حسابي/ }).click();
      await page.waitForSelector("[role=dialog]");
      await page.waitForTimeout(400);
    },
  },
  "profile-delete-noserial": {
    path: "/profile?mc=born0",
    account: DONE_ACCOUNT,
    fullPage: false,
    sizes: [390],
    themes: ["light"],
    async act(page) {
      await page.getByRole("button", { name: /Supprimer mon compte|حذف حسابي/ }).click();
      await page.waitForSelector("[role=dialog]");
      await page.waitForTimeout(400);
    },
  },
  "profile-delete-nocard": {
    path: "/profile?mc=noCard",
    account: DONE_ACCOUNT,
    fullPage: false,
    sizes: [390],
    themes: ["light"],
    langs: ["fr"],
    async act(page) {
      await page.getByRole("button", { name: /Supprimer mon compte|حذف حسابي/ }).click();
      await page.waitForSelector("[role=dialog]");
      await page.waitForTimeout(400);
    },
  },
};

/** Measures this package reports (element rectangles, never scrollWidth; see CLAUDE.md "Evidence"). */
async function measure(page, name) {
  return page.evaluate((scene) => {
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: Math.round(r.left),
        top: Math.round(r.top),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };
    const byText = (re) =>
      [...document.querySelectorAll("button,a")].find((el) => re.test(el.textContent ?? ""));
    const out = { scene, viewport: { w: innerWidth, h: innerHeight } };
    out.next = rect(byText(/^\s*(Suivant|التالي)/));
    out.finish = rect(byText(/^\s*(Terminer|إنهاء)/));
    out.submit = rect(document.querySelector("form button[type=submit]"));
    out.token = rect(document.querySelector(".mc-token"));
    out.back = rect(document.querySelector("[data-testid=pepites-back]"));
    // Element rectangles, never scrollWidth (`html, body { overflow-x: clip }` hides overflow): every
    // visible box that crosses a side of the viewport, outside fixed layers and sideways scrollers.
    const width = document.documentElement.clientWidth;
    const inScroller = (el) => {
      // Ancestors below <body> only: `html, body { overflow-x: clip }` is the very thing that hides
      // overflow, so it must never excuse a box.
      for (let parent = el.parentElement; parent && parent !== document.body; ) {
        const style = getComputedStyle(parent);
        if (style.position === "fixed") return true;
        if (["auto", "scroll", "hidden", "clip"].includes(style.overflowX)) return true;
        parent = parent.parentElement;
      }
      return false;
    };
    out.offscreen = [...document.querySelectorAll("body *")]
      .filter((el) => !el.closest("svg") && !el.closest("[data-radix-popper-content-wrapper]"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (getComputedStyle(el).position === "fixed" || inScroller(el)) return false;
        return r.left < -0.5 || r.right > width + 0.5;
      })
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
    out.backPill = rect(document.querySelector("[data-testid=pepites-back] a"));
    out.cardRow = rect(document.querySelector("[data-testid=auth-card-row]"));
    out.deletionLine = rect(document.querySelector("[data-testid=deletion-card-line]"));
    const doc = document.documentElement;
    out.dir = doc.dir;
    out.scrollHeight = doc.scrollHeight;
    return out;
  }, name);
}

/**
 * Contrast read from rasterised pixels (CLAUDE.md "Evidence": `oklch` does not parse naively, so
 * nothing is computed from CSS). The element's box is screenshotted; the backdrop is the commonest
 * colour on the box's border, the text colour is the pixel furthest from it that occurs at least
 * three times (anti-aliasing edges do not). Returns the WCAG ratio, or null if there is no text.
 */
async function contrastOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return null;
  const png = await page.screenshot({
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
  });
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const at = (x, y) => {
      const i = (y * width + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const luminance = ([r, g, b]) => {
      const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const edge = new Map();
    for (let x = 0; x < width; x += 1) {
      for (const y of [0, height - 1])
        edge.set(at(x, y).join(), (edge.get(at(x, y).join()) ?? 0) + 1);
    }
    for (let y = 0; y < height; y += 1) {
      for (const x of [0, width - 1])
        edge.set(at(x, y).join(), (edge.get(at(x, y).join()) ?? 0) + 1);
    }
    const bg = [...edge.entries()]
      .sort((a, b) => b[1] - a[1])[0][0]
      .split(",")
      .map(Number);
    const counts = new Map();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const key = at(x, y).join();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const lb = luminance(bg);
    let best = null;
    for (const [key, count] of counts) {
      if (count < 3) continue;
      const lf = luminance(key.split(",").map(Number));
      const ratio = (Math.max(lb, lf) + 0.05) / (Math.min(lb, lf) + 0.05);
      if (!best || ratio > best.ratio) best = { ratio, fg: key };
    }
    return best && best.ratio > 1.05
      ? { ratio: Math.round(best.ratio * 100) / 100, fg: best.fg, bg: bg.join() }
      : null;
  }, png.toString("base64"));
}

async function run() {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const results = [];
  const sceneNames = Object.keys(SCENES).filter((name) => ONLY.length === 0 || ONLY.includes(name));
  const matrix = [];
  for (const name of sceneNames) {
    const scene = SCENES[name];
    for (const size of scene.sizes ?? [390, 1440]) {
      for (const lang of scene.langs ?? ["fr", "ar"]) {
        for (const theme of scene.themes ?? ["light", "dark"])
          matrix.push({ name, scene, size, lang, theme });
      }
    }
  }
  mkdirSync(OUT, { recursive: true });
  for (const { name, scene, size, lang, theme } of matrix) {
    const context = await newContext(browser, { lang, theme, size, account: scene.account });
    const page = await context.newPage();
    const problems = [];
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 200)}`);
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
    page.on("response", (r) => {
      if (r.status() >= 400) problems.push(`http ${r.status()} ${new URL(r.url()).pathname}`);
    });
    await page.goto(`${BASE}${scene.path}`, { waitUntil: "networkidle" });
    await page
      .locator("html")
      .and(page.locator(`[data-lang="${lang}"]`))
      .waitFor();
    if (scene.wait) await page.waitForSelector(scene.wait, { timeout: 15000 }).catch(() => {});
    if (scene.act) await scene.act(page);
    await page.waitForTimeout(600);
    const file = `${name}-${lang}-${theme}-${size}${TAG ? `-${TAG}` : ""}.png`;
    await page.screenshot({ path: join(OUT, file), fullPage: scene.fullPage ?? false });
    const row = { file, problems };
    if (process.env.WP6_SELFTEST === "1") {
      // Proves the overflow probe can fail: a 200px box pushed past the right edge must be reported.
      await page.evaluate(() => {
        const box = document.createElement("div");
        box.className = "selftest-overflow";
        box.style.cssText = "position:absolute;left:300px;top:200px;width:200px;height:20px";
        document.body.append(box);
      });
    }
    if (PROBE) row.measure = await measure(page, name);
    if (CONTRAST && scene.contrast) {
      row.contrast = {};
      for (const selector of scene.contrast)
        row.contrast[selector] = await contrastOf(page, selector);
    }
    results.push(row);
    console.log(
      `${file}${problems.length ? `  PROBLEMS: ${problems.join(" | ")}` : ""}${
        PROBE ? `\n   ${JSON.stringify(row.measure)}` : ""
      }${row.contrast ? `\n   contrast ${JSON.stringify(row.contrast)}` : ""}`,
    );
    await context.close();
  }
  await browser.close();
  writeFileSync(join(OUT, `.capture-${TAG || "run"}.json`), JSON.stringify(results, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
