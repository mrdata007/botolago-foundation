import { useNavigate } from "@tanstack/react-router";
import { UiTabs } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import type { FootballSeason } from "@/services/football";
import { seasonSearch } from "./matches-search";

export type MatchesView = "calendar" | "standings";

/**
 * The two halves of the Matches tab, under its title band: the calendar
 * (`/matches`) and the league table (`/matches/standings`). Full-bleed
 * underline tabs, like the match page's; each is its own page, so choosing
 * one navigates and Back returns to the other. The season shown goes along
 * (`matches-search.ts`), so a reader browsing 2025/2026 stays in 2025/2026.
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
  return (
    <UiTabs<MatchesView>
      value={active}
      onChange={(next) => {
        void navigate({
          to: next === "standings" ? "/matches/standings" : "/matches",
          search: seasonSearch(season),
        });
      }}
      label={t("matches.a11y.views")}
      idBase="matches-view"
      options={[
        { value: "calendar", label: t("matches.view.calendar") },
        { value: "standings", label: t("matches.table_preview") },
      ]}
    />
  );
}
