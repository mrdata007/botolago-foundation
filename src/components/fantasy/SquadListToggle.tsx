import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export type SquadViewMode = "squad" | "list";

interface Props {
  value: SquadViewMode;
  onChange: (v: SquadViewMode) => void;
  className?: string;
}

/**
 * Segmented control to switch between the pitch (Squad) view and the
 * grouped list view. Rendered as a glass surface above the pitch.
 */
export function SquadListToggle({ value, onChange, className }: Props) {
  const { t } = useI18n();
  const options: { key: SquadViewMode; label: string }[] = [
    { key: "squad", label: t("fantasy.view.squad") },
    { key: "list", label: t("fantasy.view.list") },
  ];
  return (
    <div
      role="tablist"
      aria-label={t("fantasy.view.toggle_label")}
      className={cn(
        "glass-surface glass-regular inline-flex rounded-full border border-[var(--glass-border)] p-1 text-xs font-bold",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
              active
                ? "bg-[color:var(--brand-primary)] text-white shadow"
                : "text-foreground/70 hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
