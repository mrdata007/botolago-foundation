import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  ...(process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {}),
  args: ["--no-sandbox"],
});
const results = [];
for (const lang of ["fr", "ar"])
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
    });
    await page.addInitScript((l) => localStorage.setItem("botolago.language", l), lang);
    await page.goto("http://127.0.0.1:4390/");
    const section = page.getByTestId("admin-match-visual-drafts");
    await section
      .getByRole("button", { name: lang === "ar" ? "مراجعة" : "Examiner", exact: true })
      .click();
    await section.locator("img").first().waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector("[data-testid=admin-match-visual-drafts] img")?.naturalWidth === 588,
    );
    assert.equal(
      await section
        .getByRole("button", {
          name: lang === "ar" ? "تعديل وحفظ قيد الانتظار" : "Retoucher et garder en attente",
          exact: true,
        })
        .isEnabled(),
      true,
    );
    const brand = await page.evaluate(async () => {
      const file = await window.__makeDefaultBrand({ x: 20, y: 20, width: 60, height: 60 });
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = 588;
      canvas.height = 736;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, 588, 736).data;
      let outside = 0,
        inside = 0;
      for (let y = 0; y < 736; y++)
        for (let x = 0; x < 588; x++)
          if (data[(y * 588 + x) * 4 + 3]) {
            if (x >= 20 && x < 80 && y >= 20 && y < 80) inside++;
            else outside++;
          }
      bitmap.close();
      return { width: canvas.width, height: canvas.height, inside, outside };
    });
    assert.equal(brand.outside, 0);
    assert(brand.inside > 0);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await section.getByRole("button", { name: /^(Publier|نشر)$/ }).count(), 0);
    await section
      .getByLabel(lang === "ar" ? "X · من اليسار" : "X · depuis la gauche", { exact: true })
      .fill("20");
    await section
      .getByLabel(lang === "ar" ? "Y · من الأعلى" : "Y · depuis le haut", { exact: true })
      .fill("20");
    await section
      .getByLabel(
        lang === "ar"
          ? "شعار بديل · PNG شفاف · اختياري"
          : "Autre logo · PNG transparent · facultatif",
        {
          exact: true,
        },
      )
      .setInputFiles(
        new URL("../../test-results/match-visual-drafts/logo.png", import.meta.url).pathname,
      );
    await section
      .getByRole("button", {
        name: lang === "ar" ? "تعديل وحفظ قيد الانتظار" : "Retoucher et garder en attente",
        exact: true,
      })
      .click();
    await section
      .getByText(
        lang === "ar"
          ? "بدأ التعديل. ستبقى النتيجة معلقة هنا."
          : "Retouche démarrée. Le résultat restera en attente ici.",
      )
      .waitFor();
    const cells = await section.evaluate((el) =>
      [...el.querySelectorAll("*")]
        .filter((node) => {
          const style = getComputedStyle(node),
            r = node.getBoundingClientRect();
          return (
            style.display !== "none" && r.width > 0 && (r.left < -1 || r.right > innerWidth + 1)
          );
        })
        .map((el) => el.tagName),
    );
    assert.deepEqual(cells, []);
    assert.equal(await page.locator("html").getAttribute("dir"), lang === "ar" ? "rtl" : "ltr");
    const box = await section
      .locator("div.pointer-events-none")
      .evaluate((el) => ({ left: el.style.left, top: el.style.top }));
    assert(Math.abs(parseFloat(box.left) - (20 / 588) * 100) < 0.00001);
    assert(Math.abs(parseFloat(box.top) - (20 / 736) * 100) < 0.00001);
    await page.screenshot({
      path: `${new URL("../../test-results/match-visual-drafts/", import.meta.url).pathname}review-${lang}-${width}.png`,
      fullPage: true,
    });
    await section
      .getByLabel(lang === "ar" ? "عنوان للمراجعة" : "Titre pour la revue", { exact: true })
      .fill("QA held import");
    await section
      .getByLabel(lang === "ar" ? "رابط المنشور الأصلي" : "Lien du post original", { exact: true })
      .fill("https://www.instagram.com/p/new-qa-post/");
    await section
      .getByLabel(lang === "ar" ? "الصورة الأصلية" : "Photo originale", { exact: true })
      .setInputFiles(
        new URL("../../test-results/match-visual-drafts/source.png", import.meta.url).pathname,
      );
    await section
      .getByRole("button", {
        name: lang === "ar" ? "استيراد وحفظ قيد الانتظار" : "Importer et garder en attente",
        exact: true,
      })
      .click();
    await section
      .getByText(
        lang === "ar"
          ? "تم الاستيراد. الصورة معلقة في الإدارة."
          : "Photo importée et gardée en attente dans Admin.",
      )
      .waitFor();
    assert.equal(
      await section
        .getByLabel(lang === "ar" ? "الصورة الأصلية" : "Photo originale", { exact: true })
        .inputValue(),
      "",
    );
    page.once("dialog", (d) => d.accept());
    await section
      .getByRole("button", { name: lang === "ar" ? "استبعاد" : "Retirer de la file", exact: true })
      .click();
    await page.waitForTimeout(200);
    const calls = await page.evaluate(() => window.__draftCalls);
    assert(calls.some((c) => c.action === "edit" && c.rectangle.x === 20));
    assert(calls.some((c) => c.action === "import"));
    assert(calls.some((c) => c.action === "discard"));
    assert.deepEqual(errors, []);
    results.push({
      lang,
      width,
      passed: true,
      overflow: cells,
      actions: calls.map((c) => c.action),
    });
    await page.close();
  }
for (const kind of ["readOnly", "empty", "error"]) {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:4390/?${kind}`);
  const section = page.getByTestId("admin-match-visual-drafts");
  if (kind === "readOnly") {
    await section.getByRole("button", { name: "Examiner", exact: true }).click();
    assert.equal(await section.locator("input").count(), 0);
    assert.equal(
      await section.getByRole("button", { name: "Retirer de la file", exact: true }).count(),
      0,
    );
  }
  if (kind === "empty") await section.getByText(/Aucun visuel en attente/).waitFor();
  if (kind === "error") {
    await section.getByText("File indisponible", { exact: true }).waitFor();
    assert.equal(
      await section
        .getByRole("button", { name: "Importer et garder en attente", exact: true })
        .isDisabled(),
      true,
    );
  }
  results.push({ kind, passed: true });
  await page.close();
}
await browser.close();
await writeFile(
  new URL("../../test-results/match-visual-drafts/browser-verification.json", import.meta.url),
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
