import { FailureAwareImage } from "@/components/common/FailureAwareImage";
import { useI18n } from "@/i18n/provider";
import type { FantasyPlayer } from "@/types/fantasy";

import { clubById } from "../data/world";

/**
 * The next-fixture plate under a shirt, as `useNextFixtures` draws it on
 * `/fantasy/team`: the opponent's crest at 14px and "RCA (D)".
 */
export function FixturePlate({ player }: { player: FantasyPlayer }) {
  const { t, tr } = useI18n();
  const opponent = clubById(player.nextOpponentClubId);
  if (!opponent) return null;
  const marker = player.nextIsHome ? t("fpl.home_short") : t("fpl.away_short");
  return (
    <span
      className="inline-flex items-center gap-1 align-middle"
      title={`${tr(opponent.name)} (${marker})`}
    >
      {opponent.crestUrl ? (
        <FailureAwareImage
          src={opponent.crestUrl}
          alt=""
          aria-hidden
          draggable={false}
          className="h-3.5 w-3.5 shrink-0 object-contain"
        />
      ) : null}
      <span>{`${opponent.crestPlaceholder} (${marker})`}</span>
    </span>
  );
}
