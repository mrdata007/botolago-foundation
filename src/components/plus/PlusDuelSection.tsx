import { useMemo, type ReactNode } from "react";

import { useI18n } from "@/i18n/provider";
import { useCardDuel } from "@/services/use-premium-card-reads";

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
}: {
  access: PlusAccess;
  mine: DuelSide | null;
  other: DuelSide;
  otherTeamId: string;
  size: number;
}) {
  if (access === "off") return null;
  return access === "locked" ? (
    <LockedDuel mine={mine} other={other} size={size} />
  ) : (
    <MemberDuel mine={mine} other={other} otherTeamId={otherTeamId} />
  );
}

function Side({ side, size }: { side: DuelSide; size: number }) {
  const { rankOf } = useSeasonFmt();
  return (
    <div className="pl-side">
      <div className="pl-fig">
        <b>
          <Fig>{side.totalScore}</Fig>
        </b>
        <span className="pl-name">
          <bdi>{side.name}</bdi>
        </span>
      </div>
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
          {mine ? <Side side={mine} size={size} /> : <span />}
          <Side side={other} size={size} />
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
}: {
  mine: DuelSide | null;
  other: DuelSide;
  otherTeamId: string;
}) {
  const { t } = usePlusCopy();
  const { lang } = useI18n();
  const duel = useCardDuel(otherTeamId, true);
  const view = useMemo(
    () =>
      duel.data
        ? duelToSeasonView(duel.data, lang === "ar" ? "ar" : "fr", {
            you: mine?.name ?? "",
            rival: other.name,
          })
        : null,
    [duel.data, lang, mine?.name, other.name],
  );
  let body: ReactNode;
  if (duel.isPending) {
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
