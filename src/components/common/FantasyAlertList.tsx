import type { FantasyAlert, Player } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const iconMap = {
  info: Info,
  warning: AlertTriangle,
  critical: ShieldAlert,
} as const;

const tone = {
  info: "border-sky-500/30 bg-sky-500/10 text-sky-900",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-900",
  critical: "border-red-500/30 bg-red-500/10 text-red-900",
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
              "flex items-start gap-3 rounded-2xl border px-3 py-2.5 backdrop-blur",
              tone[a.severity],
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0 text-sm">
              {player && <div className="font-bold">{tr(player.name)}</div>}
              <div className="leading-snug">{tr(a.message)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
