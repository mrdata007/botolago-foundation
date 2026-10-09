import { chromium } from "playwright";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 900 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.addInitScript(() => {
  if (!localStorage.getItem("botolago.language")) localStorage.setItem("botolago.language", "fr");
});
await page.goto("http://127.0.0.1:4175/preview.html", { waitUntil: "domcontentloaded" });
await page.getByTestId("admin-stories-editor").waitFor();
await page.getByLabel("Titre en français", { exact: true }).waitFor();
await page.screenshot({ path: "/tmp/botolago-stories/admin-empty.png", fullPage: true });
await page.getByLabel("Titre en français", { exact: true }).fill("Dans les coulisses");
await page.getByLabel("Titre en arabe", { exact: true }).fill("خلف الكواليس");
await page
  .getByLabel("Description de l’image en français", { exact: true })
  .fill("La pelouse et les tribunes du stade");
await page
  .getByLabel("Description de l’image en arabe", { exact: true })
  .fill("أرضية الملعب ومدرجاته");
await page.getByLabel("Crédit photo", { exact: true }).fill("BotolaGO");
const upload = page.waitForResponse((r) => r.url().includes("/functions/v1/news-media-upload"));
await page
  .getByLabel("Téléverser une image", { exact: true })
  .setInputFiles(
    fileURLToPath(new URL("../../../src/assets/photos/matches-header.webp", import.meta.url)),
  );
const response = await upload;
console.log("Upload response", response.status(), await response.text());
assert.equal(response.status(), 201);
await page.getByRole("button", { name: "Enregistrer la story", exact: true }).click();
await page.getByText("Story enregistrée.", { exact: true }).waitFor();
assert.equal(await page.getByTestId("home-stories").locator("button").count(), 0);
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Publier", exact: true }).click();
await page
  .getByTestId("home-stories")
  .getByRole("button", { name: "Dans les coulisses" })
  .waitFor();
console.log("Draft survived reload and became visible only after publishing");
await page.getByRole("button", { name: "Nouvelle story", exact: true }).click();
await page.getByLabel("Titre en français", { exact: true }).fill("Jour de match");
await page.getByLabel("Titre en arabe", { exact: true }).fill("يوم المباراة");
await page
  .getByLabel("Description de l’image en français", { exact: true })
  .fill("Les supporters au stade");
await page
  .getByLabel("Description de l’image en arabe", { exact: true })
  .fill("الجماهير في الملعب");
await page.getByLabel("Destination facultative", { exact: true }).selectOption("/matches");
const secondUpload = page.waitForResponse((r) =>
  r.url().includes("/functions/v1/news-media-upload"),
);
await page
  .getByLabel("Téléverser une image", { exact: true })
  .setInputFiles(
    fileURLToPath(new URL("../../../src/assets/photos/news-header.webp", import.meta.url)),
  );
assert.equal((await secondUpload).status(), 201);
await page.getByRole("button", { name: "Enregistrer la story", exact: true }).click();
await page.getByText("Story enregistrée.", { exact: true }).waitFor();
await page.getByRole("button", { name: "Publier", exact: true }).click();
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="home-stories"] button').length === 2,
);

await page.getByTestId("home-stories").getByRole("button").first().click();
await page.getByTestId("story-viewer").waitFor();
await page.getByRole("button", { name: "Suivant", exact: true }).click();
await page.getByRole("heading", { name: "Jour de match", exact: true }).waitFor();
assert.equal(
  await page.getByRole("link", { name: "En savoir plus" }).getAttribute("href"),
  "/matches",
);
await page.getByRole("button", { name: "Précédent", exact: true }).click();
await page.screenshot({ path: "/tmp/botolago-stories/viewer-fr-390.png" });
await page.keyboard.press("Escape");
assert(
  await page
    .getByTestId("home-stories")
    .getByRole("button")
    .first()
    .evaluate((e) => e === document.activeElement),
);
console.log("Viewer opens, closes and restores focus");
for (const lang of ["fr", "ar"])
  for (const width of [390, 1440])
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => localStorage.setItem("botolago.theme", theme), theme);
      await page.evaluate((lang) => localStorage.setItem("botolago.language", lang), lang);
      await page.setViewportSize({ width, height: 900 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction((lang) => document.documentElement.dataset.lang === lang, lang);
      await page.getByTestId("admin-stories-editor").waitFor();
      await page
        .getByRole("button", { name: lang === "fr" ? "Ouvrir" : "فتح", exact: true })
        .first()
        .click();
      await page.screenshot({
        path: `/tmp/botolago-stories/admin-${lang}-${width}-${theme}.png`,
        fullPage: true,
      });
      const offscreen = await page.locator("main").evaluate((main) =>
        [...main.querySelectorAll("*")]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
          })
          .map((e) => e.tagName),
      );
      assert.deepEqual(offscreen, []);
      await page.getByTestId("home-stories").getByRole("button").first().click();
      await page.getByTestId("story-viewer").waitFor();
      await page.screenshot({ path: `/tmp/botolago-stories/viewer-${lang}-${width}-${theme}.png` });
      await page.keyboard.press("Escape");
      console.log("PASS", lang, width, theme);
    }
await page.evaluate(() => localStorage.setItem("botolago.language", "fr"));
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Dépublier", exact: true }).first().waitFor();
assert.equal(await page.getByRole("button", { name: "Dépublier", exact: true }).count(), 2);
for (let count = 2; count > 0; count--) {
  const published = page.waitForResponse((r) => r.url().includes("/rpc/admin_publish_home_story"));
  await page.getByRole("button", { name: "Dépublier", exact: true }).first().click();
  assert.equal((await published).status(), 200);
  await page.getByText("Story retirée de l’accueil.", { exact: true }).waitFor();
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll('[data-testid="home-stories"] button').length === count - 1 &&
      [...document.querySelectorAll("button")].filter((b) => b.textContent === "Dépublier")
        .length ===
        count - 1,
    count,
  );
}
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="home-stories"] button').length === 0,
);
const publicStories = await page.request.post("http://127.0.0.1:4319/rest/v1/rpc/home_stories", {
  data: {},
});
assert.deepEqual(await publicStories.json(), []);
console.log("Unpublish removed both circles; public RPC returned []");
assert.deepEqual(errors, []);
await browser.close();
