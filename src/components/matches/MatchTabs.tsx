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
        // Call-site adjustments, made here rather than by editing the kit:
        // the kit's segments are 40px tall and these are the primary
        // navigation of the match page, so they are raised to the 44px tap
        // minimum; and four labels share a 390px row.
        //
        // BG-0111 — the meta step was not enough. Measured at 390px in French,
        // each segment is an 88px column with a 72px content box, against
        // "Statistiques" at 80px and "Compositions" at 90px: both rendered as
        // "Statistique…" and "Composition…". The micro step plus a 4px inline
        // padding puts the longest label at 76px inside an 80px box, and
        // `whitespace-normal` means a label that still does not fit wraps at a
        // word boundary rather than losing its ending. Arabic was never over
        // (longest 63px) and is unaffected by either change.
        className={cn(
          "[&>button]:min-h-[var(--ui-tap-min)]",
          "[&>button]:text-[length:var(--ui-text-micro)]",
          "[&>button]:px-1",
          "[&>button]:whitespace-normal [&>button]:[line-height:1.25]",
        )}
        options={MATCH_TABS.map((tab) => ({ value: tab.key, label: t(tab.label) }))}
      />
    </div>
  );
}
