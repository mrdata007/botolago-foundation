import { ArrowLeftRight, CircleAlert, Goal, Square } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { MatchEvent } from "@/services/match-live";
import type { Club } from "@/types/domain";
import { ClubCrest } from "@/components/common/ClubCrest";

/**
 * Vertical key-events timeline.
 *
 * Home events sit on the inline-start side, away events on the inline-end
 * side; because the layout is built with logical grid columns, the mirroring
 * happens automatically in RTL.
 */
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

  if (events.length === 0) {
    return (
      <div className="rounded-[var(--radius-card-lg)] border border-dashed border-[var(--border-subtle)] bg-[color:var(--surface)]/40 px-4 py-8 text-center text-sm text-[color:var(--text-secondary)]">
        {t("matches.detail.no_events")}
      </div>
    );
  }

  const latestId = isLive ? events[events.length - 1]?.id : undefined;
  const firstSecondHalf = events.find((e) => e.minute > 45)?.id;

  return (
    <ol className="relative grid gap-1.5">
      {/* Centre rail */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 start-1/2 w-px -translate-x-1/2 bg-[var(--border-subtle)] rtl:translate-x-1/2"
      />
      {events.map((event) => (
        <li key={event.id} className="contents">
          {event.id === firstSecondHalf && <HalfTimeDivider />}
          <EventRow
            event={event}
            club={event.side === "home" ? home : away}
            isLatest={event.id === latestId}
          />
        </li>
      ))}
    </ol>
  );
}

function HalfTimeDivider() {
  const { t } = useI18n();
  return (
    <div className="relative my-1 flex items-center gap-2" role="separator">
      <span className="h-px flex-1 bg-[var(--border-subtle)]" />
      <span className="rounded-full bg-[color:var(--surface-hover)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {t("matches.status.ht")}
      </span>
      <span className="h-px flex-1 bg-[var(--border-subtle)]" />
    </div>
  );
}

function eventIcon(type: MatchEvent["type"]) {
  switch (type) {
    case "goal":
    case "penalty":
    case "own_goal":
      return <Goal className="h-3.5 w-3.5" aria-hidden />;
    case "sub":
      return <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />;
    case "var":
      return <CircleAlert className="h-3.5 w-3.5" aria-hidden />;
    default:
      return <Square className="h-3.5 w-3.5" aria-hidden />;
  }
}

function EventRow({ event, club, isLatest }: { event: MatchEvent; club: Club; isLatest: boolean }) {
  const { t, tr } = useI18n();
  const isGoal = event.homeScore !== undefined;
  const isHome = event.side === "home";

  const typeLabel = t(
    (
      {
        goal: "matches.event.goal",
        penalty: "matches.event.penalty",
        own_goal: "matches.event.own_goal",
        yellow: "matches.event.yellow",
        red: "matches.event.red",
        sub: "matches.event.sub",
        var: "matches.event.var",
      } as const
    )[event.type],
  );

  const accent =
    event.type === "red"
      ? "var(--color-live)"
      : event.type === "yellow"
        ? "var(--color-warning)"
        : isGoal
          ? "var(--brand-primary)"
          : "var(--text-muted)";

  const card = (
    <div
      className={cn(
        "min-w-0 rounded-[var(--radius-card)] border px-3 py-2",
        isGoal
          ? "border-[color:color-mix(in_oklab,var(--brand-primary)_28%,transparent)] bg-[color:color-mix(in_oklab,var(--brand-primary)_7%,var(--background-elevated))] shadow-subtle"
          : "border-[var(--border-subtle)] bg-[color:var(--background-elevated)]",
        isLatest && "ring-2 ring-[color:var(--brand-accent)]/40",
        isHome ? "text-start" : "text-end",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em]",
          !isHome && "flex-row-reverse",
        )}
        style={{ color: accent }}
      >
        {eventIcon(event.type)}
        <span>{typeLabel}</span>
        <span className="tabular-nums text-[color:var(--text-muted)]">{event.minute}′</span>
      </div>
      <div className="mt-0.5 truncate text-[13px] font-bold text-foreground">
        {tr(event.player)}
      </div>
      {event.secondary && (
        <div className="truncate text-[11px] text-[color:var(--text-secondary)]">
          {event.type === "sub"
            ? `${t("matches.event.sub_in")} ${tr(event.secondary)}`
            : `${t("matches.event.assist")} ${tr(event.secondary)}`}
        </div>
      )}
      {isGoal && (
        <div className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] font-black tabular-nums text-[color:var(--brand-primary)]">
          <ClubCrest club={club} size="sm" />
          {event.homeScore}–{event.awayScore}
        </div>
      )}
    </div>
  );

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
