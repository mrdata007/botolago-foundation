process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
const { chromium } = require("@playwright/test");
const fs = require("fs");
(async () => {
  const phase = process.env.PHASE || "before";
  const dir = process.cwd() + "/docs/qa/launch-2026-10-18/mobile";
  fs.mkdirSync(dir, { recursive: true });
  const started = Date.now();
  let browser;
  const out = {
    persona: "Mobile first-time user",
    phase,
    productionBuild: true,
    viewport: { width: 375, height: 812 },
    network: { latencyMs: 2000, downloadBytesPerSecond: 50000, uploadBytesPerSecond: 50000 },
    browserCertificateException: "Ignore certificate errors for sandbox TLS interception",
    steps: [],
    errors: [],
    requestsFailed: [],
    success: false,
  };
  const save = () =>
    fs.writeFileSync(
      dir + "/" + phase + "-production.json",
      JSON.stringify({ ...out, elapsedMs: Date.now() - started }, null, 2),
    );
  const deadline = setTimeout(() => {
    out.barrier = "180 second run limit reached";
    save();
    process.exit(2);
  }, 180000);
  async function capture(page, name) {
    await page.screenshot({
      path: dir + "/" + phase + "-" + name + ".png",
      timeout: 60000,
      animations: "disabled",
    });
    out.steps.push({
      name,
      elapsedMs: Date.now() - started,
      url: page.url(),
      text: (await page.locator("body").innerText()).slice(0, 25000),
      controls: await page.locator("a,button,input").evaluateAll((es) =>
        es.map((e) => {
          const r = e.getBoundingClientRect();
          return {
            tag: e.tagName,
            text: e.textContent || e.getAttribute("aria-label") || e.getAttribute("placeholder"),
            href: e.getAttribute("href"),
            rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          };
        }),
      ),
      overflow: await page.locator("body *").evaluateAll((es) =>
        es
          .filter((e) => {
            const r = e.getBoundingClientRect(),
              s = getComputedStyle(e);
            return (
              r.width > 0 &&
              (r.left < -1 || r.right > 376) &&
              s.display !== "none" &&
              s.visibility !== "hidden"
            );
          })
          .map((e) => ({
            tag: e.tagName,
            text: e.textContent?.slice(0, 80),
            left: e.getBoundingClientRect().left,
            right: e.getBoundingClientRect().right,
          }))
          .slice(0, 30),
      ),
    });
    save();
  }
  try {
    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox", "--ignore-certificate-errors"],
    });
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
      locale: "fr-FR",
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => out.errors.push(String(e)));
    page.on("requestfailed", (r) =>
      out.requestsFailed.push({ url: r.url(), failure: r.failure()?.errorText }),
    );
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 2000,
      downloadThroughput: 50000,
      uploadThroughput: 50000,
      connectionType: "cellular3g",
    });
    await page.goto("http://127.0.0.1:4173", { waitUntil: "commit", timeout: 60000 });
    const continueButton = page.getByRole("button", { name: "Continuer", exact: true });
    try {
      await continueButton.waitFor({ state: "visible", timeout: 90000 });
      await capture(page, "01-language-choice");
      await continueButton.click({ timeout: 10000 });
    } catch (e) {
      out.languageDialogNote = String(e);
    }
    await page.waitForTimeout(4000);
    await capture(page, "02-landing");
    if (
      !(await page.getByRole("link", { name: /^(Voir les matchs et résultats|Matchs)$/ }).count())
    ) {
      out.landingInitiallyBlank = true;
      await page
        .getByRole("link", { name: /^(Voir les matchs et résultats|Matchs)$/ })
        .last()
        .waitFor({ state: "visible", timeout: 60000 });
      await capture(page, "02b-landing-recovered");
    }
    const explicit = page.getByRole("link", { name: "Voir les matchs et résultats", exact: true });
    if (await explicit.count()) {
      out.navigation = {
        action: "Clicked Voir les matchs et résultats",
        reason: "Literal landing CTA",
      };
      await explicit.click({ timeout: 10000 });
    } else {
      out.navigation = {
        action: "Clicked bottom Matchs navigation",
        reason: "Explicit Voir les matchs et résultats CTA absent",
      };
      await page
        .getByRole("link", { name: "Matchs", exact: true })
        .last()
        .click({ timeout: 10000 });
    }
    await page.waitForTimeout(5000);
    await capture(page, "03-match-list");
    const detail = page.getByRole("link", { name: /^Score : .+ \d+, .+ \d+/ }).first();
    try {
      await detail.waitFor({ state: "visible", timeout: 30000 });
    } catch {}
    await capture(page, "03b-match-list-loaded");
    if (await detail.count()) {
      out.firstResult = {
        text: await detail.innerText(),
        accessibleLabel: await detail.getAttribute("aria-label"),
        href: await detail.getAttribute("href"),
      };
      await detail.click({ timeout: 10000 });
      await page.waitForTimeout(5000);
      await capture(page, "04-first-result-detail");
      out.success = true;
      out.successDefinition =
        "Reached an actual scored football match detail through visible UI without signup";
    } else {
      out.barrier =
        "No scored match row available after landing-to-matches navigation and30second wait";
    }
  } catch (e) {
    out.error = String(e);
  } finally {
    clearTimeout(deadline);
    save();
    console.log(JSON.stringify(out));
    await browser?.close();
  }
})();
