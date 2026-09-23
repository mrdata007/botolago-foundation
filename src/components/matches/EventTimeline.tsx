import { useState } from "react";
import {
  ArrowLeftRight,
  CircleAlert,
  Goal,
  HeartPulse,
  Play,
  Square,
  SquareStop,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { MatchEvent } from "@/services/match-live";
import type { Club } from "@/types/domain";
import { ClubCrest } from "@/components/common/ClubCrest";
import { ui } from "@/components/ui-kit";

/** Provider-backed key-events timeline. Unknown team attribution stays centred. */
export function EventTimeline({
  events,
  home,
  away,
  isLive,
}: {
  events: readonly MatchEvent[];
  home: Club;
  away: Club;
  isLive: boolean;
}) {
  const { t } = useI18n();

  // Events already on screen at first render appear as they are; one that
  // arrives later, on a live refresh, fades in and opens (`event-enter`) so
  // it is noticed. Tracked by id, so a refetch or a language change that
  // returns the same events animates nothing.
  const [seen, setSeen] = useState<ReadonlySet<string>>(
    () => new Set(events.map((event) => event.id)),
  );
  const [entering, setEntering] = useState<ReadonlySet<string>>(() => new Set());
  const arrived = events.filter((event) => !seen.has(event.id)).map((event) => event.id);
  if (arrived.length > 0) {
    // Adjusting state while rendering, so the new row's first paint already
    // carries the animation instead of flashing in before it starts.
    setSeen(new Set([...seen, ...arrived]));
    if (isLive) setEntering(new Set([...entering, ...arrived]));
  }
  const settle = (id: string) =>
    setEntering((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });

  if (events.length === 0) {
    return (
      <div
        className={cn(
          "border border-dashed border-[color:var(--ui-rule)] px-4 py-8 text-center",
          ui.radius.control,
          ui.surface.sunken,
          ui.text.secondary,
          ui.tone.muted,
        )}
      >
        {t("matches.detail.no_events")}
      </div>
    );
  }

  const latestId = isLive ? events[events.length - 1]?.id : undefined;
  const firstSecondHalf = events.find((event) => event.minute > 45)?.id;

  return (
    <ol className="relative grid gap-1.5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 start-1/2 w-px -translate-x-1/2 bg-[var(--border-subtle)] rtl:translate-x-1/2"
      />
      {events.map((event) => {
        const isEntering = entering.has(event.id);
        return (
          <li key={event.id} className="contents">
            {event.id === firstSecondHalf && <HalfTimeDivider />}
            <div
              className={cn(isEntering && "event-enter")}
              onAnimationEnd={(animation) => {
                if (isEntering && animation.target === animation.currentTarget) settle(event.id);
              }}
            >
              <div className={cn(isEntering && "min-h-0 overflow-hidden")}>
                <EventRow
                  event={event}
                  club={event.side === "home" ? home : event.side === "away" ? away : undefined}
                  isLatest={event.id === latestId}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function HalfTimeDivider() {
  const { t } = useI18n();
  return (
    <div className="relative my-1 flex items-center gap-2" role="separator">
      <span className="h-px flex-1 bg-[var(--border-subtle)]" />
      <span className="rounded-full bg-[color:var(--surface-hover)] px-2.5 py-1 text-[10px] font-black uppercase ltr:tracking-[0.16em] text-[color:var(--text-muted)]">
        {t("matches.status.ht")}
      </span>
      <span className="h-px flex-1 bg-[var(--border-subtle)]" />
    </div>
  );
}

function eventIcon(type: MatchEvent["type"]) {
  switch (type) {
    case "goal":
    case "penalty_goal":
    case "own_goal":
    case "missed_penalty":
      return <Goal className="h-3.5 w-3.5" aria-hidden />;
    case "substitution":
      return <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />;
    case "var":
      return <CircleAlert className="h-3.5 w-3.5" aria-hidden />;
    case "injury":
      return <HeartPulse className="h-3.5 w-3.5" aria-hidden />;
    case "period_start":
      return <Play className="h-3.5 w-3.5" aria-hidden />;
    case "period_end":
      return <SquareStop className="h-3.5 w-3.5" aria-hidden />;
    default:
      return <Square className="h-3.5 w-3.5" aria-hidden />;
  }
}

function EventRow({
  event,
  club,
  isLatest,
}: {
  event: MatchEvent;
  club?: Club;
  isLatest: boolean;
}) {
  const { t } = useI18n();
  const isGoal = ["goal", "penalty_goal", "own_goal"].includes(event.type);
  const isHome = event.side === "home";
  const isAway = event.side === "away";

  const typeLabel = t(
    (
      {
        goal: "matches.event.goal",
        penalty_goal: "matches.event.penalty",
        own_goal: "matches.event.own_goal",
        missed_penalty: "matches.event.missed_penalty",
        yellow_card: "matches.event.yellow",
        second_yellow: "matches.event.second_yellow",
        red_card: "matches.event.red",
        substitution: "matches.event.sub",
        var: "matches.event.var",
        injury: "matches.event.injury",
        period_start: "matches.event.period_start",
        period_end: "matches.event.period_end",
      } as const
    )[event.type],
  );

  const accent =
    event.type === "red_card"
      ? "var(--color-live)"
      : event.type === "yellow_card" || event.type === "second_yellow"
        ? "var(--color-warning)"
        : isGoal
          ? "var(--brand-primary)"
          : "var(--text-muted)";
  const minute = `${event.minute}${event.addedTime > 0 ? `+${event.addedTime}` : ""}′`;

  const card = (
    <div
      className={cn(
        "min-w-0 rounded-[var(--radius-card)] border px-3 py-2",
        isGoal
          ? "border-[color:color-mix(in_oklab,var(--brand-primary)_28%,transparent)] bg-[color:color-mix(in_oklab,var(--brand-primary)_7%,var(--background-elevated))] shadow-subtle"
          : "border-[var(--border-subtle)] bg-[color:var(--background-elevated)]",
        isLatest && "ring-2 ring-[color:var(--brand-accent)]/40",
        isAway ? "text-end" : "text-start",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 text-[10px] font-black uppercase ltr:tracking-[0.14em]",
          isAway && "flex-row-reverse",
        )}
        style={{ color: accent }}
      >
        {eventIcon(event.type)}
        <span>{typeLabel}</span>
        <span className="tabular-nums text-[color:var(--text-muted)]">{minute}</span>
      </div>
      {event.detail && (
        <div className="mt-0.5 text-[12px] font-semibold text-foreground">{event.detail}</div>
      )}
      {club && (
        <div className={cn("mt-1 flex", isAway && "justify-end")}>
          <ClubCrest club={club} size="sm" />
        </div>
      )}
    </div>
  );

  if (!isHome && !isAway) {
    return <div className="relative mx-auto w-[min(100%,22rem)]">{card}</div>;
  }

  return (
    <div className="relative grid grid-cols-[1fr_28px_1fr] items-center gap-2">
      {isHome ? card : <span aria-hidden />}
      <span
        aria-hidden
        className="mx-auto h-2.5 w-2.5 rounded-full border-2 border-[color:var(--background-elevated)]"
        style={{ background: accent }}
      />
      {isHome ? <span aria-hidden /> : card}
    </div>
  );
}
