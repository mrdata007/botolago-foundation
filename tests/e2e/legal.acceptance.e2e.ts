import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow, initializeLanguage, observePage } from "./support";

const expectations = {
  fr: {
    terms: "Conditions d'utilisation",
    privacy: "Politique de confidentialité",
    placeholder: "BROUILLON JURIDIQUE",
  },
  ar: {
    terms: "شروط الاستخدام",
    privacy: "سياسة الخصوصية",
    placeholder: "مسودة قانونية",
  },
} as const;

for (const language of ["fr", "ar"] as const) {
  test(`${language}: legal pages expose every required placeholder and are linked from registration`, async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await initializeLanguage(page, language);

    for (const [path, title] of [
      ["/terms", expectations[language].terms],
      ["/privacy", expectations[language].privacy],
    ] as const) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByTestId("legal-placeholder-banner")).toContainText(
        expectations[language].placeholder,
      );
      for (const testId of [
        "legal-effective-date",
        "legal-entity",
        "legal-contact",
        "legal-minimum-age",
        "legal-governing-law",
      ]) {
        await expect(page.getByTestId(testId)).toContainText(/\[.+\]/);
      }
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.locator("html")).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
      await expectNoHorizontalOverflow(page);
    }

    await page.goto("/auth/register", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("link", { name: expectations[language].terms }).first(),
    ).toHaveAttribute("href", "/terms");
    await expect(
      page.getByRole("link", { name: expectations[language].privacy }).first(),
    ).toHaveAttribute("href", "/privacy");

    await diagnostics.verify(testInfo);
  });
}
