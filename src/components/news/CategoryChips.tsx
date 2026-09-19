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
      role="tablist"
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
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "min-h-11 shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.08em]",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
        active
          ? "border-[color:var(--brand-accent)] bg-[color:var(--brand-accent)] text-white"
          : "border-[var(--glass-border)] bg-white/50 text-foreground hover:bg-white/70",
      )}
    >
      {children}
    </button>
  );
}
