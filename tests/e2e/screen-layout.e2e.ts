import { expect, test } from "@playwright/test";

import { initializeLanguage } from "./support";
import { dictionaries } from "../../src/i18n/dictionaries";

// Real routes and the existing development-only admin samples. All data comes
// from the local mock repositories; no privileged production session is used.
const screens = [
  ["home", "/", "guest"],
  ["calendar", "/matches", "guest"],
  ["standings", "/matches/standings", "guest"],
  ["match", "/matches/00000020-0000-4000-8000-000000000001", "guest"],
  ["clubs", "/clubs", "guest"],
  ["club", "/clubs/00000010-0000-4000-8000-000000000001", "guest"],
  ["news", "/news", "guest"],
  ["article", "/news/a0000000-0000-4000-8000-000000000001", "guest"],
  ["fantasy", "/fantasy", "member"],
  ["team", "/fantasy/team", "member"],
  ["transfers", "/fantasy/transfers", "member"],
  ["squad-builder", "/fantasy/create", "guest"],
  ["players", "/fantasy/players", "guest"],
  ["points", "/fantasy/points", "member"],
  ["rankings", "/fantasy/rankings", "guest"],
  ["leagues", "/fantasy/leagues", "member"],
  ["difficulty", "/fantasy/fixtures", "guest"],
  ["top-players", "/fantasy/top-players", "guest"],
  ["rules", "/fantasy/rules", "guest"],
  ["help", "/fantasy/help", "guest"],
  ["profile", "/profile", "member"],
  ["security", "/profile/security", "member"],
  ["saved", "/profile/saved", "member"],
  ["notifications", "/notifications", "member"],
  ["predictions", "/pronostics", "guest"],
  ["prediction-leagues", "/pronostics/ligues", "member"],
  ["prospects", "/pepites", "guest"],
  ["prospects-ranking", "/pepites/classement", "guest"],
  ["prospects-compare", "/pepites/comparer", "guest"],
  ["prospects-method", "/pepites/methode", "guest"],
  ["curva", "/curva?mc=rated", "member"],
  ["curva-card", "/curva/carte?mc=rated", "member"],
  ["curva-friends", "/curva/les-votres?mc=rated", "member"],
  ["curva-seasons", "/curva/saisons?mc=rated", "member"],
  ["plus", "/plus", "guest"],
  ["prizes", "/prizes", "guest"],
  ["landing", "/jouer", "guest"],
  ["login", "/auth/login", "guest"],
  ["register", "/auth/register", "guest"],
  ["reset", "/auth/forgot-password", "guest"],
  ["terms", "/terms", "guest"],
  ["privacy", "/privacy", "guest"],
  ["admin", "/dev/admin-shell-sample", "guest"],
  ["admin-plus", "/dev/admin-shell-sample?view=plus", "guest"],
  ["admin-mappings", "/dev/player-mappings-sample?scale=small", "guest"],
] as const;

const selected = process.env.SCREEN_LAYOUT_SCREENS?.split(",");
const widths = (process.env.SCREEN_LAYOUT_WIDTHS ?? "390,1440").split(",").map(Number);
const languages = (process.env.SCREEN_LAYOUT_LANGUAGES ?? "fr,ar").split(",") as ("fr" | "ar")[];
const themes = (process.env.SCREEN_LAYOUT_THEMES ?? "light").split(",") as ("light" | "dark")[];
const screenshots = new Set([
  "calendar",
  "standings",
  "clubs",
  "news",
  "team",
  "transfers",
  "squad-builder",
  "players",
  "rankings",
  "difficulty",
  "profile",
  "prospects-ranking",
  "curva",
  "curva-card",
  "admin",
  "login",
  "landing",
  "admin-mappings",
]);

test.describe.configure({ mode: "parallel" });

for (const language of languages) {
  for (const theme of themes) {
    for (const width of widths) {
      for (const [screen, path, persona] of screens) {
        if (selected && !selected.includes(screen)) continue;
        test(`${screen} ${language} ${theme} ${width}`, async ({ page }, info) => {
          await page.setViewportSize({ width, height: 900 });
          await initializeLanguage(page, language);
          await page.addInitScript(
            ({ lang, appearance, member }) => {
              localStorage.setItem("botolago.theme", appearance);
              sessionStorage.setItem("botolago.card.hero_session.v1", "1");
              if (!member) return;
              const demo = {
                id: "usr_demo",
                email: "demo@botolago.ma",
                displayName: "Rachid Demo",
                username: "rachid_demo",
                language: lang,
                profileComplete: true,
                verified: true,
                provider: "email",
                createdAt: "2026-09-01T00:00:00Z",
                favoriteClubId: "war",
                notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
                passwordDigest: "x",
              };
              localStorage.setItem("botolago.auth.users", JSON.stringify([demo]));
              localStorage.setItem(
                "botolago.auth.session",
                JSON.stringify({ kind: "user", userId: demo.id, createdAt: demo.createdAt }),
              );
            },
            { lang: language, appearance: theme, member: persona === "member" },
          );
          const target = path.startsWith("/dev/")
            ? `${path}${path.includes("?") ? "&" : "?"}lang=${language}`
            : path;
          await page.goto(target, { waitUntil: "networkidle" });
          if (process.env.SCREEN_LAYOUT_FONT_SCALE === "2") {
            await page.evaluate(() => {
              document.documentElement.style.fontSize = "32px";
            });
          }
          await expect(page.locator("html")).toHaveAttribute("data-lang", language);
          await expect(page.locator("html")).toHaveAttribute(
            "dir",
            language === "ar" ? "rtl" : "ltr",
          );
          await page.evaluate(() => document.fonts.ready);
          await expect(page.locator("vite-error-overlay")).toHaveCount(0);
          if (screen === "admin-mappings") {
            await expect(page.getByTestId("player-mappings")).toBeVisible();
          } else if (screen !== "landing") {
            await expect(page.locator("main").first()).toBeVisible();
          }

          const observation = await page.evaluate(() => {
            const vw = document.documentElement.clientWidth;
            const rectangle = (el: Element) => {
              const r = el.getBoundingClientRect();
              return {
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
                right: r.right,
                bottom: r.bottom,
              };
            };
            const visible = (el: Element) => {
              const r = el.getBoundingClientRect(),
                s = getComputedStyle(el);
              return (
                r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none"
              );
            };
            const constrained = (el: Element) => {
              for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
                // Only genuine horizontal scrollers are exempt. A clipping
                // shell must not hide a broken layout from this assertion.
                if (
                  /auto|scroll/.test(getComputedStyle(a).overflowX) &&
                  a.scrollWidth > a.clientWidth + 1
                )
                  return true;
              }
              return false;
            };
            const escaped: { label: string; x: number; right: number }[] = [];
            const clipped: string[] = [];
            for (const el of document.querySelectorAll(
              "main a, main button, main input, main select, main h1, main h2, main h3, header a, header button, header input",
            )) {
              if (!visible(el) || el.closest("svg") || constrained(el)) continue;
              const r = el.getBoundingClientRect(),
                s = getComputedStyle(el);
              const label = (el.getAttribute("aria-label") || el.textContent || el.tagName)
                .trim()
                .slice(0, 100);
              if (r.x < -1 || r.right > vw + 1) escaped.push({ label, x: r.x, right: r.right });
              if (
                el.children.length === 0 &&
                el.scrollWidth > el.clientWidth + 2 &&
                /hidden|clip/.test(s.overflowX) &&
                s.textOverflow !== "ellipsis"
              )
                clipped.push(label);
            }
            const main =
              document.querySelector("main") ||
              document.querySelector('[data-testid="player-mappings"]') ||
              document.querySelector('[data-testid="landing-page"]')!;
            const column = main.classList.contains("fpl-column")
              ? main
              : main.lastElementChild || main;
            const sticky = [...main.querySelectorAll("*")]
              .filter((el) => getComputedStyle(el).position === "sticky")
              .map((el) => ({
                tag: el.tagName,
                bottom: getComputedStyle(el).bottom,
                ...rectangle(el),
              }));
            return {
              actualPath: location.pathname,
              direction: document.documentElement.dir,
              main: rectangle(main),
              column: rectangle(column),
              escaped,
              clipped,
              sticky,
            };
          });
          await info.attach("layout-observation", {
            body: JSON.stringify({ screen, path, language, theme, width, ...observation }, null, 2),
            contentType: "application/json",
          });
          if (screenshots.has(screen))
            await page.screenshot({
              path: info.outputPath(`${screen}-${language}-${theme}-${width}.png`),
              fullPage: true,
            });
          expect(
            observation.escaped,
            "visible controls and headings stay inside the viewport",
          ).toEqual([]);
          expect(observation.clipped, "headings and controls do not silently clip text").toEqual(
            [],
          );
          if (screen === "landing") await expect(page.getByRole("main")).toBeVisible();
          if (["calendar", "standings", "clubs", "news"].includes(screen)) {
            const titleCanvas = await page.locator("main h1").evaluate((heading) => {
              const r = heading.parentElement!.parentElement!.getBoundingClientRect();
              return { x: r.x, width: r.width };
            });
            expect(Math.abs(titleCanvas.x - observation.column.x)).toBeLessThanOrEqual(1);
            expect(Math.abs(titleCanvas.width - observation.column.width)).toBeLessThanOrEqual(1);
            if (screen === "calendar" || screen === "standings") {
              const tabs = await page.getByRole("tablist").boundingBox();
              expect(Math.abs(tabs!.x - titleCanvas.x)).toBeLessThanOrEqual(1);
              expect(Math.abs(tabs!.width - titleCanvas.width)).toBeLessThanOrEqual(1);
            }
          }
          if (screen === "players" && width >= 1024) {
            const filters = await page.getByTestId("player-filters").boundingBox();
            const results = await page.getByTestId("player-results").boundingBox();
            expect(Math.abs(filters!.y - results!.y)).toBeLessThanOrEqual(1);
            expect(filters!.width).toBeGreaterThanOrEqual(200);
            expect(results!.width).toBeGreaterThanOrEqual(400);
            expect(language === "ar" ? filters!.x > results!.x : filters!.x < results!.x).toBe(
              true,
            );
          }
        });
      }
    }
  }
}

for (const language of ["fr", "ar"] as const) {
  test(`landing ${language}: keyboard bypass skips navigation`, async ({ page }) => {
    await initializeLanguage(page, language);
    await page.goto("/jouer", { waitUntil: "networkidle" });
    await expect(page.getByRole("main")).toHaveCount(1);
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: dictionaries[language]["nav.skip_to_content"] }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("header :focus")).toHaveCount(0);
  });

  test(`players ${language}: filters, sorting and reset remain functional`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await initializeLanguage(page, language);
    await page.goto("/fantasy/players", { waitUntil: "networkidle" });
    const rows = page.locator("[data-player-row]");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(1);
    const search = page.getByRole("searchbox", {
      name: dictionaries[language]["fantasy.picker.search"],
    });
    await search.fill("no-player-matches-this-query");
    await expect(rows).toHaveCount(0);
    await page
      .getByRole("button", { name: dictionaries[language]["fantasy.players.reset_filters"] })
      .click();
    await expect(search).toHaveValue("");
    await expect(rows.first()).toBeVisible();
    await page.locator("#players-sort").selectOption("price");
    await expect(page).toHaveURL(/sort=price/);
    await page
      .getByRole("group", { name: dictionaries[language]["fantasy.players.filter_position"] })
      .getByRole("button")
      .nth(1)
      .click();
    await expect(rows.first()).toBeVisible();
    await expect(
      page
        .getByRole("group", { name: dictionaries[language]["fantasy.players.filter_position"] })
        .getByRole("button")
        .nth(1),
    ).toHaveAttribute("aria-pressed", "true");
  });
}

for (const language of ["fr", "ar"] as const) {
  for (const width of [390, 768, 1440]) {
    test(`transfer actions ${language} ${width} remain reachable while scrolling`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 700 });
      await initializeLanguage(page, language);
      await page.goto("/fantasy/transfers", { waitUntil: "networkidle" });
      const add = page.getByRole("button", {
        name: dictionaries[language]["fpl.add_player"],
        exact: true,
      });
      await expect(add).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 160));
      await page.screenshot({ path: info.outputPath(`transfer-actions-${language}-${width}.png`) });
      const box = await add.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(701);
      await add.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(add).toBeFocused();
    });
  }
}
