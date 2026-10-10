import { Link } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { ui } from "@/components/ui-kit";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useManagerCards, useMyManagerCard } from "@/services/use-manager-card";

import { CardToken } from "../CardToken";
import { useCardStrings, useCurvaCopy, useMomentCopy } from "../copy";
import { fill } from "../interpolate";
import { fromMember } from "../to-profile";
import { newlyRated } from "./inline-model";
import { useLeagueTeamIds } from "./league-team-ids";

/** At most three minis and three names: a band is a glance, never a list. */
const MAX_SHOWN = 3;

/**
 * The line above a private league's table when members' first numbers have just landed (plan
 * M5a): up to three 24 px minis hung on a rail, as the stands hold the scarves, and « Nouvelles
 * notes après la J4 : Karim, Salma ». Names only,
 * never the numbers, so no low number becomes a headline. It is a weekly state, not a moment: it
 * is not acknowledged, and it is there while the latest evaluated journée is the one those
 * members were first rated in. The reader is never named, and members are listed in the league's
 * own order.
 *
 * Nothing renders when the cards did not load, the reader's own card is not known, or nobody is
 * new.
 */
export function LeagueCardBand({
  order,
  ownTeamId,
}: {
  /** The standings' team ids, in the league's own order. */
  order: readonly string[];
  ownTeamId: string | null;
}) {
  const ids = useLeagueTeamIds(order);
  const cards = useManagerCards(ids);
  const mine = useMyManagerCard();
  const latest = mine.data?.throughGameweekSeq ?? null;
  if (latest === null || !cards.data) return null;
  const byTeam = new Map(cards.data.map((card) => [card.teamId, card]));
  const ordered = ids.flatMap((teamId) => {
    const card = byTeam.get(teamId);
    return card ? [card] : [];
  });
  const fresh = newlyRated(ordered, latest, ownTeamId).slice(0, MAX_SHOWN);
  if (fresh.length === 0) return null;
  return (
    <BandView
      gameweek={latest}
      members={fresh.map((card) => ({ id: card.teamId, name: card.name, card }))}
    />
  );
}

function BandView({
  gameweek,
  members,
}: {
  gameweek: number;
  members: Array<{ id: string; name: string; card: Parameters<typeof fromMember>[0] }>;
}) {
  const moment = useMomentCopy();
  const strings = useCardStrings();
  useEffect(() => {
    track("card_league_band_view");
  }, []);
  const names: ReactNode[] = members.flatMap((member, index) => [
    index > 0 ? strings.a11y.separator : null,
    <bdi key={member.id} dir="auto">
      {member.name}
    </bdi>,
  ]);
  return (
    <div className="mt-3" data-testid="league-card-band">
      {/* The stands: a rail across the column, and the new cards hung from it. */}
      <span
        aria-hidden
        className="block h-1.5 rounded-full bg-[color:var(--ui-rule-strong)]"
        data-testid="league-card-band-rail"
      />
      <div className="-mt-0.5 flex items-start gap-3 ps-3">
        <span aria-hidden className="flex shrink-0 items-start gap-1.5">
          {members.map((member) => (
            <CardToken key={member.id} profile={fromMember(member.card)} size={24} />
          ))}
        </span>
        <p className={cn("min-w-0 text-pretty pt-2", ui.text.secondary, ui.tone.default)}>
          {fill(moment.m5.band, { gw: gameweek, names: <>{names}</> })}
        </p>
      </div>
    </div>
  );
}

/**
 * « Comparer les cartes de la ligue » (plan M5): the way from a league's table to « Les vôtres »,
 * where the cards sit beside each other and the face-à-face opens. A plain muted line after the
 * band, not a box: the table is what this page is for, and its rows and report menus are as they
 * were. The comparison has its own page.
 */
export function LeagueCompareLink({ leagueId }: { leagueId: string }) {
  const copy = useCurvaCopy();
  return (
    <Link
      to="/curva/les-votres"
      search={{ ligue: leagueId }}
      data-testid="league-compare-link"
      className={cn(
        "mt-1 flex min-h-11 items-center self-start",
        ui.text.meta,
        ui.tone.muted,
        "underline underline-offset-4",
        ui.focus,
      )}
    >
      {copy.peopleCompare}
    </Link>
  );
}
