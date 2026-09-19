import { useMemo } from "react";
import type { MatchLineupDto } from "@/backend/football/contracts";
import { ClubCrest } from "@/components/common/ClubCrest";
import { EmptyState } from "@/components/common/States";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { TranslationKey } from "@/i18n/dictionaries";

const POSITION_ORDER: Record<string, number> = {
  goalkeeper: 0,
  defender: 1,
  midfielder: 2,
  forward: 3,
};

/** Pure helper, exported for testing: starting XI grouped GK → DEF → MID →
 * FWD, then by the provider's own on-pitch order within each group. */
export function sortStartingXi<T extends { position: string | null; order: number }>(
  players: readonly T[],
): T[] {
  return [...players].sort(
    (a, b) =>
      (POSITION_ORDER[a.position ?? ""] ?? 9) - (POSITION_ORDER[b.position ?? ""] ?? 9) ||
      a.order - b.order,
  );
}

/** Kept as a literal-key switch (not a lookup table) so every translation
 * lookup here stays statically visible to the i18n usage audit. */
function positionAbbreviation(t: (key: TranslationKey) => string, position: string | null) {
  switch (position) {
    case "goalkeeper":
      return t("matches.detail.position.gk");
    case "defender":
      return t("matches.detail.position.def");
    case "midfielder":
      return t("matches.detail.position.mid");
    case "forward":
      return t("matches.detail.position.fwd");
    default:
      return null;
  }
}

/**
 * Provider-backed match lineups. Renders starting XI (grouped by position)
 * and substitutes for both teams. Real data only: an empty lineup array
 * (provider has not published lineups yet) renders an explicit empty state
 * rather than a guessed line-up.
 */
export function LineupsView({
  lineups,
  home,
  away,
}: {
  lineups: readonly MatchLineupDto[];
  home: Club;
  away: Club;
}) {
  const { t } = useI18n();

  const homeLineup = lineups.find((l) => l.team.id === home.id);
  const awayLineup = lineups.find((l) => l.team.id === away.id);

  if (!homeLineup && !awayLineup) {
    return <EmptyState>{t("matches.detail.no_lineups")}</EmptyState>;
  }

  return (
    <div className="grid gap-4">
      {homeLineup && <TeamLineup club={home} lineup={homeLineup} />}
      {awayLineup && <TeamLineup club={away} lineup={awayLineup} />}
    </div>
  );
}

function TeamLineup({ club, lineup }: { club: Club; lineup: MatchLineupDto }) {
  const { t, tr } = useI18n();

  const starting = useMemo(
    () => sortStartingXi(lineup.players.filter((p) => p.slot === "starting")),
    [lineup.players],
  );
  const bench = useMemo(
    () => lineup.players.filter((p) => p.slot === "bench").sort((a, b) => a.order - b.order),
    [lineup.players],
  );

  return (
    <div className="rounded-[var(--radius-card-lg)] border border-[var(--border-subtle)] bg-[color:var(--background-elevated)] p-4 shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <ClubCrest club={club} size="sm" />
          <span className="truncate text-sm font-black tracking-tight text-foreground">
            {tr(club.shortName)}
          </span>
          {!lineup.confirmed && (
            <span className="shrink-0 rounded-full bg-[color:var(--surface-hover)] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
              {t("matches.detail.lineup_provisional")}
            </span>
          )}
        </div>
        {lineup.formation && (
          <span className="shrink-0 font-mono text-xs font-black tabular-nums text-[color:var(--brand-accent)]">
            {lineup.formation}
          </span>
        )}
      </div>

      <div className="mt-3">
        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
          {t("matches.detail.starting_xi")}
        </div>
        <ul className="mt-2 grid gap-1.5">
          {starting.map((player) => (
            <li
              key={player.id}
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-[color:var(--surface-hover)]"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[color:var(--surface-hover)] font-mono text-[11px] font-black tabular-nums text-[color:var(--text-secondary)]">
                {player.shirtNumber ?? "—"}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                {player.displayName}
              </span>
              {positionAbbreviation(t, player.position) && (
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
                  {positionAbbreviation(t, player.position)}
                </span>
              )}
              {player.captain && (
                <span
                  aria-label={t("matches.detail.captain")}
                  title={t("matches.detail.captain")}
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-black text-[color:var(--fpl-ink-deep)]"
                  style={{ background: "var(--fpl-amber)" }}
                >
                  C
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {bench.length > 0 && (
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
            {t("matches.detail.substitutes")}
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {bench.map((player) => (
              <li
                key={player.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2 py-1 text-[11px] font-semibold text-[color:var(--text-secondary)]",
                )}
              >
                <span className="font-mono tabular-nums text-[color:var(--text-muted)]">
                  {player.shirtNumber ?? "—"}
                </span>
                <span className="max-w-[10rem] truncate">{player.displayName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
