import { expect, test } from "@playwright/test";
import { initializeLanguage, observePage } from "./support";

const disabledCloudHosts = ["supabase.co", "sportmonks.com", "demo.invalid"];

test("hosted demo is explicit, local-only, and blocks cloud-only surfaces", async ({
  page,
  request,
}, testInfo) => {
  const diagnostics = observePage(page);
  const unexpectedCloudRequests: string[] = [];

  page.on("request", (outgoing) => {
    try {
      const hostname = new URL(outgoing.url()).hostname.toLowerCase();
      if (disabledCloudHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
        unexpectedCloudRequests.push(outgoing.url());
      }
    } catch {
      // Non-URL requests are irrelevant to the network-isolation assertion.
    }
  });

  await initializeLanguage(page, "fr");
  for (const route of ["/", "/matches", "/fantasy/rankings", "/auth/login"] as const) {
    await page.goto(route, { waitUntil: "networkidle" });
    const notice = page.getByTestId("demo-data-notice");
    await expect(notice).toBeVisible();
    await expect(notice).not.toHaveAttribute("aria-hidden");
  }

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await page.goto("/matches", { waitUntil: "networkidle" });
  await expect(page.getByText("Simulation", { exact: true }).first()).toBeVisible();

  await page.goto("/fantasy/rankings", { waitUntil: "networkidle" });
  await expect(
    page.getByText("Classement de démonstration — managers fictifs.", { exact: true }),
  ).toBeVisible();

  await page.goto("/admin", { waitUntil: "networkidle" });
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");

  await page.goto("/.lovable/oauth/consent?authorization_id=demo", {
    waitUntil: "networkidle",
  });
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");

  for (const endpoint of [
    "/mcp",
    "/.well-known/oauth-protected-resource",
    "/.mcp/list-tools",
    "/.mcp/invoke-tool/get_profile",
  ]) {
    const response = await request.fetch(endpoint, { method: "POST", data: {} });
    expect(response.status(), endpoint).toBe(404);
  }

  expect(unexpectedCloudRequests).toEqual([]);
  await diagnostics.verify(testInfo);
});
