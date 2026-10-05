import { createFileRoute, useRouter } from "@tanstack/react-router";

import type { FantasyPublicRecapDto } from "@/backend/fantasy/contracts";
import { PublicRecapView } from "@/components/fantasy/PublicRecapView";
import { AppShell } from "@/components/shell/AppShell";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { PUBLIC_RECAP_META, publicRecapPath } from "@/lib/public-recap";
import { fantasyService } from "@/services/fantasy-runtime";

type Load = { recap: FantasyPublicRecapDto | null; failed: boolean };

/**
 * `/journee/<publicId>` — a manager's public gameweek recap (Fantasy R4).
 *
 * Read with the anonymous key from the narrow public projection, on the
 * server for the first paint and its preview tags, and again on every
 * client visit. Never cached and never indexed: a revocation or a switched-off
 * read takes effect on the next request, and a person's recap does not belong
 * in a search engine. `?lang=ar` (added to links shared from Arabic) renders
 * the title and preview in Arabic; the server cannot see a reader's stored
 * language.
 */
export const Route = createFileRoute("/journee/$publicId")({
  validateSearch: (search: Record<string, unknown>): { lang?: "ar" } =>
    search.lang === "ar" ? { lang: "ar" } : {},
  loader: async ({ params }): Promise<Load> => {
    try {
      return { recap: await fantasyService.getPublicRecap(params.publicId), failed: false };
    } catch {
      return { recap: null, failed: true };
    }
  },
  staleTime: 0,
  headers: () => ({ "Cache-Control": "no-store" }),
  head: ({ loaderData, params, match }) => {
    const meta = PUBLIC_RECAP_META[(match.search as { lang?: "ar" }).lang === "ar" ? "ar" : "fr"];
    const recap = (loaderData as Load | undefined)?.recap ?? null;
    const title = recap
      ? meta.title
          .replace("{n}", String(recap.gameweek))
          .replace(
            "{points}",
            `${recap.total} ${Math.abs(recap.total) === 1 ? meta.unitOne : meta.unitOther}`,
          )
          .replace("{alias}", recap.alias)
      : meta.titleGeneric;
    const url = `${PUBLIC_SITE_ORIGIN}${publicRecapPath(params.publicId)}`;
    return {
      meta: [
        { title },
        { name: "description", content: meta.description },
        { name: "robots", content: "noindex" },
        { property: "og:type", content: "website" },
        { property: "og:title", content: title },
        { property: "og:description", content: meta.description },
        { property: "og:url", content: url },
      ],
    };
  },
  component: PublicRecapRoute,
});

function PublicRecapRoute() {
  const data = Route.useLoaderData() as Load;
  const router = useRouter();
  return (
    <AppShell hideBottomNav>
      <PublicRecapView
        recap={data.recap}
        failed={data.failed}
        onRetry={() => void router.invalidate()}
      />
    </AppShell>
  );
}
