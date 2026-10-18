const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const dir = path.join(process.cwd(), "docs/qa/launch-2026-10-18/responsive");
fs.mkdirSync(dir, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--ignore-certificate-errors"],
  });
  const results = [];
  try {
    for (const language of ["fr", "ar"])
      for (const width of [375, 1440]) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        page.setDefaultTimeout(20000);
        await page.goto("http://127.0.0.1:4173/jouer", { waitUntil: "domcontentloaded" });
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        await dialog
          .getByRole("radio", { name: language === "fr" ? /Français/ : /العربية/ })
          .click();
        await dialog.getByRole("button").last().click();
        await dialog.waitFor({ state: "hidden" });
        await page.waitForFunction((lang) => document.documentElement.lang === lang, language);
        const terms = page.locator('[data-testid="landing-page"] a[href="/terms"]');
        const privacy = page.locator('[data-testid="landing-page"] a[href="/privacy"]');
        await terms.scrollIntoViewIfNeeded();
        const links = [];
        for (const locator of [terms, privacy]) {
          const rect = await locator.boundingBox();
          if (!rect || rect.height < 44 || rect.x < 0 || rect.x + rect.width > width + 1)
            throw Error("Policy link clipped or undersized");
          links.push({ label: await locator.innerText(), rect });
        }
        await page.screenshot({ path: path.join(dir, `${language}-${width}-legal.png`) });
        await page.locator('[data-testid="landing-page"] a[href^="/auth/login"]').first().click();
        await page.locator('a[href^="/auth/register"]').first().click();
        await page.locator("input[type=email]").waitFor();
        await page.waitForTimeout(300);
        const inputs = await page.locator("input:not([type=checkbox])").evaluateAll((nodes) =>
          nodes.map((n) => ({
            type: n.type,
            x: n.getBoundingClientRect().x,
            right: n.getBoundingClientRect().right,
          })),
        );
        if (inputs.some((r) => r.x < 0 || r.right > width + 1)) throw Error("Auth field clipped");
        await page.screenshot({
          path: path.join(dir, `${language}-${width}-register.png`),
          fullPage: true,
        });
        results.push({
          language,
          width,
          direction: await page.locator("html").getAttribute("dir"),
          links,
          inputs,
          passed: true,
        });
        await context.close();
      }
  } finally {
    fs.writeFileSync(path.join(dir, "checks.json"), JSON.stringify(results, null, 2));
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
