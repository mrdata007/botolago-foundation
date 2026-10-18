const { chromium } = require("@playwright/test");
const fs = require("fs");
(async () => {
  const arabic = process.env.QA_LANG === "ar";
  const out =
    process.cwd() +
    "/docs/qa/launch-2026-10-18/literal" +
    (process.env.QA_PHASE ? "/" + process.env.QA_PHASE : "") +
    (arabic ? "/arabic" : "");
  fs.mkdirSync(out, { recursive: true });
  const relaxed = process.env.QA_IGNORE_TLS === "1";
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", ...(relaxed ? ["--ignore-certificate-errors"] : [])],
  });
  const log = [],
    requests = [],
    actions = [];
  let page;
  const safe = (url) => {
    try {
      const u = new URL(url);
      return u.origin + u.pathname;
    } catch {
      return url;
    }
  };
  async function snap(name) {
    await page.screenshot({ path: out + "/" + name + ".png", fullPage: true });
    const text = await page.locator("body").innerText();
    fs.writeFileSync(out + "/" + name + ".txt", text);
    log.push({
      step: name,
      url: page.url(),
      dir: await page.locator("html").getAttribute("dir"),
      lang: await page.locator("html").getAttribute("lang"),
      text,
      controls: await page.locator("a,button").evaluateAll((els) =>
        els.map((e) => ({
          tag: e.tagName,
          text: e.innerText,
          href: e.getAttribute("href"),
          aria: e.getAttribute("aria-label"),
        })),
      ),
    });
    console.log(name, text);
  }
  async function clickVisible(locator, action) {
    for (let i = 0; i < (await locator.count()); i++) {
      const item = locator.nth(i);
      if ((await item.isVisible()) && (await item.isEnabled())) {
        actions.push({
          action,
          label: await item.innerText(),
          aria: await item.getAttribute("aria-label"),
        });
        await item.click();
        return true;
      }
    }
    return false;
  }
  try {
    page = await browser.newPage({
      viewport: { width: 1365, height: 900 },
      locale: arabic ? "ar-MA" : "fr-FR",
      ignoreHTTPSErrors: relaxed,
    });
    page.setDefaultTimeout(15000);
    page.on("requestfailed", (r) =>
      requests.push({ url: safe(r.url()), error: r.failure()?.errorText }),
    );
    await page.goto((process.env.QA_BASE_URL || "http://127.0.0.1:4173") + "/", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await snap("01-first-visit");
    const chooser = page.getByRole("dialog");
    if (await chooser.count()) {
      await clickVisible(
        chooser.getByRole("radio", { name: arabic ? /العربية/ : /Français/ }),
        "Choose language",
      );
      await clickVisible(
        chooser.getByRole("button", { name: arabic ? "متابعة" : "Continuer", exact: true }),
        "Confirm language",
      );
      await page.waitForTimeout(1800);
    }
    await snap("02-landing");
    const primary = page.getByRole("link", {
      name: arabic ? /^(أنشئ فريقي|اكتشف اللعبة)$/ : /^(Créer mon équipe|Découvrir le jeu)$/,
    });
    if (!(await clickVisible(primary, "Follow landing primary action"))) {
      await clickVisible(
        page.locator('a[href="/fantasy/create"], a[href="/fantasy"]').filter({ hasText: /./ }),
        "Follow visible labelled primary action",
      );
    }
    await page.waitForTimeout(5000);
    await snap("03-primary-action");
    const auto = page.getByRole("button", { name: /Compléter automatiquement|تلقائي/ });
    if (await clickVisible(auto, "Complete squad automatically")) {
      await page.waitForTimeout(1000);
      await snap("04-auto-selection");
    }
    if (
      await clickVisible(
        page.getByRole("button", { name: arabic ? "التالي" : "Suivant", exact: true }),
        "Continue squad draft",
      )
    ) {
      await page.waitForTimeout(800);
      await snap("05-name-captain-step");
    }
    // A closed Fantasy day explicitly offers the public calendar. Follow that literal alternative.
    if (
      await clickVisible(
        page.getByRole("link", { name: arabic ? "المباريات" : "Calendrier", exact: true }),
        "Follow calendar from closed Fantasy hub",
      )
    ) {
      await page.waitForTimeout(4000);
      await snap("06-calendar");
      let scored = page.locator('a[href^="/matches/"]').filter({ hasText: /Terminé|انتهت|انتهى/ });
      if (!(await scored.count())) {
        const latest = page
          .getByRole("button", { name: arabic ? /آخر النتائج/ : /Derniers résultats/ })
          .or(page.getByRole("link", { name: arabic ? /آخر النتائج/ : /Derniers résultats/ }));
        if (await clickVisible(latest, "Follow latest results label")) {
          await page.waitForTimeout(2500);
          await snap("07-latest-results");
        }
      }
      const rows = page.locator('a[href^="/matches/"][aria-label]').filter({ hasText: /./ });
      const finished = page.getByRole("link", { name: arabic ? /انتهت|انتهى/ : /Match terminé/ });
      if (
        (await clickVisible(finished, "Open finished match score")) ||
        (await clickVisible(rows, "Open visible match row"))
      ) {
        await page.waitForTimeout(4000);
        await snap("08-match-detail");
      }
    }
  } catch (e) {
    log.push({ error: String(e) });
    console.error(e);
  } finally {
    fs.writeFileSync(
      out + "/observations.json",
      JSON.stringify(
        {
          persona: "Literal-language first-time user",
          language: arabic ? "ar" : "fr",
          ignoreHTTPSErrors: relaxed,
          actions,
          states: log,
          requestFailures: requests,
        },
        null,
        2,
      ),
    );
    await browser.close();
  }
})();
