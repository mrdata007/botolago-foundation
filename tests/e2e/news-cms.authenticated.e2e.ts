import { expect, test, type Browser, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { deflateSync } from "node:zlib";
import { gotoHydrated, initializeLanguage } from "./support";

/**
 * News CMS, driven as real users (activation, 2026-09-22).
 *
 * Needs a backend with the News migrations and both News Edge Functions, and
 * three accounts on it -- never production:
 *
 *   E2E_NEWS_EDITOR_EMAIL / _PASSWORD / _TOTP_SECRET     Admin role `editor`
 *   E2E_NEWS_PUBLISHER_EMAIL / _PASSWORD / _TOTP_SECRET  Admin role `publisher`
 *   E2E_NEWS_READER_EMAIL / _PASSWORD                    no staff role
 *
 * E2E_BASE_URL is the app as shipped (News hidden). E2E_NEWS_PUBLIC_BASE_URL,
 * when set, is the same commit built with NEWS_ENABLED = true, used only to
 * read the public pages; without it the public half is skipped.
 *
 * Everything it writes is QA-marked ("QA —" titles, `qa-e2e-` slugs) and ends
 * unpublished, except where a step says otherwise.
 */

const editor = credentials("EDITOR");
const publisher = credentials("PUBLISHER");
const reader = credentials("READER");
const publicBase = process.env.E2E_NEWS_PUBLIC_BASE_URL;
const run = Date.now().toString(36);
/** Contexts made with `browser.newContext` do not inherit `use` from the config. */
const contextDefaults = { ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS === "1" };
const evidence: string[] = [];
const note = (line: string) => {
  evidence.push(`${new Date().toISOString()} ${line}`);
  console.log(`[news-cms] ${line}`);
};

test.skip(!editor || !publisher || !reader, "News CMS QA accounts are not configured.");
test.describe.configure({ mode: "serial", timeout: 420_000 });

function credentials(role: "EDITOR" | "PUBLISHER" | "READER") {
  const email = process.env[`E2E_NEWS_${role}_EMAIL`];
  const password = process.env[`E2E_NEWS_${role}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password, totpSecret: process.env[`E2E_NEWS_${role}_TOTP_SECRET`] };
}

function base32(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value >= 0) bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

/** A purpose-made QA image: a flat two-band PNG, no third-party content. */
function qaPng(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const colour = y < height / 2 ? [10, 37, 64] : [15, 118, 110];
    for (let x = 0; x < width; x++) rows.set(colour, y * (width * 3 + 1) + 1 + x * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function signIn(
  browser: Browser,
  account: NonNullable<ReturnType<typeof credentials>>,
  viewport = { width: 1280, height: 900 },
): Promise<Page> {
  const context = await browser.newContext({ ...contextDefaults, viewport });
  context.setDefaultTimeout(30_000);
  const page = await context.newPage();
  await initializeLanguage(page, "fr");
  // Filling before hydration is silently undone when React takes over.
  await gotoHydrated(page, "/auth/login", "fr");
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[autocomplete="current-password"]').fill(account.password);
  await page.locator('form button[type="submit"]').click();
  if (account.totpSecret) {
    await page.waitForURL(/\/auth\/mfa-challenge/);
    await expect(page.locator("#mfa-challenge-code")).toBeEnabled();
    await page.locator("#mfa-challenge-code").fill(totp(account.totpSecret));
    await page.locator('form button[type="submit"]').click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/"));
  return page;
}

const BODY_FR = [
  "QA — texte de test rédigé pour vérifier le CMS. Il ne contient aucune information réelle.",
  "",
  "## Première partie",
  "",
  "Un paragraphe avec du **gras** et de l’*italique*, et un lien vers [le calendrier](/matches).",
  "",
  "- premier point de test",
  "- second point de test",
  "",
  "> Citation de test, sans auteur réel.",
  "",
  "## Deuxième partie",
  "",
  "Un lien externe de test vers [le site de la FRMF](https://www.frmf.ma/).",
].join("\n");

const BODY_AR = [
  "نص اختبار لضمان الجودة، كُتب للتحقق من نظام التحرير ولا يتضمن أي معلومة حقيقية.",
  "",
  "## الجزء الأول",
  "",
  "فقرة فيها نص **عريض** واسم لاتيني مثل BotolaGO ورقم 2026.",
  "",
  "- النقطة الأولى",
  "- النقطة الثانية",
].join("\n");

let frId = "";
let arId = "";
let scheduledId = "";

test("an ordinary signed-in account is refused the CMS", async ({ browser }) => {
  const page = await signIn(browser, reader!);
  await page.goto("/admin/news");
  await expect(page.getByTestId("admin-news-create")).toHaveCount(0);
  note(`reader on /admin/news: no CMS controls (url ${new URL(page.url()).pathname})`);
  await page.context().close();
});

test("editor writes a French article with structure, links, cover and body image", async ({
  browser,
}) => {
  const page = await signIn(browser, editor!);
  await page.goto("/admin/news");
  await page.getByTestId("admin-news-create").click();
  await page.getByTestId("admin-news-new-form").waitFor();
  await page.getByLabel("Identifiant (slug)", { exact: true }).fill(`qa-e2e-fr-${run}`);
  await page.getByLabel("Titre", { exact: true }).fill("QA — Article de test du CMS");
  await page
    .getByLabel("Résumé", { exact: true })
    .fill("QA — résumé de test pour vérifier la chaîne éditoriale.");
  await page.getByLabel("Contenu (Markdown simplifié)", { exact: true }).fill(BODY_FR);
  await page.locator('form[data-testid="admin-news-new-form"] button[type="submit"]').click();
  await page.waitForURL(/\/admin\/news\/[0-9a-f-]{36}$/);
  frId = page.url().split("/").pop()!;
  note(`draft created ${frId}`);

  await page.getByLabel("Sous-titre", { exact: true }).fill("QA — sous-titre de test");
  await page.getByLabel("Titre SEO", { exact: true }).fill("QA — Titre SEO de test");
  await page
    .getByLabel("Description SEO", { exact: true })
    .fill("QA — description SEO de test pour le CMS.");

  // Cover: alt / caption / credit first, then the file.
  await page.getByTestId("admin-news-hero-alt").fill("Image de test aux couleurs BotolaGO");
  await page.getByTestId("admin-news-hero-caption").fill("Visuel de test créé pour la QA.");
  await page.getByTestId("admin-news-hero-credit").fill("BotolaGO (QA)");
  await page.getByTestId("admin-news-hero-input").setInputFiles({
    name: "qa-cover.png",
    mimeType: "image/png",
    buffer: qaPng(1200, 750),
  });
  await expect(page.getByTestId("admin-news-hero-preview")).toBeVisible();
  await expect(page.getByTestId("admin-news-hero-preview")).toContainText("BotolaGO (QA)");

  // Body image at the end of the body.
  await page.getByTestId("admin-news-body").click();
  await page.keyboard.press("Control+End");
  page.once("dialog", (dialog) => void dialog.accept("Deuxième visuel de test"));
  await page.getByTestId("admin-news-body-image-input").setInputFiles({
    name: "qa-body.png",
    mimeType: "image/png",
    buffer: qaPng(800, 500),
  });
  await expect(page.getByTestId("admin-news-body")).toHaveValue(/!\[Deuxième visuel de test\]\(/);

  await page.getByTestId("admin-news-save").click();
  await expect(page.getByText("Enregistré.")).toBeVisible();
  note("saved title, subtitle, summary, body, SEO, cover (alt/caption/credit), body image");

  // Preview renders the structure.
  await page.getByTestId("admin-news-preview-toggle").click();
  const preview = page.getByTestId("admin-news-preview");
  await expect(preview.locator("h2")).toHaveCount(2);
  await expect(preview.locator("strong")).toHaveText("gras");
  await expect(preview.locator("em")).toHaveText("italique");
  await expect(preview.locator("ul li")).toHaveCount(2);
  await expect(preview.locator("blockquote")).toHaveCount(1);
  await expect(preview.locator('a[href="/matches"]')).toHaveCount(1);
  await expect(preview.locator('a[href="https://www.frmf.ma/"]')).toHaveAttribute(
    "rel",
    "nofollow noopener noreferrer",
  );
  await expect(preview.locator("figure img")).toHaveCount(1);

  // Close and reopen: everything persisted.
  await page.reload();
  await expect(page.getByLabel("Titre", { exact: true })).toHaveValue(
    "QA — Article de test du CMS",
  );
  await expect(page.getByLabel("Sous-titre", { exact: true })).toHaveValue(
    "QA — sous-titre de test",
  );
  await expect(page.getByTestId("admin-news-body")).toHaveValue(/## Deuxième partie/);
  await expect(page.getByLabel("Titre SEO", { exact: true })).toHaveValue("QA — Titre SEO de test");
  await expect(page.getByTestId("admin-news-hero-preview")).toContainText(
    "Visuel de test créé pour la QA.",
  );
  note("reload: all fields and the cover came back from the server");
  await page.context().close();
});

test("unsaved changes are protected on in-app navigation", async ({ browser }) => {
  const page = await signIn(browser, editor!);
  await page.goto(`/admin/news/${frId}`);
  await page.getByLabel("Sous-titre", { exact: true }).fill("QA — modification non enregistrée");
  let asked = "";
  page.once("dialog", (dialog) => {
    asked = dialog.message();
    void dialog.dismiss();
  });
  await page.getByTestId("admin-news-back-to-list").click();
  await expect.poll(() => asked).toContain("non enregistrées");
  await expect(page).toHaveURL(new RegExp(`/admin/news/${frId}$`));
  await expect(page.getByLabel("Sous-titre", { exact: true })).toHaveValue(
    "QA — modification non enregistrée",
  );
  note(`in-app navigation with unsaved text asked: "${asked}" -> stayed, text intact`);

  // Accepting leaves.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("admin-news-back-to-list").click();
  await expect(page).toHaveURL(/\/admin\/news$/);
  await page.context().close();
});

test("revision A -> B -> restore A -> save keeps every version", async ({ browser }) => {
  const page = await signIn(browser, editor!);
  await page.goto(`/admin/news/${frId}`);
  const summary = page.getByLabel("Résumé", { exact: true });
  const versionA = await summary.inputValue();
  await summary.fill("QA — version B du résumé, écrite pour tester la restauration.");
  await page.getByTestId("admin-news-save").click();
  await expect(page.getByText("Enregistré.")).toBeVisible();
  await page.reload();
  // Count restore buttons (one per snapshot) once the list has loaded.
  const revisions = page.locator('[data-testid^="admin-news-revision-restore-"]');
  await expect.poll(() => revisions.count()).toBeGreaterThan(0);
  const before = await revisions.count();
  // The newest snapshot holding version A differs from the form in the summary.
  const restoreA = page
    .locator('[data-testid^="admin-news-revision-restore-"]:not([disabled])')
    .first();
  await restoreA.click();
  await expect(summary).toHaveValue(versionA);
  await page.getByTestId("admin-news-save").click();
  await expect(page.getByText("Enregistré.")).toBeVisible();
  await page.reload();
  await expect(summary).toHaveValue(versionA);
  await expect.poll(() => revisions.count()).toBe(before + 1);
  const after = await revisions.count();
  expect(after).toBe(before + 1);
  note(`restore: revisions ${before} -> ${after}; version B is itself kept as a revision`);
  await page.context().close();
});

test("editor sends to review but cannot publish; publisher publishes", async ({ browser }) => {
  const page = await signIn(browser, editor!);
  await page.goto(`/admin/news/${frId}`);
  await page.getByTestId("admin-news-transition-in_review").click();
  await expect(page.locator('[data-status="in_review"]')).toBeVisible();
  await page.getByTestId("admin-news-transition-published").click();
  await expect(page.getByText(/news_editorial_forbidden|editorial_forbidden/)).toBeVisible();
  note("editor: in_review ok; publish refused by the server");
  await page.context().close();

  const pub = await signIn(browser, publisher!);
  await pub.goto(`/admin/news/${frId}`);
  await pub.getByTestId("admin-news-transition-published").click();
  await expect(pub.locator('[data-status="published"]')).toBeVisible();
  note(`publisher published ${frId}`);
  await pub.context().close();
});

test("Arabic edition, linked to the French one, typed right-to-left", async ({ browser }) => {
  const page = await signIn(browser, editor!);
  await page.goto(`/admin/news/${frId}`);
  await page.getByTestId("admin-news-create-translation").click();
  await expect(page.getByTestId("admin-news-new-language")).toBeDisabled();
  await expect(page.getByTestId("admin-news-new-language")).toHaveValue("ar");
  await page.getByLabel("Identifiant (slug)", { exact: true }).fill(`qa-e2e-ar-${run}`);
  const title = page.getByLabel("Titre", { exact: true });
  await title.fill("اختبار الجودة — مقال تجريبي لنظام التحرير");
  await expect(title).toHaveAttribute("dir", "rtl");
  await page
    .getByLabel("Résumé", { exact: true })
    .fill("ملخص تجريبي للتحقق من سلسلة التحرير باللغة العربية.");
  await page.getByLabel("Contenu (Markdown simplifié)", { exact: true }).fill(BODY_AR);
  await page.locator('form[data-testid="admin-news-new-form"] button[type="submit"]').click();
  await page.waitForURL(/\/admin\/news\/[0-9a-f-]{36}$/);
  arId = page.url().split("/").pop()!;
  await expect(page.getByTestId("admin-news-body")).toHaveAttribute("dir", "rtl");
  await page.getByTestId("admin-news-preview-toggle").click();
  await expect(page.getByTestId("admin-news-preview").locator("[dir=rtl]")).toBeVisible();
  await expect(page.getByTestId("admin-news-open-translation")).toBeVisible();
  await page.getByTestId("admin-news-transition-in_review").click();
  await expect(page.locator('[data-status="in_review"]')).toBeVisible();
  note(`Arabic draft ${arId} linked to ${frId}; fields and preview RTL`);
  await page.context().close();
});

test("public French article before the Arabic one is published", async ({ browser }) => {
  test.skip(!publicBase, "E2E_NEWS_PUBLIC_BASE_URL not set");
  const context = await browser.newContext({
    ...contextDefaults,
    baseURL: publicBase,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await initializeLanguage(page, "fr");
  await page.goto(`/news/${frId}`);
  await expect(page.locator("article h1")).toHaveText("QA — Article de test du CMS");
  // hreflang is absent while the Arabic edition is private.
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
  await expect(page.getByTestId("article-translation-link")).toHaveCount(0);
  note("public FR article: no hreflang / no language link while AR is private");
  await context.close();
});

test("publisher publishes the Arabic edition; public pages, SEO and layout", async ({
  browser,
}) => {
  const pub = await signIn(browser, publisher!);
  await pub.goto(`/admin/news/${arId}`);
  await pub.getByTestId("admin-news-transition-published").click();
  await expect(pub.locator('[data-status="published"]')).toBeVisible();
  await pub.context().close();
  test.skip(!publicBase, "E2E_NEWS_PUBLIC_BASE_URL not set");

  for (const viewport of [
    { name: "mobile-390", width: 390, height: 844 },
    { name: "desktop-1280", width: 1280, height: 900 },
  ]) {
    const context = await browser.newContext({ ...contextDefaults, baseURL: publicBase, viewport });
    const page = await context.newPage();
    await initializeLanguage(page, "fr");
    const response = await page.goto(`/news/${frId}`);
    expect(response?.status()).toBe(200);
    const article = page.locator("article");
    await expect(article.locator("h2")).toHaveCount(2);
    await expect(article.locator('a[href="https://www.frmf.ma/"]')).toHaveAttribute(
      "target",
      "_blank",
    );
    await expect(article.locator('a[href="/matches"]')).not.toHaveAttribute("rel", /.+/);
    await expect(article.locator("figure img")).toHaveCount(1);
    await expect(page.locator("figcaption").first()).toContainText(
      "Visuel de test créé pour la QA.",
    );
    await expect(page.locator("figcaption").first()).toContainText("BotolaGO (QA)");
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("body *")].some(
        (el) => el.getBoundingClientRect().right > window.innerWidth + 1,
      ),
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: `test-results/news-cms/fr-${viewport.name}.png`,
      fullPage: true,
    });

    const arResponse = await page.goto(`/news/${arId}`);
    expect(arResponse?.status()).toBe(200);
    await expect(page.locator("article")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("article")).toHaveAttribute("lang", "ar");
    await expect(page.getByTestId("article-translation-link")).toHaveAttribute("hreflang", "fr");
    await page.screenshot({
      path: `test-results/news-cms/ar-${viewport.name}.png`,
      fullPage: true,
    });
    note(`public ${viewport.name}: FR + AR rendered, no horizontal overflow`);
    await context.close();
  }
});

test("rendered SEO head (server HTML), sitemap and robots", async ({ request }) => {
  test.skip(!publicBase, "E2E_NEWS_PUBLIC_BASE_URL not set");
  const html = await (await request.get(`${publicBase}/news/${frId}`)).text();
  // HTML attribute names are case-insensitive (the router writes `hrefLang`),
  // so compare case-insensitively.
  const has = (needle: string | RegExp) =>
    typeof needle === "string"
      ? html.toLowerCase().includes(needle.toLowerCase())
      : needle.test(html);
  for (const needle of [
    "<title>QA — Titre SEO de test — BotolaGO</title>",
    'name="description" content="QA — description SEO de test pour le CMS."',
    `rel="canonical" href="https://botolago.com/news/${frId}"`,
    'property="og:title" content="QA — Titre SEO de test"',
    'property="og:locale" content="fr_FR"',
    'property="og:locale:alternate" content="ar_MA"',
    `hreflang="ar" href="https://botolago.com/news/${arId}"`,
    `hreflang="x-default" href="https://botolago.com/news/${frId}"`,
    '"@type":"NewsArticle"',
    'property="article:published_time"',
  ]) {
    expect(`${needle}: ${has(needle)}`).toBe(`${needle}: true`);
  }
  expect(has(/property="og:image" content="https?:\/\/[^"]+news-media\/news\/[^"]+\.png"/)).toBe(
    true,
  );
  expect(has('name="robots" content="noindex')).toBe(false);

  const sitemap = await (await request.get(`${publicBase}/sitemap.xml`)).text();
  expect(sitemap).toContain(`<loc>https://botolago.com/news/${frId}</loc>`);
  expect(sitemap).toContain(`hreflang="ar" href="https://botolago.com/news/${arId}"`);
  const robots = await (await request.get(`${publicBase}/robots.txt`)).text();
  expect(robots).toContain("Disallow: /admin");
  note(
    "server HTML: title, description, canonical, OG, locale, hreflang, JSON-LD; sitemap lists both",
  );
});

test("scheduling through the UI publishes on time without anyone opening the CMS", async ({
  browser,
}) => {
  const page = await signIn(browser, editor!);
  await page.goto("/admin/news/new");
  await page.getByLabel("Identifiant (slug)", { exact: true }).fill(`qa-e2e-sched-${run}`);
  await page.getByLabel("Titre", { exact: true }).fill("QA — Article programmé de test");
  await page
    .getByLabel("Résumé", { exact: true })
    .fill("QA — résumé de l’article programmé de test.");
  await page
    .getByLabel("Contenu (Markdown simplifié)", { exact: true })
    .fill("QA — corps de l’article programmé.");
  await page.locator('form[data-testid="admin-news-new-form"] button[type="submit"]').click();
  await page.waitForURL(/\/admin\/news\/[0-9a-f-]{36}$/);
  scheduledId = page.url().split("/").pop()!;
  await page.getByTestId("admin-news-transition-in_review").click();
  await expect(page.locator('[data-status="in_review"]')).toBeVisible();
  await page.context().close();

  const pub = await signIn(browser, publisher!);
  await pub.goto(`/admin/news/${scheduledId}`);
  // Two whole minutes ahead, in the browser's local time.
  const target = new Date(Math.ceil((Date.now() + 120_000) / 60_000) * 60_000);
  const local = new Date(target.getTime() - target.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
  await pub.getByTestId("admin-news-scheduled-at").fill(local);
  await pub.getByTestId("admin-news-transition-scheduled").click();
  await expect(pub.locator('[data-status="scheduled"]')).toBeVisible();
  await expect(pub.getByTestId("admin-news-scheduled-for")).toContainText(
    `${target.toISOString().slice(0, 16).replace("T", " ")} UTC`,
  );
  note(`scheduled ${scheduledId} for ${target.toISOString()} (browser local ${local})`);
  await pub.context().close();

  if (!publicBase) return;
  const reader = await browser.newContext({ ...contextDefaults, baseURL: publicBase });
  const page2 = await reader.newPage();
  await initializeLanguage(page2, "fr");
  await page2.goto(`/news/${scheduledId}`);
  await expect(page2.locator("article h1")).toHaveCount(0);
  note(`before ${target.toISOString()}: public URL shows no article`);
  let publishedSeenAt: Date | null = null;
  const deadline = target.getTime() + 150_000;
  while (Date.now() < deadline) {
    await page2.goto(`/news/${scheduledId}`);
    if ((await page2.locator("article h1").count()) > 0) {
      publishedSeenAt = new Date();
      break;
    }
    await page2.waitForTimeout(10_000);
  }
  expect(publishedSeenAt).not.toBeNull();
  note(
    `publicly readable at ${publishedSeenAt!.toISOString()} (${Math.round((publishedSeenAt!.getTime() - target.getTime()) / 1000)} s after the scheduled time)`,
  );
  await reader.close();
});

test("unpublishing removes the article from the public page and the sitemap", async ({
  browser,
  request,
}) => {
  const pub = await signIn(browser, publisher!);
  for (const id of [frId, arId, scheduledId]) {
    await pub.goto(`/admin/news/${id}`);
    await pub.getByTestId("admin-news-transition-unpublished").click();
    await expect(pub.locator('[data-status="unpublished"]')).toBeVisible();
  }
  await pub.context().close();
  note("all QA articles unpublished");
  if (!publicBase) return;
  const html = await (await request.get(`${publicBase}/news/${frId}`)).text();
  expect(html).toContain('name="robots" content="noindex"');
  const sitemap = await (await request.get(`${publicBase}/sitemap.xml`)).text();
  expect(sitemap).not.toContain(frId);
  expect(sitemap).not.toContain(arId);
  note("public page now noindex/not found; sitemap no longer lists them");
});

test.afterAll(() => {
  if (evidence.length) console.log(`\n[news-cms] evidence\n${evidence.join("\n")}`);
});
