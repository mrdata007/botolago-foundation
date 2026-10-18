const { chromium } = require("playwright-core");
const fs = require("fs");
const out = process.cwd() + "/docs/qa/launch-2026-10-18/breaker";
fs.mkdirSync(out, { recursive: true });
const read = new Set([
  "home_stories",
  "premium_status",
  "manager_card_status",
  "fantasy_hub",
  "fantasy_player_pool",
  "fantasy_rules",
  "fantasy_fixture_difficulty",
  "fantasy_gameweeks",
  "fantasy_gameweek_summary",
  "fantasy_leagues",
  "fantasy_league_standings",
  "fantasy_overall_standings",
  "public_fantasy_gameweek_recap",
  "fantasy_top_players",
  "fantasy_player_season_stats",
  "fantasy_player_gameweek_history",
  "fantasy_prizes",
  "fantasy_prize_winners",
  "predictions_round",
  "predictions_leaderboard",
  "predictions_league_standings",
  "match_votes",
  "pepites_version",
  "pepites_home",
  "pepites_ranking",
  "pepites_player",
  "pepites_player_matches",
  "pepites_player_stats",
  "pepites_edition",
  "pepites_methodology",
  "news_home_modules",
  "news_feed",
  "news_team_filters",
  "news_article_detail",
  "news_related_articles",
  "news_search",
  "news_sitemap_entries",
  "football_season_catalog",
  "football_team_catalog",
  "football_home_matches",
  "football_live_matches",
  "football_upcoming_matches",
  "football_matches_by_date",
  "football_match_detail",
  "football_match_timeline",
  "football_match_lineups",
  "football_match_statistics",
  "football_match_pressure",
  "football_match_absences",
  "football_head_to_head",
  "football_standings",
  "football_competition_fixtures",
  "football_competition_summary",
  "football_team_summary",
  "football_team_fixtures",
  "football_team_squad",
  "football_player_summary",
  "football_player_availability",
]);
(async () => {
  let browser;
  const results = {
    persona: "breaker",
    steps: [],
    checks: {},
    blockedWrites: [],
    errors: [],
    responses: [],
    limit:
      "No external mutations permitted; account creation and authenticated success cannot be proved.",
  };
  const timer = setTimeout(() => {
    fs.writeFileSync(out + "/after.json", JSON.stringify(results, null, 2));
    browser?.close();
  }, 85000);
  try {
    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--ignore-certificate-errors"],
    });
    const c = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const p = await c.newPage();
    p.setDefaultTimeout(3500);
    p.setDefaultNavigationTimeout(20000);
    await c.route("**/*", async (r) => {
      const req = r.request(),
        u = new URL(req.url());
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method()) &&
        !read.has(u.pathname.match(/\/rpc\/([^/]+)$/)?.[1])
      ) {
        results.blockedWrites.push({ method: req.method(), path: u.pathname });
        return r.abort("blockedbyclient");
      }
      return r.continue();
    });
    p.on("pageerror", (e) => results.errors.push(e.message));
    p.on("response", (r) => {
      if (r.status() >= 400)
        results.responses.push({ status: r.status(), path: new URL(r.url()).pathname });
    });
    async function snap(name, action) {
      await p.screenshot({ path: out + "/after-" + name + ".png", fullPage: true });
      const step = {
        name,
        action,
        url: p.url(),
        text: (await p.locator("body").innerText()).slice(0, 18000),
        links: await p
          .locator("a")
          .evaluateAll((ns) =>
            ns.map((n) => ({ text: n.innerText, href: n.getAttribute("href") })),
          ),
        inputs: await p
          .locator("input")
          .evaluateAll((ns) =>
            ns.map((n) => ({
              type: n.type,
              name: n.name,
              id: n.id,
              placeholder: n.placeholder,
              value: n.value,
              valid: n.validity.valid,
              validation: n.validationMessage,
            })),
          ),
      };
      results.steps.push(step);
      fs.writeFileSync(out + "/after.json", JSON.stringify(results, null, 2));
      console.log(name, step.url, step.text.slice(0, 1100));
    }
    async function visibleLink(re) {
      const loc = p.locator("a").filter({ visible: true });
      for (let i = 0; i < (await loc.count()); i++) {
        const a = loc.nth(i),
          href = await a.getAttribute("href");
        if (href && re.test(href)) return a;
      }
      return null;
    }
    await p.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(3500);
    await snap("01-first-visit", "Fresh context, landing page");
    const cont = p.getByRole("button", { name: /Continuer/ }).first();
    if (await cont.isVisible()) {
      await cont.click({ clickCount: 2 });
      await p.waitForTimeout(2000);
    }
    await snap("02-language-double-click", "Double-click Continuer");
    let target = await visibleLink(/\/auth\/(?:register|login)|\/fantasy/);
    if (target) {
      results.steps.push({
        action: "Double-click first visible signup/Fantasy action",
        text: await target.innerText(),
        href: await target.getAttribute("href"),
      });
      await target.click({ clickCount: 2 });
      await p.waitForTimeout(3000);
      await snap("03-first-action", "Double-click CTA");
    }
    if (p.url().includes("/auth/login")) {
      await p.locator("input[type=email]").fill("junk@@@");
      await p.locator("input[type=password]").fill("x");
      await p.locator("button[type=submit]").click({ clickCount: 2 });
      await snap("login-junk", "Malformed login and double submit");
      await p.goBack({ waitUntil: "domcontentloaded" });
      await p.waitForTimeout(300);
      await p.goForward({ waitUntil: "domcontentloaded" });
      await p.waitForTimeout(400);
      await snap("login-restored", "Back/Forward restores non-secret login email");
      results.checks.loginEmailRestored =
        (await p.locator("input[type=email]").inputValue()) === "junk@@@";
      results.checks.loginPasswordCleared =
        (await p.locator("input[type=password]").inputValue()) === "";
    }
    const create = p.getByRole("link", { name: "Créer un compte", exact: true });
    if (await create.isVisible()) {
      await create.click({ clickCount: 2 });
      await p.waitForTimeout(1000);
      await snap("04-create-account", "Follow visible Créer un compte from sign-in");
    }
    // If the CTA reached the guest hub, follow its visible account action.
    if (!(await p.locator("input").count())) {
      const a = await visibleLink(/\/auth\/(?:register|login)/);
      if (a) {
        await a.click({ clickCount: 2 });
        await p.waitForTimeout(1500);
        await snap("04-account-form", "Double-click account link visible in hub");
      }
    }
    const inputs = p.locator("input").filter({ visible: true });
    if (await inputs.count()) {
      for (let i = 0; i < (await inputs.count()); i++) {
        const el = inputs.nth(i),
          type = await el.getAttribute("type");
        if (["checkbox", "radio", "hidden", "file", "submit"].includes(type)) continue;
        await el.fill(
          type === "email"
            ? "junk@@@"
            : type === "password"
              ? "x"
              : "<script>alert(1)</script> 💥 ".repeat(8),
        );
      }
      await snap("05-junk-entered", "Paste malformed email, short password, long HTML-like junk");
      const submit = p.locator('button[type="submit"]').first();
      if (await submit.isVisible()) await submit.click({ clickCount: 2 });
      await p.waitForTimeout(500);
      await snap(
        "06-junk-double-submit",
        "Double-click submit with invalid fields; record native and inline validation",
      );
      await p.goBack({ waitUntil: "domcontentloaded" });
      await p.waitForTimeout(600);
      await snap("07-back-mid-form", "Browser Back after typing and invalid submit");
      await p.goForward({ waitUntil: "domcontentloaded" });
      await p.waitForTimeout(600);
      await snap("08-forward-form", "Browser Forward; inspect draft retention");
      const before = results.steps
        .find((s) => s.name === "05-junk-entered")
        .inputs.filter((x) => ["text", "email"].includes(x.type));
      const now = results.steps
        .find((s) => s.name === "08-forward-form")
        .inputs.filter((x) => ["text", "email"].includes(x.type));
      results.checks.signupDraftRestored = before.every((x, i) => now[i]?.value === x.value);
      results.checks.signupPasswordsCleared = await p
        .locator("input[type=password]")
        .evaluateAll((ns) => ns.every((n) => n.value === ""));
      const terms = await visibleLink(/^\/terms$/);
      if (terms) {
        await terms.click({ clickCount: 2 });
        await p.waitForTimeout(400);
        await snap("terms-detour", "Read terms through visible signup link");
        await p.goBack({ waitUntil: "domcontentloaded" });
        await p.waitForTimeout(400);
        await snap("terms-return", "Return to signup after reading terms");
        results.checks.signupDraftSurvivesTerms =
          (await p.locator("input[type=email]").inputValue()) === "junk@@@";
      }
    }
    // Recover using visible public links; never type a hidden URL for product navigation.
    for (let i = 0; i < 3 && p.url().includes("/auth/"); i++) {
      await p.goBack({ waitUntil: "domcontentloaded" });
      await p.waitForTimeout(400);
    }
    await snap("09-back-recovery", "Back out of account form to visible public app");
    let publicLink = await visibleLink(/^\/$|^\/matches$|^\/pronostics$/);
    if (publicLink) {
      await publicLink.click({ clickCount: 2 });
      await p.waitForTimeout(2000);
      await snap("09-recover-public", "Double-click visible public/home action");
    }
    let match = await visibleLink(/^\/matches\/[^?]+/);
    if (match) {
      await match.click({ clickCount: 2 });
      await p.waitForTimeout(1500);
      await snap(
        "10-first-public-success",
        "Double-click actual match link and read match information",
      );
      results.firstSuccess = "Opened public match details";
    } else
      results.firstSuccess =
        "No match detail available via visible link in bounded flow; inspect screenshots for current barrier";
  } catch (e) {
    results.errors.push("Driver: " + e.message);
  } finally {
    clearTimeout(timer);
    fs.writeFileSync(out + "/after.json", JSON.stringify(results, null, 2));
    await browser?.close();
    console.log("DONE", out + "/after.json");
  }
})();
