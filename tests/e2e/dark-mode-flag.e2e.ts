import { test, expect } from "@playwright/test";

// DARK_MODE_ENABLED is false, so nothing about the product may change. The
// case that matters is not "the toggle is hidden" -- it is that the default
// choice is "system", so a visitor whose OS prefers dark would have been served
// dark mode with no way back. Both halves are asserted here.

test.use({ colorScheme: "dark" });

for (const path of ["/", "/profile", "/fantasy"] as const) {
  test(`${path} stays light on a dark-preferring OS`, async ({ page }) => {
    // Also seed a stored preference, as a browser that used a preview build would carry.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("botolago.theme", "dark");
      } catch {
        /* private mode */
      }
    });
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    const html = await page.content();
    expect(html).not.toContain("botolago.theme");
  });
}

test("profile exposes no theme control", async ({ page }) => {
  await page.goto("/profile", { waitUntil: "networkidle" });
  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const label of ["thème", "sombre", "clair", "système"]) {
    expect(body, `theme control label "${label}" is visible`).not.toContain(label);
  }
});
