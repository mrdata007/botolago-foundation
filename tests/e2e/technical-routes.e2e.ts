import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow, initializeLanguage, observePage } from "./support";

const disabledMcpRoutes = [
  { method: "GET", path: "/mcp" },
  { method: "GET", path: "/.mcp/list-tools" },
  { method: "POST", path: "/.mcp/invoke-tool/get-profile" },
  { method: "GET", path: "/.well-known/oauth-protected-resource" },
] as const;

test("demo MCP HTTP surfaces fail closed with the same non-cacheable contract", async ({
  request,
}) => {
  for (const route of disabledMcpRoutes) {
    const response = await request.fetch(route.path, {
      method: route.method,
      data: route.method === "POST" ? { arguments: {} } : undefined,
      failOnStatusCode: false,
    });
    expect(response.status(), `${route.method} ${route.path}`).toBe(404);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.json()).toEqual({ error: "not_available_in_demo" });
  }
});

for (const language of ["fr", "ar"] as const) {
  test(`${language}: OAuth consent route fails closed without losing mobile direction`, async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await initializeLanguage(page, language);

    await page.goto("/.lovable/oauth/consent?authorization_id=e2e-placeholder", {
      waitUntil: "networkidle",
    });

    // Demo builds intentionally disable the OAuth/MCP surface and redirect home.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await expect(page.locator("html")).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
    await expect(page.locator("body")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await diagnostics.verify(testInfo);
  });
}
