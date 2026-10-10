/**
 * WP6a "off means identical" proof, in a real browser: the DOM of each surface this package edits,
 * with the section switched off (`?mc=featureOff` answers the status read as off, so
 * `useManagerCardLive()` is false), taken from two trees and compared.
 *
 *   # tree A (the base: the section branch before WP6a) on port 4186
 *   WP6_BASE=http://127.0.0.1:4186 node off-identical.mjs snapshot base.json
 *   # tree B (this branch), same port once A's server is stopped
 *   WP6_BASE=http://127.0.0.1:4186 node off-identical.mjs snapshot after.json
 *   node off-identical.mjs compare base.json after.json
 *
 * Each snapshot is `document.body.innerHTML` without scripts and styles, with React's generated ids
 * normalised, after the page settled; also the requests the page made (method and path) and the
 * `localStorage` / `sessionStorage` key lists. `compare` prints every surface that differs, and
 * exits 1 if any does.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const BASE = process.env.WP6_BASE ?? "http://127.0.0.1:4186";
const CHROMIUM = process.env.WP6_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const ACCOUNT = {
  id: "usr_wp6_off",
  email: "karim@botolago.test",
  displayName: "Karim",
  username: "karim_k",
  profileComplete: false,
};
const DONE = { ...ACCOUNT, profileComplete: true, favoriteClubId: "war" };

const next = (page) => page.getByRole("button", { name: /Suivant|التالي/ }).click();
const SURFACES = {
  register: { path: "/auth/register?next=/fantasy/create&mc=featureOff", account: null },
  "register-error": {
    path: "/auth/register?mc=featureOff",
    account: null,
    async act(page) {
      await page.getByRole("button", { name: /Créer mon compte|إنشاء حسابي/ }).click();
      await page.waitForTimeout(300);
    },
  },
  "setup-1-builder": {
    path: "/auth/profile-setup?next=/fantasy/create&mc=featureOff",
    account: ACCOUNT,
    async act(page) {
      await page.locator("#displayName").fill("Karim");
    },
  },
  "setup-2-builder": {
    path: "/auth/profile-setup?next=/fantasy/create&mc=featureOff",
    account: ACCOUNT,
    async act(page) {
      await page.locator("#displayName").waitFor();
      await next(page);
      await page.locator("button[aria-pressed][data-club]").nth(2).click();
    },
  },
  "setup-3-builder": {
    path: "/auth/profile-setup?next=/fantasy/create&mc=featureOff",
    account: ACCOUNT,
    async act(page) {
      await page.locator("#displayName").waitFor();
      await next(page);
      await page.locator("button[aria-pressed][data-club]").nth(2).waitFor();
      await next(page);
      await page.waitForTimeout(200);
    },
  },
  "setup-1-plain": {
    path: "/auth/profile-setup?mc=featureOff",
    account: ACCOUNT,
    async act(page) {
      await page.locator("#displayName").waitFor();
    },
  },
  pepites: { path: "/pepites?mc=featureOff", account: null, wait: "[data-testid=pepites-page]" },
  profile: { path: "/profile?mc=featureOff", account: DONE },
  "profile-delete": {
    path: "/profile?mc=featureOff",
    account: DONE,
    async act(page) {
      await page.getByRole("button", { name: /Supprimer mon compte|حذف حسابي/ }).click();
      await page.waitForSelector("[role=dialog]");
      await page.waitForTimeout(400);
    },
  },
};

async function snapshot(out) {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const result = {};
  for (const lang of ["fr", "ar"]) {
    for (const [name, surface] of Object.entries(SURFACES)) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addInitScript(
        ({ lang, account }) => {
          const ls = window.localStorage;
          ls.setItem("botolago.welcomed", "1");
          ls.setItem("botolago.prizes.welcome.v1", "1");
          ls.setItem("botolago.language", lang);
          ls.setItem("botolago.theme", "light");
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
              JSON.stringify({ kind: "user", userId: user.id, createdAt: user.createdAt }),
            );
          }
        },
        { lang, account: surface.account },
      );
      const page = await context.newPage();
      const requests = new Set();
      const errors = [];
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.origin === new URL(BASE).origin)
          requests.add(`${request.method()} ${url.pathname.replace(/-[A-Za-z0-9_]{8}\./, ".")}`);
      });
      page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
      await page.goto(`${BASE}${surface.path}`, { waitUntil: "networkidle" });
      await page.locator(`html[data-lang="${lang}"]`).waitFor();
      if (surface.wait) await page.waitForSelector(surface.wait).catch(() => {});
      if (surface.act) await surface.act(page);
      await page.waitForTimeout(700);
      const state = await page.evaluate(() => {
        const body = document.body.cloneNode(true);
        for (const node of body.querySelectorAll("script,style,link")) node.remove();
        const html = body.innerHTML
          // The dev server stamps every element with its source file, line and column.
          .replace(/ data-tsd-source="[^"]*"/g, "")
          .replace(/_R_[a-z0-9_]+/gi, "_R_")
          .replace(/radix-[:\w-]+/g, "radix")
          .replace(/:r[0-9a-z]+:/g, ":r:");
        const keys = (storage) => Object.keys(storage).sort();
        return { html, local: keys(localStorage), session: keys(sessionStorage) };
      });
      result[`${name}-${lang}`] = { ...state, requests: [...requests].sort(), errors };
      await context.close();
    }
  }
  await browser.close();
  writeFileSync(out, JSON.stringify(result, null, 1));
  console.log(`${Object.keys(result).length} surfaces written to ${out}`);
}

function compare(aPath, bPath) {
  const a = JSON.parse(readFileSync(aPath, "utf8"));
  const b = JSON.parse(readFileSync(bPath, "utf8"));
  let differing = 0;
  for (const name of Object.keys(a)) {
    const notes = [];
    const plain = (html) => (html ?? "").replace(/ data-tsd-source="[^"]*"/g, "");
    if (plain(a[name].html) !== plain(b[name]?.html)) {
      const x = plain(a[name].html);
      const y = plain(b[name]?.html);
      let at = 0;
      while (at < x.length && x[at] === y[at]) at += 1;
      notes.push(
        `markup differs at ${at}: base «${x.slice(at, at + 90)}» after «${y.slice(at, at + 90)}»`,
      );
    }
    for (const field of ["local", "session", "requests", "errors"]) {
      const left = a[name][field];
      const right = b[name]?.[field] ?? [];
      if (JSON.stringify(left) !== JSON.stringify(right)) {
        const only = (x, y) => x.filter((item) => !y.includes(item));
        notes.push(
          `${field}: only in base ${JSON.stringify(only(left, right))}, only after ${JSON.stringify(only(right, left))}`,
        );
      }
    }
    if (notes.length) {
      differing += 1;
      console.log(`DIFF ${name}\n  ${notes.join("\n  ")}`);
    } else {
      console.log(
        `same ${name} (${a[name].html.length} chars, ${a[name].requests.length} requests)`,
      );
    }
  }
  console.log(differing === 0 ? "ALL IDENTICAL" : `${differing} DIFFER`);
  process.exit(differing === 0 ? 0 : 1);
}

const [command, one, two] = process.argv.slice(2);
if (command === "snapshot") await snapshot(one);
else if (command === "compare") compare(one, two);
else console.error("usage: off-identical.mjs snapshot <out.json> | compare <a.json> <b.json>");
