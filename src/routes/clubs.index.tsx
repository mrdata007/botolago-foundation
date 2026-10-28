import { clubPathParam } from "@/lib/club-slug";
import { unavailableHeaders } from "@/lib/page-availability";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ClubCrest } from "@/components/common/ClubCrest";
import { EmptyState, ErrorState } from "@/components/common/States";
import { AppShell } from "@/components/shell/AppShell";
import { ui, UiPageTitle, UiSkeleton } from "@/components/ui-kit";
import { useReaderDocumentTitle } from "@/hooks/use-reader-document-title";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { clubPalette, clubStyle } from "@/lib/club-palette";
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
 * tiles, two across on a phone, three from `sm`, four from `lg`. Each tile is
 * painted in the club's own colours — its fill deepening to the bottom under
 * the kit stripes, a glow and a 4px base in its second colour — with the
 * crest raised on a surface disc and the name in the text colour measured
 * for that fill; each opens its club page. A wall of Botola colours.
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
        <ul aria-hidden className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index}>
              <UiSkeleton className={cn("h-36", ui.radius.card)} />
            </li>
          ))}
        </ul>
      ) : directoryQ.isError ? (
        <ErrorState message={t("clubs.load_failed")} onRetry={() => void directoryQ.refetch()} />
      ) : clubs.length === 0 ? (
        <EmptyState>{t("clubs.empty")}</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
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
  const palette = useMemo(() => clubPalette(club), [club]);
  const colours = clubStyle(palette);
  // The club's second colour (the kit table's, when the data has none), for
  // the glow and the base bar; the stripe band when the club has none.
  const second = palette.secondary ?? "var(--ui-club-band)";
  return (
    <Link
      to="/clubs/$clubId"
      params={{ clubId: clubPathParam(club) }}
      data-club={colours["data-club"]}
      style={colours.style}
      className={cn(
        "group relative isolate flex min-h-36 w-full min-w-0 flex-col items-center justify-center gap-2.5 overflow-hidden px-3 pb-5 pt-5 text-center",
        // The club's own fill and the text measured for it (≥ 4.5:1 in each
        // theme, `club-palette.ts`), the diagonal kit texture, and the edge
        // ring that keeps a white or yellow kit a shape on the page — an inset
        // shadow rather than `ui.club.ring`, whose `ring-inset` would pull the
        // focus ring inside the tile — under the one lifted shadow.
        ui.club.fill,
        ui.club.stripes,
        "shadow-[inset_0_0_0_1px_var(--ui-club-edge),var(--ui-shadow-lifted)]",
        ui.radius.card,
        "press-tile",
        ui.focus,
      )}
    >
      {/* The fill deepens toward the bottom, toward the stripe band: the
          colour the text is NOT, so the name only gains contrast over it. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, transparent 30%, color-mix(in oklab, var(--ui-club-band) 26%, transparent))",
        }}
      />
      {/* The second colour as a glow in the top inline-end corner, behind the
          crest's row only: it has faded out well above the name. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -end-10 -top-10 -z-10 h-24 w-24 rounded-full"
        style={{
          backgroundImage: `radial-gradient(closest-side, color-mix(in oklab, ${second} 45%, transparent), transparent)`,
        }}
      />
      {/* The kit's second colour as the tile's base. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1"
        style={{ backgroundColor: second }}
      />
      {/* The crest raised off the tile: a surface disc, ringed and lifted. */}
      <ClubCrest
        club={club}
        palette={palette}
        size="lg"
        tone="inverse"
        className="transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
      />
      {/* Two lines at most, broken between words only. */}
      <span
        className={cn(
          "line-clamp-2 w-full text-balance",
          ui.text.body,
          "[font-weight:var(--ui-weight-heavy)]",
        )}
      >
        {tr(club.name)}
      </span>
    </Link>
  );
}
