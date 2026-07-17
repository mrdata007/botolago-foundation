import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export function GameweekSelector({
  value,
  min = 1,
  max = 30,
  onChange,
  className,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  const { t, dir } = useI18n();
  const prev = () => onChange(Math.max(min, value - 1));
  const next = () => onChange(Math.min(max, value + 1));
  // In RTL, the leading arrow (visually on the right) still means "previous"
  // gameweek. The label between them carries the semantics; buttons keep
  // their logical prev/next roles.
  return (
    <div className={cn("glass-surface glass-regular inline-flex items-center gap-1 rounded-full border border-[var(--glass-border)] px-1 py-1", className)}>
      <button
        onClick={prev}
        disabled={value <= min}
        className="grid h-8 w-8 place-items-center rounded-full text-foreground disabled:opacity-40 hover:bg-white/70"
        aria-label="previous gameweek"
      >
        {dir === "rtl" ? "›" : "‹"}
      </button>
      <div className="min-w-24 select-none text-center text-xs font-black uppercase tracking-wider text-foreground">
        {t("fantasy.points.gameweek")} {value}
      </div>
      <button
        onClick={next}
        disabled={value >= max}
        className="grid h-8 w-8 place-items-center rounded-full text-foreground disabled:opacity-40 hover:bg-white/70"
        aria-label="next gameweek"
      >
        {dir === "rtl" ? "‹" : "›"}
      </button>
    </div>
  );
}
