import { cn } from "@/lib/utils";

/**
 * Fixture Difficulty Rating pill on the same `--fpl-fdr-*` scale the FPL
 * reference uses (1 easiest/green → 5 hardest/dark red), already defined in
 * `styles.css` for reuse across the Fantasy design system.
 */
const tones: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "bg-[color:var(--fpl-fdr-1)] text-[color:var(--fpl-ink-deep)]",
  2: "bg-[color:var(--fpl-fdr-2)] text-[color:var(--fpl-ink-deep)]",
  3: "bg-[color:var(--fpl-fdr-3)] text-[color:var(--fpl-ink-deep)]",
  4: "bg-[color:var(--fpl-fdr-4)] text-white",
  5: "bg-[color:var(--fpl-fdr-5)] text-white",
};

export function DifficultyBadge({
  difficulty,
  label,
  className,
}: {
  difficulty: 1 | 2 | 3 | 4 | 5;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-h-9 place-items-center rounded-[4px] px-1.5 text-center text-[10px] font-black leading-tight",
        tones[difficulty],
        className,
      )}
      title={`${label}`}
    >
      {label}
    </div>
  );
}
