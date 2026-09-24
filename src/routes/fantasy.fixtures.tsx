import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Info } from "lucide-react";
import { useMemo, useState } from "react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { clubLabel, clubToken } from "@/components/fantasy/club-identity";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyPhaseBody } from "@/components/fpl/FantasyScreenGate";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import {
  ui,
  UiCard,
  UiDifficultyCell,
  UiEmptyState,
  UiHeader,
  UiIconButton,
  UiSkeleton,
  type UiDifficulty,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { MATCH_TIME_ZONE } from "@/lib/match-kickoff";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";
import type { Club } from "@/types/domain";
import type { FixtureDifficulty } from "@/types/fantasy";

export const Route = createFileRoute("/fantasy/fixtures")({
  component: FdrPage,
});

/**
 * "Fixture Difficulty Rating": a Team column plus one sortable column per
 * gameweek, colour-coded opponent cells with (H)/(A), horizontal scrolling for
 * later gameweeks, and the FDR key.
 *
 * Option A: the clubs are round crest discs, the sort controls are round, the
 * gameweek columns say "J.14" in both languages rather than an English "GW14",
 * and the key is a pill that floats above the bottom navigation. The grid
 * keeps the saturated difficulty scale — it is read by scanning colour down a
 * column, which the pale tints of the player page would not survive.
 *
 * Two things this screen must not do, and structurally cannot:
 *
 * 1. **Invent or drop a fixture.** Every cell is rendered from a row the
 *    service returned, one `<div data-fdr-fixture>` per row, with no padding,
 *    no filtering and no "a gameweek has N matches" assumption anywhere. GW1
 *    has seven counting fixtures because FAR Rabat v Raja Casablanca is
 *    postponed and deferred out of the gameweek server-side; the grid shows
 *    fourteen club rows (seven fixtures × two clubs) and neither club appears.
 *    `data-fdr-fixture` exists so that count is assertable from outside.
 *
 * 2. **Name a gameweek by one of its dates.** GW1 spans 24–27 September and
 *    the header used to read "27 sept." — the trailing kickoff, picked by
 *    whichever row happened to come first out of the array. It now reads the
 *    real range, formatted with `Intl.formatRange` so French and Arabic each
 *    get their own idiom, and pinned to `MATCH_TIME_ZONE` so it agrees with
 *    the deadline on the card beside it (BG-0100).
 *
 * The rows key clubs by UUID in cloud mode and by source slug in mock mode
 * (BG-0111), so a club is looked up under both; keyed by id alone, the mock
 * grid rendered no rows at all.
 */
function FdrPage() {
  return (
    <FantasyFrame bottomNav>
      <FdrBody />
    </FantasyFrame>
  );
}

type SortKey = "team" | number;

function FdrBody() {
  const { t, tr, lang } = useI18n();
  const screen = useFantasyScreen({ needsAuth: false, needsTeam: false });
  const clubs = screen.clubs;
  const fdrQ = useQuery({
    queryKey: ["fantasy-fixture-difficulty"],
    queryFn: () => fantasyService.getFixtureDifficulty(),
    enabled: screen.phase === "ready",
    staleTime: 5 * 60_000,
  });
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "team",
    dir: "asc",
  });
  const [keyOpen, setKeyOpen] = useState(false);

  const rows = useMemo(() => fdrQ.data ?? [], [fdrQ.data]);
  const gameweeks = useMemo(
    () => [...new Set(rows.map((r) => r.gameweek))].sort((a, b) => a - b),
    [rows],
  );
  const byClub = useMemo(() => {
    const map = new Map<string, Map<number, FixtureDifficulty[]>>();
    for (const row of rows) {
      const clubMap = map.get(row.clubId) ?? new Map<number, FixtureDifficulty[]>();
      clubMap.set(row.gameweek, [...(clubMap.get(row.gameweek) ?? []), row]);
      map.set(row.clubId, clubMap);
    }
    return map;
  }, [rows]);
  /** A club's fixtures, under its id or its slug — whichever the rows used. */
  const fixturesOf = (club: Club) =>
    byClub.get(club.id) ?? (club.slug ? byClub.get(club.slug) : undefined);

  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const nf = new Intl.NumberFormat(locale);
  const gwLabel = (gw: number) => `${t("fantasy.leagues.gw")}${nf.format(gw)}`;

  /**
   * The span of a gameweek, in the competition's own calendar.
   *
   * A gameweek is a set of kickoffs, not one kickoff, so the column names the
   * first and last of them. `formatRange` collapses to a single date when they
   * fall on the same day, and keeps the locale's own range idiom otherwise.
   */
  const spanOf = useMemo(() => {
    const dtf = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      timeZone: MATCH_TIME_ZONE,
    });
    return (gw: number): string => {
      const times = rows
        .filter((r) => r.gameweek === gw && r.kickoffAt)
        .map((r) => new Date(r.kickoffAt as string).getTime())
        .filter((n) => Number.isFinite(n));
      if (times.length === 0) return "";
      const first = new Date(Math.min(...times));
      const last = new Date(Math.max(...times));
      try {
        return dtf.formatRange(first, last);
      } catch {
        // `formatRange` is the right tool but is not universal; the fallback
        // still names both ends rather than silently naming one.
        const a = dtf.format(first);
        const b = dtf.format(last);
        return a === b ? a : `${a} – ${b}`;
      }
    };
  }, [rows, locale]);

  const sortedClubs = useMemo(() => {
    const has = (club: Club) => byClub.has(club.id) || (!!club.slug && byClub.has(club.slug));
    const at = (club: Club, gw: number) =>
      (byClub.get(club.id) ?? (club.slug ? byClub.get(club.slug) : undefined))?.get(gw)?.[0]
        ?.difficulty ?? 6;
    const list = clubs.filter(has);
    const dirMul = sort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sort.key === "team") return tr(a.shortName).localeCompare(tr(b.shortName)) * dirMul;
      const gw = sort.key;
      return (at(a, gw) - at(b, gw)) * dirMul || tr(a.shortName).localeCompare(tr(b.shortName));
    });
    return list;
  }, [clubs, byClub, sort, tr]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  /** Opponents are keyed the same way as the rows: id in cloud, slug in mock. */
  const clubByKey = useMemo(() => {
    const map = new Map<string, Club>();
    for (const club of clubs) {
      if (club.slug) map.set(club.slug, club);
      map.set(club.id, club);
    }
    return map;
  }, [clubs]);

  const sortGlyph = (key: SortKey) =>
    sort.key === key && sort.dir === "desc" ? (
      <ArrowDownWideNarrow className="h-4 w-4" aria-hidden />
    ) : (
      <ArrowUpNarrowWide className={cn("h-4 w-4", sort.key !== key && "opacity-50")} aria-hidden />
    );

  const sortButtonClass = (key: SortKey) =>
    cn(
      "mt-1.5 grid w-full place-items-center",
      "min-h-[var(--ui-tap-min)]",
      ui.radius.full,
      ui.focus,
      sort.key === key ? ui.surface.inkPlain : cn(ui.surface.sunken, ui.tone.muted),
    );

  return (
    <>
      <UiHeader kicker={t("nav.fantasy")} title={t("fpl.fdr")} backTo="/fantasy" />

      {screen.phase !== "ready" ? (
        <FantasyPhaseBody phase={screen.phase} next="/fantasy/fixtures" retry={screen.retry} />
      ) : fdrQ.isPending ? (
        <div role="status" aria-label={t("state.loading")} className="m-4 space-y-2">
          <UiSkeleton className="h-12" />
          <UiSkeleton className="h-12" />
          <UiSkeleton className="h-12" />
          <UiSkeleton className="h-12" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <UiEmptyState title={t("fpl.no_data_yet")} body={t("fantasy.fixtures.subtitle")} />
        </div>
      ) : (
        // The one legitimate horizontal scroller on this screen: later
        // gameweeks scroll sideways instead of pushing the page. The bottom
        // padding lets the last rows scroll clear of the floating key.
        <div className={cn("relative overflow-x-auto pb-24 pt-2", ui.surface.page)}>
          <table className="w-auto border-collapse">
            <caption className="sr-only">{t("fpl.fdr")}</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className={cn(
                    "sticky start-0 z-10 w-[148px] min-w-[148px] px-3 py-2 text-start align-bottom",
                    ui.surface.page,
                  )}
                >
                  <span className={cn("block", ui.text.label, ui.tone.muted)}>{t("fpl.team")}</span>
                  <button
                    type="button"
                    onClick={() => toggleSort("team")}
                    className={sortButtonClass("team")}
                    aria-label={t("fpl.team")}
                    aria-pressed={sort.key === "team"}
                  >
                    {sortGlyph("team")}
                  </button>
                </th>
                {gameweeks.map((gw) => (
                  <th
                    key={gw}
                    scope="col"
                    className="w-[92px] min-w-[92px] px-1 py-2 text-center align-bottom"
                  >
                    <span
                      className={cn(
                        "block",
                        ui.display.tab,
                        "[font-weight:var(--ui-weight-heavy)]",
                      )}
                    >
                      <bdi>{gwLabel(gw)}</bdi>
                    </span>
                    <span className={cn("block", ui.text.micro, ui.tone.muted)}>{spanOf(gw)}</span>
                    <button
                      type="button"
                      onClick={() => toggleSort(gw)}
                      className={sortButtonClass(gw)}
                      aria-label={gwLabel(gw)}
                      aria-pressed={sort.key === gw}
                    >
                      {sortGlyph(gw)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedClubs.map((club) => (
                <tr key={club.id} className={ui.rule.blockStart}>
                  <th
                    scope="row"
                    className={cn(
                      "sticky start-0 z-10 w-[148px] min-w-[148px] px-3 py-2 text-start",
                      ui.surface.page,
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <ClubCrest club={club} size="xs" />
                      <span
                        className={cn(
                          "truncate",
                          ui.text.meta,
                          "[font-weight:var(--ui-weight-heavy)]",
                          ui.tone.default,
                        )}
                        dir="auto"
                        title={tr(club.name)}
                      >
                        {clubLabel(club, tr)}
                      </span>
                    </span>
                  </th>
                  {gameweeks.map((gw) => {
                    const fixtures = fixturesOf(club)?.get(gw) ?? [];
                    return (
                      <td key={gw} className="px-1 py-1 align-top">
                        <div className="flex flex-col gap-1">
                          {fixtures.length === 0 ? (
                            <span
                              className={cn(
                                "grid min-h-[var(--ui-tap-min)] place-items-center",
                                ui.radius.tight,
                                ui.surface.sunken,
                                ui.text.meta,
                                ui.tone.muted,
                              )}
                            >
                              {t("fantasy.stat.none")}
                            </span>
                          ) : (
                            fixtures.map((f) => {
                              const opponent = clubByKey.get(f.opponentClubId);
                              const venue = f.isHome ? t("fpl.home_short") : t("fpl.away_short");
                              const venueName = f.isHome ? t("common.home") : t("common.away");
                              const fullName = opponent ? tr(opponent.name) : "";
                              return (
                                // One marker per SERVICE ROW. Nothing else in
                                // this file emits one, so counting
                                // `[data-fdr-fixture]` in a gameweek column
                                // counts exactly the fixtures the backend
                                // returned for it — seven for GW1, fourteen
                                // club-cells.
                                <div
                                  key={`${f.opponentClubId}-${f.gameweek}-${f.isHome ? "h" : "a"}`}
                                  data-fdr-fixture=""
                                  data-fdr-gameweek={f.gameweek}
                                >
                                  <UiDifficultyCell
                                    difficulty={f.difficulty as UiDifficulty}
                                    title={fullName ? `${fullName} (${venueName})` : undefined}
                                  >
                                    {/* The three-letter token is a
                                        convenience; the club's real name is
                                        always available to a screen reader and
                                        on hover, because `code` is null for 13
                                        of the 21 clubs and cannot carry
                                        identity on its own. */}
                                    <span aria-hidden dir="ltr">
                                      {opponent ? clubToken(opponent, tr) : ""} ({venue})
                                    </span>
                                    <span className="sr-only">
                                      {fullName} ({venueName})
                                    </span>
                                  </UiDifficultyCell>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* FDR key: a round pill floating above the bottom navigation (which
          only shows below `md`), with the explanation behind the info disc. */}
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 z-30 mx-auto flex max-w-[var(--ui-column-max)] justify-center px-4",
          "bottom-[calc(var(--bottomnav-h)+0.75rem)] md:bottom-6",
        )}
      >
        <div
          className={cn(
            "pointer-events-auto flex items-center gap-2 py-1 pe-1 ps-4",
            ui.radius.full,
            ui.surface.overlay,
          )}
        >
          <span className={cn(ui.text.label, ui.tone.muted)}>{t("fpl.fdr_key")}</span>
          <span className="flex items-center gap-1" aria-hidden>
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <UiDifficultyCell
                key={n}
                difficulty={n}
                className={cn("h-7 min-h-0 w-7 px-0", ui.radius.full)}
              >
                {n}
              </UiDifficultyCell>
            ))}
          </span>
          <UiIconButton
            variant="ink"
            onClick={() => setKeyOpen((v) => !v)}
            aria-expanded={keyOpen}
            aria-label={t("fpl.fdr_key")}
          >
            <Info aria-hidden />
          </UiIconButton>
        </div>
      </div>
      {keyOpen ? (
        <div
          className={cn(
            "fixed inset-x-0 z-30 mx-auto max-w-[var(--ui-column-max)] px-6",
            "bottom-[calc(var(--bottomnav-h)+4.75rem)] md:bottom-24",
          )}
        >
          <UiCard padding="sm" className={ui.shadow.overlay}>
            <div className={cn("flex items-center justify-between", ui.text.bodyStrong)}>
              <span>{t("fpl.easy")} (1)</span>
              <span>{t("fpl.hard")} (5)</span>
            </div>
            <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>
              {t("fantasy.fixtures.subtitle")}
            </p>
          </UiCard>
        </div>
      ) : null}
    </>
  );
}
