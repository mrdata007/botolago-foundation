import type { Club, FantasyAlert, Player } from "@/types/domain";
import { ClubCrest } from "@/components/common/ClubCrest";
import { PlayerStatusBadge } from "@/components/fantasy/PlayerStatusBadge";
import { ui, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * The Fantasy alerts on Accueil, as player rows: the club disc, the player's
 * name over the alert, and the availability pill the Fantasy lists already
 * use. One white card with a hairline between rows, like every other list on
 * the page, rather than a stack of pink, yellow and grey tinted boxes; the
 * pill carries the state, in words, so nothing rests on the colour.
 *
 * The list is part of Accueil, not news about it: no row is a live region (a
 * five-alert squad would otherwise hand a screen reader five interruptions
 * for one page).
 */
export function FantasyAlertList({
  alerts,
  players,
  clubById,
}: {
  alerts: FantasyAlert[];
  players: Player[];
  clubById: (id: string) => Club | undefined;
}) {
  const { tr } = useI18n();
  return (
    <UiCard padding="none">
      <ul>
        {alerts.map((alert, index) => {
          const player = players.find((p) => p.id === alert.playerId);
          const club = player ? clubById(player.clubId) : undefined;
          return (
            <li
              key={alert.id}
              className={cn(
                "flex min-w-0 items-center gap-3 px-3 py-2.5",
                ui.space.row,
                index < alerts.length - 1 && ui.rule.block,
              )}
            >
              {club ? <ClubCrest club={club} size="sm" /> : null}
              <div className="min-w-0 flex-1">
                {player ? (
                  <p className={cn("truncate", ui.text.bodyStrong, ui.tone.default)}>
                    {tr(player.name)}
                  </p>
                ) : null}
                <p className={cn(ui.text.meta, ui.tone.muted)}>{tr(alert.message)}</p>
              </div>
              {player ? <PlayerStatusBadge status={player.status} className="shrink-0" /> : null}
            </li>
          );
        })}
      </ul>
    </UiCard>
  );
}
