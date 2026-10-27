import { describe, expect, test } from "bun:test";
import { inspectHtml } from "./audit-site";

describe("SEO site audit", () => {
  test("inspects body copy without counting metadata or scripts as page content", () => {
    const row = inspectHtml(
      "https://botolago.com/clubs/raja",
      200,
      "",
      `<!doctype html>
        <html lang="fr">
          <head>
            <title>Raja Casablanca : matchs, classement et actualites</title>
            <meta name="description" content="Suivez le Raja Casablanca, ses matchs, son classement et ses actualites sur BotolaGO.">
            <link rel="canonical" href="https://botolago.com/clubs/raja">
            <meta property="og:image" content="https://botolago.com/og-image.jpg">
            <script type="application/ld+json">{"@type":"SportsTeam"}</script>
          </head>
          <body><main><h1>Raja Casablanca</h1><p>Club marocain.</p></main></body>
        </html>`,
      42,
    );

    expect(row.wordCount).toBe(4);
    expect(row.h1Count).toBe(1);
    expect(row.ogImage).toBe("https://botolago.com/og-image.jpg");
    expect(row.issues).not.toContain("missing_og_image");
    expect(row.issues).not.toContain("missing_h1");
    expect(row.jsonLdTypes).toBe("SportsTeam");
    expect(row.issues).toContain("thin_raw_html");
  });

  test("flags a page with no h1", () => {
    const row = inspectHtml(
      "https://botolago.com/x",
      200,
      "",
      "<html><body><p>a</p></body></html>",
      1,
    );
    expect(row.issues).toContain("missing_h1");
  });

  test("reports the high-impact indexability issues", () => {
    const row = inspectHtml(
      "https://botolago.com/news/example",
      200,
      "",
      '<html><head><meta name="robots" content="noindex"></head><body><h1>A</h1><h1>B</h1></body></html>',
      10,
    );

    expect(row.issues).toEqual(
      expect.arrayContaining([
        "missing_title",
        "missing_description",
        "multiple_h1",
        "missing_canonical",
        "missing_og_image",
        "noindex",
      ]),
    );
  });
});
