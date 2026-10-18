const { chromium } = require("playwright-core");
const fs = require("fs");
const phase = process.env.QA_PHASE === "after" ? "after" : "before";
const dir = process.cwd() + "/docs/qa/launch-2026-10-18/impatient";
const report = {
  persona: "impatient",
  phase,
  viewport: { width: 1440, height: 900 },
  tlsWorkaround: true,
  stages: [],
  issues: [],
  diagnostics: [],
};
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--ignore-certificate-errors"],
  });
  const context = await browser.newContext({ viewport: report.viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => report.diagnostics.push(e.message));
  async function snap(suffix, action) {
    const name = `${phase}-${suffix}`;
    await page.screenshot({ path: `${dir}/${name}.png` });
    const body = await page.locator("body").innerText();
    fs.writeFileSync(`${dir}/${name}.txt`, body);
    const controls = await page.locator("button,a").evaluateAll((es) =>
      es
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width && r.height;
        })
        .map((e) => ({
          tag: e.tagName,
          text: (e.innerText || e.getAttribute("aria-label") || "").trim(),
          href: e.getAttribute("href"),
        })),
    );
    report.stages.push({
      name,
      action,
      url: page.url(),
      body,
      controls,
      screenshot: `${name}.png`,
    });
    save();
    return body;
  }
  function save() {
    fs.writeFileSync(`${dir}/${phase}.json`, JSON.stringify(report, null, 2));
  }
  async function quitIfError(body) {
    if (
      /Impossible de charger cette page|Le service Fantasy n.a pas répondu|Une erreur est survenue/i.test(
        body,
      )
    ) {
      report.issues.push({
        id: "primary-flow-error",
        summary: "Visible error blocks impatient persona",
        visibleText: body,
      });
      report.result = "quit at first error";
      return true;
    }
    return false;
  }
  try {
    await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4500);
    await snap("01-first-visit", "Open landing in fresh context");
    if (await page.getByRole("dialog").count()) {
      await page.getByRole("button", { name: "Continuer", exact: true }).click();
      await page.waitForTimeout(1500);
      await snap("02-french", "Click Continuer with Français already selected");
    }
    const candidate = page
      .getByRole("link", { name: /^(Créer mon équipe|Découvrir le jeu)$/ })
      .first();
    await candidate.waitFor({ state: "visible" });
    const label = await candidate.innerText();
    await candidate.click();
    await page.waitForTimeout(3500);
    let body = await snap("03-first-action", `Click first clear primary landing action: ${label}`);
    if (await quitIfError(body)) {
      save();
      await browser.close();
      return;
    }
    if (await page.getByRole("dialog").count()) {
      const dialog = page.getByRole("dialog").last();
      const dismiss = dialog
        .getByRole("button", { name: /Continuer|Compris|Découvrir|C.est parti|Fermer/i })
        .first();
      if (await dismiss.count()) {
        await dismiss.click();
        await page.waitForTimeout(600);
        body = await snap("04-dismiss-dialog", "Follow visible welcome dialog action");
      }
    }
    report.fantasyClosed =
      /inscriptions.*fermées|prochaine journée|ne pouvez pas créer|effectif.*ferm/i.test(body);
    const matches = page
      .getByRole("link", {
        name: /^(Calendrier|Matchs|Matches|Voir les matchs|Voir les matchs et résultats)$/,
      })
      .first();
    if (await matches.count()) {
      const label = await matches.innerText();
      await matches.click();
      await page.waitForTimeout(3000);
      body = await snap(
        "05-public-matches",
        `Closed round: click visible ${label} to find public football information`,
      );
      if (await quitIfError(body)) {
        save();
        await browser.close();
        return;
      }
      const match = page.locator('a[href^="/matches/"]').filter({ hasText: /\d/ }).first();
      if (await match.count()) {
        const label = (await match.innerText()).slice(0, 180);
        await match.click();
        await page.waitForTimeout(2500);
        body = await snap("06-first-public-match", `Open first visible score/fixture: ${label}`);
        if (!(await quitIfError(body))) report.result = "first public match detail reached";
      } else
        report.result =
          "public matches screen reached; inspect whether score or fixture information visible";
    } else report.result = "Fantasy hub reached; no visible public matches action found";
  } catch (e) {
    report.failure = e.message;
    try {
      await snap(
        "99-stuck",
        "Harness action could not complete; inspect before counting app issue",
      );
    } catch {}
  }
  save();
  console.log(
    JSON.stringify(
      {
        result: report.result,
        failure: report.failure,
        stages: report.stages.map((s) => ({
          name: s.name,
          action: s.action,
          url: s.url,
          body: s.body.slice(0, 2500),
        })),
        issues: report.issues,
      },
      null,
      2,
    ),
  );
  await browser.close();
})().catch((e) => {
  fs.writeFileSync(`${dir}/${phase}-error.txt`, e.stack);
  console.error(e);
  process.exit(1);
});
