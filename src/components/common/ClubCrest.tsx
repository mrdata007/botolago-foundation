import type { Club } from "@/types/domain";
import { cn } from "@/lib/utils";
import { FailureAwareImage } from "./FailureAwareImage";
import { ui } from "@/components/ui-kit";

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
    size === "sm"
      ? `h-7 w-7 ${ui.text.micro}`
      : size === "lg"
        ? `h-12 w-12 ${ui.text.secondary}`
        : `h-9 w-9 ${ui.text.meta}`;
  return (
    <div
      className={cn(
        // Kit radius; the initials plate keeps an explicit on-ink text colour
        // because its background is the club's own colour, not a surface token.
        "relative grid shrink-0 place-items-center overflow-hidden rounded-[var(--ui-radius-control)] text-[color:var(--ui-on-ink-plain)] [font-weight:var(--ui-weight-hero)] ring-1 ring-[color:var(--ui-rule)]",
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
        className="absolute inset-0 h-full w-full bg-[color:var(--ui-surface)] object-contain p-0.5"
        draggable={false}
      />
    </div>
  );
}
