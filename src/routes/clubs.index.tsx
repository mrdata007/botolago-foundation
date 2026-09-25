import { unavailableHeaders } from "@/lib/page-availability";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClubCrest } from "@/components/common/ClubCrest";
import { EmptyState, ErrorState } from "@/components/common/States";
import { AppShell } from "@/components/shell/AppShell";
import { ui, UiPageTitle, UiSkeleton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { clubStyle } from "@/lib/club-palette";
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
        queryFn: () => footballService.getClubDirectory("fr"),
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
 * tiles, two across on a phone and three from `sm`. Each tile is the crest
 * disc, the name and a 4px base in the club's edge colour, as Profile draws
 * "Mes clubs"; each opens its club page.
 *
 * The list is the current season's clubs (its table, or before there is one,
 * its fixtures), by name — not the whole team catalogue, which still holds
 * clubs that have since been relegated.
 */
function ClubsPage() {
  const { t, lang } = useI18n();
  const directoryQ = useQuery({
    queryKey: ["football", "club-directory", lang],
    queryFn: () => footballService.getClubDirectory(lang),
  });
  const season = directoryQ.data?.season ?? null;
  const clubs = directoryQ.data?.clubs ?? [];

  return (
    <AppShell
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
        <ul aria-hidden className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index}>
              <UiSkeleton className={cn("h-36", ui.radius.card)} />
            </li>
          ))}
        </ul>
      ) : directoryQ.isError ? (
        <ErrorState onRetry={() => void directoryQ.refetch()} />
      ) : clubs.length === 0 ? (
        <EmptyState>{t("clubs.empty")}</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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
      params={{ clubId: club.id }}
      data-club={colours["data-club"]}
      style={colours.style}
      className={cn(
        "flex min-h-36 w-full min-w-0 flex-col items-center justify-center gap-2.5 px-3 pb-4 pt-5 text-center",
        ui.surface.card,
        ui.edge.blockEnd,
        "transition-transform duration-[var(--duration-tap)] ease-[var(--ease-standard)] active:translate-y-px",
        ui.focus,
      )}
    >
      <ClubCrest club={club} size="lg" />
      {/* Two lines at most, broken between words only. */}
      <span
        className={cn(
          "line-clamp-2 w-full text-balance",
          ui.text.body,
          "[font-weight:var(--ui-weight-heavy)]",
          ui.tone.default,
        )}
      >
        {tr(club.name)}
      </span>
    </Link>
  );
}
