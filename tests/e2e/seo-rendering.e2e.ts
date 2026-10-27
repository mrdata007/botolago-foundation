import { expect, test } from "@playwright/test";

// The request fixture never executes JavaScript: these are crawler-visible HTML checks.
for (const [path, contentLink] of [
  ["/matches", /href="\/matches\/[0-9a-f-]+"/],
  // A club page is addressed by its readable slug (`/clubs/rsb-berkane`), or by
  // its id where it has none (`@/lib/club-slug`).
  ["/clubs", /href="\/clubs\/[a-z0-9-]+"/],
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

// /sitemap.xml is a sitemap index (`@/lib/sitemap`); the public pages are in
// its static file. /fantasy/players and /fantasy/fixtures are left out on
// purpose: Search Console reported them as duplicates (SEO pass 1).
test("the sitemap exposes every public Fantasy discovery page", async ({ request }) => {
  const index = await request.get("/sitemap.xml");
  expect(index.status()).toBe(200);
  expect(await index.text()).toContain("<loc>https://botolago.com/sitemaps/static.xml</loc>");

  const response = await request.get("/sitemaps/static.xml");
  expect(response.status()).toBe(200);
  const xml = await response.text();
  for (const path of ["top-players", "rankings", "help"] as const) {
    expect(xml).toContain(`<loc>https://botolago.com/fantasy/${path}</loc>`);
  }
  for (const path of ["players", "fixtures"] as const) {
    expect(xml).not.toContain(`<loc>https://botolago.com/fantasy/${path}</loc>`);
  }
});

test("the Fantasy rules answer is useful before hydration", async ({ request }) => {
  const response = await request.get("/fantasy/rules");
  expect(response.status()).toBe(200);
  const html = await response.text();
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

  expect(visible).toContain(
    "Choisissez 15 joueurs de Botola Pro avec un budget de jeu de 100 millions.",
  );
  expect(visible).toContain(
    "Chaque transfert supplémentaire déduit 4 points du total de la journée.",
  );
  expect(visible).toContain('rel="canonical" href="https://botolago.com/fantasy/rules"');
});
