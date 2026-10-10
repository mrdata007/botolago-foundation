import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type JSX } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { SectionHeader } from "@/components/common/SectionHeader";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { useCurvaCopy, useMomentCopy } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { ReplaySheet } from "@/components/manager-card/moments/ReplaySheet";
import type { ReplayItem } from "@/components/manager-card/types";
import { ui, UiButton, UiCard, UiErrorState, UiHeader, UiSkeleton } from "@/components/ui-kit";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import { Figure } from "./figures";
import { HistoryTable } from "./HistoryTable";
import { RevoirList } from "./RevoirList";
import { SeasonRack } from "./SeasonRack";
import { Sparkline } from "./Sparkline";
import { CurvaError, CurvaLoading, CurvaUnavailable } from "./StateBlocks";
import { deriveReplayItems } from "./replay-items";
import { seasonsNewestFirst } from "./season-profile";
import { useAllHistory } from "./use-all-history";
import { useCurvaScreen } from "./use-curva-screen";
import { useViewEvent } from "./use-view-event";

/** The table shows this many journées, and this many more each time « Afficher plus » is pressed. */
export const HISTORY_PAGE = 20;

/**
 * G6, « Vos saisons » `/curva/saisons?saison=<id>` (plan 4.6): the record. Every season hangs
 * from the rack; the one chosen (the current one without `?saison=`) shows how many journées
 * counted, the note it first had, the line of its notes, the table of them, and « Revoir ». A
 * guest or an account with no team has no seasons and goes back to Curva.
 */
export function CurvaSeasonsPage(): JSX.Element {
  const g = useCurvaScreen();
  const navigate = useNavigate();
  const copy = useCurvaCopy();
  const { state } = g;
  const away = state.kind === "guest" || state.kind === "no_team";
  useEffect(() => {
    if (away) void navigate({ to: "/curva", replace: true });
  }, [away, navigate]);
  return (
    <FantasyFrame bottomNav>
      <UiHeader title={copy.seasonsTitle} backTo="/curva" />
      {state.kind === "loading" || away ? <CurvaLoading /> : null}
      {state.kind === "error" ? <CurvaError retry={g.retry} /> : null}
      {state.kind === "unavailable" ? <CurvaUnavailable /> : null}
      {state.kind === "card" ? <SeasonsBody card={state.card} /> : null}
    </FantasyFrame>
  );
}

function SeasonsBody({ card }: { card: MyCardDto }): JSX.Element {
  const copy = useCurvaCopy();
  const moments = useMomentCopy();
  const navigate = useNavigate();
  const search = useSearch({ from: "/curva/saisons" });
  const seasons = useMemo(() => seasonsNewestFirst(card), [card]);
  const selected =
    seasons.find((season) => season.seasonId === search.saison) ??
    seasons.find((season) => season.seasonId === card.season.id) ??
    seasons[0] ??
    null;
  const current = selected?.seasonId === card.season.id;
  const history = useAllHistory(current ? null : (selected?.seasonId ?? null));
  const [shown, setShown] = useState(HISTORY_PAGE);
  const [replay, setReplay] = useState<ReplayItem | null>(null);
  useViewEvent("curva_seasons_view");
  // A different season starts at its newest journées again.
  useEffect(() => setShown(HISTORY_PAGE), [selected?.seasonId]);

  const rows = history.rows;
  const firstRated = useMemo(
    () =>
      [...rows]
        .filter((row) => row.ovr !== null)
        .sort((a, b) => a.gameweekSeq - b.gameweekSeq)[0] ?? null,
    [rows],
  );
  const items = useMemo(
    () => deriveReplayItems(card, rows, selected?.seasonId ?? card.season.id),
    [card, rows, selected?.seasonId],
  );

  if (!selected) {
    return (
      <div className={cn("pt-6", ui.space.gutter)}>
        <UiCard padding="lg">
          <p className={cn("text-center", ui.text.secondary, ui.tone.muted)}>{copy.seasonsEmpty}</p>
        </UiCard>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col gap-5 pb-2 pt-4", ui.space.gutter)}
      data-testid="curva-seasons-page"
    >
      <section aria-label={copy.seasonsTitle}>
        <UiCard padding="md">
          <SeasonRack
            card={card}
            seasons={seasons}
            selectedId={selected.seasonId}
            size={56}
            onPick={(season) =>
              void navigate({
                to: "/curva/saisons",
                search: { saison: season.seasonId },
                replace: true,
              })
            }
          />
        </UiCard>
      </section>

      <section data-testid="curva-season-summary">
        <SectionHeader
          title={fill(copy.seasonsSeason, { season: <Figure>{selected.label}</Figure> })}
        />
        <UiCard padding="md" className="flex flex-col gap-3">
          <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
            {copy.countedRounds(selected.gameweeksCounted)}
          </p>
          {firstRated && firstRated.ovr !== null ? (
            <p className={cn(ui.text.secondary, ui.tone.muted)}>
              {fill(copy.seasonsFirstRating, { gw: firstRated.gameweekSeq, ovr: firstRated.ovr })}
            </p>
          ) : null}
          {history.error ? (
            <UiErrorState title={copy.seasonsError} onRetry={history.refetch} />
          ) : history.pending ? (
            <div role="status" aria-hidden className="space-y-2">
              <UiSkeleton className="h-16" />
            </div>
          ) : rows.length === 0 ? (
            <p className={cn("text-pretty", ui.text.secondary, ui.tone.muted)}>
              {copy.seasonsEmpty}
            </p>
          ) : (
            <Sparkline rows={rows} />
          )}
        </UiCard>
      </section>

      {rows.length > 0 ? (
        <section data-testid="curva-history" aria-label={copy.seasonsTitle}>
          <UiCard padding="none" className="overflow-hidden">
            <HistoryTable
              rows={rows.slice(0, shown)}
              caption={fill(copy.seasonsSeason, { season: selected.label })}
            />
            {rows.length > shown ? (
              <div className={cn("p-3", ui.rule.blockStart)}>
                <UiButton variant="soft" onClick={() => setShown((n) => n + HISTORY_PAGE)}>
                  {copy.seasonsMore}
                </UiButton>
              </div>
            ) : null}
          </UiCard>
        </section>
      ) : null}

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

      <ReplaySheet
        open={replay !== null}
        onOpenChange={(open) => {
          if (!open) setReplay(null);
        }}
        item={replay}
        current={card}
      />
    </div>
  );
}
