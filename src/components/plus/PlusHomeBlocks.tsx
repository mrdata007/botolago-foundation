import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { ui, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { useCardDuel, useMyCareer } from "@/services/use-premium-card-reads";
import { useLeagueContext } from "@/services/use-premium-league-context";

import { DuelHead } from "./PlusDuelScreen";
import { PlusDuelSection, type DuelSide } from "./PlusDuelSection";
import { PlusEmbed, PlusLockedSection } from "./PlusLockedSection";
import { PlusLogo } from "./PlusLogo";
import { SEASON_SECTION_ID, StandingHead, type Standing } from "./PlusSeasonSection";
import { PlusStylePicker } from "./PlusStylePicker";
import { editionLabel, editionOf } from "./plus-card-style";
import { PLUS_NAME, usePlusCopy } from "./plus-copy";
import { careerToSeasonView, duelToSeasonView } from "./plus-member-data";
import { rememberDuelReturn } from "./plus-return";
import { CumChart } from "./plus-season-charts";
import { SeasonProvider, useDuelPeople, useSeason, EXAMPLE_VIEW } from "./plus-season-context";
import { isMissing } from "./plus-season-data";
import { useSeasonFmt } from "./plus-season-fmt";
import { Fig, Num } from "./plus-season-ui";
import type { PlusAccess } from "./plus-access";
import { usePlusMemberCard } from "./use-plus-member-card";

/**
 * BotolaGO+ in place on Curva's home, for the two audiences that see it (nothing at all while the
 * feature is off for the reader; the slots in `curva/PlusHomeSlots.tsx` decide):
 *   - not a member: « Votre saison » and « Votre duel » as the night-stadium locked strips, the
 *     reader's real free number clear above (their points and rank; the duel's score against the
 *     closest rival), the example blurred below, « Découvrir » to the paywall;
 *   - a member: the same two places, real and compact, each with the way to the full screen.
 * Nothing under a blur is the reader's own data; a member's comparison without data is left out.
 */

/** « Votre saison »: locked for a non-member, compact and real for a member. */
export function PlusHomeSeason({
  access,
  standing,
  leagueId,
  leaguePending,
}: {
  access: PlusAccess;
  standing: Standing | null;
  leagueId: string | null;
  leaguePending: boolean;
}) {
  const { t } = usePlusCopy();
  if (access === "off") return null;
  if (access === "member")
    return <MemberSeason leagueId={leagueId} leaguePending={leaguePending} />;
  return (
    <PlusLockedSection
      compact
      testId="plus-home-season-locked"
      via="season"
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
      <ExampleChart />
    </PlusLockedSection>
  );
}

/** The example season's points race (what hides under the blur). */
function ExampleChart() {
  const { jAxis } = useSeasonFmt();
  const S = EXAMPLE_VIEW.S;
  return <CumChart a={S.cumYou} b={S.cumLeague} bKind="ref" jAxis={jAxis} label="" />;
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
  const league = useLeagueContext(!leaguePending, leagueId);
  const loading =
    career.isPending || leaguePending || (league.isPending && league.fetchStatus !== "idle");
  const view = useMemo(
    () => (career.data ? careerToSeasonView(career.data, league.data ?? null) : null),
    [career.data, league.data],
  );
  // No career yet (no journée played), or the read failed: the card page says so; the home stays quiet.
  if (!loading && !view) return null;
  return (
    <PlusEmbed
      className="plus-embed--home"
      data-testid="plus-home-season-member"
      aria-labelledby="plus-home-season-title"
    >
      <h2 className="plus-h2 pl-title" id="plus-home-season-title">
        {t("plus.s2.title")}
      </h2>
      {loading || !view ? (
        <>
          <div className="pl-skeleton" aria-hidden />
          <span className="sr-only">{t("plus.in.loading")}</span>
        </>
      ) : (
        <SeasonProvider view={view}>
          <div className="plus-body ps-body">
            <SeasonFigures />
          </div>
        </SeasonProvider>
      )}
      <Link
        to="/curva/carte"
        hash={SEASON_SECTION_ID}
        className="ps-linkbtn"
        data-testid="plus-home-season-all"
      >
        {t("plus.home.season_all")}
        <ArrowRight aria-hidden />
      </Link>
    </PlusEmbed>
  );
}

/** Key figures and the points race of the member's season; a figure without data is left out. */
function SeasonFigures() {
  const { S, raw, J } = useSeason();
  const { t } = usePlusCopy();
  const { jAxis, ord } = useSeasonFmt();
  const rank = raw.youRank[raw.youRank.length - 1];
  const above = S.total - S.leagueTotal;
  const items: ReactNode[] = [
    <li key="avg">
      <span className="ps-label">{t("plus.s2.tile_avg")}</span>
      <b className="ps-mid">
        <Num value={S.total / J} decimals={1} />
      </b>
    </li>,
    <li key="total" className="me">
      <span className="ps-label">{t("plus.s2.b_points")}</span>
      <b className="ps-mid">
        <Num value={S.total} />
      </b>
    </li>,
  ];
  if (!isMissing(rank)) {
    items.push(
      <li key="rank">
        <span className="ps-label">{t("plus.home.rank")}</span>
        <b className="ps-mid">
          <Fig>{ord(rank!)}</Fig>
        </b>
      </li>,
    );
  }
  return (
    <>
      <ul
        className="ps-trio"
        style={items.length === 3 ? undefined : { gridTemplateColumns: "repeat(2, 1fr)" }}
        data-testid="plus-home-season-figures"
      >
        {items}
      </ul>
      {!isMissing(above) && above > 0 ? (
        <p className="pl-note" data-testid="plus-home-season-above">
          {t("plus.s2.r_above").replace("{n}", String(above))}
        </p>
      ) : null}
      <CumChart a={S.cumYou} b={S.cumLeague} bKind="ref" jAxis={jAxis} label={t("plus.s2.title")} />
    </>
  );
}

/** « Votre duel »: the closest rival. Locked for a non-member, compact and real for a member. */
export function PlusHomeDuel({
  access,
  mine,
  other,
  otherTeamId,
  size,
  leagueId,
}: {
  access: PlusAccess;
  mine: DuelSide;
  other: DuelSide;
  otherTeamId: string;
  size: number;
  leagueId: string | null;
}) {
  if (access === "off") return null;
  if (access === "locked") {
    return (
      <PlusDuelSection
        access="locked"
        compact
        mine={mine}
        other={other}
        otherTeamId={otherTeamId}
        size={size}
        leagueId={leagueId}
      />
    );
  }
  return <MemberDuel mine={mine} other={other} otherTeamId={otherTeamId} leagueId={leagueId} />;
}

function MemberDuel({
  mine,
  other,
  otherTeamId,
  leagueId,
}: {
  mine: DuelSide;
  other: DuelSide;
  otherTeamId: string;
  leagueId: string | null;
}) {
  const { t } = usePlusCopy();
  const { lang } = useI18n();
  const duel = useCardDuel(otherTeamId, true);
  const league = useLeagueContext(true, leagueId, otherTeamId);
  const loading =
    duel.isPending || (duel.data && league.isPending && league.fetchStatus !== "idle");
  const view = useMemo(
    () =>
      duel.data && duel.data.opponent.historyVisible
        ? duelToSeasonView(
            duel.data,
            lang === "ar" ? "ar" : "fr",
            { you: mine.name, rival: other.name },
            league.data ?? null,
          )
        : null,
    [duel.data, lang, mine.name, other.name, league.data],
  );
  // A rival who keeps their history private, a duel with no journée in common, a failed read: the
  // block is not drawn rather than shown empty.
  if (!loading && !view) return null;
  return (
    <PlusEmbed
      className="plus-embed--home"
      data-testid="plus-home-duel-member"
      aria-labelledby="plus-home-duel-title"
    >
      <h2 className="plus-h2 pl-title" id="plus-home-duel-title">
        {t("plus.home.duel_t")}
      </h2>
      {loading || !view ? (
        <>
          <div className="pl-skeleton" aria-hidden />
          <span className="sr-only">{t("plus.in.loading")}</span>
        </>
      ) : (
        <SeasonProvider view={view}>
          <div className="plus-body ps-body">
            <DuelSummary />
          </div>
        </SeasonProvider>
      )}
      <Link
        to="/curva/les-votres"
        search={leagueId ? { ligue: leagueId } : {}}
        onClick={() => rememberDuelReturn(otherTeamId)}
        className="ps-linkbtn"
        data-testid="plus-home-duel-all"
      >
        {t("plus.s2.duel_open")}
        <ArrowRight aria-hidden />
      </Link>
    </PlusEmbed>
  );
}

/** Who leads and by how much, with the head of the duel; a tie says so, no gap is invented. */
function DuelSummary() {
  const { S } = useSeason();
  const { t, f } = usePlusCopy();
  const people = useDuelPeople({ you: t("plus.s2.me_name"), rival: t("plus.s2.rival_name") });
  const gap = S.total - S.rivalTotal;
  const name = <bdi>{people.rival.name}</bdi>;
  let finding: ReactNode = null;
  if (!isMissing(gap)) {
    if (gap > 0) finding = f("plus.s2.lead_h", { name, n: <Fig>{gap}</Fig> });
    else if (gap < 0) finding = f("plus.home.duel_trail", { name, n: <Fig>{-gap}</Fig> });
    else finding = f("plus.home.duel_tie", { name });
  }
  return (
    <>
      <DuelHead finding={false} />
      {finding ? (
        <h3 className="ps-hl ps-head-label" data-testid="plus-home-duel-finding">
          {finding}
        </h3>
      ) : null}
    </>
  );
}

/**
 * The member's identity on Curva: the logo and the way to « Mon abonnement ». The product name is
 * the logo, never typed (its spoken label carries it).
 */
export function PlusHomeMember() {
  const { t, text } = usePlusCopy();
  const profile = usePlusMemberCard();
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-3" data-testid="plus-home-member">
      <UiCard padding="none" className="overflow-hidden">
        <Link
          to="/profile"
          className={cn(
            "flex min-h-[var(--ui-tap-min)] w-full items-center gap-3 px-4 py-3",
            ui.focus,
          )}
          data-testid="plus-home-member-band"
        >
          <PlusLogo
            label={text("plus.in.member_aria", { name: PLUS_NAME })}
            height={24}
            className="plus-logo--heading"
          />
          <span className={cn("min-w-0 flex-1", ui.text.bodyStrong, ui.tone.default)}>
            {t("plus.hub.title")}
          </span>
          <ChevronRight className={cn("h-4.5 w-4.5 shrink-0", ui.tone.muted)} aria-hidden />
        </Link>
        {profile ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              "flex min-h-[var(--ui-tap-min)] w-full items-center gap-3 px-4 py-3 text-start",
              ui.rule.blockStart,
              ui.focus,
            )}
            data-testid="plus-home-style"
          >
            <span className="min-w-0 flex-1">
              <span className={cn("block", ui.text.bodyStrong, ui.tone.default)}>
                {t("plus.hub.style_t")}
              </span>
              <span className={cn("block", ui.text.meta, ui.tone.muted)}>
                {editionLabel(t, editionOf(profile))}
              </span>
            </span>
            <ChevronRight className={cn("h-4.5 w-4.5 shrink-0", ui.tone.muted)} aria-hidden />
          </button>
        ) : null}
      </UiCard>
      {profile ? <PlusStylePicker open={open} onOpenChange={setOpen} profile={profile} /> : null}
    </section>
  );
}
