// Local fixtures only; no backend writes. Run against the dedicated stories Vite harness.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const out = "/tmp/instagram-stories";
await mkdir(out, { recursive: true });
const stories = Array.from({ length: 3 }, (_, i) => ({
  id: `10000000-0000-4000-8000-00000000000${i + 1}`,
  mediaAssetId: "20000000-0000-4000-8000-000000000001",
  titleFr: [
    "Hassania Agadir triomphe face à Renaissance Zemamra",
    "FAR Rabat s’impose face à Widad Témara",
    "Match nul entre Maghreb Fès et Raja Casablanca",
  ][i],
  titleAr: [
    "حسنية أكادير يتفوق على نادي النهضة أتلتيك الزمامرة",
    "الجيش الملكي يفوز على الوداد الرياضي لتمارة",
    "التعادل السلبي بين المغرب الفاسي والرجاء الرياضي",
  ][i],
  altFr: "Illustration IA",
  altAr: "صورة توضيحية بالذكاء الاصطناعي",
  storagePath: `news/ai-stories/${i}.png`,
  generated: true,
  railLabel: ["RCAZ V HUSA", "FAR V WST", "MAS V RCA"][i],
  destination: null,
  credit: "BotolaGO · OpenAI",
  position: i,
  published: true,
  version: 1,
}));
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><rect width="1024" height="1536" fill="#17683c"/><path d="M512 0V1536" stroke="white" stroke-width="12"/><circle cx="512" cy="768" r="180" fill="none" stroke="white" stroke-width="12"/><rect x="100" y="1000" width="824" height="180" fill="#101a24"/><text x="512" y="1125" text-anchor="middle" font-size="120" fill="white">2 – 5</text></svg>';
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
async function setup(page, lang, data = stories, image = "ready") {
  await page.addInitScript((lang) => localStorage.setItem("botolago.language", lang), lang);
  await page.route("http://127.0.0.1:4319/rest/v1/rpc/**", (r) =>
    r.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify(data),
    }),
  );
  await page.route("**/storage/v1/object/public/news-media/**", async (r) => {
    if (image === "broken") return r.fulfill({ status: 404 });
    if (image === "slow") await new Promise((resolve) => setTimeout(resolve, 700));
    return r.fulfill({ contentType: "image/svg+xml", body: svg });
  });
  await page.goto("http://127.0.0.1:4175/preview.html");
  await page.getByTestId("home-stories").getByRole("button").first().click();
}
async function ready(page) {
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-testid="story-photo"]');
    return image?.complete && image.naturalWidth > 0;
  });
}
const results = [];
for (const lang of ["fr", "ar"])
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [1440, 900],
  ])
    for (const theme of ["light", "dark"]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
      await page.addInitScript((theme) => localStorage.setItem("botolago.theme", theme), theme);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await setup(page, lang);
      await ready(page);
      const viewer = page.getByTestId("story-viewer");
      const geometry = await viewer.evaluate((el) => {
        const image = el.querySelector('[data-testid="story-photo"]'),
          headline = el.querySelector('[data-testid="story-headline"]'),
          caption = el.querySelector("figcaption"),
          rect = (x) => {
            const r = x.getBoundingClientRect();
            return {
              top: r.top,
              left: r.left,
              right: r.right,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
            };
          };
        return {
          viewer: rect(el),
          image: rect(image),
          caption: rect(caption),
          headline: rect(headline),
          fit: getComputedStyle(image).objectFit,
          alt: image.alt,
          scroll: el.scrollHeight - el.clientHeight,
        };
      });
      assert.equal(geometry.fit, "contain");
      assert(geometry.scroll <= 1, JSON.stringify(geometry));
      assert(geometry.viewer.top >= 0 && geometry.viewer.bottom <= height + 1);
      assert(geometry.headline.bottom <= height - 16);
      assert(geometry.caption.top > geometry.viewer.top + 80);
      assert.equal(geometry.image.height, geometry.viewer.height);
      assert.equal(await page.getByRole("progressbar").count(), 1);
      assert.equal(await viewer.getAttribute("data-paused"), "true");
      assert(!/Illustration IA|بالذكاء الاصطناعي|OpenAI/.test(await viewer.innerText()));
      assert(!/Illustration IA|بالذكاء الاصطناعي/.test(geometry.alt));
      assert.equal(await page.getByRole("dialog").locator("a").count(), 0);
      await page.screenshot({ path: `${out}/${lang}-${width}-${theme}.png` });
      const announcement = await page.getByTestId("story-announcement").elementHandle();
      await page.getByTestId("story-next").click();
      await ready(page);
      assert(await announcement.evaluate((el) => el.isConnected));
      assert.match(await page.getByTestId("story-announcement").innerText(), /2 \/ 3/);
      assert.equal(
        await page.getByTestId("story-announcement").getAttribute("aria-live"),
        "polite",
      );
      assert.equal(
        await page.getByTestId("story-headline").innerText(),
        lang === "ar" ? stories[1].titleAr : stories[1].titleFr,
      );
      await page.keyboard.press(lang === "ar" ? "ArrowRight" : "ArrowLeft");
      assert.equal(
        await page.getByTestId("story-headline").innerText(),
        lang === "ar" ? stories[0].titleAr : stories[0].titleFr,
      );
      // A real drag must advance exactly once, including when it crosses tap zones.
      const box = await viewer.boundingBox(),
        y = box.y + box.height * 0.45;
      await page.mouse.move(box.x + box.width * (lang === "ar" ? 0.25 : 0.75), y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * (lang === "ar" ? 0.75 : 0.25), y, { steps: 6 });
      await page.mouse.up();
      assert.equal(
        await page.getByTestId("story-headline").innerText(),
        lang === "ar" ? stories[1].titleAr : stories[1].titleFr,
      );
      await page.keyboard.press("Escape");
      await viewer.waitFor({ state: "hidden" });
      assert(
        await page
          .getByTestId("home-stories")
          .getByRole("button")
          .first()
          .evaluate((el) => document.activeElement === el),
      );
      await page.getByTestId("home-stories").getByRole("button").first().click();
      await page.mouse.move(box.x + box.width * 0.75, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.75, y + 90, { steps: 6 });
      await page.mouse.up();
      await viewer.waitFor({ state: "hidden" });
      assert.deepEqual(errors, []);
      results.push({ lang, width, height, theme, ...geometry });
      await page.close();
    }
// Playback: image-loaded gating, explicit pause, hold/release, tab visibility and sequence end.
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
  });
  await page.clock.install();
  await setup(page, "fr");
  await ready(page);
  const value = async () =>
    Number(await page.getByRole("progressbar").getAttribute("aria-valuenow"));
  await page.keyboard.press(" ");
  const keyboardPaused = await value();
  await page.clock.runFor(1500);
  assert.equal(await value(), keyboardPaused);
  await page.keyboard.press(" ");
  await page.clock.runFor(1500);
  assert((await value()) > 15);
  await page.getByTestId("story-headline").click();
  const reading = await value();
  await page.clock.runFor(3000);
  assert.equal(await value(), reading);
  await page.getByRole("button", { name: "Lire", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await value();
  await page.clock.runFor(3000);
  assert.equal(await value(), paused);
  await page.getByRole("button", { name: "Lire", exact: true }).click();
  await page.mouse.move(300, 400);
  await page.mouse.down();
  const held = await value();
  await page.clock.runFor(3000);
  assert.equal(await value(), held);
  await page.mouse.up();
  assert.equal(await page.getByTestId("story-headline").innerText(), stories[0].titleFr);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hidden = await value();
  await page.clock.runFor(8000);
  assert.equal(await value(), hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(7100);
  await ready(page);
  assert.equal(await page.getByTestId("story-headline").innerText(), stories[1].titleFr);
  await page.clock.runFor(7100);
  await ready(page);
  assert.equal(await page.getByTestId("story-headline").innerText(), stories[2].titleFr);
  await page.clock.runFor(7100);
  await page.getByTestId("story-viewer").waitFor({ state: "hidden" });
  await page.close();
}
for (const lang of ["fr", "ar"])
  for (const mode of ["broken", "slow", "long"]) {
    const page = await browser.newPage({
      viewport: { width: 320, height: 568 },
      reducedMotion: "reduce",
    });
    const data =
      mode === "long"
        ? [
            {
              ...stories[0],
              generated: false,
              titleFr: "Les nouvelles du championnat marocain ".repeat(8).slice(0, 200),
              titleAr: "أخبار البطولة الوطنية وآخر النتائج ".repeat(8).slice(0, 200),
              credit: "Photo : photographe sportif ".repeat(12).slice(0, 300),
            },
          ]
        : stories;
    await setup(page, lang, data, mode);
    if (mode !== "long") await page.getByTestId("story-viewer").getByRole("status").waitFor();
    if (mode !== "broken") await ready(page);
    if (mode === "long") {
      const box = await page.getByTestId("story-viewer").locator("figcaption").boundingBox();
      assert(box.y > 100 && box.y + box.height <= 568);
      const caption = page.getByTestId("story-headline").locator("..");
      await caption.focus();
      await caption.evaluate((el) => (el.scrollTop = el.scrollHeight));
      assert(await caption.evaluate((el) => el.scrollTop > 0));
    }
    assert.equal(await page.getByTestId("story-viewer").getAttribute("data-paused"), "true");
    await page.keyboard.press("Escape");
    await page.close();
  }
await browser.close();
await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(
  `PASS ${results.length} layouts, tap/swipe/close/focus, playback/hold/visibility/end and slow/broken/long captions`,
);
