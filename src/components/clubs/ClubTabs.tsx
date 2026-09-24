import { UiTabs } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle } from "@/lib/club-palette";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";

export const CLUB_TAB_KEYS = ["overview", "matches", "standings", "squad"] as const;
export type ClubTabKey = (typeof CLUB_TAB_KEYS)[number];

/** The id of the one tab panel the page renders; every tab controls it. */
export const CLUB_PANEL_ID = "club-panel";
/** Tab ids are `${CLUB_TAB_ID_BASE}-tab-${key}` (UiTabs), for `aria-labelledby`. */
export const CLUB_TAB_ID_BASE = "club";

/**
 * A club page's section tabs: the kit's underline tabs, full bleed on a
 * phone, with the club's edge colour as the indicator (`clubStyle(club)` on
 * the wrapper puts `--ui-club-edge`, ≥ 3:1 on the bar, in scope).
 *
 * Four, not five. At 390px each of four columns leaves ~89px of label, and
 * "Classement" in the display face needs about 80; a fifth column would cut
 * it. The season's statistics live on "Aperçu" instead.
 *
 * Every label is looked up by its own literal key, so the i18n gate sees each.
 * Sticky under the page's bar, which is built to the global bar's height.
 */
export function ClubTabs({
  club,
  active,
  onChange,
  flush = false,
}: {
  club: Club;
  active: ClubTabKey;
  onChange: (key: ClubTabKey) => void;
  /**
   * Directly under the club band on a phone, as the match tabs sit under the
   * split header — for when no key-numbers card stands between the two.
   */
  flush?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      {...clubStyle(club)}
      className={cn(
        "sticky top-[var(--topbar-h)] z-20 -mx-[var(--ui-gutter)] min-w-0 sm:mx-0 sm:mt-4",
        !flush && "mt-4",
      )}
    >
      <UiTabs<ClubTabKey>
        value={active}
        onChange={onChange}
        label={t("club.tabs_label")}
        accent="var(--ui-club-edge)"
        idBase={CLUB_TAB_ID_BASE}
        options={[
          { value: "overview", label: t("club.tab.overview"), panelId: CLUB_PANEL_ID },
          { value: "matches", label: t("club.tab.matches"), panelId: CLUB_PANEL_ID },
          { value: "standings", label: t("club.tab.standings"), panelId: CLUB_PANEL_ID },
          { value: "squad", label: t("club.tab.squad"), panelId: CLUB_PANEL_ID },
        ]}
      />
    </div>
  );
}
