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

for (const path of ["/terms", "/privacy", "/prizes", "/prizes/terms"] as const) {
  test(`${path} exposes one H1 and a self-canonical before hydration`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

    expect(visible.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(visible).toContain(`rel="canonical" href="https://botolago.com${path}"`);
    expect(visible).not.toMatch(/name="robots"[^>]*content="[^"]*noindex/);
  });
}

test("the sitemap exposes every public Fantasy discovery page", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const xml = await response.text();

  for (const path of ["players", "top-players", "fixtures", "rankings", "help"] as const) {
    expect(xml).toContain(`<loc>https://botolago.com/fantasy/${path}</loc>`);
  }
});

test("the Fantasy rules answer is useful before hydration", async ({ request }) => {
  const response = await request.get("/fantasy/rules");
  expect(response.status()).toBe(200);
  const html = await response.text();
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

  expect(visible).toContain("BotolaGO Fantasy se joue avec 15 joueurs");
  expect(visible).toContain("Chaque transfert supplémentaire coûte 4 points.");
  expect(visible).toContain('rel="canonical" href="https://botolago.com/fantasy/rules"');
});
