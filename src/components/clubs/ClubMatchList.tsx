import noMatchesArt from "@/assets/illustrations/empty-matches.webp";
import { MatchCard } from "@/components/common/MatchCard";
import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import { MatchCardSkeleton } from "@/components/common/Skeletons";
import { EmptyState, ErrorState } from "@/components/common/States";
import { UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubFixtures, clubResults } from "@/lib/club-season";
import type { Club, Match } from "@/types/domain";
import type { SectionData } from "./ClubOverview";

/**
 * A club's season, match by match (A-Club, "Matchs"): what is still to be
 * played, soonest first — the live match, the calendar, and postponed games,
 * which keep their place with their badge — then the results, most recent
 * first. The rows are the Matches page's club-colour rows, each naming its
 * round, and each opens its match.
 */
export function ClubMatchList({
  clubId,
  matches,
  clubById,
}: {
  clubId: string;
  matches: SectionData<readonly Match[]>;
  clubById: (id: string) => Club | undefined;
}) {
  const { t } = useI18n();

  if (matches.isPending) {
    return (
      <Section>
        <UiCard padding="none" className="divide-y divide-[color:var(--ui-rule)] overflow-hidden">
          <MatchCardSkeleton flat />
          <MatchCardSkeleton flat />
          <MatchCardSkeleton flat />
        </UiCard>
      </Section>
    );
  }
  if (matches.isError) {
    return (
      <Section>
        <ErrorState onRetry={() => void matches.refetch()} />
      </Section>
    );
  }

  const list = matches.data ?? [];
  const fixtures = clubFixtures(list);
  const results = clubResults(list, clubId);
  if (fixtures.length === 0 && results.length === 0) {
    return (
      <Section>
        <EmptyState illustration={noMatchesArt}>{t("club.matches_empty")}</EmptyState>
      </Section>
    );
  }

  const rows = (items: readonly Match[]) =>
    items.map((match) => {
      const home = clubById(match.homeClubId);
      const away = clubById(match.awayClubId);
      if (!home || !away) return null;
      return <MatchCard key={match.id} match={match} home={home} away={away} variant="list" />;
    });

  return (
    <>
      {fixtures.length > 0 && (
        <Section>
          <SectionHeader title={t("matches.section.upcoming")} />
          {/* The card clips the rows' club edge bars to its corners. */}
          <UiCard padding="none" className="divide-y divide-[color:var(--ui-rule)] overflow-hidden">
            {rows(fixtures)}
          </UiCard>
        </Section>
      )}
      {results.length > 0 && (
        <Section>
          <SectionHeader title={t("matches.section.finished")} />
          <UiCard padding="none" className="divide-y divide-[color:var(--ui-rule)] overflow-hidden">
            {rows(results)}
          </UiCard>
        </Section>
      )}
    </>
  );
}
