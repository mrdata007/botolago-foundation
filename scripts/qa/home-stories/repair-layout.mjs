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
};
const stories = Array.from({ length: 6 }, (_, i) => ({
  ...base,
  id: `10000000-0000-4000-8000-00000000000${i + 1}`,
}));
await mkdir("/tmp/stories-repair-layout", { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
for (const lang of ["fr", "ar"])
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [1440, 900],
  ])
    for (const theme of ["light", "dark"]) {
      const page = await browser.newPage({
        viewport: { width, height },
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
      await page.screenshot({
        path: `/tmp/stories-repair-layout/rail-${lang}-${width}-${theme}.png`,
      });
      await buttons.first().click();
      await page.getByTestId("story-viewer").waitFor();
      await page.waitForFunction(() => {
        const i = document.querySelector('[data-testid="story-viewer"] img');
        return i?.complete && i.naturalWidth > 0;
      });
      const fit = await page.getByTestId("story-viewer").evaluate((el) => {
        const img = el.querySelector("img"),
          caption = el.querySelector("figcaption"),
          scroll = el.parentElement;
        return {
          fit: getComputedStyle(img).objectFit,
          centerOffset: (() => {
            const stage = img.parentElement.getBoundingClientRect();
            const body = el.getBoundingClientRect();
            return Math.abs(stage.y + stage.height / 2 - body.y - body.height / 2);
          })(),
          alt: img.alt,
          scroll: scroll.scrollHeight - scroll.clientHeight,
          captionBottom: caption.getBoundingClientRect().bottom,
          bodyBottom: scroll.getBoundingClientRect().bottom,
        };
      });
      assert.equal(fit.fit, "contain");
      assert(fit.centerOffset <= 1, JSON.stringify(fit));
      assert.equal(fit.alt, lang === "ar" ? base.titleAr : base.titleFr);
      assert(fit.scroll <= 1, JSON.stringify(fit));
      assert(fit.captionBottom <= fit.bodyBottom + 1);
      assert(
        !/OpenAI|Illustration IA|بالذكاء الاصطناعي/.test(
          await page.getByRole("dialog").innerText(),
        ),
      );
      await page.keyboard.press(lang === "ar" ? "ArrowLeft" : "ArrowRight");
      assert.match(await page.getByRole("dialog").innerText(), /2 \/ 6/);
      await page.keyboard.press(lang === "ar" ? "ArrowRight" : "ArrowLeft");
      assert.match(await page.getByRole("dialog").innerText(), /1 \/ 6/);
      const stage = page.getByTestId("story-image-stage");
      await stage.dispatchEvent("pointerdown", { isPrimary: true, clientX: 160, clientY: 160 });
      await stage.dispatchEvent("pointerup", {
        isPrimary: true,
        clientX: lang === "ar" ? 230 : 80,
        clientY: 165,
      });
      assert.match(await page.getByRole("dialog").innerText(), /2 \/ 6/);
      await page.keyboard.press(lang === "ar" ? "ArrowRight" : "ArrowLeft");
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
        path: `/tmp/stories-repair-layout/viewer-${lang}-${width}-${theme}.png`,
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
        ...fit,
        height,
        emptyFeedHidden: true,
        viewerOnly: true,
        errors,
      });
      await page.close();
    }
// Maximum valid titles/credits on a short phone must not create a blank first screen.
for (const lang of ["fr", "ar"]) {
  const page = await browser.newPage({
    viewport: { width: 320, height: 568 },
    reducedMotion: "reduce",
  });
  await page.addInitScript((lang) => localStorage.setItem("botolago.language", lang), lang);
  await page.route("http://127.0.0.1:4319/rest/v1/rpc/**", (r) =>
    r.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify([
        {
          ...stories[0],
          generated: false,
          titleFr: "Les nouvelles du championnat marocain et des équipes ".repeat(4).slice(0, 200),
          titleAr: "أخبار البطولة الوطنية والفرق المغربية وآخر النتائج ".repeat(5).slice(0, 200),
          credit: (lang === "ar"
            ? "صورة من تصوير المصور الرياضي "
            : "Photo du photographe sportif "
          )
            .repeat(12)
            .slice(0, 300),
        },
      ]),
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
  await page.getByTestId("home-stories").getByRole("button").first().click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="story-viewer"] img')?.naturalWidth > 0,
  );
  const bounds = await page.getByTestId("story-viewer").evaluate((el) => {
    const body = el.getBoundingClientRect(),
      stage = el.querySelector('[data-testid="story-image-stage"]').getBoundingClientRect(),
      cap = el.querySelector("figcaption").getBoundingClientRect();
    return {
      topGap: stage.top - body.top,
      stageHeight: stage.height,
      captionTop: cap.top,
      bodyBottom: body.bottom,
    };
  });
  assert(bounds.topGap <= 1, JSON.stringify(bounds));
  assert(bounds.stageHeight >= 160, JSON.stringify(bounds));
  assert(bounds.captionTop < bounds.bodyBottom, JSON.stringify(bounds));
  await page.getByTestId("story-viewer").locator("figcaption").scrollIntoViewIfNeeded();
  await page.keyboard.press("Escape");
  await page.close();
}
// Slow/broken images keep the headline and close controls usable; manual credits survive.
{
  const page = await browser.newPage({
    viewport: { width: 320, height: 568 },
    reducedMotion: "reduce",
  });
  await page.addInitScript(() => localStorage.setItem("botolago.language", "fr"));
  let broken = true;
  await page.route("http://127.0.0.1:4319/rest/v1/rpc/**", (r) =>
    r.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify([
        { ...stories[0], generated: false, credit: "Photo : photographe test" },
      ]),
    }),
  );
  await page.route("**/storage/v1/object/public/news-media/**", async (r) => {
    if (broken) return r.fulfill({ status: 404 });
    await new Promise((resolve) => setTimeout(resolve, 600));
    return r.fulfill({
      path: fileURLToPath(
        new URL("../../../src/assets/photos/matches-header.webp", import.meta.url),
      ),
      contentType: "image/webp",
    });
  });
  await page.goto("http://127.0.0.1:4175/preview.html");
  await page.getByTestId("home-stories").getByRole("button").first().click();
  await page.getByText("Impossible de charger le visuel", { exact: true }).waitFor();
  assert.match(await page.getByTestId("story-viewer").innerText(), /Photo : photographe test/);
  await page.keyboard.press("Escape");
  broken = false;
  await page.getByTestId("home-stories").getByRole("button").first().click();
  await page.getByText("Chargement du visuel…", { exact: true }).waitFor();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="story-viewer"] img')?.naturalWidth > 0,
  );
  await page.keyboard.press("Escape");
  await page.close();
}
await browser.close();
await writeFile("/tmp/stories-repair-layout/results.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
