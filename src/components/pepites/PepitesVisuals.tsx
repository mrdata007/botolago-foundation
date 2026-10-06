import type { Movement, PepitesPlayerCard } from "@/backend/pepites/contracts";
import { ClubCrest } from "@/components/common/ClubCrest";
import { PlayerPhoto, type PlayerPhotoSize } from "@/components/common/PlayerPhoto";
import { ui, UiBadge, UiRankMovement } from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { useRevealOnView } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { printedRatingBand, type RatingBand, segments, shirtName, teamKit } from "./pepites-design";
import { formatNumber, type ListedClub, playerPhotoUrl, teamAsClub } from "./pepites-format";

/**
 * The data glyphs the Pépites screens share, on the main kit (BG-0152): the
 * rating chip, the ten-segment bar, the score ring, the fill bar, the
 * player's photo, the shirt a player without a licensed photo wears, and
 * last week's movement. Data goes in; nothing here fetches.
 *
 * Every colour is a `--ui-*` token, so each glyph is right in `.dark` too.
 * Page furniture (titles, chips, figures, meta lines) is the kit's own:
 * `UiPageTitle`/`UiHeader`, `UiChip`, `UiStatBlock`, `ui.text.meta`.
 */

/** The ten segments of a `Seg10Bar`, by position. */
const SEGMENT_INDEXES = Array.from({ length: 10 }, (_, index) => index);

/**
 * Seg10Bar: ten rounded segments, `round(value / 10)` of them lit from the
 * inline start (so the bar fills from the right in Arabic). Lit is the brand
 * foreground (`--ui-ink-fg`), unlit the sunken track — the kit's progress
 * colours, no skew and no energy gradient. `value` is out of 100. The figure
 * itself is always printed beside the bar; the bar is its picture.
 *
 * `className` sets the height and the gap on a wider screen
 * (`md:h-3 md:gap-1`).
 */
export function Seg10Bar({
  value,
  className,
  label,
}: {
  value: number | null | undefined;
  className?: string;
  /** Names the bar (`role="img"`) when no figure beside it does. */
  label?: string;
}) {
  const [ref, reveal] = useRevealOnView<HTMLDivElement>();
  // Empty while waiting to be seen, then lit one segment after another.
  const lit = reveal === "armed" ? 0 : segments(value);
  return (
    <div
      ref={ref}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("flex h-1.5 w-full gap-0.5", className)}
    >
      {SEGMENT_INDEXES.map((index) => (
        <span
          key={index}
          className={cn(
            "h-full flex-1",
            ui.radius.full,
            "transition-colors duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
            index < lit ? "bg-[color:var(--ui-ink-fg)]" : "bg-[color:var(--ui-surface-sunken)]",
          )}
          style={reveal === "played" ? { transitionDelay: `${index * 45}ms` } : undefined}
        />
      ))}
    </div>
  );
}

/**
 * Each rating band's fill and the foreground measured for it. The rating
 * tokens are the fixture-difficulty scale read backwards (styles.css), so
 * band 5 (≥ 7.5) is green and band 1 (< 6) deep magenta, in both themes.
 * Spelled out once each so Tailwind sees every class.
 */
const RATING_PAINT: Record<RatingBand, string> = {
  1: "bg-[color:var(--ui-rating-1)] text-[color:var(--ui-on-rating-1)]",
  2: "bg-[color:var(--ui-rating-2)] text-[color:var(--ui-on-rating-2)]",
  3: "bg-[color:var(--ui-rating-3)] text-[color:var(--ui-on-rating-3)]",
  4: "bg-[color:var(--ui-rating-4)] text-[color:var(--ui-on-rating-4)]",
  5: "bg-[color:var(--ui-rating-5)] text-[color:var(--ui-on-rating-5)]",
};

/**
 * RatingChip: a match rating on its five-step scale (`printedRatingBand`), always
 * with the number, so the colour is never the only cue. A tight tag in the
 * micro step, heavy and tabular, at least 36px wide so a column of chips
 * lines up. No rating prints a muted dash in the same box.
 */
export function RatingChip({
  rating,
  className,
}: {
  rating: number | null | undefined;
  className?: string;
}) {
  const { lang } = useI18n();
  const frame = cn(
    "inline-flex min-w-9 shrink-0 items-center justify-center px-1.5 py-0.5",
    ui.radius.tight,
    ui.text.micro,
    ui.text.tabular,
    className,
  );
  if (typeof rating !== "number" || !Number.isFinite(rating)) {
    return <span className={cn(frame, ui.tone.muted)}>–</span>;
  }
  // The band of the printed figure, so two chips reading "6,5" match.
  const band = printedRatingBand(rating);
  return (
    <span
      data-band={band}
      className={cn(frame, "[font-weight:var(--ui-weight-heavy)]", RATING_PAINT[band])}
    >
      <bdi>{formatNumber(rating, lang, 1)}</bdi>
    </span>
  );
}

/** A name written right to left: its first letter is Arabic or Hebrew. */
function nameDirection(name: string): "ltr" | "rtl" {
  const first = name.match(/\p{L}/u)?.[0];
  return first && /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(first) ? "rtl" : "ltr";
}

/**
 * A player's name in a box that may cut it (`truncate`, `line-clamp-*`).
 * The box takes the NAME's direction, not the page's, so the ellipsis lands
 * at the end of the name: in an Arabic row an inherited right-to-left box
 * cut the start of "Baba Bello Ilou" and lost the first name ("… Bello
 * Ilou"). The `dir` attribute also isolates the name, as a `<bdi>` would.
 * The box still lines up with the row: a Latin name in an Arabic row sits
 * at the inline end of its own (left-to-right) box, which is the right, the
 * row's start. A caller's own alignment (`text-center`) wins.
 */
export function PepitesName({
  name,
  as: Tag = "span",
  className,
}: {
  name: string;
  as?: "span" | "p";
  className?: string;
}) {
  const { lang } = useI18n();
  const own = nameDirection(name);
  const row = lang === "ar" ? "rtl" : "ltr";
  return (
    <Tag dir={own} className={cn(own === row ? "text-start" : "text-end", className)}>
      {name}
    </Tag>
  );
}

/**
 * A Pépites player's photo as the kit's `PlayerPhoto` disc: the approved
 * photo when there is one, otherwise the silhouette in the club's shirt
 * (`teamAsClub`). Decorative, like every photo disc: the name is printed
 * beside it. Sizes are `PlayerPhoto`'s: xs 28, sm 32, md 40, lg 56, xl 96.
 */
export function PepitesPlayerPhoto({
  player,
  size = "md",
  className,
  loading,
}: {
  player: Pick<PepitesPlayerCard, "team" | "photo">;
  size?: PlayerPhotoSize;
  className?: string;
  /** `"eager"` for a photo in the first screen. */
  loading?: "eager" | "lazy";
}) {
  return (
    <PlayerPhoto
      photoUrl={playerPhotoUrl(player)}
      club={teamAsClub(player.team)}
      size={size}
      className={className}
      loading={loading}
    />
  );
}

/**
 * Who a row is about, as one disc: the player's photo when the read returned
 * one (only under a release that allows in-app use; the RPC answers null for
 * everyone else), otherwise the club's crest from the app's club catalogue
 * (`listed`), otherwise the club-colour disc with the club's initials, which
 * is also what `ClubCrest` shows while a crest loads or when it fails. A
 * player without a club gets the silhouette. Decorative, like every disc:
 * the name and the club are printed beside it. Sizes are the kit's discs (xs
 * 28, sm 32, md 40, lg 56); every option fills the same box, so nothing moves
 * when a photo or a crest arrives.
 */
export function PepitesIdentityDisc({
  player,
  listed,
  size = "md",
  className,
  loading,
}: {
  player: Pick<PepitesPlayerCard, "team" | "photo">;
  /** The player's club in the app's club catalogue (`useClubCatalogue`). */
  listed?: ListedClub | null;
  size?: Exclude<PlayerPhotoSize, "xl">;
  className?: string;
  /** `"eager"` for a disc in the first screen. */
  loading?: "eager" | "lazy";
}) {
  const photoUrl = playerPhotoUrl(player);
  const club = teamAsClub(player.team, listed);
  if (photoUrl || !club) {
    return (
      <PlayerPhoto
        photoUrl={photoUrl}
        club={club}
        size={size}
        className={className}
        loading={loading}
      />
    );
  }
  return <ClubCrest club={club} size={size} className={className} loading={loading} />;
}

/** A rank plate's box and figure, per size. */
const PLATE_SIZE = {
  /** 28px: a table's rank column. */
  sm: cn("h-7 min-w-7 px-1", ui.radius.segment, ui.stat.sm),
  /** 36px: a Top 10 row. */
  md: cn("h-9 min-w-9 px-1", ui.radius.segment, ui.score.row),
  /** 44px: the featured N°1. */
  lg: cn("h-11 min-w-11 px-1.5", ui.radius.track, ui.score.sm),
} as const;

/**
 * A rank as the share pictures set it (BG-0153): 1 to 3 on the white score
 * plate with Tunnel Navy figures (`ui.surface.scorebox`, light in both
 * themes), 4 and below as a muted figure in the same box, so a column of
 * ranks lines up. On a card the plate also takes a hairline ring and the
 * card shadow, because in the light theme the plate and the card are the
 * same white; on the dark photo band (`onBand`) it stays flat, the white
 * plate on the navy being cue enough (the lifted shadow there is the score
 * plate's alone: DESIGN.md, The One Lift Rule), and the other ranks take
 * the band's quieter foreground. The figure is the rank's only cue, so the
 * plate needs no label.
 */
export function RankPlate({
  rank,
  size = "md",
  onBand = false,
  className,
}: {
  rank: number | null;
  size?: keyof typeof PLATE_SIZE;
  onBand?: boolean;
  className?: string;
}) {
  const { lang } = useI18n();
  const podium = typeof rank === "number" && rank >= 1 && rank <= 3;
  return (
    <span
      data-testid="pepites-rank"
      data-podium={podium ? "" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        PLATE_SIZE[size],
        podium
          ? cn(
              ui.surface.scorebox,
              !onBand && cn(ui.shadow.card, "ring-1 ring-inset ring-[color:var(--ui-rule)]"),
            )
          : onBand
            ? ui.tone.onInkMuted
            : ui.tone.muted,
        className,
      )}
    >
      <bdi>{typeof rank === "number" ? formatNumber(rank, lang) : "–"}</bdi>
    </span>
  );
}

/**
 * The shirt's hairline: the default text colour at a quarter strength, so a
 * white or yellow kit keeps its shape on a white card and a navy one on the
 * dark card.
 */
const SHIRT_OUTLINE = "stroke-[color:color-mix(in_oklab,var(--ui-on-surface)_25%,transparent)]";

/**
 * The shirt a player wears when no licensed photo exists: the club's kit
 * (src/lib/kits.ts), the surname on the back and the Pépites rank as the
 * number, set in the display face. The kit colours are club data; the
 * outline is themed. Default 128×120; `className` resizes it.
 */
export function PepitesShirt({
  player,
  number,
  className,
}: {
  player: Pick<PepitesPlayerCard, "name" | "team">;
  number: number | null;
  className?: string;
}) {
  const { lang } = useI18n();
  const kit = teamKit(player.team);
  const name = shirtName(player.name);
  return (
    <svg
      viewBox="0 0 130 122"
      className={cn("h-30 w-32", className)}
      aria-hidden
      data-testid="pepites-shirt"
    >
      <path
        d="M41.2 0.53L17.73 11.64L0.67 40.53L19.87 53.87L28.4 44.98V120.53H100.93V44.98L109.47 53.87L128.67 40.53L111.6 11.64L88.13 0.53C72.49 4.98 56.84 4.98 41.2 0.53Z"
        fill={kit.primary}
        className={SHIRT_OUTLINE}
      />
      <path
        d="M41.2 1.09L17.73 12.2L0.67 41.09L19.87 54.42L28.4 45.54V25.54L41.2 1.09ZM88.13 1.09L111.6 12.2L128.67 41.09L109.47 54.42L100.93 45.54V25.54L88.13 1.09Z"
        fill={kit.secondary}
        className={SHIRT_OUTLINE}
      />
      {/* Font sizes are viewBox units: they scale with the shirt. */}
      <text
        x="64.7"
        y="44"
        textAnchor="middle"
        fill={kit.ink}
        className={cn(ui.font.display, "[font-weight:var(--ui-weight-heavy)]")}
        fontSize={name.length > 10 ? 9 : 12}
      >
        {name}
      </text>
      {number !== null ? (
        <text
          x="64.7"
          y="92"
          textAnchor="middle"
          fill={kit.ink}
          className={cn(ui.font.display, "[font-weight:var(--ui-weight-heavy)]")}
          fontSize={34}
        >
          {formatNumber(number, lang)}
        </text>
      ) : null}
    </svg>
  );
}

/**
 * ScoreRing: the Pépites score on a ring, the arc in the brand foreground
 * (`--ui-ink-fg`) over the sunken track, from twelve o'clock clockwise,
 * `score / 100` of the way round. The figure is `ui.score.sm` (`ui.score.md`
 * from a 96px ring) in the brand foreground, the label under it
 * `ui.text.label` muted. The arc stays clockwise in Arabic, as a clock does.
 */
export function ScoreRing({
  score,
  label,
  size = 80,
  testId,
}: {
  score: number | null;
  label: string;
  /** The ring's diameter in px (geometry only; the type comes from the ramps). */
  size?: number;
  testId?: string;
}) {
  const { lang } = useI18n();
  const stroke = size * 0.08;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const [revealRef, reveal] = useRevealOnView<HTMLDivElement>();
  const share =
    typeof score === "number" && reveal !== "armed" ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const hasScore = typeof score === "number" && score > 0;
  return (
    <div
      ref={revealRef}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      data-testid={testId}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--ui-surface-sunken)"
          strokeWidth={stroke}
        />
        {hasScore ? (
          <circle
            className="transition-[stroke-dasharray] duration-[var(--duration-hero)] ease-[var(--ease-emphasized)]"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--ui-ink-fg)"
            strokeWidth={stroke}
            strokeDasharray={`${circumference * share} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <bdi className={cn(size >= 96 ? ui.score.md : ui.score.sm, ui.tone.ink)}>
          {typeof score === "number" ? formatNumber(Math.round(score), lang) : "–"}
        </bdi>
        <span className={cn(ui.text.label, ui.tone.muted)}>{label}</span>
      </span>
    </div>
  );
}

/**
 * A horizontal fill bar (`percent` of its track) that grows from the inline
 * start the first time it is scrolled into view. The track is the sunken
 * surface on the track radius; the fill is the brand foreground (`ink`) or
 * the faint text colour (`faint`, the quieter of two bars side by side).
 * `className` sets the height (default 10px) and the width.
 */
export function FillBar({
  percent,
  fill = "ink",
  className,
}: {
  percent: number;
  fill?: "ink" | "faint";
  className?: string;
}) {
  const [ref, reveal] = useRevealOnView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn(
        "h-2.5 overflow-hidden bg-[color:var(--ui-surface-sunken)]",
        ui.radius.track,
        className,
      )}
    >
      <div
        className={cn(
          "h-full transition-[width] duration-[var(--duration-hero)] ease-[var(--ease-emphasized)]",
          ui.radius.track,
          fill === "faint"
            ? "bg-[color:var(--ui-on-surface-faint)]"
            : "bg-[color:var(--ui-ink-fg)]",
        )}
        style={{ width: reveal === "armed" ? "0%" : `${percent}%` }}
      />
    </div>
  );
}

function movementLabel(movement: NonNullable<Movement>, t: (key: TranslationKey) => string) {
  switch (movement.kind) {
    case "new":
      return t("pepites.movement.new");
    case "up":
      return t("pepites.movement.up");
    case "down":
      return t("pepites.movement.down");
    case "same":
      return t("pepites.movement.same");
  }
}

/**
 * Last week's movement: the kit's quiet rank movement (a small ▲/▼ and the
 * places moved, in the positive or negative text colour; "=" when it held),
 * and a positive badge for a newcomer. Each carries its name for screen
 * readers, so colour is never the only cue. Nothing for no movement data.
 */
export function MovementMark({
  movement,
  onBand = false,
  className,
}: {
  movement: Movement;
  /**
   * On the dark photo band (`PepitesFeature`): the green and magenta text
   * steps are made for the page's surface, so the mark takes the band's
   * plain foreground (the arrow and the hidden label still say which way),
   * and a newcomer the outline badge.
   */
  onBand?: boolean;
  className?: string;
}) {
  const { t, lang } = useI18n();
  if (!movement) return null;
  const label = movementLabel(movement, t);
  if (movement.kind === "new") {
    return (
      <span
        title={label}
        data-testid="pepites-movement"
        className={cn("inline-flex shrink-0", className)}
      >
        <UiBadge tone={onBand ? "outline" : "positive"}>
          <span aria-hidden>{t("pepites.movement.new_short")}</span>
          <span className="sr-only">{label}</span>
        </UiBadge>
      </span>
    );
  }
  // `UiRankMovement` reads the places moved as `previousRank - rank`.
  const by = movement.by ?? 1;
  const previousRank = movement.kind === "up" ? by : movement.kind === "down" ? -by : 0;
  return (
    <span
      title={label}
      data-testid="pepites-movement"
      className={cn("inline-flex shrink-0", className)}
    >
      <UiRankMovement
        variant="quiet"
        rank={0}
        previousRank={previousRank}
        className={onBand ? ui.tone.onInkPlain : undefined}
        labels={{
          up: t("pepites.movement.up"),
          down: t("pepites.movement.down"),
          same: t("pepites.movement.same"),
        }}
        formatDelta={(places) => formatNumber(places, lang)}
      />
    </span>
  );
}
