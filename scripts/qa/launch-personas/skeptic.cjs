const { chromium } = require("playwright-core");
const fs = require("node:fs");
const dir = process.cwd() + "/docs/qa/launch-2026-10-18/skeptic/after";
fs.mkdirSync(dir, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--ignore-certificate-errors"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(60000);
  const rows = [];
  async function snap(label) {
    await page.screenshot({ path: `${dir}/${label}.png`, fullPage: true });
    rows.push({
      label,
      url: page.url(),
      text: await page.locator("body").innerText(),
      fields: await page.locator("input").evaluateAll((xs) =>
        xs
          .filter((x) => x.type !== "password")
          .map((x) => ({
            type: x.type,
            name: x.name,
            id: x.id,
            value: x.value,
            checked: x.checked,
          })),
      ),
    });
    console.log(label, rows.at(-1));
  }
  try {
    await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("radio", { name: /français/i })
      .waitFor({ state: "visible", timeout: 30000 });
    await page.getByRole("button", { name: /continuer/i }).click();
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await snap("01-landing-legal");
    for (const re of [/conditions/i, /confidentialité/i]) {
      await page.getByRole("link", { name: re }).first().click();
      await page.waitForTimeout(1600);
      await snap(re.source.includes("conditions") ? "02-landing-terms" : "03-landing-privacy");
      await page.goBack({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1600);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page
      .getByRole("link", { name: /se connecter/i })
      .first()
      .click();
    await page.getByRole("link", { name: /créer un compte/i }).click();
    await page.getByLabel("Nom complet", { exact: true }).fill("QA Skeptic");
    await page.getByLabel("Nom d'utilisateur", { exact: true }).fill("qa_skeptic_local");
    await page.getByLabel("Adresse e-mail", { exact: true }).fill("qa-skeptic@example.invalid");
    await snap("14-before-terms");
    await page
      .getByRole("link", { name: /conditions d.utilisation/i })
      .first()
      .click();
    await page
      .getByRole("heading", { name: /conditions/i })
      .first()
      .waitFor();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await snap("15-terms-read");
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.getByLabel("Nom complet", { exact: true }).waitFor();
    await page.waitForTimeout(1800);
    await snap("16-after-terms-back");
    const termsValues = await Promise.all(
      ["Nom complet", "Nom d'utilisateur", "Adresse e-mail"].map((name) =>
        page.getByLabel(name, { exact: true }).inputValue(),
      ),
    );
    if (
      JSON.stringify(termsValues) !==
      JSON.stringify(["QA Skeptic", "qa_skeptic_local", "qa-skeptic@example.invalid"])
    )
      throw Error("Signup draft lost after terms");
    await page
      .getByRole("link", { name: /politique de confidentialité/i })
      .first()
      .click();
    await page
      .getByRole("heading", { name: /politique de confidentialité/i })
      .first()
      .waitFor();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await snap("17-privacy-read");
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.getByLabel("Nom complet", { exact: true }).waitFor();
    await page.waitForTimeout(1800);
    await snap("18-after-privacy-back");
    const preserved = await Promise.all(
      ["Nom complet", "Nom d'utilisateur", "Adresse e-mail"].map((name) =>
        page.getByLabel(name, { exact: true }).inputValue(),
      ),
    );
    if (
      JSON.stringify(preserved) !==
      JSON.stringify(["QA Skeptic", "qa_skeptic_local", "qa-skeptic@example.invalid"])
    )
      throw Error("Signup draft lost after legal detour");
    const checked = await page.getByRole("checkbox").first().isChecked();
    const passwords = await page
      .locator("input[type=password]")
      .evaluateAll((xs) => xs.map((x) => x.value));
    if (checked || passwords.some(Boolean))
      throw Error("Consent or passwords restored unexpectedly");
    rows.push({
      assertion:
        "all nonsecret fields retained after both policy detours; consent false; passwords empty",
      passed: true,
    });
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);
    let matches = page.getByRole("link", { name: /voir les matchs et résultats/i }).first();
    if (!(await matches.isVisible().catch(() => false)))
      matches = page.getByRole("link", { name: "Matchs", exact: true }).first();
    if (!(await matches.isVisible().catch(() => false)))
      throw Error("Visible match navigation not found after Back");
    if (await matches.isVisible().catch(() => false)) {
      await matches.click();
      await page.waitForTimeout(5000);
      await snap("20-public-matches-success");
      const scored = page.getByRole("link", { name: /^Score :/ }).first();
      await scored.waitFor({ state: "visible", timeout: 20000 });
      const success = await scored.getAttribute("aria-label");
      if (!success || !/^Score :/.test(success)) throw Error("No actual public score found");
      await scored.click();
      await page.waitForTimeout(3000);
      await snap("21-actual-score-detail");
      rows.push({
        assertion: "read actual public score and opened match detail",
        passed: true,
        score: success,
        matchDetail: page.url(),
      });
    }
  } catch (e) {
    rows.push({ error: String(e) });
    await snap("19-detour-error").catch(() => {});
  } finally {
    fs.writeFileSync(dir + "/rerun.json", JSON.stringify(rows, null, 2));
    await browser.close();
  }
})();
