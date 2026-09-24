import { useI18n } from "@/i18n/provider";
import { UiTabs } from "@/components/ui-kit";
import { clubStyle, type ClubPalette } from "@/lib/club-palette";
import type { TranslationKey } from "@/i18n/dictionaries";

export type MatchTabKey = "summary" | "stats" | "lineups" | "h2h";

/**
 * Short labels on purpose. At 390px each of the four columns leaves ~89px of
 * label, and in the display face (Changa 16, heavy when chosen) the French
 * "Statistiques" measures 90px and "Compositions" 102px — both truncated.
 * "Stats" (38px) and "Compos" (59px) fit with room; "Face à face" is 79px.
 * Every Arabic label fits (the longest, "المواجهات", is 78px).
 */
export const MATCH_TABS: { key: MatchTabKey; label: TranslationKey }[] = [
  { key: "summary", label: "matches.detail.tab.summary" },
  { key: "stats", label: "matches.detail.tab.stats_short" },
  { key: "lineups", label: "matches.detail.tab.lineups_short" },
  { key: "h2h", label: "matches.detail.tab.h2h" },
];

/** The id of the one tab panel the page renders; every tab controls it. */
export const MATCH_PANEL_ID = "match-panel";
/** Tab ids are `${MATCH_TAB_ID_BASE}-tab-${key}` (UiTabs), for `aria-labelledby`. */
export const MATCH_TAB_ID_BASE = "match";

/**
 * The match page's section tabs (A-Match): the kit's underline tabs, full
 * bleed on a phone, with the HOME club's edge colour as the indicator — the
 * `clubStyle(home)` on the wrapper puts `--ui-club-edge` (≥ 3:1 on the bar)
 * in scope for `accent`.
 *
 * Sticky under the top bar. The match page's own bar (`MatchTopBar`) is
 * built to the global bar's height, so `--topbar-h` is the right offset here
 * too, and the tabs no longer park underneath it as the old `top-2` did.
 *
 * Public props (`active`, `onChange`) are unchanged; `homePalette` is new.
 */
export function MatchTabs({
  active,
  onChange,
  homePalette,
}: {
  active: MatchTabKey;
  onChange: (key: MatchTabKey) => void;
  /** `clubMatchPalettes(home, away).home` — the indicator's colour. */
  homePalette: ClubPalette;
}) {
  const { t } = useI18n();
  return (
    <div
      {...clubStyle(homePalette)}
      className="sticky top-[var(--topbar-h)] z-20 -mx-[var(--ui-gutter)] min-w-0 sm:mx-0 sm:mt-3"
    >
      <UiTabs<MatchTabKey>
        value={active}
        onChange={onChange}
        label={t("matches.detail.tabs_label")}
        accent="var(--ui-club-edge)"
        idBase={MATCH_TAB_ID_BASE}
        options={MATCH_TABS.map((tab) => ({
          value: tab.key,
          label: t(tab.label),
          panelId: MATCH_PANEL_ID,
        }))}
      />
    </div>
  );
}
