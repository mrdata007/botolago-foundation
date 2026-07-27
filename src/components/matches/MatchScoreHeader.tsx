import { CalendarClock, MapPin, Trophy } from "lucide-react";
import { ClubCrest } from "@/components/common/ClubCrest";
import { LiveIndicator } from "@/components/matches/LiveIndicator";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Club, Match } from "@/types/domain";

/**
 * Live-first scoreboard header.
 *
 * State-aware: live shows minute + a match-clock progress bar, finished shows
 * FT, scheduled shows the kickoff time, postponed shows a notice.
 */
export function MatchScoreHeader({
  match,
  home,
  away,
  elapsed,
}: {
  match: Match;
  home: Club;
  away: Club;
  elapsed: number;
}) {
  const { t, tr, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const kickoff = new Date(match.kickoff);
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
    kickoff,
  );
  const dateFmt = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(kickoff);

  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const isScheduled = match.status === "scheduled";
  const isPostponed = match.status === "postponed";

  const hs = match.homeScore ?? 0;
  const as = match.awayScore ?? 0;
  const scoreA11y = t("matches.a11y.score")
    .replace("{home}", tr(home.shortName))
    .replace("{hs}", String(hs))
    .replace("{away}", tr(away.shortName))
    .replace("{as}", String(as));

  return (
    <header
      className={cn(
        "relative mt-4 overflow-hidden rounded-[var(--radius-hero)] border border-[var(--border-subtle)]",
        "bg-[color:var(--background-elevated)] px-4 py-5 shadow-card sm:px-6 sm:py-6",
        "animate-in fade-in-0 slide-in-from-bottom-1 duration-500 ease-out",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 h-44 opacity-45"
        style={{
          background:
            "radial-gradient(620px 260px at 50% 100%, color-mix(in oklab, var(--brand-primary) 24%, transparent) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--brand-accent)]">
          <Trophy className="h-3.5 w-3.5" aria-hidden />
          {t("matches.competition.botola")} · {t("matches.gameweek")} {match.gameweek}
        </div>
        {isLive ? (
          <LiveIndicator minute={match.minute} size="md" />
        ) : isFinished ? (
          <span className="inline-flex items-center rounded-full bg-[color:var(--surface-hover)] px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--text-secondary)]">
            {t("matches.status.ft")}
          </span>
        ) : isScheduled ? (
          <span className="inline-flex items-center rounded-full bg-[color:var(--surface-hover)] px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
            {t("matches.status.scheduled")}
          </span>
        ) : isPostponed ? (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.14em]"
            style={{
              background: "color-mix(in oklab, var(--color-warning) 14%, transparent)",
              color: "color-mix(in oklab, var(--color-warning) 60%, black)",
            }}
          >
            {t("matches.status.postponed")}
          </span>
        ) : null}
      </div>

      <div
        className="relative mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5"
        role="group"
        aria-label={scoreA11y}
      >
        <TeamColumn club={home} />
        <div className="flex flex-col items-center px-1">
          {isLive || isFinished ? (
            <div
              className="flex items-baseline gap-2 font-mono text-5xl font-black tabular-nums tracking-tight text-foreground sm:text-6xl"
              aria-live={isLive ? "polite" : "off"}
            >
              <span>{hs}</span>
              <span className="text-[color:var(--text-muted)]">–</span>
              <span>{as}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="font-mono text-3xl font-black tabular-nums text-foreground sm:text-4xl">
                {timeFmt}
              </div>
              <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                {t("matches.kickoff")}
              </div>
            </div>
          )}
        </div>
        <TeamColumn club={away} />
      </div>

      {isLive && (
        <div className="relative mt-5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
            <span>{t("matches.detail.elapsed")}</span>
            <span className="tabular-nums">{elapsed}′ / 90′</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-hover)]">
            <div
              className="h-full rounded-full bg-[color:var(--color-live)] transition-[width] duration-700"
              style={{ width: `${Math.min(100, (elapsed / 90) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {isPostponed && (
        <p className="relative mt-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[color:var(--surface)]/50 px-3 py-2 text-xs text-[color:var(--text-secondary)]">
          {t("matches.detail.postponed_notice")}
        </p>
      )}

      <div className="relative mt-5 grid grid-cols-1 gap-2 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-3">
        <MetaCell
          icon={<CalendarClock className="h-3.5 w-3.5" aria-hidden />}
          label={t("matches.detail.kickoff")}
          value={`${dateFmt} · ${timeFmt}`}
        />
        <MetaCell
          icon={<Trophy className="h-3.5 w-3.5" aria-hidden />}
          label={t("matches.detail.competition")}
          value={t("matches.competition.botola")}
        />
        <MetaCell
          icon={<MapPin className="h-3.5 w-3.5" aria-hidden />}
          label={t("matches.detail.venue")}
          value={tr(match.venue)}
        />
      </div>
    </header>
  );
}

function TeamColumn({ club }: { club: Club }) {
  const { tr } = useI18n();
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <ClubCrest club={club} size="lg" />
      <div className="min-w-0 text-center text-sm font-black tracking-tight text-foreground">
        <div className="truncate">{tr(club.shortName)}</div>
        <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
          {tr(club.city)}
        </div>
      </div>
    </div>
  );
}

function MetaCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-0.5 truncate text-[13px] font-semibold text-foreground">{value}</div>
    </div>
  );
}
