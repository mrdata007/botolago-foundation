/**
 * `/matches/standings`, as src/routes/matches.standings.tsx composes it: the
 * Matches title with its season pill and tabs, where the table stands, the
 * Général / Domicile / Extérieur / Forme chips, the table with its zone bars,
 * the key and the note. The table is `computeLeagueTable` over the sample
 * results, so it moves on by one round when Journée 12 is played.
 */
import { useState } from "react";

import { MatchesTabs } from "@/components/matches/MatchesTabs";
import { SeasonPicker } from "@/components/matches/SeasonPicker";
import { roundsLabel } from "@/components/matches/standings-copy";
import {
  StandingsLegend,
  StandingsNotes,
  StandingsTable,
  type StandingsView,
} from "@/components/matches/StandingsTable";
import { AppShell } from "@/components/shell/AppShell";
import { ui, UiChip, UiPageTitle } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { roundsPlayed } from "@/lib/league-table";
import { cn } from "@/lib/utils";
import type { FootballSeason } from "@/services/football";

import { DEMO_GAMEWEEK, clubById, standings } from "../data/world";
import { useDemo } from "../state";

const SEASON: FootballSeason = {
  id: "demo-2026-27",
  competitionId: "botola-pro",
  label: "2026/2027",
  startsOn: "2026-08-28",
  endsOn: "2027-06-06",
  status: "active",
  isCurrent: true,
  firstMatchDate: "2026-08-28",
  lastMatchDate: "2027-06-06",
  competitionName: "Botola Pro",
};

export function StandingsScreen() {
  const { t, lang } = useI18n();
  const { state } = useDemo();
  const [view, setView] = useState<StandingsView>("overall");
  const data = standings(state.played ? DEMO_GAMEWEEK : DEMO_GAMEWEEK - 1);
  const rows = view === "home" ? data.home : view === "away" ? data.away : data.overall;

  const views: { value: StandingsView; label: string }[] = [
    { value: "overall", label: t("standings.view.overall") },
    { value: "home", label: t("standings.view.home") },
    { value: "away", label: t("standings.view.away") },
    { value: "form", label: t("matches.table.form") },
  ];
  const shownLabel = views.find((option) => option.value === view)!.label;
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const status = [
    t("matches.competition.botola"),
    roundsLabel(roundsPlayed(data.overall), lang, t, (value) => nf.format(value)),
  ].join(" · ");

  return (
    <AppShell
      backgroundVariant="matches"
      pageHeader={
        <>
          <UiPageTitle
            title={t("matches.title")}
            trailing={
              <SeasonPicker
                seasons={[SEASON]}
                selected={SEASON}
                loading={false}
                onChange={() => undefined}
              />
            }
            className="border-b-0"
          />
          <MatchesTabs active="standings" season={SEASON} />
        </>
      }
    >
      <div className="grid min-w-0 gap-4">
        <p className={cn("min-w-0", ui.text.meta, ui.tone.muted)}>{status}</p>
        <section aria-labelledby="standings-heading" className="grid min-w-0 gap-3">
          <h2 id="standings-heading" className="sr-only">
            {t("matches.table_preview")}
          </h2>
          <div
            role="group"
            aria-label={t("standings.a11y.views")}
            className="flex min-w-0 items-center gap-1.5 max-[359px]:gap-1"
          >
            {views.map((option) => (
              <UiChip
                key={option.value}
                selected={view === option.value}
                onClick={() => setView(option.value)}
                className="min-w-0 shrink max-[359px]:px-2"
              >
                <span className="min-w-0 truncate">{option.label}</span>
              </UiChip>
            ))}
          </div>
          <StandingsTable
            rows={rows}
            clubById={clubById}
            view={view}
            caption={`${t("matches.table_preview")} · ${shownLabel}`}
          />
          {view === "overall" || view === "form" ? <StandingsLegend /> : null}
          <StandingsNotes rows={rows} computed seasonStatus={SEASON.status} />
        </section>
      </div>
      <div className="h-6" aria-hidden />
    </AppShell>
  );
}
