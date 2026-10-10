import { useNavigate } from "@tanstack/react-router";
import { useState, type JSX, type ReactNode } from "react";

import { useAuth } from "@/auth/AuthProvider";
import type { MyCardDto } from "@/backend/manager-card/contracts";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { useCurvaCopy, useMomentCopy } from "@/components/manager-card/copy";
import { CardBornPanel } from "@/components/manager-card/moments/CardBornPanel";
import { MomentHero } from "@/components/manager-card/moments/MomentHero";
import { MomentLines } from "@/components/manager-card/moments/MomentLines";
import { ShareCardSheet } from "@/components/manager-card/moments/ShareCardSheet";
import { useMomentGate } from "@/components/manager-card/moments/use-moment-gate";
import { fromMyCard } from "@/components/manager-card/to-profile";
import { ui, UiLinkButton, UiButton, UiPageTitle } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { useManagerCardStatus } from "@/services/manager-card-status";
import type { Club, Gameweek } from "@/types/domain";

import { CardStage, RatingLine, waitingBox } from "./CardStage";
import { useStageBeat } from "./use-stage-beat";
import { ClubBlock } from "./ClubBlock";
import { GuestHero } from "./GuestHero";
import {
  cardView,
  isOverForming,
  roundBlock,
  roundGlance,
  sinceRound,
  type HomeState,
} from "./curva-state";
import { IdentityLine } from "./IdentityLine";
import { NoTeamHero } from "./NoTeamHero";
import { PeopleBlock } from "./PeopleBlock";
import { RoundGlance } from "./RoundGlance";
import { SeasonsBlock } from "./SeasonsBlock";
import { CurvaError, CurvaLoading, CurvaUnavailable } from "./StateBlocks";
import { StatTiles } from "./StatTiles";
import { ThisRoundBlock } from "./ThisRoundBlock";
import { useClubBlock } from "./use-club-block";
import { useCurvaPeople } from "./use-curva-people";
import { useCurvaScreen } from "./use-curva-screen";
import { useViewEvent } from "./use-view-event";
import { QuietHeading, STICKY_COLUMN_CLASS } from "./figures";

/**
 * G1, the section home `/curva` (plan section 4.1): who I am in the stands. The card hangs on
 * its rail with the number under it in text and, under the identity line, one line for the next
 * round and its deadline; then the people of my leagues, my club and its next match, my seasons
 * (belonging first, plan 5.2 item 6), then what the journée means for the card, what its four
 * statistics say, and the way to share it.
 *
 * `CurvaHomeView` is the screen for a resolved state; `CurvaHome` is the data-bound page.
 */
export function CurvaHome(): JSX.Element {
  const g = useCurvaScreen();
  const { user } = useAuth();
  const status = useManagerCardStatus();
  const { screen, state } = g;
  return (
    <CurvaHomeView
      state={state}
      clubs={screen.clubs}
      gameweek={screen.gameweek}
      canCreate={screen.canCreate}
      loadingAction={screen.phase === "loading"}
      displayName={user?.displayName ?? ""}
      favouriteClubId={user?.favoriteClubId}
      minRated={status.minRated}
      retry={g.retry}
    />
  );
}

export function CurvaHomeView({
  state,
  clubs,
  gameweek,
  canCreate,
  loadingAction,
  displayName,
  favouriteClubId,
  minRated,
  retry,
}: {
  state: HomeState;
  clubs: readonly Club[];
  gameweek: Gameweek | null;
  canCreate: boolean;
  loadingAction: boolean;
  displayName: string;
  favouriteClubId?: string;
  minRated: number | null;
  retry: () => void;
}): JSX.Element {
  const copy = useCurvaCopy();
  return (
    <FantasyFrame bottomNav topBar="always" className={STICKY_COLUMN_CLASS}>
      <UiPageTitle title={copy.nav} />
      {state.kind === "loading" ? <CurvaLoading /> : null}
      {state.kind === "error" ? <CurvaError retry={retry} /> : null}
      {state.kind === "unavailable" ? <CurvaUnavailable /> : null}
      {state.kind === "guest" ? (
        <GuestHero
          audience="guest"
          clubs={clubs}
          closed={state.closed}
          canCreate={canCreate}
          loadingAction={loadingAction}
          minRated={minRated}
        />
      ) : null}
      {state.kind === "no_team" ? (
        <NoTeamHero
          clubs={clubs}
          closed={state.closed}
          canCreate={canCreate}
          loadingAction={loadingAction}
          displayName={displayName}
          favouriteClubId={favouriteClubId}
          minRated={minRated}
        />
      ) : null}
      {state.kind === "card" ? (
        <OwnerHome card={state.card} clubs={clubs} gameweek={gameweek} />
      ) : null}
    </FantasyFrame>
  );
}

/** The signed-in manager's home: the stage and, beside or under it, the five blocks. */
export function OwnerHome({
  card,
  clubs,
  gameweek,
}: {
  card: MyCardDto;
  clubs: readonly Club[];
  gameweek: Gameweek | null;
}): JSX.Element {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const moments = useMomentCopy();
  const curva = useCurvaCopy();
  const [shareOpen, setShareOpen] = useState(false);
  const gate = useMomentGate("curva", card);
  const view = cardView(card);
  const profile = fromMyCard(card);
  const people = useCurvaPeople(true);
  const clubBlock = useClubBlock(card, clubs, people.league?.name ?? null, people.rows);
  const beat = useStageBeat({
    kind: "owner",
    counted: card.gameweeksCounted,
    suppress: gate.hero !== null,
  });
  useViewEvent("curva_view_manager");

  const block = roundBlock(card, { gameweek, now: Date.now() });
  const glance = roundGlance(block, { gameweek, now: Date.now() });
  const hasNumber = card.ovr !== null;

  const over = isOverForming(block);
  const rating = over ? null : (
    <RatingLine
      ovr={view.ovr}
      tier={view.tier}
      provisional={card.provisional && !view.newSeason}
      counted={card.gameweeksCounted}
      min={card.minRated}
      statsFilled={view.statsFilled}
      season={view.newSeason ? view.numberSeason : null}
      formingLabel={moments.m3.label}
    />
  );
  const identity = (
    <IdentityLine
      since={sinceRound(card)}
      founder={view.founder}
      club={card.club ? card.club.shortName[lang] || card.club.shortName.fr : null}
      leagueCount={people.leaguesPending ? null : people.leagues.length}
    />
  );
  const action: ReactNode = hasNumber ? (
    <UiButton variant="gradient" onClick={() => setShareOpen(true)} data-testid="curva-share">
      {moments.m4.sheetShare}
    </UiButton>
  ) : (
    <UiLinkButton to="/fantasy/leagues" variant="soft">
      {t("fantasy.hub.invite_share")}
    </UiLinkButton>
  );

  return (
    <div
      className="pb-2 md:grid md:grid-cols-[352px_minmax(0,1fr)] md:gap-x-6 md:px-6"
      data-testid="curva-owner"
    >
      <div className="empty:hidden md:col-span-2" data-hero-slot="" data-testid="curva-hero-slot">
        <MomentHero
          surface="curva"
          card={card}
          profile={profile}
          onDetail={() => void navigate({ to: "/curva/carte" })}
          onShare={() => setShareOpen(true)}
        />
        <CardBornPanel
          surface="curva"
          card={card}
          profile={profile}
          nextDeadline={gameweek?.deadline ?? null}
        />
      </div>

      {/* While a hero is in the slot above, it carries the card (playing its beat); this stage
          keeps the rating line and the identity line and hides its own copy of the card. */}
      <div
        className={cn(
          "md:sticky md:top-[calc(var(--topbar-h)+16px)] md:self-start",
          "[[data-hero-slot]:not(:empty)~&_[data-stage-card]]:hidden",
        )}
      >
        <CardStage
          profile={profile}
          beat={beat}
          fitHeight
          waiting={over ? null : waitingBox(view.ovr, card.gameweeksCounted, card.minRated)}
        >
          {rating}
        </CardStage>
        <div className="mt-1 px-4 max-md:rtl:mt-0">{identity}</div>
        {glance ? <RoundGlance round={glance} composeLabel={t("fpl.pick_team")} /> : null}
        <div className={cn("mt-4 hidden md:block", ui.space.gutter, "md:px-0")}>{action}</div>
      </div>

      {/* Belonging leads: the people, the club, the seasons. How the note is made comes after,
          and is quiet. */}
      <div
        className={cn(
          "mt-5 flex min-w-0 flex-col gap-5 md:mt-0 md:pt-5",
          ui.space.gutter,
          "md:px-0",
        )}
      >
        <PeopleBlock
          league={people.league}
          rows={people.rows}
          loading={people.leaguesPending || people.standingsPending || people.cardsPending}
          failed={people.leaguesError || people.standingsError}
          retry={people.retry}
          noLeague={!people.leaguesPending && !people.leaguesError && people.leagues.length === 0}
          cardsFailed={people.cardsError}
          retryCards={people.retryCards}
        />
        <ClubBlock
          dto={card.club}
          club={clubBlock.club}
          mates={clubBlock.mates}
          spotlight={clubBlock.spotlight}
          spotlightFailed={clubBlock.spotlightFailed}
          retry={clubBlock.retry}
          clubById={clubBlock.clubById}
        />
        <SeasonsBlock card={card} />
        <ThisRoundBlock
          block={block}
          composeLabel={t("fpl.pick_team")}
          lines={<MomentLines card={card} />}
        />
        <section data-testid="curva-stats" aria-label={curva.statsTitle}>
          <QuietHeading>{curva.statsTitle}</QuietHeading>
          <StatTiles card={card} />
        </section>
        <div className="md:hidden">{action}</div>
      </div>

      <ShareCardSheet open={shareOpen} onOpenChange={setShareOpen} card={card} />
    </div>
  );
}
