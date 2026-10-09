// Local component regression: no requests are forwarded to a database.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
const story = {
  id: "10000000-0000-4000-8000-000000000001",
  titleFr: "Jour de match",
  titleAr: "يوم المباراة",
  altFr: "Le stade",
  altAr: "الملعب",
  mediaAssetId: "20000000-0000-4000-8000-000000000001",
  storagePath: "news/test/story.webp",
  credit: null,
  destination: null,
  position: 0,
  published: true,
  version: 1,
};
await mkdir("/tmp/stories-reauth", { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
for (const lang of ["fr", "ar"]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.addInitScript((lang) => localStorage.setItem("botolago.language", lang), lang);
  await page.route("http://127.0.0.1:4319/rest/v1/rpc/**", async (route) => {
    const write = /admin_(save|publish)_home_story/.test(route.request().url());
    await route.fulfill({
      status: route.request().method() === "OPTIONS" ? 204 : write ? 403 : 200,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "POST,OPTIONS",
        "content-type": "application/json",
      },
      body:
        route.request().method() === "OPTIONS"
          ? ""
          : JSON.stringify(write ? { code: "PT403", message: "recent_auth_required" } : [story]),
    });
  });
  await page.route("**/storage/v1/object/public/news-media/**", (route) =>
    route.fulfill({
      path: fileURLToPath(
        new URL("../../../src/assets/photos/matches-header.webp", import.meta.url),
      ),
      contentType: "image/webp",
    }),
  );
  await page.goto("http://127.0.0.1:4175/preview.html");
  await page
    .getByRole("button", { name: lang === "fr" ? "Dépublier" : "إخفاء", exact: true })
    .click();
  const action = page.getByTestId("admin-reauthenticate");
  await action.waitFor();
  const target = new URL(await action.getAttribute("href"), page.url());
  assert.equal(target.pathname, "/auth/login");
  assert.equal(target.searchParams.get("next"), "/admin/stories");
  await page.getByRole("button", { name: lang === "fr" ? "Ouvrir" : "فتح", exact: true }).click();
  const title = page.getByLabel(lang === "fr" ? "Titre en français" : "العنوان بالفرنسية", {
    exact: true,
  });
  await title.fill("Titre modifié à conserver");
  await page.getByTestId("story-form").locator('button[type="submit"]').click();
  await action.waitFor();
  assert.equal(await title.inputValue(), "Titre modifié à conserver");
  assert.match(await action.innerText(), lang === "fr" ? /Se réauthentifier/ : /إعادة المصادقة/);
  await page.screenshot({ path: `/tmp/stories-reauth/${lang}.png`, fullPage: true });
  console.log(
    `PASS ${lang}: expired publish and edit show sign-in action; return target and unsaved text preserved`,
  );
  await page.close();
}
await browser.close();
