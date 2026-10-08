import { Fragment, type ReactNode } from "react";

import { useGradinsCopy, useMomentCopy } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

import { PersonName } from "./figures";

/**
 * The line under the rating: the four belongings in a sentence, each part only when it is known.
 * « Depuis la J5 · Fondateur 2026 · Raja · 2 ligues ». Plan 4.1: omit any unknown part. The name
 * is on the card and in its label, and never in a heading.
 */
export function IdentityLine({
  since,
  founder,
  club,
  leagueCount,
}: {
  /** The first counted journée. */
  since: number | null;
  founder: boolean;
  /** The club's short name in the interface language. */
  club: string | null;
  /** The private leagues the manager is in; 0 or null: no part. */
  leagueCount: number | null;
}) {
  const copy = useGradinsCopy();
  const moments = useMomentCopy();
  const parts: ReactNode[] = [];
  if (since !== null) parts.push(fill(copy.identitySince, { gw: since }));
  if (founder) parts.push(moments.m9.heading);
  if (club) parts.push(<PersonName>{club}</PersonName>);
  if (leagueCount !== null && leagueCount > 0) parts.push(copy.leagues(leagueCount));
  if (parts.length === 0) return null;
  return (
    <p
      className={cn("text-balance text-center", ui.text.meta, ui.tone.muted)}
      data-testid="gradins-identity-line"
    >
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <span aria-hidden className="px-1.5">
              ·
            </span>
          ) : null}
          {part}
        </Fragment>
      ))}
    </p>
  );
}
