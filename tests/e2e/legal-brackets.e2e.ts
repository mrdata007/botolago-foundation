import { test, expect } from "@playwright/test";

// A bracketed blank is only a defect if a reader can see it, so this reads the
// rendered text of the live pages rather than the source module.
for (const lang of ["fr", "ar"] as const) {
  for (const path of ["/terms", "/privacy"] as const) {
    test(`${path} ${lang} renders no bracketed blank`, async ({ page }) => {
      await page.addInitScript((l) => {
        try {
          localStorage.setItem("botolago.language", l);
        } catch {
          /* private mode */
        }
      }, lang);
      await page.goto(path, { waitUntil: "networkidle" });
      const body = (await page.locator("body").innerText()).trim();
      expect(body.length).toBeGreaterThan(500);
      const brackets = [...body.matchAll(/\[([^\]\n]{2,80})\]/g)].map((m) => m[0]);
      expect(brackets, `visible brackets on ${path} (${lang})`).toEqual([]);
      expect(await page.getAttribute("html", "dir")).toBe(lang === "ar" ? "rtl" : "ltr");
      expect(body).not.toContain("botolago.ma");
      expect(body).toContain("contact@botolago.com");
    });
  }
}
