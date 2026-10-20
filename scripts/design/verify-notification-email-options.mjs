// Local preview verification only; no email sending or shared database access.
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const root = resolve(process.argv[2] ?? "/workspace/artifacts/botolago-notification-email-options");
await mkdir(root + "/screenshots", { recursive: true });
const catalog = JSON.parse(await readFile(root + "/catalog.json", "utf8"));
const audit = JSON.parse(await readFile(root + "/source-audit.json", "utf8"));
const browser = await chromium.launch({
  executablePath:
    process.env.E2E_CHROMIUM_PATH ??
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  args: ["--no-sandbox"],
});
const results = [];
const compact = (s) =>
  s
    .replace(/[\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();
try {
  for (const email of catalog)
    for (const version of email.versions)
      for (const language of ["fr", "ar"])
        for (const width of [320, 390, 1280]) {
          const file = version.files[language],
            page = await browser.newPage({ viewport: { width, height: 1000 } });
          const errors = [];
          page.on("pageerror", (e) => errors.push(e.message));
          await page.goto(
            (process.env.EMAIL_OPTIONS_URL ?? "http://127.0.0.1:4391/options/") + file,
            { waitUntil: "load" },
          );
          const data = await page.evaluate(() => {
            const rect = (el) => {
              const r = el.getBoundingClientRect();
              return {
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
                right: r.right,
                bottom: r.bottom,
              };
            };
            const visible = (el) =>
              el.getClientRects().length && getComputedStyle(el).visibility !== "hidden";
            const nodes = [...document.querySelectorAll("table,td,h1,h2,p,a,img,span")].filter(
              visible,
            );
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            const textBoxes = [];
            let textNode;
            while ((textNode = walker.nextNode())) {
              if (!textNode.textContent.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(textNode);
              for (const box of range.getClientRects()) {
                if (box.width && box.height) {
                  textBoxes.push({ text: textNode.textContent.trim(), x: box.x, right: box.right });
                }
              }
            }
            return {
              textBoxes,
              direction: document.documentElement.dir,
              scrollWidth: document.documentElement.scrollWidth,
              boxes: nodes.map((el) => ({
                ...rect(el),
                tag: el.tagName,
                text: el.innerText?.trim().slice(0, 110),
                bg: getComputedStyle(el).backgroundColor,
                color: getComputedStyle(el).color,
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
              })),
              images: [...document.images].map((i) => ({
                src: i.getAttribute("src"),
                loaded: i.complete && i.naturalWidth > 0,
              })),
              links: [...document.querySelectorAll("a")].map((a) => ({
                href: a.getAttribute("href"),
                text: a.textContent.trim(),
              })),
              cta: rect(document.querySelector("[data-email-cta]")),
              text: document.querySelector(".email-content").innerText,
              footer: document.querySelector(".email-footer").innerText,
            };
          });
          const outside = data.boxes.filter(
            (b) => b.width > 0 && (b.x < -1 || b.right > width + 1),
          );
          const outsideText = data.textBoxes.filter((b) => b.x < -1 || b.right > width + 1);
          const source = audit.find((a) => a.type === email.type && a.language === language);
          const expected = await page.evaluate((model) => {
            const plain = (html) => {
              const d = document.createElement("div");
              d.innerHTML = html;
              return d.textContent;
            };
            const first = model.blocks.findIndex((b) => b.panel || b.heading);
            return {
              orderedData:
                first < 0
                  ? ""
                  : model.blocks
                      .slice(first)
                      .map((b) => plain(b.html))
                      .join(""),
              fragments: [...model.prose, ...model.panels, ...model.closing].map(plain),
              footer: plain(model.footer),
              footerLinks: [
                ...(() => {
                  const d = document.createElement("div");
                  d.innerHTML = model.footer;
                  return d.querySelectorAll("a");
                })(),
              ].map((a) => a.getAttribute("href")),
            };
          }, source.model);
          const flat = (s) => s.replace(/[\s\u2066-\u2069]/g, "");
          const contentOk =
            compact(data.text).includes(compact(source.model.title)) &&
            compact(data.text).includes(compact(source.model.cta.label)) &&
            flat(data.text).includes(flat(expected.orderedData)) &&
            expected.fragments.every((s) => flat(data.text).includes(flat(s))) &&
            flat(data.footer) === flat(expected.footer) &&
            expected.footerLinks.every((h) => data.links.some((l) => l.href === h)) &&
            data.links.some((l) => l.href === source.model.cta.url);
          const r = {
            type: email.type,
            version: version.id,
            language,
            width,
            file,
            errors,
            outside,
            outsideText,
            contentOk,
            data,
          };
          results.push(r);
          if (
            process.env.EMAIL_OPTION_SCREENSHOTS !== "0" &&
            (width === 390 || (email.type === "gameweek_finalized" && width === 1280))
          )
            await page.screenshot({
              path: root + "/screenshots/" + file.replace(".html", "") + "-" + width + ".png",
              fullPage: true,
            });
          await page.close();
        }
} finally {
  await browser.close();
  await writeFile(root + "/geometry.json", JSON.stringify(results, null, 2));
}
const failures = results.filter(
  (r) =>
    r.outside.length ||
    r.outsideText.length ||
    r.errors.length ||
    !r.contentOk ||
    r.data.images.some((i) => !i.loaded) ||
    r.data.cta.height < 44 ||
    r.data.direction !== (r.language === "ar" ? "rtl" : "ltr"),
);
await writeFile(
  root + "/summary.json",
  JSON.stringify(
    {
      checks: results.length,
      failures: failures.map((r) => ({
        type: r.type,
        version: r.version,
        lang: r.language,
        width: r.width,
        outside: r.outside,
        outsideText: r.outsideText,
        errors: r.errors,
        contentOk: r.contentOk,
        images: r.data.images,
        cta: r.data.cta,
      })),
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ checks: results.length, failures: failures.length }));
if (failures.length) process.exitCode = 1;
