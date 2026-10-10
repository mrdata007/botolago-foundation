// Fixture browser checks; no database writes or image-generation calls.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const out = process.env.STORY_RAIL_OUT ?? "/tmp/balanced-story-rail";
await mkdir(out, { recursive: true });
const labels = ["MAS V RCA", "FAR V WST", "RCAZ V HUSA", "RCA V WAC"];
const stories = labels.map((railLabel, i) => ({
  id: `10000000-0000-4000-8000-00000000000${i + 1}`,
  mediaAssetId: "20000000-0000-4000-8000-000000000001",
  titleFr: [
    "Match nul entre Maghreb Fès et Raja Casablanca",
    "FAR Rabat s’impose face à Widad Témara",
    "Hassania Agadir triomphe face à Renaissance Zemamra",
    "Le derby entre Raja Casablanca et Wydad Casablanca",
  ][i],
  titleAr: "عنوان الخبر الكامل يبقى داخل القصة ولا يوسع شريط القصص",
  railLabel,
  altFr: "Image",
  altAr: "صورة",
  storagePath: `news/ai-stories/${i}.png`,
  generated: true,
  destination: null,
  credit: null,
  position: i,
  published: true,
  version: 1,
}));
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><rect width="1024" height="1536" fill="#126831"/><circle cx="512" cy="768" r="180" fill="none" stroke="white" stroke-width="16"/></svg>';
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
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(
        ({ lang, theme }) => {
          localStorage.setItem("botolago.language", lang);
          localStorage.setItem("botolago.theme", theme);
          localStorage.setItem("botolago.welcomed", "1");
          sessionStorage.setItem("botolago.splashShown", "1");
        },
        { lang, theme },
      );
      await page.route("http://127.0.0.1:4319/rest/v1/rpc/**", (r) =>
        r.fulfill({
          status: 200,
          headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
          body: JSON.stringify(r.request().url().includes("home_stories") ? stories : []),
        }),
      );
      await page.route("**/storage/v1/object/public/news-media/**", (r) =>
        r.fulfill({ contentType: "image/svg+xml", body: svg }),
      );
      await page.goto(process.env.STORY_RAIL_URL ?? "http://127.0.0.1:4176/");
      const rail = page.getByTestId("home-stories");
      await rail.waitFor();
      await page.waitForFunction((l) => document.documentElement.dataset.lang === l, lang);
      const geometry = await rail.evaluate((el) => {
        const rect = (e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        return {
          section: rect(el),
          items: [...el.querySelectorAll("li")].map((li) => {
            const b = li.querySelector("button"),
              img = li.querySelector("img"),
              label = li.querySelector("bdi").parentElement;
            return {
              item: rect(li),
              circle: rect(img.parentElement.parentElement),
              label: rect(label),
              textWidth: rect(li.querySelector("bdi")).width,
              text: label.innerText,
              whiteSpace: getComputedStyle(label).whiteSpace,
              dir: li.querySelector("bdi").dir,
            };
          }),
        };
      });
      const gaps = await rail.evaluate((el) => {
        const li = el.querySelector("li").getBoundingClientRect();
        const rail = el.getBoundingClientRect();
        const main = el.closest("main").getBoundingClientRect();
        const band = document
          .querySelector('[data-testid="home-gameweek-band"]')
          .getBoundingClientRect();
        return {
          above:
            li.top -
            (document.querySelector('[data-testid="deadline-strip"]')?.getBoundingClientRect()
              .bottom ?? main.top),
          below: band.top - li.bottom,
          railTop: rail.top,
          mainTop: main.top,
          railBottom: rail.bottom,
          bandTop: band.top,
        };
      });
      assert(Math.abs(gaps.above - gaps.below) < 1, JSON.stringify(gaps));
      assert.equal(gaps.above, 20);
      assert.equal(gaps.bandTop, gaps.railBottom);
      geometry.gaps = gaps;
      for (const [i, row] of geometry.items.entries()) {
        assert.equal(row.text, labels[i]);
        assert.equal(row.whiteSpace, "nowrap");
        assert.equal(row.dir, "ltr");
        assert(row.label.height <= 17);
        assert(row.textWidth <= row.label.width, JSON.stringify(row));
        assert(row.item.width <= 88);
        assert(row.item.width - row.circle.width <= 10);
        assert(row.label.y - (row.circle.y + row.circle.height) <= 5);
      }
      await page.screenshot({ path: `${out}/${lang}-${width}-${theme}.png` });
      await rail.getByRole("button").first().click();
      assert.equal(
        await page.getByTestId("story-headline").innerText(),
        lang === "fr" ? stories[0].titleFr : stories[0].titleAr,
      );
      await page.keyboard.press("Escape");
      assert.deepEqual(errors, []);
      results.push({ lang, width, height, theme, ...geometry });
      await page.close();
    }
// Exercise the conditional parent offsets as well as the normal deadline layout.
for (const width of [320, 1440]) {
  for (const populated of [true, false]) {
    for (const deadline of [true, false]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      await page.addInitScript(() => {
        localStorage.setItem("botolago.welcomed", "1");
        sessionStorage.setItem("botolago.splashShown", "1");
      });
      if (!deadline)
        await page.route("**/src/mocks/data.ts*", async (route) => {
          const response = await route.fetch();
          const body = (await response.text()).replace(
            "deadline: inHours(38)",
            "deadline: inHours(-1)",
          );
          assert(body.includes("deadline: inHours(-1)"));
          await route.fulfill({ response, body });
        });
      await page.route("http://127.0.0.1:4319/rest/v1/rpc/**", (route) =>
        route.fulfill({
          status: 200,
          headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
          body: JSON.stringify(
            populated && route.request().url().endsWith("/home_stories") ? stories : [],
          ),
        }),
      );
      await page.route("**/storage/v1/object/public/news-media/**", (route) =>
        route.fulfill({ contentType: "image/svg+xml", body: svg }),
      );
      await page.goto(process.env.STORY_RAIL_URL ?? "http://127.0.0.1:4176/");
      await page.getByTestId("home-gameweek-band").waitFor();
      // The mock gameweek is asynchronous; its greeting proves it has loaded.
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="home-gameweek-band"]')?.textContent.includes("14"),
      );
      if (populated) await page.getByTestId("home-stories").waitFor();
      if (deadline) await page.getByTestId("deadline-strip").waitFor();
      const layout = await page.evaluate(() => {
        const band = document.querySelector('[data-testid="home-gameweek-band"]');
        const main = band.closest("main");
        const rail = document.querySelector('[data-testid="home-stories"]');
        const strip = document.querySelector('[data-testid="deadline-strip"]');
        const item = rail?.querySelector("li").getBoundingClientRect();
        return {
          hasStrip: !!strip,
          hasRail: !!rail,
          padding: parseFloat(getComputedStyle(main).paddingTop),
          margin: parseFloat(getComputedStyle(band).marginTop),
          above: item
            ? item.top - (strip?.getBoundingClientRect().bottom ?? main.getBoundingClientRect().top)
            : null,
          below: item ? band.getBoundingClientRect().top - item.bottom : null,
        };
      });
      assert.equal(layout.hasStrip, deadline);
      assert.equal(layout.hasRail, populated);
      assert.equal(layout.padding, populated && !deadline ? 0 : width < 768 ? 16 : 24);
      assert.equal(layout.margin, populated || deadline || width >= 640 ? 0 : -16);
      if (populated) {
        assert.equal(layout.above, 20);
        assert.equal(layout.below, 20);
      }
      results.push({ width, populated, deadline, ...layout });
      console.log("PASS conditional layout", width, populated, deadline);
      await page.close();
    }
  }
}
await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
await browser.close();
console.log(
  "PASS 12 full home layouts: balanced 20px rail gaps, compact labels, full viewer headlines, RTL and no page errors",
);
