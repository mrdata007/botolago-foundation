import { ChevronRight } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { ui, UiLinkButton } from "@/components/ui-kit";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import { CardToken } from "../CardToken";
import { useCardStrings, useGradinsCopy, useMomentCopy } from "../copy";
import { fill } from "../interpolate";
import { fromMember } from "../to-profile";
import { newlyRated } from "./inline-model";
import { useLeagueCards } from "./LeagueRowMini";

/** At most three minis and three names: a band is a glance, never a list. */
const MAX_SHOWN = 3;

/**
 * The line above a private league's table when members' first numbers have just landed (plan
 * M5a): up to three 24 px minis and « Nouvelles notes après la J4 : Karim, Salma ». Names only,
 * never the numbers, so no low number becomes a headline. It is a weekly state, not a moment: it
 * is not acknowledged, and it is there while the latest evaluated journée is the one those
 * members were first rated in. The reader is never named, and members are listed in the league's
 * own order.
 *
 * Nothing renders when the section is not live, the cards did not load, or nobody is new.
 */
export function LeagueCardBand({ order }: { order: readonly string[] }) {
  const cards = useLeagueCards();
  if (!cards || cards.latestEvaluatedGameweek === null) return null;
  const ordered = order.flatMap((teamId) => {
    const card = cards.byTeam.get(teamId);
    return card ? [card] : [];
  });
  const fresh = newlyRated(ordered, cards.latestEvaluatedGameweek, cards.ownTeamId).slice(
    0,
    MAX_SHOWN,
  );
  if (fresh.length === 0) return null;
  return (
    <BandView
      gameweek={cards.latestEvaluatedGameweek}
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
    <div
      className={cn(
        "mt-3 flex min-h-12 items-center gap-2.5 px-3 py-2",
        ui.radius.card,
        ui.surface.sunken,
      )}
      data-testid="league-card-band"
    >
      <span aria-hidden className="flex shrink-0 items-center gap-1">
        {members.map((member) => (
          <CardToken key={member.id} profile={fromMember(member.card)} size={24} />
        ))}
      </span>
      <p className={cn("min-w-0 text-pretty", ui.text.secondary, ui.tone.default)}>
        {fill(moment.m5.band, { gw: gameweek, names: <>{names}</> })}
      </p>
    </div>
  );
}

/**
 * « Comparer les cartes de la ligue » (plan M5): the way from a league's table to « Les vôtres »,
 * where the cards sit beside each other and the face-à-face opens. The Fantasy league page keeps
 * its rows and report menus as they are; the comparison has its own page.
 */
export function LeagueCompareLink({ leagueId }: { leagueId: string }) {
  const copy = useGradinsCopy();
  return (
    <UiLinkButton
      to="/gradins/les-votres"
      search={{ ligue: leagueId }}
      variant="soft"
      className="mt-3"
      data-testid="league-compare-link"
    >
      {copy.peopleCompare}
      <ChevronRight className="h-4 w-4" aria-hidden />
    </UiLinkButton>
  );
}
