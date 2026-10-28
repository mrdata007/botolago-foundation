import type { APIRequestContext } from "@playwright/test";

/**
 * Every URL list behind /sitemap.xml, joined. /sitemap.xml is a sitemap index
 * (`src/lib/sitemap.ts`): the pages are in the files it lists
 * (`/sitemaps/<name>.xml`), which are read here from the same server, `base`
 * standing in for botolago.com. A plain `urlset` is returned as it is.
 * `null` when any file does not answer 200: half a sitemap is not one.
 */
export async function readSitemapFiles(
  request: APIRequestContext,
  base = "",
  query = "",
): Promise<string | null> {
  const index = await request.get(`${base}/sitemap.xml${query}`);
  if (!index.ok()) return null;
  const body = await index.text();
  if (!/<sitemapindex\b/.test(body)) return body;
  const files = [...body.matchAll(/<loc>https:\/\/botolago\.com(\/[^<]+)<\/loc>/g)].map(
    ([, path]) => path!,
  );
  const parts: string[] = [];
  for (const path of files) {
    const response = await request.get(`${base}${path}${query}`);
    if (!response.ok()) return null;
    parts.push(await response.text());
  }
  return parts.join("\n");
}
