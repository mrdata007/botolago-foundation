import { test, expect } from "./fixtures";
import {
  expectHealthyDocument,
  gotoHydrated,
  isDeepFunctionalProject,
  observePage,
  reloadHydrated,
} from "./support";

test.beforeEach(({}, testInfo) => {
  test.skip(!isDeepFunctionalProject(testInfo), "Deep functional coverage runs in mobile French.");
});

test("login validation, password visibility, and forgot-password controls work", async ({
  anonymousPage: page,
}, testInfo) => {
  const diagnostics = observePage(page);
  await gotoHydrated(page, "/auth/login", "fr");
  const email = page.getByLabel("Adresse e-mail");
  const password = page.locator('input[autocomplete="current-password"]');
  const submit = page.locator('form button[type="submit"]');

  await submit.click();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAttribute("aria-invalid", "true");

  await email.fill("demo@botolago.ma");
  await password.fill("demo12345");
  await page.getByRole("button", { name: "Afficher le mot de passe" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Masquer le mot de passe" }).click();
  await expect(password).toHaveAttribute("type", "password");
  await submit.click();
  await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();

  await page.getByRole("link", { name: /Mot de passe oublié/i }).click();
  await expect(page).toHaveURL(/\/auth\/forgot-password$/);
  await expect(page.getByRole("heading", { name: "Mot de passe oublié" })).toBeVisible();
  const forgotForm = page.locator("form");
  await forgotForm.locator('button[type="submit"]').click();
  await expect(forgotForm.getByLabel("Adresse e-mail")).toHaveAttribute("aria-invalid", "true");
  await forgotForm.getByLabel("Adresse e-mail").fill("qa+botolago@example.com");
  await forgotForm.getByRole("button", { name: "Envoyer le lien" }).click();
  await expect(
    page.getByRole("heading", { name: "Vérifiez votre boîte de réception" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /connexion/i }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await diagnostics.verify(testInfo);
});

test("fresh registration, verification, profile setup, password update, and both sign-out choices work", async ({
  anonymousPage: page,
}, testInfo) => {
  test.setTimeout(90_000);
  const diagnostics = observePage(page);
  const suffix = Date.now().toString(36);
  const emailAddress = `qa+botolago-${suffix}@example.com`;
  const username = `qa_${suffix}`.slice(0, 20);
  const originalPassword = "QaTest123!";
  const updatedPassword = "NewPass123!";

  await gotoHydrated(page, "/auth/register", "fr");
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByLabel("Nom complet")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("checkbox")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Nom complet").fill("QA BotolaGO");
  await page.getByLabel("Nom d'utilisateur").fill(username);
  await page.getByLabel("Adresse e-mail").fill(emailAddress);
  const newPassword = page.getByLabel("Mot de passe", { exact: true });
  await newPassword.fill(originalPassword);
  await page.getByLabel("Confirmer le mot de passe").fill(originalPassword);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Afficher le mot de passe" }).click();
  await expect(newPassword).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/auth\/verify\?/);

  const otp = page.getByRole("textbox", { name: "Code de vérification" });
  await expect(otp).toBeVisible();
  await otp.pressSequentially("111111");
  await page.getByRole("button", { name: "Vérifier" }).click();
  await expect(page.getByText("Code invalide.")).toBeVisible();
  await otp.press("ControlOrMeta+A");
  await otp.pressSequentially("123456");
  await page.getByRole("button", { name: "Vérifier" }).click();
  await expect(page).toHaveURL(/\/auth\/profile-setup$/);

  await page.locator('input[type="file"]').setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.locator('img[src^="data:image/png"]')).toBeVisible();
  await page.getByRole("button", { name: /Retirer/i }).click();
  await page.getByLabel("Nom affiché").fill("QA Manager");
  await page.getByLabel("Nom d'utilisateur").fill(username);
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: /Wydad/i }).first().click();
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("checkbox").first().uncheck();
  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page).toHaveURL(/\/$/);

  await gotoHydrated(page, "/auth/update-password", "fr");
  await page.getByLabel("Nouveau mot de passe").fill(updatedPassword);
  await page.getByLabel("Confirmer le mot de passe").fill("does-not-match");
  await page.getByRole("button", { name: "Mettre à jour" }).click();
  await expect(page.getByText("Les mots de passe ne correspondent pas.")).toBeVisible();
  await page.getByLabel("Confirmer le mot de passe").fill(updatedPassword);
  await page.getByRole("button", { name: "Mettre à jour" }).click();
  await expect(page.getByRole("heading", { name: /Mot de passe mis à jour/i })).toBeVisible();

  await gotoHydrated(page, "/profile", "fr");
  await expect(page.getByText("QA Manager")).toBeVisible();
  await page.getByRole("button", { name: "Se déconnecter", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Se déconnecter ?" })
    .getByRole("button", {
      name: "Conserver les données",
    })
    .click();

  await gotoHydrated(page, "/auth/login", "fr");
  await page.getByLabel("Adresse e-mail").fill(emailAddress);
  await page.locator('input[autocomplete="current-password"]').fill(updatedPassword);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/auth/login"));
  await gotoHydrated(page, "/profile", "fr");
  await page.getByRole("button", { name: "Se déconnecter", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Se déconnecter ?" })
    .getByRole("button", {
      name: "Effacer et se déconnecter",
    })
    .click();
  await gotoHydrated(page, "/profile", "fr");
  await expect(page.getByRole("heading", { name: /Connectez-vous à BotolaGO/i })).toBeVisible();
  await diagnostics.verify(testInfo);
});

test("news save/follow states and match navigation, filters, detail tabs, back, and share work", async ({
  guestPage: page,
  context,
}, testInfo) => {
  const diagnostics = observePage(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await gotoHydrated(page, "/news", "fr");

  for (const label of ["Pour vous", "Dernières actualités", "Mercato", "Analyses", "Interviews"]) {
    const tab = page.getByRole("tab", { name: label });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }
  await page.getByRole("tab", { name: "Dernières actualités" }).click();

  const clubFilters = page
    .locator("section")
    .filter({ hasText: "Filtrer par club" })
    .first()
    .locator("button[aria-pressed]")
    .filter({ hasNotText: /Suivre|Suivi/ });
  const clubFilterCount = await clubFilters.count();
  expect(clubFilterCount).toBeGreaterThan(1);
  for (let index = 0; index < clubFilterCount; index += 1) {
    const filter = clubFilters.nth(index);
    await filter.click();
    await expect(filter).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByRole("button", { name: "Tous", exact: true }).click();
  await page.getByRole("button", { name: "Suivre", exact: true }).first().click();
  const authDialog = page.getByRole("dialog", { name: /Compte requis/i });
  await expect(authDialog).toBeVisible();
  await authDialog.getByRole("button", { name: "Continuer à explorer" }).click();

  const save = page.getByRole("button", { name: "Enregistrer" }).first();
  await save.click();
  await expect(page.getByRole("button", { name: "Enregistré" }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await reloadHydrated(page, "fr");
  await expect(page.getByRole("button", { name: "Enregistré" }).first()).toBeVisible();

  await page
    .getByRole("link", { name: /Le Wydad relance/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/news\/[^/]+$/);
  await page.getByRole("button", { name: /Partager/i }).click();
  await expect(page.getByText(/Lien copié/i)).toBeVisible();
  await page
    .getByRole("button", { name: /Retour/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/news$/);

  await gotoHydrated(page, "/matches", "fr");
  await page.getByRole("button", { name: "Jour précédent" }).click();
  await expect(page.getByRole("button", { name: "Aujourd'hui" })).toBeVisible();
  await page.getByRole("button", { name: "Aujourd'hui" }).click();
  await page.getByRole("button", { name: "Jour suivant" }).click();
  await page.getByRole("button", { name: "Aujourd'hui" }).click();

  const inactiveDate = page
    .locator('[role="tab"][aria-current="date"]')
    .locator("xpath=preceding-sibling::button[1]");
  const inactiveDayNumber = (await inactiveDate.locator("span").last().textContent())?.trim();
  await inactiveDate.click();
  await expect(page.locator("[role='tab'][aria-current='date']").locator("span").last()).toHaveText(
    inactiveDayNumber!,
  );
  await page.getByRole("button", { name: "Aujourd'hui" }).click();

  for (const label of ["Tous", "En direct", "À venir", "Résultats"]) {
    const tab = page.getByRole("tab", { name: label, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }
  await page.getByRole("tab", { name: "En direct" }).click();
  await page.getByRole("link", { name: /Score : WAC 1, FAR 1/i }).click();
  for (const [label, key] of [
    ["Statistiques", "stats"],
    ["Momentum", "momentum"],
    ["Face à face", "h2h"],
    ["Résumé", "summary"],
  ] as const) {
    await page.getByRole("tab", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`tab=${key}`));
    await expect(page.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
  }
  await page.getByRole("button", { name: /Partager/i }).click();
  await expect(page.getByText(/Lien copié/i)).toBeVisible();
  await page.getByRole("button", { name: /Retour/i }).click();
  await expect(page).toHaveURL(/\/matches\/?$/);
  await expectHealthyDocument(page);
  await diagnostics.verify(testInfo);
});

test("home, news, and match cards plus view-all and profile edit controls navigate correctly", async ({
  authenticatedPage: page,
}, testInfo) => {
  const diagnostics = observePage(page);
  await gotoHydrated(page, "/", "fr");

  const articleHrefs = await page
    .locator('a[href^="/news/"]')
    .evaluateAll((links) =>
      [...new Set(links.map((link) => link.getAttribute("href")))].filter(Boolean),
    );
  expect(articleHrefs.length).toBeGreaterThan(0);
  for (const href of articleHrefs) {
    await gotoHydrated(page, "/", "fr");
    await page.locator(`a[href="${href}"]`).first().click();
    await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === href);
    await expect(page.getByRole("heading", { name: "Article introuvable" })).toHaveCount(0);
  }

  await gotoHydrated(page, "/news", "fr");
  const newsArticleHrefs = await page
    .locator('a[href^="/news/"]')
    .evaluateAll((links) =>
      [...new Set(links.map((link) => link.getAttribute("href")))].filter(Boolean),
    );
  expect(newsArticleHrefs.length).toBeGreaterThan(0);
  for (const href of newsArticleHrefs) {
    await gotoHydrated(page, "/news", "fr");
    await page.locator(`a[href="${href}"]`).first().click();
    await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === href);
    await expect(page.getByRole("heading", { name: "Article introuvable" })).toHaveCount(0);
  }

  await gotoHydrated(page, "/", "fr");
  const matchHrefs = await page
    .locator('a[href^="/matches/"]')
    .evaluateAll((links) =>
      [...new Set(links.map((link) => link.getAttribute("href")))].filter(Boolean),
    );
  expect(matchHrefs.length).toBeGreaterThan(0);
  for (const href of matchHrefs) {
    await gotoHydrated(page, "/", "fr");
    await page.locator(`a[href="${href}"]`).first().click();
    await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === href);
    await expect(page.getByRole("tab", { name: "Résumé" })).toBeVisible();
  }

  await gotoHydrated(page, "/matches", "fr");
  const matchDayHrefs = await page
    .locator('a[href^="/matches/"]')
    .evaluateAll((links) =>
      [...new Set(links.map((link) => link.getAttribute("href")))].filter(Boolean),
    );
  expect(matchDayHrefs.length).toBeGreaterThan(0);
  for (const href of matchDayHrefs) {
    await gotoHydrated(page, "/matches", "fr");
    await page.locator(`a[href="${href}"]`).first().click();
    await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === href);
    await expect(page.getByRole("tab", { name: "Résumé" })).toBeVisible();
  }

  for (const [index, target] of ["/matches", "/news", "/fantasy"].entries()) {
    await gotoHydrated(page, "/", "fr");
    await page.getByRole("link", { name: "Tout voir" }).nth(index).click();
    await expect(page).toHaveURL(new RegExp(`${target}/?$`));
  }

  await gotoHydrated(page, "/", "fr");
  await page.getByRole("link", { name: "Voir mon équipe" }).click();
  await expect(page).toHaveURL(/\/fantasy\/team\/?$/);

  await gotoHydrated(page, "/profile", "fr");
  const editProfile = page.getByRole("button", { name: "Modifier le profil" });
  await expect(editProfile).toHaveCount(2);
  await editProfile.first().click();
  await expect(page).toHaveURL(/\/auth\/profile-setup$/);
  await gotoHydrated(page, "/profile", "fr");
  await editProfile.last().click();
  await expect(page).toHaveURL(/\/auth\/profile-setup$/);
  await diagnostics.verify(testInfo);
});

test("guest and anonymous profile calls to action reach registration and login", async ({
  guestPage: page,
}, testInfo) => {
  const diagnostics = observePage(page);

  await gotoHydrated(page, "/profile", "fr");
  await expect(page.getByRole("heading", { name: /Vous naviguez en invité/i })).toBeVisible();
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await expect(page).toHaveURL(/\/auth\/register$/);
  await gotoHydrated(page, "/profile", "fr");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);

  await gotoHydrated(page, "/profile", "fr");
  await page.evaluate(() => {
    localStorage.removeItem("botolago.auth.session");
    localStorage.removeItem("botolago.auth.guest");
  });
  await reloadHydrated(page, "fr");
  await expect(page.getByRole("heading", { name: /Connectez-vous à BotolaGO/i })).toBeVisible();
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await expect(page).toHaveURL(/\/auth\/register$/);
  await gotoHydrated(page, "/profile", "fr");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await diagnostics.verify(testInfo);
});

test("fantasy hub quick actions navigate to every functional section", async ({
  authenticatedPage: page,
}, testInfo) => {
  const diagnostics = observePage(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("botolago.fantasy.onboarded", "1");
  });

  for (const [label, path] of [
    ["Mon équipe", "/fantasy/team"],
    ["Transferts", "/fantasy/transfers"],
    ["Points", "/fantasy/points"],
    ["Top 5", "/fantasy/top-players"],
    ["Ligues", "/fantasy/leagues"],
    ["Joueurs", "/fantasy/players"],
    ["Calendrier", "/fantasy/fixtures"],
  ] as const) {
    await gotoHydrated(page, "/fantasy", "fr");
    await page.getByRole("link", { name: label, exact: true }).last().click();
    await expect(page).toHaveURL(new RegExp(`${path}/?$`));
  }

  await diagnostics.verify(testInfo);
});

test("fantasy onboarding advances through every step and persists dismissal", async ({
  guestPage: page,
}, testInfo) => {
  const diagnostics = observePage(page);
  await page.addInitScript(() => {
    window.localStorage.removeItem("botolago.fantasy.onboarded");
  });
  await gotoHydrated(page, "/fantasy", "fr");

  const dialog = page.getByRole("dialog", { name: /Bienvenue sur Fantasy BotolaGO/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Suivant" }).click();
  await dialog.getByRole("button", { name: "Suivant" }).click();
  await dialog.getByRole("button", { name: /Commencer/i }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("botolago.fantasy.onboarded")))
    .toBe("1");
  await diagnostics.verify(testInfo);
});

test("fantasy team, transfer, points, player, ranking, fixture, rules, and league controls work in isolated local state", async ({
  authenticatedPage: page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const diagnostics = observePage(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    window.localStorage.setItem("botolago.fantasy.onboarded", "1");
  });

  await gotoHydrated(page, "/fantasy/team", "fr");
  await page.getByRole("tab", { name: "Liste" }).click();
  await expect(page.getByRole("tab", { name: "Liste" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Équipe" }).click();
  await page.getByRole("button", { name: "Modifier la composition" }).click();
  await expect(page.getByRole("button", { name: "Enregistrer" })).toBeVisible();
  await page
    .locator("button")
    .filter({ hasText: /Formation/ })
    .click();
  await page.getByRole("button", { name: "4-3-3" }).click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await reloadHydrated(page, "fr");
  await expect(page.getByRole("button", { name: /Formation: 4-3-3/ })).toBeVisible();

  await page.getByRole("button", { name: "Définir capitaine" }).click();
  await expect(page.getByRole("dialog", { name: "Définir capitaine" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Bench Boost/ }).click();
  const chipDialog = page.getByRole("alertdialog");
  await expect(chipDialog).toBeVisible();
  await chipDialog.getByRole("button", { name: "Annuler" }).click();

  await gotoHydrated(page, "/fantasy/transfers", "fr");
  await page.getByRole("button", { name: /Transferts: Anas Bach/i }).click();
  const picker = page.getByRole("dialog", { name: /Sélectionnez un remplaçant/i });
  await picker.getByPlaceholder(/Rechercher un joueur/i).fill("Munir Mohamedi");
  await picker.getByRole("button", { name: /Munir Mohamedi/i }).click();
  await page.getByRole("button", { name: "Vérifier" }).click();
  await expect(page.getByRole("heading", { name: /Résumé des transferts/i })).toBeVisible();
  await page.getByRole("button", { name: /Confirmer/i }).click();
  await expect(page.getByRole("status")).toContainText(/Transfert/i);

  await gotoHydrated(page, "/fantasy/points", "fr");
  await page.getByRole("button", { name: "Journée -1" }).click();
  await expect(page.getByRole("button", { name: "Journée +1" })).toBeEnabled();
  await page.getByRole("button", { name: "Journée +1" }).click();
  await page.getByRole("tab", { name: "Liste" }).click();
  await expect(page.getByRole("tab", { name: "Liste" })).toHaveAttribute("aria-selected", "true");

  await gotoHydrated(page, "/fantasy/players", "fr");
  const search = page.getByPlaceholder(/Rechercher un joueur/i);
  await search.fill("Ayoub El Kaabi");
  await page.getByRole("button", { name: "Ajouter à ma liste" }).click();
  await expect(page.getByRole("button", { name: "Retirer" })).toBeVisible();
  await page.getByRole("button", { name: "Comparer" }).click();
  await search.fill("");
  await page.getByRole("button", { name: "Comparer" }).nth(1).click();
  await expect(page.getByRole("heading", { name: "Comparer" })).toBeVisible();
  await reloadHydrated(page, "fr");
  await search.fill("Ayoub El Kaabi");
  await expect(page.getByRole("button", { name: "Retirer" })).toBeVisible();
  await page.getByRole("link", { name: /Ayoub El Kaabi/i }).click();
  for (const tab of ["Historique", "Calendrier", "Statistiques", "Actualités", "Aperçu"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await expect(page.getByRole("button", { name: tab, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }

  await page.evaluate(() => window.localStorage.removeItem("botolago.fantasy.watchlist"));
  await gotoHydrated(page, "/fantasy/top-players", "fr");
  await page.getByRole("button", { name: "Journée -1" }).click();
  await expect(page.getByRole("button", { name: "Journée +1" })).toBeEnabled();
  await page.getByRole("button", { name: "Ajouter à la liste" }).click();
  await expect(page.getByRole("button", { name: "Retirer" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Recruter" }).click();
  await expect(page).toHaveURL(/\/fantasy\/transfers$/);
  await gotoHydrated(page, "/fantasy/top-players", "fr");
  await page.getByRole("button", { name: "Voir le joueur" }).click();
  await expect(page).toHaveURL(/\/fantasy\/players\/[^/]+$/);
  await gotoHydrated(page, "/fantasy/top-players", "fr");
  await page.getByRole("button", { name: /#2/ }).click();
  await expect(page).toHaveURL(/\/fantasy\/players\/[^/]+$/);

  await gotoHydrated(page, "/fantasy/rankings", "fr");
  await page.getByRole("tab", { name: "Journée" }).click();
  await expect(page.getByRole("tab", { name: "Journée" })).toHaveAttribute("aria-selected", "true");
  const rankingSearch = page.getByPlaceholder("Rechercher un manager ou une équipe");
  await rankingSearch.fill("Atlas");
  await expect(page.locator("main li").first()).toBeVisible();
  await rankingSearch.fill("");
  const nextRankingsPage = page.getByRole("button", { name: "Page suivante" });
  if (await nextRankingsPage.isEnabled()) await nextRankingsPage.click();

  await gotoHydrated(page, "/fantasy/fixtures", "fr");
  await page.getByRole("button", { name: "WAC", exact: true }).click();
  await expect(page.getByRole("button", { name: "WAC", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "6 GW" }).click();
  await expect(page.getByRole("button", { name: "6 GW" })).toHaveAttribute("aria-pressed", "true");

  await gotoHydrated(page, "/fantasy/rules", "fr");
  await expectHealthyDocument(page);

  await gotoHydrated(page, "/fantasy/leagues", "fr");
  await page.getByRole("button", { name: "Publiques" }).click();
  await expect(page.getByRole("button", { name: "Publiques" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Privées" }).click();
  await page.getByPlaceholder("Entrez le code d'invitation").fill("INVALID");
  await page.getByRole("button", { name: "Rejoindre une ligue" }).click();
  await expect(page.getByRole("status")).toContainText(/invalide/i);
  const leagueName = `QA League ${Date.now().toString(36)}`;
  await page.getByPlaceholder("Nom de la ligue").fill(leagueName);
  await page.getByRole("button", { name: "Créer une ligue" }).click();
  await expect(page.getByRole("status")).toContainText(/créée/i);
  await expect(page.getByRole("button", { name: /Partager/i })).toBeVisible();
  await page.getByRole("button", { name: /Partager/i }).click();
  await expect(page.getByRole("status")).toContainText(/copié/i);

  await page.getByRole("link", { name: new RegExp(leagueName) }).click();
  await expect(page).toHaveURL(/\/fantasy\/leagues\/[^/]+$/);
  await page.getByRole("button", { name: "Partager le code" }).click();
  await expect(page.getByRole("status")).toContainText(/Code copié/i);
  await page.getByRole("button", { name: "Supprimer la ligue" }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Supprimer cette ligue ?" });
  await deleteDialog.getByRole("button", { name: "Annuler" }).click();
  await page.getByRole("button", { name: "Supprimer la ligue" }).click();
  await deleteDialog.getByRole("button", { name: "Confirmer" }).click();
  await expect(page).toHaveURL(/\/fantasy\/leagues\/?$/);
  await expect(page.getByRole("link", { name: new RegExp(leagueName) })).toHaveCount(0);

  await page.getByPlaceholder("Entrez le code d'invitation").fill("BOT-ABCDE");
  await page.getByRole("button", { name: "Rejoindre une ligue" }).click();
  await expect(page.getByRole("status")).toContainText(/rejointe/i);
  await page.getByRole("link", { name: /Ligue BOT-ABCDE/i }).click();
  await page.getByRole("button", { name: "Quitter la ligue" }).click();
  const leaveDialog = page.getByRole("alertdialog", { name: "Quitter cette ligue ?" });
  await leaveDialog.getByRole("button", { name: "Annuler" }).click();
  await page.getByRole("button", { name: "Quitter la ligue" }).click();
  await leaveDialog.getByRole("button", { name: "Confirmer" }).click();
  await expect(page).toHaveURL(/\/fantasy\/leagues\/?$/);
  await expect(page.getByRole("link", { name: /Ligue BOT-ABCDE/i })).toHaveCount(0);

  await expectHealthyDocument(page);
  await diagnostics.verify(testInfo);
});
