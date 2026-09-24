import { UiChip } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { categoryLabel, type CategoryOption } from "./news-data";

/**
 * Content-discovery chips driven by real, currently-populated categories
 * (see `deriveCategoryOptions`) rather than a hardcoded tab list.
 *
 * Option A: one line that scrolls sideways under the page title, bleeding to
 * the band's edges (the negative gutter margin is symmetric, so it mirrors in
 * Arabic), in sentence case on the kit's round chips — navy with white when
 * chosen.
 */
export function CategoryChips({
  categories,
  selected,
  onSelect,
  className,
}: {
  categories: readonly CategoryOption[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("news.filter_categories")}
      className={cn(
        // `py-1` keeps the focus ring (2px offset + 2px ring) inside the
        // scroller, which clips on both axes once it scrolls on one.
        "-mx-[var(--ui-gutter)] flex gap-2 overflow-x-auto px-[var(--ui-gutter)] py-1",
        "scroll-px-[var(--ui-gutter)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        // A wide screen has the room, and a mouse has no easy way to scroll
        // sideways past a hidden scrollbar: there the chips wrap.
        "md:flex-wrap md:overflow-visible",
        className,
      )}
    >
      <CategoryChip active={selected === null} onClick={() => onSelect(null)}>
        {t("news.filter_all")}
      </CategoryChip>
      {categories.map((category) => (
        <CategoryChip
          key={category.slug}
          active={selected === category.slug}
          onClick={() => onSelect(selected === category.slug ? null : category.slug)}
        >
          {categoryLabel(category, t)}
        </CategoryChip>
      ))}
    </div>
  );
}

/**
 * One chip.
 *
 * The chrome is the kit's `UiChip`, so a selected category here and a
 * selected filter anywhere else in the product are the same control. The row
 * was previously announced as a `tablist`, which it is not — selecting a
 * category filters a feed in place, it does not switch panels — so it is a
 * labelled group of `aria-pressed` toggles, which is what `UiChip` models.
 * The A-News board draws `role="tablist"`; that is the semantics this file
 * deliberately left, and it stays left.
 */
function CategoryChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <UiChip
      selected={active}
      onClick={onClick}
      className="whitespace-nowrap [font-weight:var(--ui-weight-heavy)]"
    >
      {children}
    </UiChip>
  );
}
