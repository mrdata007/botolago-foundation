import { useI18n } from "@/i18n/provider";
import { UiSegmented } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";

export type MatchTabKey = "summary" | "stats" | "lineups" | "h2h";

export const MATCH_TABS: { key: MatchTabKey; label: TranslationKey }[] = [
  { key: "summary", label: "matches.detail.tab.summary" },
  { key: "stats", label: "matches.detail.tab.stats" },
  { key: "lineups", label: "matches.detail.tab.lineups" },
  { key: "h2h", label: "matches.detail.tab.h2h" },
];

/**
 * Sticky segmented control driving the match detail sections.
 *
 * This is now a thin wrapper over the kit's `UiSegmented` rather than a
 * second implementation of a segmented control: the track, the selected
 * segment, the type scale, the radii and the focus ring all come from the
 * kit, so these tabs and the ones on every other screen are the same
 * control. Only the sticky placement is local.
 *
 * Public props (`active`, `onChange`) are unchanged.
 */
export function MatchTabs({
  active,
  onChange,
}: {
  active: MatchTabKey;
  onChange: (key: MatchTabKey) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="sticky top-2 z-20 mt-5 min-w-0">
      <UiSegmented<MatchTabKey>
        value={active}
        onChange={onChange}
        label={t("matches.detail.tabs_label")}
        // Two call-site adjustments, made here rather than by editing the kit:
        // the kit's segments are 40px tall and these are the primary
        // navigation of the match page, so they are raised to the 44px tap
        // minimum; and four labels share a 390px row, so they drop from the
        // body size to the meta size instead of truncating to "Résu…".
        className={cn(
          "[&>button]:min-h-[var(--ui-tap-min)]",
          "[&>button]:text-[length:var(--ui-text-meta)]",
        )}
        options={MATCH_TABS.map((tab) => ({ value: tab.key, label: t(tab.label) }))}
      />
    </div>
  );
}
