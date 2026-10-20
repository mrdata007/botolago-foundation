// Pure-renderer evidence, served locally. No database or email provider access.
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(process.argv[2] ?? "/tmp/botolago-email-design");
const baseUrl = process.env.EMAIL_CLUB_URL ?? "http://127.0.0.1:4391/";
const manifests = {};
for (const phase of ["club-before", "club-after"])
  manifests[phase] = JSON.parse(await readFile(`${root}/${phase}/rendered.json`, "utf8"));
const browser = await chromium.launch({
  executablePath: process.env.E2E_CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [],
  fallbacks = [];
const flat = (text) => text.replace(/[\s\u2066-\u2069]/g, "");
async function inspect(page) {
  return page.evaluate(() => {
    const bounds = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, right: r.right, width: r.width, height: r.height };
    };
    const visible = (el) =>
      el.getClientRects().length && getComputedStyle(el).visibility !== "hidden";
    const cell = document.querySelector("td.bg-card,td.content");
    const cta = cell.querySelector("[data-email-cta]") ?? cell.querySelector("a[href]");
    const footer =
      document.querySelector(".email-footer") ??
      (cell.matches(".bg-card")
        ? cell.parentElement.nextElementSibling.querySelector("td")
        : cell.closest("table").nextElementSibling.querySelector("td"));
    const textBoxes = [],
      walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim() || !visible(node.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects())
        if (r.width && r.height)
          textBoxes.push({ text: node.textContent.trim().slice(0, 100), x: r.x, right: r.right });
    }
    return {
      dir: document.documentElement.dir,
      body: cell.innerText,
      footer: footer.innerText,
      links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")),
      footerLinks: [...footer.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")),
      cta: { ...bounds(cta), href: cta.getAttribute("href"), text: cta.innerText },
      images: [...document.images].map((i) => ({
        src: i.getAttribute("src"),
        alt: i.alt,
        loaded: i.complete && i.naturalWidth > 0,
      })),
      outside: [...document.querySelectorAll("table,td,h1,h2,p,a,img,span,div")]
        .filter(visible)
        .map((el) => ({ tag: el.tagName, ...bounds(el) }))
        .filter((b) => b.width > 0 && (b.x < -1 || b.right > innerWidth + 1)),
      outsideText: textBoxes.filter((b) => b.x < -1 || b.right > innerWidth + 1),
    };
  });
}
try {
  for (const phase of ["club-before", "club-after"]) {
    await mkdir(`${root}/${phase}/screenshots`, { recursive: true });
    for (const entry of manifests[phase])
      for (const width of [320, 390, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(`${baseUrl}${phase}/${entry.id}.html`, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        const data = await inspect(page);
        const before =
          phase === "club-after"
            ? results.find(
                (r) => r.phase === "club-before" && r.id === entry.id && r.width === width,
              )
            : null;
        const old = manifests["club-before"].find((r) => r.id === entry.id);
        const contentOk =
          !before ||
          (flat(data.body) === flat(before.data.body) &&
            flat(data.footer) === flat(before.data.footer) &&
            JSON.stringify(data.footerLinks) === JSON.stringify(before.data.footerLinks) &&
            data.cta.href === before.data.cta.href &&
            flat(data.cta.text) === flat(before.data.cta.text) &&
            old.email.subject === entry.email.subject &&
            old.email.preheader === entry.email.preheader &&
            old.email.text === entry.email.text);
        const brandingOk =
          phase !== "club-after" ||
          (data.images.length === 1 &&
            data.images[0].src === "assets/botolago-wordmark-light.png" &&
            data.images[0].alt === "BotolaGO" &&
            data.images[0].loaded);
        results.push({ phase, id: entry.id, width, errors, contentOk, brandingOk, data });
        await page.screenshot({
          path: `${root}/${phase}/screenshots/${entry.id}-${width}.png`,
          fullPage: true,
        });
        await page.close();
      }
  }
  // Every real production family/language, without media CSS and without images.
  for (const entry of manifests["club-after"].filter((r) => !/points-(0|-4|123456)/.test(r.id)))
    for (const mode of ["inline-only", "images-blocked"]) {
      const page = await browser.newPage({ viewport: { width: 320, height: 1000 } });
      await page.route("**/*", async (route) => {
        if (mode === "images-blocked" && route.request().resourceType() === "image")
          return route.abort();
        if (mode === "inline-only" && route.request().resourceType() === "document") {
          const response = await route.fetch();
          return route.fulfill({
            response,
            body: (await response.text()).replace(/<style>[\s\S]*?<\/style>/g, ""),
          });
        }
        return route.continue();
      });
      await page.goto(`${baseUrl}club-after/${entry.id}.html`, { waitUntil: "load" });
      const data = await inspect(page);
      const main = results.find(
        (r) => r.phase === "club-after" && r.id === entry.id && r.width === 320,
      );
      const contentOk =
        flat(data.body) === flat(main.data.body) &&
        data.cta.href === main.data.cta.href &&
        data.images.every((i) => i.alt === "BotolaGO");
      fallbacks.push({ id: entry.id, mode, contentOk, data });
      if (entry.id === "automated.points-76.ar")
        await page.screenshot({
          path: `${root}/club-after/screenshots/${entry.id}-${mode}.png`,
          fullPage: true,
        });
      await page.close();
    }
} finally {
  await browser.close();
}
await writeFile(
  `${root}/club-after/geometry.json`,
  JSON.stringify({ results, fallbacks }, null, 2),
);
const failures = results.filter(
  (r) =>
    r.phase === "club-after" &&
    (!r.contentOk ||
      !r.brandingOk ||
      r.errors.length ||
      r.data.outside.length ||
      r.data.outsideText.length ||
      r.data.cta.height < 44 ||
      r.data.dir !== (r.id.endsWith(".ar") ? "rtl" : "ltr")),
);
const fallbackFailures = fallbacks.filter(
  (r) =>
    !r.contentOk || r.data.outside.length || r.data.outsideText.length || r.data.cta.height < 44,
);
const summary = {
  cases: results.length,
  afterCases: results.filter((r) => r.phase === "club-after").length,
  fallbackCases: fallbacks.length,
  baselineOverflow: results
    .filter(
      (r) => r.phase === "club-before" && (r.data.outside.length || r.data.outsideText.length),
    )
    .map((r) => ({ id: r.id, width: r.width })),
  failures: failures.map((r) => ({
    id: r.id,
    width: r.width,
    contentOk: r.contentOk,
    brandingOk: r.brandingOk,
    outside: r.data.outside,
    outsideText: r.data.outsideText,
  })),
  fallbackFailures: fallbackFailures.map((r) => ({
    id: r.id,
    mode: r.mode,
    outside: r.data.outside,
    outsideText: r.data.outsideText,
  })),
};
await writeFile(`${root}/club-after/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
if (failures.length || fallbackFailures.length) process.exitCode = 1;
