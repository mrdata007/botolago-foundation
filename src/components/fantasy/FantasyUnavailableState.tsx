import { CalendarClock } from "lucide-react";

import { ui, UiEmptyState } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { FantasyUnavailableReason } from "@/services/fantasy-availability";

/**
 * "Fantasy is not open yet / any more" — the season-closed and
 * awaiting-gameweek branches, shared by the home page and the Fantasy hub.
 *
 * Converted to the kit (BG-0092): a `UiEmptyState` on the card surface
 * instead of a `surface-4` glass panel with the Tailwind type ramp, so the
 * copy stays legible in both themes.
 */
export function FantasyUnavailableState({ reason }: { reason: FantasyUnavailableReason }) {
  const { t } = useI18n();

  // Spelled out per branch rather than `t(\`fantasy.availability.${reason}…\`)`:
  // a computed key is invisible to the i18n gate's literal-key check (W4), so
  // a typo or a renamed key would only surface at runtime.
  const copy =
    reason === "season_closed"
      ? {
          title: t("fantasy.availability.season_closed.title"),
          body: t("fantasy.availability.season_closed.body"),
        }
      : reason === "registration_closed"
        ? {
            title: t("fantasy.availability.registration_closed.title"),
            body: t("fantasy.availability.registration_closed.body"),
          }
        : {
            title: t("fantasy.availability.awaiting_gameweek.title"),
            body: t("fantasy.availability.awaiting_gameweek.body"),
          };

  return (
    <UiEmptyState
      title={
        <span className="flex flex-col items-center gap-3">
          <CalendarClock className={cn("h-8 w-8", ui.tone.ink)} aria-hidden />
          {copy.title}
        </span>
      }
      body={copy.body}
    />
  );
}
