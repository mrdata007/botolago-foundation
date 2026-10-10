import { useNavigate } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState, type JSX } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { SectionHeader } from "@/components/common/SectionHeader";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { useCardCopy, useCurvaCopy, useMomentCopy } from "@/components/manager-card/copy";
import { fill, fillText, ltr } from "@/components/manager-card/interpolate";
import { MomentLines } from "@/components/manager-card/moments/MomentLines";
import { ReplaySheet } from "@/components/manager-card/moments/ReplaySheet";
import { ShareCardSheet } from "@/components/manager-card/moments/ShareCardSheet";
import { FORMULA_KEYS } from "@/components/manager-card/copy";
import { fromMyCard } from "@/components/manager-card/to-profile";
import { STAT_CODES, type LineSpec, type ReplayItem } from "@/components/manager-card/types";
import { ui, UiButton, UiCard, UiHeader, UiLinkButton } from "@/components/ui-kit";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import { CardStage, RatingLine } from "./CardStage";
import { FounderBlock } from "./FounderBlock";
import { STICKY_COLUMN_CLASS } from "./figures";
import { cardView } from "./curva-state";
import { RevoirList } from "./RevoirList";
import { CurvaError, CurvaLoading, CurvaUnavailable } from "./StateBlocks";
import { StatTile } from "./StatTiles";
import { TierLadder } from "./TierLadder";
import { deriveReplayItems, stageReplayBeat } from "./replay-items";
import { useAllHistory } from "./use-all-history";
import { useCurvaScreen } from "./use-curva-screen";
import { useRatingBadge } from "./use-rating-change";
import { useBeatPlayback, useMotionAllowed } from "./use-replay-beat";
import { useViewEvent } from "./use-view-event";

/**
 * G2, « Votre carte » `/curva/carte` (plan section 4.2): where the number comes from and what
 * the card records. The card, then « D'où vient votre note » (the four statistics and why any is
 * empty), « Votre palier », the serial, the founder block for founders, « Revoir », and the ways
 * on. A guest or an account with no team has no card to explain and goes back to Curva.
 */
export function CurvaCardPage(): JSX.Element {
  const g = useCurvaScreen();
  const navigate = useNavigate();
  const copy = useCurvaCopy();
  const { state } = g;
  const away = state.kind === "guest" || state.kind === "no_team";
  useEffect(() => {
    if (away) void navigate({ to: "/curva", replace: true });
  }, [away, navigate]);
  return (
    <FantasyFrame bottomNav className={STICKY_COLUMN_CLASS}>
      <UiHeader title={copy.cardTitle} backTo="/curva" />
      {state.kind === "loading" || away ? <CurvaLoading /> : null}
      {state.kind === "error" ? <CurvaError retry={g.retry} /> : null}
      {state.kind === "unavailable" ? <CurvaUnavailable /> : null}
      {state.kind === "card" ? <CardPageBody card={state.card} /> : null}
    </FantasyFrame>
  );
}

/** The one line of state the card page asks WP4 for. */
const TIER_DOWN: readonly LineSpec["kind"][] = ["tier_down"];

function CardPageBody({ card }: { card: MyCardDto }): JSX.Element {
  const copy = useCurvaCopy();
  const cardCopy = useCardCopy();
  const moments = useMomentCopy();
  const view = cardView(card);
  const profile = fromMyCard(card);
  const history = useAllHistory(null);
  const [replay, setReplay] = useState<ReplayItem | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const { beat, play } = useBeatPlayback();
  const motion = useMotionAllowed();
  const badge = useRatingBadge({
    ovr: view.ovr,
    newSeason: view.newSeason,
    seasonId: card.season.id,
  });
  useViewEvent("curva_card_view");

  const items = useMemo(() => deriveReplayItems(card, history.rows), [card, history.rows]);
  const hasFormula = card.rulesVersion !== null && card.rulesVersion in FORMULA_KEYS;
  const rated = card.ovr !== null;

  return (
    <div
      className="pb-2 md:grid md:grid-cols-[352px_minmax(0,1fr)] md:gap-x-6 md:px-6"
      data-testid="curva-card-page"
    >
      <div className="md:sticky md:top-[calc(var(--topbar-h)+16px)] md:self-start">
        <CardStage profile={profile} beat={beat} flippable>
          <RatingLine
            ovr={view.ovr}
            tier={view.tier}
            provisional={card.provisional && !view.newSeason}
            counted={card.gameweeksCounted}
            min={card.minRated}
            statsFilled={view.statsFilled}
            season={view.newSeason ? view.numberSeason : null}
            formingLabel={moments.m3.label}
            closedSeason={card.seasonClosed ? card.season.label : null}
            change={badge}
          />
          {motion ? (
            <UiButton
              variant="ghost"
              size="sm"
              className="mt-1"
              onClick={() => play(stageReplayBeat(card))}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              {moments.m4.sheetReplay}
            </UiButton>
          ) : null}
        </CardStage>
      </div>

      <div
        className={cn(
          "mt-4 flex min-w-0 flex-col gap-5 md:mt-0 md:pt-5",
          ui.space.gutter,
          "md:px-0",
        )}
      >
        <section data-testid="curva-where" aria-label={copy.cardWhere}>
          <SectionHeader title={copy.cardWhere} />
          <UiCard padding="none" className="overflow-hidden">
            <p className={cn("px-4 pt-4 text-pretty", ui.text.secondary, ui.tone.muted)}>
              {rated ? copy.cardIntro : copy.cardIntroForming}
            </p>
            {card.provisional && rated ? (
              <p
                className={cn(
                  "px-4 pt-2 text-pretty",
                  ui.text.secondary,
                  "[font-weight:var(--ui-weight-strong)]",
                  ui.tone.default,
                )}
              >
                {fill(moments.m4.heroFreshLine, { final: cardCopy.finalRounds(card.minConfirmed) })}
              </p>
            ) : null}
            <ul className="mt-2 grid grid-cols-2 border-t border-[color:var(--ui-rule)]">
              {STAT_CODES.map((code, index) => (
                <StatTile
                  key={code}
                  code={code}
                  stat={card.stats[code]}
                  minRated={card.minRated}
                  className={cn(
                    index % 2 === 0 && "border-e border-[color:var(--ui-rule)]",
                    index < 2 && "border-b border-[color:var(--ui-rule)]",
                  )}
                />
              ))}
            </ul>
            {/* The formula sentences come with `FORMULA_KEYS[rulesVersion]`, empty in rules v1:
                the footer is true only where the rules say how the note is made. */}
            {hasFormula ? (
              <p className={cn("px-4 py-3 text-pretty", ui.text.meta, ui.tone.muted)}>
                {moments.m4.sheetFooter}
              </p>
            ) : null}
          </UiCard>
        </section>

        <section data-testid="curva-tier" aria-label={copy.cardTier}>
          <SectionHeader title={copy.cardTier} />
          <UiCard padding="sm">
            <TierLadder card={card} fallLine={<MomentLines card={card} kinds={TIER_DOWN} />} />
          </UiCard>
        </section>

        {card.serial ? (
          <p
            className={cn("text-pretty px-1", ui.text.secondary, ui.tone.muted)}
            data-testid="curva-serial"
          >
            {fill(copy.cardSerial, {
              serial: ltr(fillText(cardCopy.serial, { serial: card.serial })),
            })}
          </p>
        ) : null}

        <FounderBlock card={card} profile={profile} />

        {items.length > 0 ? (
          <section data-testid="curva-replay" aria-label={copy.revoirTitle}>
            <SectionHeader title={copy.revoirTitle} />
            <UiCard padding="md">
              <RevoirList
                items={items}
                card={card}
                onOpen={(item) => {
                  setReplay(item);
                  track("card_replay_open");
                }}
              />
            </UiCard>
          </section>
        ) : null}

        <div className="flex flex-col gap-3">
          {rated ? (
            <UiButton variant="gradient" onClick={() => setShareOpen(true)}>
              {moments.m4.sheetShare}
            </UiButton>
          ) : null}
          <UiLinkButton to="/curva/les-votres" variant="soft">
            {moments.m4.sheetLeague}
          </UiLinkButton>
        </div>
      </div>

      <ReplaySheet
        open={replay !== null}
        onOpenChange={(open) => {
          if (!open) setReplay(null);
        }}
        item={replay}
        current={card}
      />
      <ShareCardSheet open={shareOpen} onOpenChange={setShareOpen} card={card} />
    </div>
  );
}
