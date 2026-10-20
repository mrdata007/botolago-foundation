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

// The public tables must contain records, not just a title and a loading shell.
for (const [path, record] of [
  ["/fantasy/players", /href="\/fantasy\/players\/[^"?]+"/],
  ["/fantasy/top-players", /El Kaabi/],
  ["/fantasy/fixtures", /data-fdr-fixture=/],
  ["/fantasy/rankings", /<tbody[\s\S]*?<tr/],
  ["/pepites/classement", /data-testid="pepites-ranking-row"/],
] as const) {
  test(`${path} includes public records without JavaScript`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const visible = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    expect(visible).toMatch(record);
  });
}

test("a club's fixtures and selected squad are present before hydration", async ({ request }) => {
  const directory = await (await request.get("/clubs")).text();
  const path = directory.match(/href="(\/clubs\/[0-9a-f-]+)"/)?.[1];
  expect(path).toBeTruthy();
  const response = await request.get(path!);
  expect(response.status()).toBe(200);
  const visible = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  expect(visible).toMatch(/href="\/matches\/[0-9a-f-]+"/);
  const squad = await request.get(`${path}?tab=squad`);
  expect(squad.status()).toBe(200);
  const squadHtml = (await squad.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  expect(squadHtml).toContain("<li");
  expect(squadHtml).not.toContain("Chargement…");
});

test("an unknown Fantasy player returns an actual 404", async ({ request }) => {
  expect(
    (await request.get("/fantasy/players/00000000-0000-4000-8000-000000000000")).status(),
  ).toBe(404);
});

test("help answers work with JavaScript disabled", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}/fantasy/help`);
    await expect(page.locator("details")).toHaveCount(10);
    const first = page.locator("details").first();
    await first.locator("summary").click();
    await expect(first).toHaveAttribute("open", "");
    await expect(first.locator("div")).toBeVisible();
    await page.locator("details").nth(1).locator("summary").click();
    await expect(page.locator("details[open]")).toHaveCount(1);
  } finally {
    await context.close();
  }
});
