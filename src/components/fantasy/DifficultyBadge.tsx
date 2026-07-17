import { cn } from "@/lib/utils";

const tones: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "bg-emerald-500 text-white",
  2: "bg-emerald-300 text-emerald-950",
  3: "bg-neutral-300 text-neutral-800",
  4: "bg-orange-400 text-orange-950",
  5: "bg-red-600 text-white",
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
        "grid min-h-9 place-items-center rounded-lg px-1.5 text-center text-[10px] font-black leading-tight",
        tones[difficulty],
        className,
      )}
      title={`${label}`}
    >
      {label}
    </div>
  );
}
