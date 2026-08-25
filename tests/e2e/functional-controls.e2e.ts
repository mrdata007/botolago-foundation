import { expect, test, type Page } from "@playwright/test";

import {
  expectNoHorizontalOverflow,
  gotoHydrated,
  initializeLanguage,
  observePage,
  reloadHydrated,
} from "./support";

type Language = "fr" | "ar";

const labels = {
  fr: {
    news: "Actualités",
    follow: "Suivre",
    promptCancel: "Continuer à explorer",
    latest: "Dernières actualités",
    transfers: "Mercato",
    analysis: "Analyses",
    interviews: "Interviews",
    bookmark: "Enregistrer",
    bookmarked: "Enregistré",
    share: "Partager",
    copied: "Lien copié",
    articleMissing: "Article introuvable",
    matches: "Matchs",
    all: "Tous",
    live: "En direct",
    upcoming: "À venir",
    results: "Résultats",
    summary: "Résumé",
    stats: "Statistiques",
    h2h: "Face à face",
    momentum: "Momentum",
    matchMissing: "Match introuvable",
    switchLanguage: "Langue",
    oppositeLanguage: "العربية",
    email: "Adresse e-mail",
    forgot: "Mot de passe oublié ?",
    sendReset: "Envoyer le lien",
    resetSent: "Vérifiez votre boîte de réception",
    credentials: "E-mail ou mot de passe incorrect.",
  },
  ar: {
    news: "الأخبار",
    follow: "متابعة",
    promptCancel: "المتابعة في التصفح",
    latest: "آخر الأخبار",
    transfers: "سوق الانتقالات",
    analysis: "تحليلات",
    interviews: "مقابلات",
    bookmark: "حفظ",
    bookmarked: "محفوظ",
    share: "مشاركة",
    copied: "تم نسخ الرابط",
    articleMissing: "المقال غير موجود",
    matches: "المباريات",
    all: "الكل",
    live: "مباشر",
    upcoming: "قادمة",
    results: "النتائج",
    summary: "الملخص",
    stats: "الإحصائيات",
    h2h: "المواجهات",
    momentum: "الأفضلية",
    matchMissing: "المباراة غير موجودة",
    switchLanguage: "اللغة",
    oppositeLanguage: "Français",
    email: "البريد الإلكتروني",
    forgot: "نسيت كلمة المرور؟",
    sendReset: "إرسال الرابط",
    resetSent: "تحقق من صندوق الوارد",
    credentials: "البريد أو كلمة المرور غير صحيحة.",
  },
} as const;

async function prepare(page: Page, language: Language) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          window.localStorage.setItem("botolago.qa.clipboard", value);
        },
      },
    });
  });
  await initializeLanguage(page, language);
}

for (const language of ["fr", "ar"] as const) {
  test(`${language}: news, article, match, and recovery controls work`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const diagnostics = observePage(page);
    const l = labels[language];
    await page.setViewportSize(
      language === "ar" ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    );
    await prepare(page, language);

    await gotoHydrated(page, "/news", language);
    await expect(page.getByRole("heading", { level: 1, name: l.news })).toBeVisible();

    const articleLink = page.locator('a[href^="/news/"]').first();
    await expect(articleLink).toBeVisible();
    const articleHref = await articleLink.getAttribute("href");
    expect(articleHref).toBeTruthy();

    await page.getByRole("button", { name: l.follow, exact: true }).first().click();
    const prompt = page.getByRole("dialog");
    await expect(prompt).toBeVisible();
    await prompt.getByRole("button", { name: l.promptCancel, exact: true }).click();

    for (const name of [l.latest, l.transfers, l.analysis, l.interviews]) {
      const tab = page.getByRole("tab", { name, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
    }

    await page.goto(articleHref!);
    await expect(page.locator("article h1")).toBeVisible();
    await expect(page.getByRole("link", { name: /retour|رجوع/i })).toHaveAttribute("href", "/news");

    await page.getByRole("button", { name: l.bookmark, exact: true }).click();
    await expect(page.getByRole("button", { name: l.bookmarked, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await reloadHydrated(page, language);
    await expect(page.getByRole("button", { name: l.bookmarked, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: l.share, exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: l.copied })).toBeVisible();

    const titleBeforeSwitch = await page.locator("article h1").textContent();
    await page.getByRole("button", { name: l.switchLanguage, exact: true }).click();
    await page.getByRole("menuitem", { name: l.oppositeLanguage, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", language === "fr" ? "ar" : "fr");
    await expect.poll(() => page.locator("article h1").textContent()).not.toBe(titleBeforeSwitch);
    await expect(page.locator('a[href^="/news/"]')).not.toHaveCount(0);

    await prepare(page, language);
    await gotoHydrated(page, "/news/preview-a1", language);
    await expect(page.locator("article h1")).toBeVisible();
    await expect(page.locator('a[href^="/news/"]')).not.toHaveCount(0);

    await gotoHydrated(page, "/news/does-not-exist", language);
    await expect(
      page.getByRole("heading", { level: 1, name: l.articleMissing }),
    ).toBeVisible();

    await gotoHydrated(page, "/matches", language);
    await expect(page.getByRole("heading", { level: 1, name: l.matches })).toBeVisible();

    const matchLink = page.locator('a[href^="/matches/"]').first();
    await expect(matchLink).toBeVisible();
    const matchHref = await matchLink.getAttribute("href");
    expect(matchHref).toBeTruthy();

    for (const name of [l.live, l.upcoming, l.results, l.all]) {
      const tab = page.getByRole("tab", { name, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
    }

    await page.goto(matchHref!);
    await expect(page.getByRole("link", { name: /retour|رجوع/i })).toHaveAttribute(
      "href",
      "/matches",
    );
    for (const name of [l.stats, l.h2h, l.summary]) {
      const tab = page.getByRole("tab", { name, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
    }
    await expect(page.getByRole("tab", { name: l.momentum, exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: language === "fr" ? "Partager" : "مشاركة" }).click();
    await expect(page.getByRole("status").filter({ hasText: l.copied })).toBeVisible();

    await gotoHydrated(page, "/matches/does-not-exist", language);
    await expect(page.getByRole("heading", { level: 1, name: l.matchMissing })).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await diagnostics.verify(testInfo);
  });

  test(`${language}: login failure and password recovery terminate correctly`, async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    const l = labels[language];
    await prepare(page, language);

    await gotoHydrated(page, "/auth/login", language);
    await page.getByLabel(l.email).fill("demo@botolago.ma");
    await page.locator('input[type="password"]').fill("wrong-password");
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByText(l.credentials, { exact: true })).toBeVisible();

    await page.getByRole("link", { name: l.forgot, exact: true }).click();
    await page.getByLabel(l.email).fill("demo@botolago.ma");
    await page.getByRole("button", { name: l.sendReset, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: l.resetSent })).toBeVisible();

    await expect(page.locator("html")).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
    await diagnostics.verify(testInfo);
  });
}

test("French Fantasy browse, watchlist, detail, and ranking controls work", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const diagnostics = observePage(page);
  await prepare(page, "fr");

  await gotoHydrated(page, "/fantasy/players", "fr");
  await expect(page.getByRole("heading", { level: 1, name: "Joueurs" })).toBeVisible();
  const watch = page.getByRole("button", { name: "Ajouter à ma liste" }).first();
  await expect(watch).toBeEnabled();
  await expect(watch).toHaveAttribute("aria-pressed", "false");
  await watch.click();
  await expect(page.getByRole("button", { name: "Retirer" }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await reloadHydrated(page, "fr");
  await expect(page.getByRole("button", { name: "Retirer" }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.locator('a[href^="/fantasy/players/"]').first().click();
  const fixtureTab = page.getByRole("tab", { name: "Calendrier", exact: true });
  await fixtureTab.click();
  await expect(fixtureTab).toHaveAttribute("data-state", "active");
  await page.getByRole("tab", { name: "Aperçu", exact: true }).click();

  await gotoHydrated(page, "/fantasy/rankings", "fr");
  const gameweek = page.getByRole("tab", { name: "Journée", exact: true });
  await gameweek.click();
  await expect(gameweek).toHaveAttribute("aria-selected", "true");
  const overall = page.getByRole("tab", { name: "Général", exact: true });
  await overall.click();
  await expect(overall).toHaveAttribute("aria-selected", "true");
  const rankingSearch = page.getByLabel("Rechercher un manager ou une équipe");
  await rankingSearch.fill("Atlas");
  await expect(rankingSearch).toHaveValue("Atlas");
  await rankingSearch.clear();

  const nextPage = page.getByRole("button", { name: "Page suivante", exact: true });
  if (await nextPage.isEnabled()) {
    await nextPage.click();
    const previousPage = page.getByRole("button", { name: "Page précédente", exact: true });
    await expect(previousPage).toBeEnabled();
    await previousPage.click();
  }

  for (const path of [
    "/fantasy/fixtures",
    "/fantasy/top-players",
    "/fantasy/rules",
    "/fantasy/team",
    "/fantasy/points",
    "/fantasy/transfers",
    "/fantasy/leagues",
  ]) {
    await gotoHydrated(page, path, "fr");
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  await diagnostics.verify(testInfo);
});
