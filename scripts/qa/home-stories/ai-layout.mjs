// UI fixture only. All story/media requests stay local; no production writes.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const base = {
  titleFr: "Le derby de Casablanca au cœur de cette nouvelle journée de championnat",
  titleAr: "ديربي الدار البيضاء يتصدر أبرز مباريات الجولة الجديدة من البطولة الوطنية",
  altFr: "Illustration du stade",
  altAr: "رسم توضيحي للملعب",
  mediaAssetId: "20000000-0000-4000-8000-000000000001",
  storagePath: "news/ai-stories/test.png",
  destination: null,
  credit: "BotolaGO · OpenAI",
  position: 0,
  published: true,
  version: 1,
  generated: true,
  sourceName: "BotolaGO",
};
const stories = Array.from({ length: 6 }, (_, i) => ({
  ...base,
  id: `10000000-0000-4000-8000-00000000000${i + 1}`,
}));
await mkdir("/tmp/ai-stories-layout", { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
for (const lang of ["fr", "ar"])
  for (const width of [390, 1440])
    for (const theme of ["light", "dark"]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(
        ({ lang, theme }) => {
          localStorage.setItem("botolago.language", lang);
          localStorage.setItem("botolago.theme", theme);
        },
        { lang, theme },
      );
      let empty = false;
      await page.route("http://127.0.0.1:4319/rest/v1/rpc/**", (r) =>
        r.fulfill({
          status: 200,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "POST,OPTIONS",
            "content-type": "application/json",
          },
          body: JSON.stringify(empty ? [] : stories),
        }),
      );
      await page.route("**/storage/v1/object/public/news-media/**", (r) =>
        r.fulfill({
          path: fileURLToPath(
            new URL("../../../src/assets/photos/matches-header.webp", import.meta.url),
          ),
          contentType: "image/webp",
        }),
      );
      await page.goto("http://127.0.0.1:4175/preview.html");
      const rail = page.getByTestId("home-stories");
      await rail.waitFor();
      assert.equal(await rail.locator("a").count(), 0);
      const buttons = rail.getByRole("button");
      assert.equal(await buttons.count(), 6);
      const measures = await rail.evaluate((el) => {
        const list = el.querySelector("ul"),
          item = list.querySelector("li"),
          r = item.getBoundingClientRect(),
          img = item.querySelector("img").getBoundingClientRect();
        return {
          gap: getComputedStyle(list).columnGap,
          itemWidth: r.width,
          imageWidth: img.width,
          paddingBottom: getComputedStyle(el).paddingBottom,
        };
      });
      assert.equal(measures.gap, width < 640 ? "8px" : "12px");
      await page.screenshot({ path: `/tmp/ai-stories-layout/rail-${lang}-${width}-${theme}.png` });
      await buttons.first().click();
      await page.getByTestId("story-viewer").waitFor();
      assert.equal(
        await page.getByTestId("story-headline").innerText(),
        lang === "ar" ? base.titleAr : base.titleFr,
      );
      assert.equal(await page.getByRole("dialog").locator("a").count(), 0);
      await page
        .getByRole("button", { name: lang === "ar" ? "التالي" : "Suivant", exact: true })
        .click();
      assert.match(await page.getByRole("dialog").innerText(), /2 \/ 6/);
      await page.screenshot({
        path: `/tmp/ai-stories-layout/viewer-${lang}-${width}-${theme}.png`,
      });
      await page.keyboard.press("Escape");
      assert.equal(await buttons.first().evaluate((el) => el === document.activeElement), true);
      empty = true;
      await page.reload();
      await page.getByTestId("admin-stories-editor").waitFor();
      await page.waitForFunction(() => !document.querySelector('[data-testid="home-stories"]'));
      assert.deepEqual(errors, []);
      results.push({
        lang,
        width,
        theme,
        ...measures,
        emptyFeedHidden: true,
        viewerOnly: true,
        errors,
      });
      await page.close();
    }
await browser.close();
await writeFile("/tmp/ai-stories-layout/results.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
