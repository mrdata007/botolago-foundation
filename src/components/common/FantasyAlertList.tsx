import type { FantasyAlert, Player } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { ui } from "@/components/ui-kit";

const iconMap = {
  info: Info,
  warning: AlertTriangle,
  critical: ShieldAlert,
} as const;

const tone = {
  // Status tones come from the kit, not from a raw Tailwind palette: the V2
  // `text-sky-900` on `bg-sky-500/10` is a light-only pairing that turns
  // near-black-on-near-black the moment the app is in dark mode.
  info: "border-[color:color-mix(in_oklab,var(--ui-ink)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--ui-ink)_10%,transparent)] text-[color:var(--ui-ink)]",
  warning:
    "border-[color:color-mix(in_oklab,var(--ui-caution)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--ui-caution)_16%,transparent)] text-[color:var(--ui-on-surface)]",
  critical:
    "border-[color:color-mix(in_oklab,var(--ui-negative)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--ui-negative)_14%,transparent)] text-[color:var(--ui-negative)]",
} as const;

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
        const Icon = iconMap[a.severity];
        const player = players.find((p) => p.id === a.playerId);
        return (
          <li
            key={a.id}
            className={cn(
              "flex items-start gap-3 border px-3 py-2.5",
              ui.radius.control,
              tone[a.severity],
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className={cn("min-w-0", ui.text.secondary)}>
              {player && <div className="font-bold">{tr(player.name)}</div>}
              <div className="leading-snug">{tr(a.message)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
