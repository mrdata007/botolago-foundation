import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ClubCrest } from "@/components/common/ClubCrest";
import { MatchCard } from "@/components/common/MatchCard";
import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import { EmptyState, ErrorState } from "@/components/common/States";
import { AppShell } from "@/components/shell/AppShell";
import { ui, UiCard, UiPageTitle, UiSkeleton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { RIVALRIES, rivalryQueryKey, tallyMeetings, type RivalryKey } from "@/lib/rivalries";
import { cn } from "@/lib/utils";
import { footballService } from "@/services/football";
import type { Club, Match } from "@/types/domain";

const COPY = {
  fr: {
    intro: (a: string, b: string) =>
      `Cette page réunit le prochain match et les résultats des rencontres entre ${a} et ${b} en Botola Pro, tels que BotolaGO les a enregistrés. Chaque match ouvre sa fiche\u00a0: score, compositions et statistiques.`,
    clubs: "Les clubs",
    next: "Prochain match",
    results: "Résultats des rencontres",
    noNext: "Aucune rencontre n'est programmée pour le moment.",
    noResults: "Aucun résultat enregistré entre ces deux clubs.",
    tally: (a: string, wa: number, d: number, b: string, wb: number, n: number) =>
      `Sur les ${n} rencontres enregistrées\u00a0: ${wa} victoire${wa > 1 ? "s" : ""} ${a}, ${d} nul${d > 1 ? "s" : ""}, ${wb} victoire${wb > 1 ? "s" : ""} ${b}.`,
    club: "Page du club",
    failed: "Impossible de charger ces rencontres pour le moment.",
  },
  ar: {
    intro: (a: string, b: string) =>
      `تجمع هذه الصفحة المباراة القادمة ونتائج اللقاءات بين ${a} و${b} في البطولة الاحترافية، كما سجّلتها BotolaGO. تفتح كل مباراة صفحتها: النتيجة والتشكيلات والإحصاءات.`,
    clubs: "الفريقان",
    next: "المباراة القادمة",
    results: "نتائج اللقاءات",
    noNext: "لا توجد مباراة مبرمجة بين الفريقين حاليا.",
    noResults: "لا توجد نتائج مسجّلة بين الفريقين.",
    tally: (a: string, wa: number, d: number, b: string, wb: number, n: number) =>
      `في ${n} لقاءات مسجّلة: ${wa} فوز لـ${a}، ${d} تعادل، ${wb} فوز لـ${b}.`,
    club: "صفحة النادي",
    failed: "تعذّر تحميل هذه اللقاءات حاليا.",
  },
} as const;

/**
 * A rivalry page (`/derby-casablanca`, `/classico-wac-far`): the two clubs,
 * linked, the next meeting and the past results, each a row that opens its
 * match page. The data is in the server's HTML (the route's loader warms the
 * query), so the page reads without JavaScript.
 */
export function RivalryPage({ rivalryKey }: { rivalryKey: RivalryKey }) {
  const { tr, lang } = useI18n();
  const copy = COPY[lang === "ar" ? "ar" : "fr"];
  const rivalry = RIVALRIES[rivalryKey];
  const query = useQuery({
    queryKey: rivalryQueryKey(rivalryKey, lang),
    queryFn: () => footballService.getRivalry(rivalry, lang),
  });
  const data = query.data ?? null;
  const clubs = data?.clubs ?? null;
  const byId = useMemo(
    () => new Map((clubs ?? []).map((club) => [club.id, club] as const)),
    [clubs],
  );

  const rows = (items: readonly Match[]) =>
    items.map((match) => {
      const home = byId.get(match.homeClubId);
      const away = byId.get(match.awayClubId);
      if (!home || !away) return null;
      return (
        <div key={match.id} className="min-w-0">
          <MatchCard match={match} home={home} away={away} variant="list" showDate />
        </div>
      );
    });

  const tally = clubs && data ? tallyMeetings(data.results, clubs[0].id, clubs[1].id) : null;
  const counted = tally ? tally.aWins + tally.draws + tally.bWins : 0;

  return (
    <AppShell
      contentWidth="wide"
      backgroundVariant="matches"
      pageHeader={<UiPageTitle title={tr(rivalry.h1)} />}
    >
      {query.isPending ? (
        <UiSkeleton aria-hidden className={cn("mt-5 h-40", ui.radius.card)} />
      ) : query.isError || !clubs || !data ? (
        <ErrorState message={copy.failed} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <Section className="mt-4 sm:mt-6">
            <p className={cn("max-w-prose", ui.text.body, ui.tone.default)}>
              {copy.intro(tr(clubs[0].name), tr(clubs[1].name))}
            </p>
          </Section>

          <Section>
            <SectionHeader title={copy.clubs} />
            <ul className="grid grid-cols-2 gap-2.5">
              {clubs.map((club: Club) => (
                <li key={club.id} className="flex min-w-0">
                  <Link
                    to="/clubs/$clubId"
                    params={{ clubId: club.id }}
                    aria-label={`${copy.club} : ${tr(club.name)}`}
                    className={cn(
                      "flex min-h-32 w-full min-w-0 flex-col items-center justify-center gap-2.5 px-3 pb-4 pt-5 text-center",
                      ui.surface.card,
                      "press-tile",
                      ui.focus,
                    )}
                  >
                    <ClubCrest club={club} size="lg" />
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
                </li>
              ))}
            </ul>
          </Section>

          <Section>
            <SectionHeader title={copy.next} />
            {data.upcoming.length > 0 ? (
              <UiCard
                padding="none"
                className="divide-y divide-[color:var(--ui-rule)] overflow-hidden"
              >
                {rows(data.upcoming.slice(0, 1))}
              </UiCard>
            ) : (
              <EmptyState>{copy.noNext}</EmptyState>
            )}
          </Section>

          <Section>
            <SectionHeader title={copy.results} />
            {data.results.length > 0 ? (
              <>
                {tally && counted > 0 ? (
                  <p className={cn("mb-3", ui.text.meta, ui.tone.muted)}>
                    {copy.tally(
                      tr(clubs[0].shortName),
                      tally.aWins,
                      tally.draws,
                      tr(clubs[1].shortName),
                      tally.bWins,
                      counted,
                    )}
                  </p>
                ) : null}
                <UiCard
                  padding="none"
                  className="divide-y divide-[color:var(--ui-rule)] overflow-hidden"
                >
                  {rows(data.results.slice(0, 12))}
                </UiCard>
              </>
            ) : (
              <EmptyState>{copy.noResults}</EmptyState>
            )}
          </Section>
        </>
      )}
      {/* Clears the bottom navigation's shadow. */}
      <div className="h-6" aria-hidden />
    </AppShell>
  );
}
