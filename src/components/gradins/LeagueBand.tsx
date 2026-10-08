import { CardToken } from "@/components/manager-card/CardToken";
import { useCardCopy, useMomentCopy } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { fromMember } from "@/components/manager-card/to-profile";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

import { PersonName } from "./figures";
import type { PeopleRow } from "./people";

/**
 * « Nouvelles notes après la J7 : Karim, Salma » (M5a): the people of the league whose first note
 * is the latest evaluated journée, up to three, hung on the same barrier rail as the card: the
 * rail runs across, their minis hang from it, and the sentence names them and nothing else, so no
 * low number becomes a headline. It sits on the page, not in a white card: it is the stands, not a
 * notice. A weekly state, not a moment: nothing to acknowledge.
 */
export function LeagueBand({ rows, gameweek }: { rows: readonly PeopleRow[]; gameweek: number }) {
  const moments = useMomentCopy();
  const card = useCardCopy();
  const shown = rows.slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <div className="relative pt-2" data-testid="gradins-band">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1.5 rounded-full bg-[color:var(--ui-rule-strong)]"
      />
      <div className="flex items-start gap-4 pt-2">
        <span className="flex shrink-0 items-start gap-1" aria-hidden>
          {shown.map((row) =>
            row.card ? (
              <CardToken key={row.standing.managerId} profile={fromMember(row.card)} size={44} />
            ) : null,
          )}
        </span>
        <p className={cn("min-w-0 flex-1 text-pretty pt-1", ui.text.secondary, ui.tone.default)}>
          {fill(moments.m5.band, {
            gw: gameweek,
            names: shown.map((row, index) => (
              <span key={row.standing.managerId}>
                {index > 0 ? card.a11y.separator : ""}
                <PersonName>{row.name}</PersonName>
              </span>
            )),
          })}
        </p>
      </div>
    </div>
  );
}
