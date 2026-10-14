import { useEffect, useMemo, type ReactNode } from "react";

import { useMyCareer } from "@/services/use-premium-card-reads";
import { useLeagueContext } from "@/services/use-premium-league-context";

import { PlusEmbed, PlusLockedSection } from "./PlusLockedSection";
import type { PlusAccess } from "./plus-access";
import { usePlusCopy } from "./plus-copy";
import { careerToSeasonView } from "./plus-member-data";
import { SeasonProvider } from "./plus-season-context";
import { Fig } from "./plus-season-ui";
import { useSeasonFmt } from "./plus-season-fmt";
import { PlusSeasonTabs } from "./PlusSeasonScreen";

/** The address fragment the card page's section answers to (the paywall returns here). */
export const SEASON_SECTION_ID = "votre-saison";

/** The reader's real standing in a league, from the standings the free screens already load. */
export interface Standing {
  totalScore: number;
  rank: number;
  /** Managers in the league. */
  size: number;
}

/**
 * « Votre saison » on Curva's card page. The card page's slot (`PlusSeasonSlot`) decides `access`
 * (`usePlusAccess()`) and hands over the real standing:
 *   - off: null (no node, no request);
 *   - locked: the real total points and league position clear on top, the example analysis
 *     blurred below with the lock and « Découvrir ». The paid reads are not called;
 *   - member: the four tabs, clear, from the member's career read.
 */
export function PlusSeasonSection({
  access,
  standing = null,
  leagueId = null,
  leaguePending = false,
}: {
  access: PlusAccess;
  standing?: Standing | null;
  /** The private league the Curva screen is showing: the league figures are read for it. */
  leagueId?: string | null;
  /** The screen does not know its league yet; the league figures wait for it. */
  leaguePending?: boolean;
}) {
  if (access === "off") return null;
  return access === "locked" ? (
    <LockedSeason standing={standing} />
  ) : (
    <MemberSeason leagueId={leagueId} leaguePending={leaguePending} />
  );
}

/** When the address names the section (`#votre-saison`, after the paywall), bring it into view. */
function useScrollToSection(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    if (window.location.hash !== `#${SEASON_SECTION_ID}`) return;
    document.getElementById(SEASON_SECTION_ID)?.scrollIntoView({ block: "start" });
  }, [active]);
}

function LockedSeason({ standing }: { standing: Standing | null }) {
  const { t } = usePlusCopy();
  useScrollToSection(true);
  return (
    <PlusLockedSection
      id={SEASON_SECTION_ID}
      testId="plus-season-locked"
      headline={t("plus.in.season_title")}
      head={
        standing ? (
          <StandingHead
            totalScore={standing.totalScore}
            rank={standing.rank}
            size={standing.size}
          />
        ) : null
      }
    >
      <PlusSeasonTabs />
    </PlusLockedSection>
  );
}

/** The reader's real points and league position: clear, outside the blur. */
export function StandingHead({
  totalScore,
  rank,
  size,
  label,
}: {
  totalScore: number;
  rank: number;
  size: number;
  label?: ReactNode;
}) {
  const { t } = usePlusCopy();
  const { rankOf } = useSeasonFmt();
  return (
    <>
      <div className="pl-fig" data-testid="plus-real-points">
        <b>
          <Fig>{totalScore}</Fig>
        </b>
        <span>{label ?? t("plus.s2.b_points")}</span>
      </div>
      <span className="pl-rank" data-testid="plus-real-rank">
        {rankOf(rank, size)}
      </span>
    </>
  );
}

function MemberSeason({
  leagueId,
  leaguePending,
}: {
  leagueId: string | null;
  leaguePending: boolean;
}) {
  const { t } = usePlusCopy();
  const career = useMyCareer(true);
  // Members only (this component is rendered for no one else). A league that fails to read leaves
  // the career and its « — » for the league's figures, rather than an error panel.
  const league = useLeagueContext(!leaguePending, leagueId);
  const leagueLoading = leaguePending || (league.isPending && league.fetchStatus !== "idle");
  const view = useMemo(
    () => (career.data ? careerToSeasonView(career.data, league.data ?? null) : null),
    [career.data, league.data],
  );
  useScrollToSection(view !== null);
  let body: ReactNode;
  if (career.isPending || (career.data && leagueLoading)) {
    body = (
      <>
        <div className="pl-skeleton" aria-hidden />
        <span className="sr-only">{t("plus.in.loading")}</span>
      </>
    );
  } else if (career.isError) body = <p className="pl-note">{t("plus.in.failed")}</p>;
  else if (!view) body = <p className="pl-note">{t("plus.in.season_empty")}</p>;
  else
    body = (
      <SeasonProvider view={view}>
        <div className="plus-body ps-body">
          <PlusSeasonTabs />
        </div>
      </SeasonProvider>
    );
  return (
    <PlusEmbed
      id={SEASON_SECTION_ID}
      data-testid="plus-season-member"
      aria-labelledby="plus-season-member-title"
    >
      <h2 className="plus-h2 pl-title" id="plus-season-member-title">
        {t("plus.s2.title")}
      </h2>
      {body}
    </PlusEmbed>
  );
}
