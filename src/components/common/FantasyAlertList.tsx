import type { FantasyAlert, Player } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { ShieldAlert } from "lucide-react";
import { UiAlert, type UiAlertTone } from "@/components/ui-kit";

/**
 * The Fantasy alert strip on Accueil — the one Fantasy surface a signed-out
 * visitor reaches.
 *
 * Each row is now a `UiAlert` rather than a hand-rolled bordered box. Two
 * things the local version got wrong and the primitive does not:
 *
 *   - the `info` tone painted its text in `--ui-ink`, which is a FILL colour
 *     and a dark navy in BOTH themes — measured 1.25:1 on the dark page. That
 *     is BG-0083. `UiAlert` composes its tint from `--ui-ink-fg` and keeps
 *     `--ui-on-surface` as the foreground, so the row reads in either theme;
 *   - the player name was `font-bold`, a raw Tailwind weight off the
 *     `--ui-weight-*` ramp. It is `UiAlert`'s `title` slot now.
 *
 * `live={false}` ON EVERY ITEM IS THE POINT, not a detail. `UiAlert` derives a
 * live region from its tone, and this component renders N of them: a five-alert
 * squad would install five simultaneous live regions and hand a screen reader
 * five interruptions for one page. The list carries none, which is exactly what
 * it announced before this conversion — these rows are part of Accueil, not
 * news about it, and the migration is not allowed to add an announcement any
 * more than it is allowed to drop one.
 */
const severityTone: Record<FantasyAlert["severity"], UiAlertTone> = {
  info: "info",
  // `--ui-caution` is a fill and its foreground is fixed by the kit; the amber
  // can never be the text. `UiAlert` handles that pairing.
  warning: "caution",
  critical: "negative",
};

export function FantasyAlertList({
  alerts,
  players,
}: {
  alerts: FantasyAlert[];
  players: Player[];
}) {
  const { tr } = useI18n();
  return (
    <ul className="grid gap-2">
      {alerts.map((a) => {
        const player = players.find((p) => p.id === a.playerId);
        return (
          <li key={a.id}>
            <UiAlert
              tone={severityTone[a.severity]}
              live={false}
              title={player ? tr(player.name) : undefined}
              // `critical` is the one severity whose glyph the kit does not
              // already draw: `negative` and `caution` both default to the
              // warning triangle, and a shield is what this product has always
              // used for "this player cannot play at all". `info` and `warning`
              // take the kit's own defaults, which are the same two glyphs the
              // local `iconMap` held.
              icon={a.severity === "critical" ? <ShieldAlert className="h-5 w-5" /> : undefined}
            >
              {tr(a.message)}
            </UiAlert>
          </li>
        );
      })}
    </ul>
  );
}
