import { useNavigate } from "@tanstack/react-router";
import { UiTabs } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { PRONOSTICS_PROMOTED } from "@/lib/feature-flags";
import { useIntentPreload } from "@/lib/intent-preload";
import type { FootballSeason } from "@/services/football";
import { seasonSearch } from "./matches-search";

export type MatchesView = "calendar" | "standings" | "predictions";

/**
 * The two halves of the Matches tab, under its title band: the calendar
 * (`/matches`) and the league table (`/matches/standings`). Full-bleed
 * underline tabs, like the match page's; each is its own page, so choosing
 * one navigates and Back returns to the other. The season shown goes along
 * (`matches-search.ts`), so a reader browsing 2025/2026 stays in 2025/2026.
 *
 * A tab loads its page ahead, as a link would (`useIntentPreload`): the
 * pointer resting on it or a finger touching it starts the table's or the
 * round's reads before the click lands.
 */
export function MatchesTabs({
  active,
  season,
}: {
  active: MatchesView;
  /** The season the page is showing, once it is known. */
  season?: Pick<FootballSeason, "id" | "isCurrent">;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const intent = useIntentPreload();
  // Where each tab goes: the same place for the click and the preload.
  const destination = (view: MatchesView) =>
    view === "predictions"
      ? { to: "/pronostics" as const }
      : {
          to: view === "standings" ? ("/matches/standings" as const) : ("/matches" as const),
          search: seasonSearch(season),
        };
  return (
    <UiTabs<MatchesView>
      value={active}
      onChange={(next) => {
        intent.cancel();
        void navigate(destination(next));
      }}
      tabIntent={(view) => intent.handlers(destination(view))}
      label={t("matches.a11y.views")}
      idBase="matches-view"
      options={[
        { value: "calendar", label: t("matches.view.calendar") },
        { value: "standings", label: t("matches.table_preview") },
        // Pronostics (BG-0146), an entry point: shown once promoted.
        ...(PRONOSTICS_PROMOTED
          ? [{ value: "predictions" as const, label: t("matches.tab.predictions") }]
          : []),
      ]}
    />
  );
}
