import type { ReactNode } from "react";
import { useI18n } from "@/i18n/provider";
import { Clock } from "lucide-react";
import { ui, UiPill } from "@/components/ui-kit";
import { countdownText, useDeadlineCountdown } from "@/components/fpl/deadline";
import { cn } from "@/lib/utils";

/**
 * The time left before a Fantasy deadline, to the minute ("1j 13h 59min").
 * The day part drops out on the last day rather than reading "0j"
 * (`countdownText`, shared with the Fantasy screens).
 *
 * The time is read from the first client effect (`useDeadlineCountdown`),
 * never during render: the server and the hydrating browser read two clocks,
 * and a minute rolling over between them was a hydration mismatch on Home.
 * Until then the pill carries its label alone; once the deadline has passed
 * there is nothing to count down to and it renders nothing.
 *
 * `tone="pill"` (default) is Option A's deadline pill on Home's gameweek band:
 * the action gradient, fully round, a clock, an optional `label` and the
 * countdown — ink-deep throughout, the one foreground the gradient carries in
 * both themes. `tone="plain"` is the countdown alone, in the inherited type
 * and colour, for a caller that draws its own frame.
 *
 * Tabular figures so the minutes do not shift the pill as they tick.
 */
export function DeadlineCountdown({
  iso,
  tone = "pill",
  label,
}: {
  iso: string;
  tone?: "pill" | "plain";
  /** What the deadline is for ("Date limite Fantasy"), set before the time. */
  label?: ReactNode;
}) {
  const { t } = useI18n();
  const left = useDeadlineCountdown(iso);
  if (left?.passed) return null;

  const countdown = (
    <span className={cn("whitespace-nowrap", ui.text.tabular)}>
      {left ? countdownText(left, t) : null}
    </span>
  );

  if (tone === "plain") return countdown;

  return (
    <UiPill tone="action" className="max-w-full">
      <Clock className="h-4 w-4 shrink-0" aria-hidden />
      {label ? (
        <>
          <span className="min-w-0 truncate">{label}</span>
          {left ? <span aria-hidden>·</span> : null}
        </>
      ) : null}
      {countdown}
    </UiPill>
  );
}
