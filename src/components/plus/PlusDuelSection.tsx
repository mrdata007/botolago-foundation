import { useMemo, type ReactNode } from "react";

import { useI18n } from "@/i18n/provider";
import { useCardDuel } from "@/services/use-premium-card-reads";
import { useLeagueContext } from "@/services/use-premium-league-context";

import { PlusEmbed, PlusLockedSection } from "./PlusLockedSection";
import { PlusDuelBody } from "./PlusDuelScreen";
import type { PlusAccess } from "./plus-access";
import { usePlusCopy } from "./plus-copy";
import { duelToSeasonView } from "./plus-member-data";
import { SeasonProvider } from "./plus-season-context";
import { Fig } from "./plus-season-ui";
import { useSeasonFmt } from "./plus-season-fmt";

/** One side of the duel as the free screens know it: the name, the league points and position. */
export interface DuelSide {
  name: string;
  totalScore: number;
  rank: number;
}

/**
 * « Détail du duel » in the face-à-face sheet. The sheet's slot (`PlusDuelSlot`) decides `access`
 * (`usePlusAccess()`). Same three outcomes as the card page's section (`PlusSeasonSection`):
 *   - off: null;
 *   - locked: both managers' real points and league positions clear on top (the league's
 *     standings, which the free screens already load), the example duel blurred below with the
 *     lock and « Découvrir ». The paid duel read is not called;
 *   - member: the duel's four tabs, clear, from the duel read.
 *
 * `mine` is the reader's own side, `other` the league mate's; `otherTeamId` is the mate's team and
 * `size` the league's size.
 */
export function PlusDuelSection({
  access,
  mine,
  other,
  otherTeamId,
  size,
  leagueId = null,
}: {
  access: PlusAccess;
  mine: DuelSide | null;
  other: DuelSide;
  otherTeamId: string;
  size: number;
  /** The private league the sheet is showing: the league figures are read for it, with the rival. */
  leagueId?: string | null;
}) {
  if (access === "off") return null;
  return access === "locked" ? (
    <LockedDuel mine={mine} other={other} size={size} />
  ) : (
    <MemberDuel mine={mine} other={other} otherTeamId={otherTeamId} leagueId={leagueId} />
  );
}

/** The first letter of a name, for the round avatar (decoration; the name is written beside it). */
function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? "";
}

function Side({ side, size, own = false }: { side: DuelSide; size: number; own?: boolean }) {
  const { rankOf } = useSeasonFmt();
  return (
    <div className="pl-side">
      <span className={own ? "pl-av pl-av--own" : "pl-av"} aria-hidden="true">
        {initialOf(side.name)}
      </span>
      <span className="pl-name">
        <bdi>{side.name}</bdi>
      </span>
      <span className="pl-rank">{rankOf(side.rank, size)}</span>
    </div>
  );
}

function LockedDuel({
  mine,
  other,
  size,
}: {
  mine: DuelSide | null;
  other: DuelSide;
  size: number;
}) {
  const { t } = usePlusCopy();
  return (
    <PlusLockedSection
      testId="plus-duel-locked"
      headline={t("plus.in.duel_title")}
      head={
        <div className="pl-duel-head" data-testid="plus-real-duel-head">
          <div className="pl-fig">
            <b>
              {mine ? (
                <>
                  <Fig>{mine.totalScore}</Fig>
                  <i aria-hidden="true">–</i>
                </>
              ) : null}
              <Fig>{other.totalScore}</Fig>
            </b>
            <span>{t("plus.s2.b_points")}</span>
          </div>
          <div className="pl-sides">
            {mine ? <Side side={mine} size={size} own /> : <span />}
            <Side side={other} size={size} />
          </div>
        </div>
      }
    >
      <PlusDuelBody />
    </PlusLockedSection>
  );
}

function MemberDuel({
  mine,
  other,
  otherTeamId,
  leagueId,
}: {
  mine: DuelSide | null;
  other: DuelSide;
  otherTeamId: string;
  leagueId: string | null;
}) {
  const { t } = usePlusCopy();
  const { lang } = useI18n();
  const duel = useCardDuel(otherTeamId, true);
  // The rival's team goes with the league: the context then carries their side. A league that
  // fails to read leaves the duel with « — » for the league's figures, not an error panel.
  const league = useLeagueContext(true, leagueId, otherTeamId);
  const leagueLoading = league.isPending && league.fetchStatus !== "idle";
  const view = useMemo(
    () =>
      duel.data
        ? duelToSeasonView(
            duel.data,
            lang === "ar" ? "ar" : "fr",
            { you: mine?.name ?? "", rival: other.name },
            league.data ?? null,
          )
        : null,
    [duel.data, lang, mine?.name, other.name, league.data],
  );
  let body: ReactNode;
  if (duel.isPending || (duel.data && leagueLoading)) {
    body = (
      <>
        <div className="pl-skeleton" aria-hidden />
        <span className="sr-only">{t("plus.in.loading")}</span>
      </>
    );
  } else if (duel.isError) body = <p className="pl-note">{t("plus.in.failed")}</p>;
  else if (!duel.data) body = <p className="pl-note">{t("plus.in.duel_empty")}</p>;
  else if (!duel.data.opponent.historyVisible)
    body = <p className="pl-note">{t("plus.in.duel_private")}</p>;
  else if (!view) body = <p className="pl-note">{t("plus.in.duel_empty")}</p>;
  else
    body = (
      <SeasonProvider view={view}>
        <div className="plus-body ps-body">
          <PlusDuelBody />
        </div>
      </SeasonProvider>
    );
  return (
    <PlusEmbed data-testid="plus-duel-member" aria-labelledby="plus-duel-member-title">
      <h2 className="plus-h2 pl-title" id="plus-duel-member-title">
        {t("plus.s2.duel_title")}
      </h2>
      {body}
    </PlusEmbed>
  );
}
