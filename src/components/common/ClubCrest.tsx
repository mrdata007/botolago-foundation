import type { Club } from "@/types/domain";
import { responsiveMedia } from "@/lib/media";
import { cn } from "@/lib/utils";
import { FailureAwareImage } from "./FailureAwareImage";
import { ui } from "@/components/ui-kit";

/** The drawn width of each size below (h-7, h-9, h-12), for picking a copy. */
const CREST_SIZES = { sm: "28px", md: "36px", lg: "48px" } as const;

export function ClubCrest({
  club,
  size = "md",
  className,
  loading,
}: {
  club: Club;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** `"eager"` for a crest in the first screen, which should not wait. */
  loading?: "eager" | "lazy";
}) {
  const crest = responsiveMedia(club.crestUrl, "crest", CREST_SIZES[size]);
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
        /**
         * Three things this line got wrong, all of them rules the design
         * system states outright.
         *
         * `135deg` is a PHYSICAL angle (rule 3): under `dir="rtl"` it lands on
         * the opposite corner, so every crest in the product lit from the
         * wrong side in Arabic. `to bottom` reads the same in both.
         *
         * `black` is a literal colour in a file that does not know which theme
         * it is in. `--ui-ink-deep` is the token for a dark scrim and it
         * carries a dark counterpart.
         *
         * And the monogram is white on whatever colour the club supplies,
         * which is a contrast lottery: FUS's orange measured 3.93:1 against
         * the 4.5:1 floor. Mixing both stops toward the ink caps the plate's
         * lightness while keeping the hue, so the plate is still recognisably
         * the club. Measured with white text, worst case per stop-average:
         * orange 7.2:1, cyan 5.2:1, yellow 4.9:1.
         *
         * It does NOT rescue a near-white club (3.9:1). That needs a paired
         * foreground the way `--ui-fdr-N` has `--ui-on-fdr-N`, which is only
         * decidable once real club colours exist — today all 21 production
         * clubs have a null `primaryColor` and fall back to the ink. Tracked
         * against BG-0112.
         */
        background: `linear-gradient(to bottom, color-mix(in oklab, ${club.primaryColor} 60%, var(--ui-ink-deep)) 0%, color-mix(in oklab, ${club.primaryColor} 35%, var(--ui-ink-deep)) 100%)`,
      }}
      aria-hidden
      title={club.name.fr}
    >
      <span>{club.crestPlaceholder}</span>
      <FailureAwareImage
        src={crest.src}
        srcSet={crest.srcSet}
        sizes={crest.sizes}
        loading={loading}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full bg-[color:var(--ui-surface)] object-contain p-0.5"
        draggable={false}
      />
    </div>
  );
}
