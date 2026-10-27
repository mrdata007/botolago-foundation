import { createFileRoute } from "@tanstack/react-router";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import {
  buildClubsSitemapXml,
  buildMatchesSitemapXml,
  buildNewsRecentSitemapXml,
  buildNewsSitemapXml,
  buildStaticSitemapXml,
  parseSitemapName,
} from "@/lib/sitemap";
import { readSitemapNews, sitemapUnavailable, sitemapXmlResponse } from "@/lib/sitemap-responses";
import { footballService } from "@/services/football";

/**
 * The files `/sitemap.xml` lists (`@/lib/sitemap`): `static.xml`,
 * `clubs.xml`, `matches.xml`, `news-recent.xml` (Google News) and
 * `news-YYYY-MM.xml`. Any other name is a 404,
 * and so are the News files while News is off.
 *
 * A failed read is a 503 the crawler retries, never an empty file: an empty
 * sitemap tells it every page it listed has gone.
 */
export const Route = createFileRoute("/sitemaps/$file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const wanted = parseSitemapName(params.file);
        if (
          !wanted ||
          ((wanted.kind === "news" || wanted.kind === "news-recent") && !NEWS_ENABLED)
        ) {
          return new Response("Not found", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        if (wanted.kind === "news-recent") {
          const news = await readSitemapNews();
          if (news === "failed") return sitemapUnavailable();
          return sitemapXmlResponse(buildNewsRecentSitemapXml(news));
        }
        if (wanted.kind === "news") {
          const news = await readSitemapNews();
          if (news === "failed") return sitemapUnavailable();
          return sitemapXmlResponse(buildNewsSitemapXml(news, wanted.name));
        }
        switch (wanted.section) {
          case "static":
            return sitemapXmlResponse(buildStaticSitemapXml({ newsEnabled: NEWS_ENABLED }));
          case "clubs":
            try {
              const directory = await footballService.getClubDirectory("fr");
              return sitemapXmlResponse(
                buildClubsSitemapXml(directory.clubs.map((club) => club.id)),
              );
            } catch {
              return sitemapUnavailable();
            }
          case "matches":
            try {
              const matches = await footballService.getSitemapMatches("fr");
              return sitemapXmlResponse(buildMatchesSitemapXml(matches.map((match) => match.id)));
            } catch {
              return sitemapUnavailable();
            }
        }
      },
    },
  },
});
