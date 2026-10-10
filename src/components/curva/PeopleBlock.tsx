import type { ReactNode } from "react";

import { SectionHeaderLink } from "@/components/common/SectionHeader";
import { Trans } from "@/components/common/Trans";
import { CreateLeagueInvite } from "@/components/fantasy/CreateLeagueInvite";
import { useCurvaCopy } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { ui, UiCard, UiErrorState, UiSkeleton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { League } from "@/types/fantasy";

import { PersonName } from "./figures";
import { LeagueRows } from "./LeagueRows";
import { neighbours, type PeopleRow } from "./people";

/**
 * The block's heading and the way to the whole table. It is `SectionHeader`'s line (the display
 * face, the link a 44 px target at the inline end) with one difference: when the two do not fit
 * one line, the link goes under the heading instead of cutting it.
 *
 * `SectionHeader` keeps them on one line and truncates the title. From 768 px the column beside
 * the 352 px card is 248 px wide, and « Les vôtres » (103 px) with « Voir les cartes de la ligue »
 * (173 px) and the 12 px between them need 288: the heading was cut to « Les … ». Neither is ever
 * cut here: the heading takes its own line when it must, and the link's box overhangs the line it
 * shares, as `SectionHeader`'s does, so a header with the link beside it and one with it below
 * take the same room per line.
 */
function PeopleHeader({ title, action }: { title: string; action: ReactNode }) {
  return (
    <header className="min-w-0 pb-2.5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3">
        <h2 className={cn("min-w-0 [overflow-wrap:anywhere]", ui.display.section, ui.tone.default)}>
          <Trans text={title} accentClassName={ui.tone.ink} />
        </h2>
        {action ? <div className="-my-2 shrink-0 -ms-2">{action}</div> : null}
      </div>
    </header>
  );
}

/**
 * « Les vôtres », on G1: the first private league (or the one this phone remembered), its name,
 * and three rows in the league's points order, the one above you, you, the one below, each with
 * the card's mini and what the card says. A link goes to the whole table (G3). Plan 4.1.
 *
 * With no private league the block invites one (the existing create-and-invite flow); a league
 * with only you in it says so. Nothing here ranks by rating.
 */
export function PeopleBlock({
  league,
  rows,
  loading,
  failed,
  retry,
  noLeague,
  cardsFailed,
  retryCards,
}: {
  league: League | null;
  rows: readonly PeopleRow[];
  loading: boolean;
  failed: boolean;
  retry: () => void;
  noLeague: boolean;
  cardsFailed: boolean;
  retryCards: () => void;
}) {
  const copy = useCurvaCopy();
  const { t } = useI18n();
  const alone =
    league !== null && !loading && !failed && rows.length > 0 && rows.every((r) => r.own);
  return (
    <section data-testid="curva-people" aria-label={copy.peopleTitle}>
      <PeopleHeader
        title={copy.peopleTitle}
        action={
          league ? (
            <SectionHeaderLink to="/curva/les-votres" search={{ ligue: league.id }}>
              {copy.peopleViewLeague}
            </SectionHeaderLink>
          ) : null
        }
      />
      {noLeague ? (
        <UiCard padding="md">
          <p className={cn("text-pretty", ui.text.secondary, ui.tone.muted)}>{copy.peopleEmpty}</p>
          <CreateLeagueInvite />
        </UiCard>
      ) : failed ? (
        <UiErrorState onRetry={retry} />
      ) : loading || !league ? (
        <UiCard padding="none" className="overflow-hidden" testId="curva-people-loading">
          <div role="status" aria-hidden className="space-y-px">
            <UiSkeleton className="h-14 rounded-none" />
            <UiSkeleton className="h-14 rounded-none" />
            <UiSkeleton className="h-14 rounded-none" />
          </div>
        </UiCard>
      ) : (
        <UiCard padding="none" className="overflow-hidden">
          <p
            className={cn(
              "flex min-h-[var(--ui-row-min)] items-center px-4",
              ui.rule.block,
              ui.text.bodyStrong,
              ui.tone.default,
            )}
          >
            <span className="min-w-0 truncate">
              <PersonName>{league.name}</PersonName>
            </span>
          </p>
          {alone ? (
            <p className={cn("p-4 text-pretty", ui.text.secondary, ui.tone.muted)}>
              {fill(copy.peopleAlone, { league: <PersonName>{league.name}</PersonName> })}
            </p>
          ) : (
            <LeagueRows rows={neighbours(rows)} caption={league.name} />
          )}
          {cardsFailed ? (
            <p
              className={cn(
                "flex items-center justify-between gap-3 px-4 py-2",
                ui.rule.blockStart,
                ui.text.meta,
                ui.tone.muted,
              )}
            >
              <span>{copy.peopleCardsFailed}</span>
              <button
                type="button"
                onClick={retryCards}
                className={cn(
                  "min-h-[var(--ui-tap-min)] px-2",
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-heavy)]",
                  ui.tone.ink,
                  ui.focus,
                )}
              >
                {t("state.retry")}
              </button>
            </p>
          ) : null}
        </UiCard>
      )}
    </section>
  );
}
