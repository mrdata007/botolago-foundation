import type { ReactNode } from "react";

import { CardToken } from "@/components/manager-card/CardToken";
import { useCardCopy, useGradinsCopy } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { guestProfile } from "@/components/manager-card/to-profile";
import type { CardClub, CardProfile } from "@/components/manager-card/types";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * The four things a card is, in the hub's icon-disc row: your name on it, your club's colours,
 * a note that comes from your choices, your friends' cards beside yours. Each disc holds the
 * object in the matching state at 24px (named, in a club's colour, with an empty number slot, two
 * side by side), so the proposition is shown, not described. Plan 4.1, « Guest hero ».
 *
 * « Une note qui vient de vos choix » says after how many journées only when the server's status
 * has said so (`minRated`); without it the line says what is always true, and no number.
 */
export function GuestPoints({
  club,
  season,
  minRated,
}: {
  /** The club the first token is dressed in: the try-on's, else any club of the list. */
  club: CardClub | null;
  season: string;
  /** The rating's minimum, from the server's status; null when it has not said. */
  minRated: number | null;
}) {
  const copy = useGradinsCopy();
  const card = useCardCopy();

  const base = (over: Partial<CardProfile> = {}): CardProfile => ({
    ...guestProfile({ season }),
    ...over,
  });
  const points: Array<{ key: string; tokens: CardProfile[]; title: string; body: ReactNode }> = [
    {
      key: "name",
      tokens: [base({ name: "ALI" })],
      title: copy.guestPointNameTitle,
      body: copy.guestPointNameBody,
    },
    {
      key: "club",
      tokens: [base({ club })],
      title: copy.guestPointClubTitle,
      body: copy.guestPointClubBody,
    },
    {
      key: "rating",
      tokens: [base({ counted: 0, minRated })],
      title: copy.guestPointRatingTitle,
      body:
        minRated !== null
          ? fill(copy.guestPointRatingBody, { final: card.finalRounds(minRated) })
          : copy.cardIntroForming,
    },
    {
      key: "people",
      tokens: [base({ name: "ALI" }), base({ name: "OMAR", club })],
      title: copy.guestPointPeopleTitle,
      body: copy.guestPointPeopleBody,
    },
  ];
  return (
    <ul className="grid gap-4" data-testid="gradins-guest-points">
      {points.map((point) => (
        <li key={point.key} className="flex items-start gap-3">
          <span
            aria-hidden
            className={cn(
              "flex h-11 min-w-11 shrink-0 items-center justify-center gap-0.5 px-1",
              ui.radius.full,
              ui.surface.sunken,
            )}
          >
            {point.tokens.map((profile, index) => (
              <CardToken key={index} profile={profile} size={24} />
            ))}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className={cn(ui.text.bodyStrong, ui.tone.default)}>{point.title}</span>
            <span className={cn("text-pretty", ui.text.secondary, ui.tone.muted)}>
              {point.body}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
