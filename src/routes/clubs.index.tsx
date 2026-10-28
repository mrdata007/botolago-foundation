import { clubPathParam } from "@/lib/club-slug";
import { unavailableHeaders } from "@/lib/page-availability";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClubCrest } from "@/components/common/ClubCrest";
import { EmptyState, ErrorState } from "@/components/common/States";
import { AppShell } from "@/components/shell/AppShell";
import { ui, UiPageTitle, UiSkeleton } from "@/components/ui-kit";
import { useReaderDocumentTitle } from "@/hooks/use-reader-document-title";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { clubStyle } from "@/lib/club-palette";
import { clubShortName } from "@/lib/club-identity";
import { cn } from "@/lib/utils";
import { ssrAvailability, prefetchForSsr } from "@/lib/ssr-prefetch";
import { footballService } from "@/services/football";
import type { Club } from "@/types/domain";

const CLUBS_TITLE = "Clubs de Botola Pro — BotolaGO";
const CLUBS_DESCRIPTION =
  "Tous les clubs de la Botola Pro : prochains matchs, résultats, classement, statistiques et effectif de chaque équipe.";

export const Route = createFileRoute("/clubs/")({
  // Every club, with a link to its page, in the server's HTML (see
  // `@/lib/ssr-prefetch`): no other page linked to them in HTML before.
  loader: async ({ context }) => {
    await prefetchForSsr(context.queryClient, [
      {
        queryKey: ["football", "club-directory", "fr"],
        queryFn: ({ signal }) => footballService.getClubDirectory("fr", signal),
      },
    ]);
    return ssrAvailability(context.queryClient);
  },
  headers: ({ loaderData }) => unavailableHeaders(loaderData),
  head: () => ({
    meta: [
      { title: CLUBS_TITLE },
      { name: "description", content: CLUBS_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: CLUBS_TITLE },
      { property: "og:description", content: CLUBS_DESCRIPTION },
      { property: "og:url", content: `${PUBLIC_SITE_ORIGIN}/clubs` },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: CLUBS_TITLE },
      { name: "twitter:description", content: CLUBS_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${PUBLIC_SITE_ORIGIN}/clubs` }],
  }),
  component: ClubsPage,
});

/**
 * Every club of the season (A-Clubs): a white title band — "Clubs", then the
 * competition and the season the list is drawn from — over a grid of club
 * tiles, three across on a phone, four from `sm` and six from `lg`. Each
 * tile is filled with the club's own colour (club-palette tokens, AA text),
 * with its crest on an inverse disc and its one short name; each opens its
 * club page (owner direction 2026-10-28: dense, and the colour shows).
 *
 * The list is the current season's clubs (its table, or before there is one,
 * its fixtures), by name — not the whole team catalogue, which still holds
 * clubs that have since been relegated.
 */
function ClubsPage() {
  const { t, lang } = useI18n();
  useReaderDocumentTitle(t("meta.clubs_title"));
  const directoryQ = useQuery({
    queryKey: ["football", "club-directory", lang],
    queryFn: () => footballService.getClubDirectory(lang),
  });
  const season = directoryQ.data?.season ?? null;
  const clubs = directoryQ.data?.clubs ?? [];

  return (
    <AppShell
      contentWidth="wide"
      backgroundVariant="matches"
      pageHeader={
        <UiPageTitle title={t("clubs.title")}>
          {season ? (
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {t("matches.competition.botola")} ·{" "}
              <bdi className={ui.text.tabular}>{season.label}</bdi>
            </p>
          ) : null}
        </UiPageTitle>
      }
    >
      {directoryQ.isPending ? (
        <ul aria-hidden className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index}>
              <UiSkeleton className={cn("h-[7.25rem]", ui.radius.card)} />
            </li>
          ))}
        </ul>
      ) : directoryQ.isError ? (
        <ErrorState message={t("clubs.load_failed")} onRetry={() => void directoryQ.refetch()} />
      ) : clubs.length === 0 ? (
        <EmptyState>{t("clubs.empty")}</EmptyState>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 lg:grid-cols-6">
          {clubs.map((club) => (
            // A flex cell, so every tile fills its row's height and the
            // club-colour edges line up when one name wraps and its
            // neighbour's does not.
            <li key={club.id} className="flex min-w-0">
              <ClubTile club={club} />
            </li>
          ))}
        </ul>
      )}

      {/* Clears the bottom navigation's shadow. */}
      <div className="h-6" aria-hidden />
    </AppShell>
  );
}

function ClubTile({ club }: { club: Club }) {
  const { tr } = useI18n();
  const colours = clubStyle(club);
  return (
    <Link
      to="/clubs/$clubId"
      params={{ clubId: clubPathParam(club) }}
      data-club={colours["data-club"]}
      style={colours.style}
      className={cn(
        // The club's own colour as the tile: the fill and the text measured for
        // it (`--ui-on-club`, AA in both themes), the diagonal club texture, and
        // an inverse crest plate that stays a disc on a light kit.
        "flex min-h-[7.25rem] w-full min-w-0 flex-col items-center justify-center gap-2 px-1.5 pb-3 pt-3.5 text-center",
        ui.radius.card,
        ui.shadow.card,
        ui.club.fill,
        ui.club.stripes,
        // The inner edge ring keeps a white kit (Zemamra) a tile on a light page.
        ui.club.ring,
        "press-tile",
        ui.focus,
      )}
    >
      <ClubCrest club={club} size="md" tone="inverse" />
      {/* Two lines at most, broken between words only: the one short name
          every screen prints for the club. */}
      <span
        className={cn(
          "line-clamp-2 w-full text-balance [overflow-wrap:anywhere]",
          ui.text.meta,
          "[font-weight:var(--ui-weight-heavy)]",
        )}
      >
        {clubShortName(club, tr)}
      </span>
    </Link>
  );
}
