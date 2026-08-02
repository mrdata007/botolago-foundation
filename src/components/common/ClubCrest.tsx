import type { Club } from "@/types/domain";
import { cn } from "@/lib/utils";
import { FailureAwareImage } from "./FailureAwareImage";

export function ClubCrest({
  club,
  size = "md",
  className,
}: {
  club: Club;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims =
    size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-12 w-12 text-sm" : "h-9 w-9 text-xs";
  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-xl font-black text-white shadow-inner ring-1 ring-white/20",
        dims,
        className,
      )}
      style={{
        background: `linear-gradient(135deg, ${club.primaryColor} 0%, color-mix(in oklab, ${club.primaryColor} 60%, black) 100%)`,
      }}
      aria-hidden
      title={club.name.fr}
    >
      <span>{club.crestPlaceholder}</span>
      <FailureAwareImage
        src={club.crestUrl}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full bg-white/95 object-contain p-0.5"
        draggable={false}
      />
    </div>
  );
}
