import { expect, test } from "@playwright/test";

// The request fixture never executes JavaScript: these are crawler-visible HTML checks.
for (const [path, contentLink] of [
  ["/matches", /href="\/matches\/[0-9a-f-]+"/],
  ["/clubs", /href="\/clubs\/[0-9a-f-]+"/],
  ["/news", /href="\/news\/[^"?]+"/],
] as const) {
  test(`${path} exposes content and canonical before hydration`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    expect(visible).toMatch(/<h1[\s>]/);
    expect(visible).toMatch(contentLink);
    expect(visible).toContain(`href="https://botolago.com${path}"`);
    expect(visible).not.toMatch(/name="robots"[^>]*content="[^"]*noindex/);
  });
}
