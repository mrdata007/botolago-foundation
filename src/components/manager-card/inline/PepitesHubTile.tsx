import { Link } from "@tanstack/react-router";
import { ChevronRight, Gem } from "lucide-react";

import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import { useCurvaCopy } from "../copy";

/**
 * Pépites, inside Fantasy (plan section 3.4): a wide tile under the four shortcuts, to
 * `/pepites`. While the section is live Pépites leaves the bottom bar and this is where a
 * manager finds it: Fantasy's scouting room, next to « Statistiques joueurs » and « Meilleurs
 * joueurs ». Nothing about Pépites' addresses changes; this is a plain link.
 *
 * Shown to every hub audience (guest, no team, owner). A 64 px row at the least (it grows when
 * the line wraps): the sunken disc with the `Gem` icon Pépites had in the bar, the name in
 * body-strong, one muted line, and a chevron the right-to-left layout mirrors. The tap is
 * counted once (`pepites_from_fantasy`) so the move can be read against Pépites' own traffic.
 */
export function PepitesHubTile({ className }: { className?: string }) {
  const { t } = useI18n();
  const copy = useCurvaCopy();
  return (
    <Link
      to="/pepites"
      onClick={() => track("pepites_from_fantasy")}
      data-testid="fantasy-hub-pepites-tile"
      className={cn(
        "flex min-h-16 items-center gap-3 px-3 py-2.5",
        ui.surface.card,
        "transition-colors hover:bg-[color:var(--ui-surface-sunken)] active:bg-[color:var(--ui-surface-sunken)]",
        ui.focus,
        className,
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center",
          ui.radius.full,
          ui.surface.sunken,
          ui.tone.ink,
        )}
      >
        <Gem className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn(ui.text.bodyStrong, ui.tone.default)}>{t("nav.pepites")}</span>
        <span className={cn("text-pretty", ui.text.meta, ui.tone.muted)}>
          {copy.hubPepitesBody}
        </span>
      </span>
      <ChevronRight className={cn("h-5 w-5 shrink-0", ui.tone.muted)} aria-hidden />
    </Link>
  );
}
