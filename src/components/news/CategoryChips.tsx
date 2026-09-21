import { ui, UiChip } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { CategoryOption } from "./news-data";

/**
 * Content-discovery chips driven by real, currently-populated categories
 * (see `deriveCategoryOptions`) rather than a hardcoded tab list.
 */
export function CategoryChips({
  categories,
  selected,
  onSelect,
}: {
  categories: readonly CategoryOption[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("news.filter_clubs")}
      className="flex flex-wrap gap-2 [scrollbar-width:none]"
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
          {category.name}
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
 * category filters a feed in place, it does not switch panels — so it is now
 * a labelled group of `aria-pressed` toggles, which is what `UiChip` models.
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
      className={cn(ui.space.tap, "justify-center px-3.5 uppercase", ui.text.label)}
    >
      {children}
    </UiChip>
  );
}
