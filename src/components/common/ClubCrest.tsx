import type { Club } from "@/types/domain";
import { clubStyle, type ClubPalette } from "@/lib/club-palette";
import { cn } from "@/lib/utils";
import { crestMonogramClass, crestStyle } from "./club-crest-style";
import { FailureAwareImage } from "./FailureAwareImage";
import { ui } from "@/components/ui-kit";

export type ClubCrestSize = "xs" | "sm" | "md" | "lg";

/**
 * `solid` — the club-colour disc, for a crest on a surface (list rows,
 * tables, cards). `inverse` — a surface disc with the club colour as its
 * text and the lifted shadow, for a crest sitting ON a club-colour block
 * (the split score header, the compact bar, a profile card), where a
 * club-colour disc would vanish into its own background.
 */
export type ClubCrestTone = "solid" | "inverse";

/**
 * Disc diameter and the monogram's base size. The monogram is then capped by
 * the container query below, so the size here is a ceiling, not a promise.
 *
 * xs 28 — the live strip, the compact score bar, chips
 * sm 32 — list rows and tables
 * md 40 — cards
 * lg 56 — the match hero, a profile card
 */
const SIZE: Record<ClubCrestSize, string> = {
  xs: "h-7 w-7 text-[length:var(--ui-text-micro)]",
  sm: "h-8 w-8 text-[length:var(--ui-text-micro)]",
  md: "h-10 w-10 text-[length:var(--ui-text-meta)]",
  lg: "h-14 w-14 text-[length:var(--ui-text-body)]",
};

/**
 * A club's crest, as Option A draws it: a DISC.
 *
 * With a badge image (production has real ones), the badge sits on a light
 * plate inside the disc. The plate is `--ui-scorebox` rather than
 * `--ui-surface` on purpose: club badges are drawn for a light ground, and
 * the score-box plate is the one surface token that stays light in the dark
 * theme too. Without an image — or when the image fails, which removes it —
 * the disc is the club's own colour with its monogram, both from
 * `clubStyle()`: the fill, and a foreground chosen by measured contrast per
 * theme (FUS orange takes dark letters; white would be 3:1).
 *
 * `inverse` flips that for a crest on a club block: a surface disc, the club
 * colour as the monogram (`--ui-club-fg`, ≥ 4.5:1, the plain foreground in
 * dark), lifted off the block by `--ui-shadow-lifted` and ringed in the
 * club's edge colour, so it stays a disc on a light kit's block too.
 *
 * Decorative: the club's name is always printed beside a crest, so the disc
 * is hidden from assistive tech and carries the name only as a tooltip.
 *
 * `palette` — the colours to paint instead of the club's own. Anything that
 * shows BOTH sides of a fixture takes its colours from `clubMatchPalettes`,
 * whose away side may be re-coloured by the clash rule (Wydad v Tétouan:
 * Tétouan becomes its white second kit). The crest puts `data-club` and the
 * `--club-*` vars on its OWN root, which overrides any ancestor's, so an
 * away crest has to be handed that resolved palette —
 * `<ClubCrest club={away} palette={pair.away} />` — or its disc stays the
 * clashing red beside a re-coloured half or edge bar.
 */
export function ClubCrest({
  club,
  size = "md",
  tone = "solid",
  palette,
  className,
}: {
  club: Club;
  size?: ClubCrestSize;
  tone?: ClubCrestTone;
  /** A resolved palette (e.g. `clubMatchPalettes(home, away).away`) that wins over the club's own. */
  palette?: ClubPalette;
  className?: string;
}) {
  // A passed palette is already computed, so `clubStyle` only writes it out;
  // the memoised path is for the club's own colours.
  const { style, "data-club": dataClub } = palette ? clubStyle(palette) : crestStyle(club);
  return (
    <div
      data-club={dataClub}
      style={style}
      className={cn(
        "@container relative grid shrink-0 place-items-center overflow-hidden",
        ui.radius.full,
        "[font-weight:var(--ui-weight-heavy)]",
        tone === "inverse"
          ? // The ring again: a surface disc on a white or yellow kit's block
            // is surface on surface, and the club's edge (≥ 3:1) is what
            // keeps it a disc (Wydad's white second kit against Berkane).
            cn(ui.club.inverse, ui.club.ring, ui.shadow.lifted)
          : // The inner ring is invisible on most clubs (the edge colour is
            // the fill) and is what keeps a white or yellow kit a shape on a
            // white card.
            cn(ui.club.fill, ui.club.ring),
        SIZE[size],
        className,
      )}
      aria-hidden
      title={club.name.fr}
    >
      <span className={cn("leading-none", crestMonogramClass(club.crestPlaceholder))}>
        {club.crestPlaceholder}
      </span>
      <FailureAwareImage
        src={club.crestUrl}
        alt=""
        aria-hidden
        className={cn(
          "absolute inset-0 h-full w-full object-contain p-[16%]",
          ui.radius.full,
          "bg-[color:var(--ui-scorebox)] ring-1 ring-inset ring-[color:var(--ui-rule)]",
        )}
        draggable={false}
      />
    </div>
  );
}
