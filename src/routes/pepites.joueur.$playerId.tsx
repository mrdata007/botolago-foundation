import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import type { PlayerResponse } from "@/backend/pepites/contracts";
import { PepitesPlayerPage } from "@/components/pepites/PepitesPlayerPage";
import {
  isPlayerId,
  isPublicAnswer,
  pepitesPageHeaders,
  pepitesRobotsMeta,
  prefetchPointer,
  validatePlayerSearch,
} from "@/components/pepites/pepites-route";
import { playerQueryOptions } from "@/components/pepites/use-pepites";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { isServerRender, prefetchForSsr, ssrAvailability } from "@/lib/ssr-prefetch";

export const Route = createFileRoute("/pepites/joueur/$playerId")({
  validateSearch: validatePlayerSearch,
  beforeLoad: ({ params }) => {
    if (!isPlayerId(params.playerId)) throw notFound();
  },
  loader: {
    staleReloadMode: "blocking",
    handler: async ({ context, params }) => {
      if (!isServerRender()) return null;
      const { queryClient } = context;
      const pointer = await prefetchPointer(queryClient);
      if (!pointer?.available || !pointer.version) {
        return ssrAvailability(queryClient) ?? { cache: "private" as const, name: null };
      }
      const options = playerQueryOptions("anon", pointer.version, params.playerId);
      await prefetchForSsr(queryClient, [{ queryKey: options.queryKey, queryFn: options.queryFn }]);
      const player = queryClient.getQueryData<PlayerResponse>(options.queryKey);
      if (player?.available && !player.found) throw notFound();
      const unavailable = ssrAvailability(queryClient);
      if (unavailable) return unavailable;
      return {
        cache: isPublicAnswer(player) ? ("current" as const) : ("private" as const),
        name: player?.available && player.found ? (player.player?.name ?? null) : null,
      };
    },
  },
  headers: ({ loaderData }) => pepitesPageHeaders(loaderData),
  head: ({ loaderData, params }) => {
    const name = (loaderData as { name?: string | null } | null)?.name ?? null;
    const title = name
      ? fr["pepites.player.meta_title"].replace("{name}", name)
      : fr["pepites.meta_title"];
    return {
      meta: [
        { title },
        { name: "description", content: fr["pepites.meta_description"] },
        ...pepitesRobotsMeta(loaderData),
        { property: "og:type", content: "profile" },
        { property: "og:title", content: title },
        { property: "og:url", content: `${PUBLIC_SITE_ORIGIN}/pepites/joueur/${params.playerId}` },
      ],
      links: [
        { rel: "canonical", href: `${PUBLIC_SITE_ORIGIN}/pepites/joueur/${params.playerId}` },
      ],
    };
  },
  component: PepitesPlayerRoute,
});

function PepitesPlayerRoute() {
  const { t } = useI18n();
  const { playerId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/pepites/joueur/$playerId" });
  const title = t("pepites.meta_title");
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return (
    <PepitesPlayerPage
      playerId={playerId}
      tab={
        search.onglet === "matchs" ? "matches" : search.onglet === "stats" ? "stats" : "overview"
      }
      onTabChange={(tab) =>
        void navigate({
          search:
            tab === "matches" ? { onglet: "matchs" } : tab === "stats" ? { onglet: "stats" } : {},
          replace: true,
        })
      }
    />
  );
}
