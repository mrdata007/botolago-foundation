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
            <script type="application/ld+json">{"@type":"SportsTeam"}</script>
          </head>
          <body><main><h1>Raja Casablanca</h1><p>Club marocain.</p></main></body>
        </html>`,
      42,
    );

    expect(row.wordCount).toBe(4);
    expect(row.h1Count).toBe(1);
    expect(row.jsonLdTypes).toBe("SportsTeam");
    expect(row.issues).toContain("thin_raw_html");
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
        "noindex",
      ]),
    );
  });
});
