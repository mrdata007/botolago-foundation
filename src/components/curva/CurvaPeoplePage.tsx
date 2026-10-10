import { useNavigate, useSearch } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type JSX } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { CreateLeagueInvite } from "@/components/fantasy/CreateLeagueInvite";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { useCurvaCopy, useMomentCopy } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { DEVICE_KEYS, hasSeen, markSeen, rememberLeague } from "@/components/manager-card/storage";
import {
  ui,
  UiCard,
  UiChip,
  UiErrorState,
  UiHeader,
  UiIconButton,
  UiLinkButton,
  UiSkeleton,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import { PersonName } from "./figures";
import { HeadToHeadSheet } from "./HeadToHeadSheet";
import { LeagueBand } from "./LeagueBand";
import { LeagueRows } from "./LeagueRows";
import { newlyRated, sameClub, type PeopleRow } from "./people";
import { CurvaError, CurvaLoading, CurvaUnavailable } from "./StateBlocks";
import { useCurvaPeople } from "./use-curva-people";
import { useCurvaScreen } from "./use-curva-screen";
import { useViewEvent } from "./use-view-event";

/**
 * G3, « Les vôtres » `/curva/les-votres?ligue=<id>` (plan 4.3): my friends' cards beside mine.
 * One chip per private league, then the league's own table in its own points order (never sorted
 * by rating) with each row's mini and what its card says; a tap on a name opens the face-à-face.
 * A guest or an account with no team has no leagues here and goes back to Curva.
 */
export function CurvaPeoplePage(): JSX.Element {
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
      <UiHeader title={copy.peopleTitle} backTo="/curva" />
      {state.kind === "loading" || away ? <CurvaLoading /> : null}
      {state.kind === "error" ? <CurvaError retry={g.retry} /> : null}
      {state.kind === "unavailable" ? <CurvaUnavailable /> : null}
      {state.kind === "card" ? <PeopleBody card={state.card} /> : null}
    </FantasyFrame>
  );
}

function PeopleBody({ card }: { card: MyCardDto }): JSX.Element {
  const { t, lang } = useI18n();
  const copy = useCurvaCopy();
  const moments = useMomentCopy();
  const navigate = useNavigate();
  const search = useSearch({ from: "/curva/les-votres" });
  const people = useCurvaPeople(true, search.ligue);
  const [open, setOpen] = useState<PeopleRow | null>(null);
  const [onlyClub, setOnlyClub] = useState(false);
  const [hint, setHint] = useState(false);
  useViewEvent("curva_people_view");

  // The compare hint shows once per phone; blocked storage counts as seen.
  useEffect(() => setHint(!hasSeen(DEVICE_KEYS.compareHint)), []);
  const closeHint = () => {
    markSeen(DEVICE_KEYS.compareHint);
    setHint(false);
  };

  const { league, rows } = people;
  const band = useMemo(
    () => newlyRated(rows, card.throughGameweekSeq),
    [rows, card.throughGameweekSeq],
  );
  useEffect(() => {
    if (band.length > 0) track("card_league_band_view");
  }, [band.length]);

  const clubRows = useMemo(
    () => (card.club ? sameClub(rows, card.club.id) : []),
    [rows, card.club],
  );
  const filtering = onlyClub && card.club !== null;
  const shown = filtering ? rows.filter((row) => row.own || clubRows.includes(row)) : rows;

  // The reader's own row is brought into view when the table is longer than the screen.
  const ownRow = useRef<HTMLTableRowElement | null>(null);
  const scrolled = useRef<string | null>(null);
  useEffect(() => {
    const element = ownRow.current;
    if (!element || !league || scrolled.current === league.id || people.standingsPending) return;
    scrolled.current = league.id;
    const box = element.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight) {
      element.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }, [league, rows, people.standingsPending]);

  const choose = (id: string) => {
    rememberLeague(id);
    setOnlyClub(false);
    void navigate({ to: "/curva/les-votres", search: { ligue: id }, replace: true });
  };

  // The table waits for the cards too, so the band and the minis arrive with the rows, not after.
  const loading = people.leaguesPending || people.standingsPending || people.cardsPending;
  const alone = rows.length > 0 && rows.every((row) => row.own);
  const canInvite = league !== null && (league.role === "owner" || league.role === "creator");
  const clubName = card.club ? card.club.shortName[lang] || card.club.shortName.fr : "";

  return (
    <div
      className={cn("flex flex-col gap-4 pb-2 pt-4", ui.space.gutter)}
      data-testid="curva-people-page"
    >
      {people.leaguesError ? (
        <UiErrorState onRetry={people.retry} />
      ) : !people.leaguesPending && people.leagues.length === 0 ? (
        <UiCard padding="md">
          <p className={cn("text-pretty", ui.text.secondary, ui.tone.muted)}>{copy.peopleEmpty}</p>
          <CreateLeagueInvite />
        </UiCard>
      ) : (
        <>
          <div role="group" aria-label={copy.peopleTitle} className="flex flex-wrap gap-2">
            {people.leagues.map((item) => (
              <UiChip
                key={item.id}
                selected={item.id === league?.id}
                onClick={() => choose(item.id)}
                className="max-w-full"
              >
                <span className="truncate">
                  <PersonName>{item.name}</PersonName>
                </span>
              </UiChip>
            ))}
            {card.club && league && rows.length > 1 ? (
              <UiChip selected={onlyClub} onClick={() => setOnlyClub((on) => !on)}>
                <span>
                  {fill(copy.peopleSameClub, { club: <PersonName>{clubName}</PersonName> })}
                </span>
              </UiChip>
            ) : null}
          </div>

          {band.length > 0 && card.throughGameweekSeq !== null ? (
            <LeagueBand rows={band} gameweek={card.throughGameweekSeq} />
          ) : null}

          {people.standingsError ? (
            <UiErrorState onRetry={people.retry} />
          ) : loading || !league ? (
            <div role="status" aria-label={t("state.loading")} className="space-y-2">
              <UiSkeleton className="h-16" />
              <UiSkeleton className="h-16" />
              <UiSkeleton className="h-16" />
            </div>
          ) : alone ? (
            <UiCard padding="lg" className="flex flex-col items-center gap-4">
              <p className={cn("text-pretty text-center", ui.text.body, ui.tone.default)}>
                {fill(copy.peopleAlone, { league: <PersonName>{league.name}</PersonName> })}
              </p>
              {canInvite ? (
                <UiLinkButton
                  to="/fantasy/leagues/$leagueId"
                  params={{ leagueId: league.id }}
                  variant="soft"
                >
                  {t("fantasy.leagues.invite_friends")}
                </UiLinkButton>
              ) : null}
            </UiCard>
          ) : (
            <UiCard padding="none" className="overflow-hidden">
              <LeagueRows
                rows={shown}
                caption={league.name}
                head
                onOpen={(row) => {
                  if (row.card && !row.own) setOpen(row);
                }}
                ownRef={(element) => {
                  ownRow.current = element;
                }}
              />
              {people.cardsError ? (
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
                    onClick={people.retryCards}
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

          {hint && rows.length > 0 && !alone && !loading ? (
            <p
              className={cn("flex items-center gap-2", ui.text.meta, ui.tone.muted)}
              data-testid="curva-compare-hint"
            >
              <span className="min-w-0 flex-1 text-pretty">{moments.m5.hintCompare}</span>
              <UiIconButton variant="ghost" aria-label={t("fpl.close")} onClick={closeHint}>
                <X aria-hidden />
              </UiIconButton>
            </p>
          ) : null}

          {!alone && canInvite && league ? (
            <UiLinkButton
              to="/fantasy/leagues/$leagueId"
              params={{ leagueId: league.id }}
              variant="soft"
            >
              {t("fantasy.leagues.invite_friends")}
            </UiLinkButton>
          ) : null}
        </>
      )}
      <HeadToHeadSheet
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
        mine={card}
        row={open}
      />
    </div>
  );
}
