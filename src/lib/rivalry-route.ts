import { notFound } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { serializeJsonLd } from "@/lib/article-meta";
import { prefetchForSsr, ssrAvailability } from "@/lib/ssr-prefetch";
import {
  RIVALRIES,
  rivalryCanonical,
  rivalryJsonLd,
  rivalryQueryKey,
  rivalrySeoDescription,
  type RivalryKey,
} from "@/lib/rivalries";
import { footballService } from "@/services/football";

type RivalryData = Awaited<ReturnType<typeof footballService.getRivalry>>;

/**
 * Warms the rivalry for the server's HTML. A rivalry whose clubs are not in
 * the directory is a 404; a read that failed or timed out is a 503 (see
 * `@/lib/page-availability`), never an empty indexable page. Returns the
 * description, which names the clubs and the next meeting.
 */
export async function rivalryRouteLoader(queryClient: QueryClient, key: RivalryKey) {
  const queryKey = rivalryQueryKey(key, "fr");
  await prefetchForSsr(queryClient, [
    { queryKey, queryFn: () => footballService.getRivalry(RIVALRIES[key], "fr") },
  ]);
  const unavailable = ssrAvailability(queryClient);
  if (unavailable) return unavailable;
  const data = queryClient.getQueryData<RivalryData>(queryKey);
  if (data === null) throw notFound();
  return { description: data ? rivalrySeoDescription(data.clubs, data.upcoming[0]) : undefined };
}

type RivalryLoaderData = Awaited<ReturnType<typeof rivalryRouteLoader>>;

export function rivalryRouteHead(key: RivalryKey, loaderData: RivalryLoaderData | undefined) {
  const rivalry = RIVALRIES[key];
  const canonical = rivalryCanonical(rivalry);
  const title = rivalry.title.fr;
  const description =
    (loaderData && "description" in loaderData ? loaderData.description : undefined) ??
    `${rivalry.crumb.fr} : le prochain match, les résultats des dernières rencontres et le détail de chaque match en Botola Pro.`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: canonical },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: [{ rel: "canonical", href: canonical }],
    scripts: rivalryJsonLd(rivalry).map((jsonLd) => ({
      type: "application/ld+json",
      children: serializeJsonLd(jsonLd),
    })),
  };
}
