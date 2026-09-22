import wordmark from "@/assets/brand/botolago-wordmark-light.svg";
import type { ArticleCategory, Club } from "@/types/domain";
import { cn } from "@/lib/utils";
import { ClubCrest } from "./ClubCrest";

/**
 * BG-0076 — the branded plate a News card paints where a hero photo would be.
 *
 * In production most French editions and a third of the Arabic ones carry no
 * `hero_asset_id`, so `MediaImage` rendered its gradient and nothing else: an
 * empty dark block, and for a French visitor the first thing above the fold.
 * The photo is still missing — what changes here is that its absence reads as
 * a deliberate brand plate rather than a failed image. The content question
 * (what the French feed should actually contain) is BG-0065 and stays open.
 *
 * Three layers, in the order the task specifies:
 *
 *   1. the category colour (`--news-plate-*`, declared for both themes) as
 *      the ground;
 *   2. the BotolaGO wordmark from `src/assets/brand/` as the base mark;
 *   3. the club crest, on top, only when the edition names exactly one club
 *      — `story_teams` with two or more clubs has no single crest to show.
 *
 * Layout notes that matter more than the art direction:
 *
 *   - It is `absolute inset-0` inside the box `MediaImage` already sizes, so
 *     it inherits that box's aspect ratio exactly and cannot shift layout in
 *     any of `ArticleCard`'s five variants.
 *   - The gradient runs `to bottom`. An angle in `deg` is a physical
 *     direction and would land on the opposite edge under `dir="rtl"`.
 *   - The crest is placed with `start-`/`top-`, so it mirrors to the right
 *     edge in Arabic rather than sitting in a fixed corner.
 *   - `aria-hidden`: the card's `<Link>` already carries the accessible name,
 *     and a decorative plate must not add a second one. Nothing here is
 *     translated copy, so there is no string for the i18n gate to miss.
 */

/** One plate colour per category. Spelled out so the set is exhaustive. */
const PLATE_TOKEN: Record<ArticleCategory, string> = {
  for_you: "--news-plate-for-you",
  latest: "--news-plate-latest",
  transfers: "--news-plate-transfers",
  analysis: "--news-plate-analysis",
  interviews: "--news-plate-interviews",
};

const CATEGORIES = Object.keys(PLATE_TOKEN) as readonly ArticleCategory[];

/** Narrows a free-form slug (the detail DTO carries one) to a known category. */
export function plateTokenForCategory(category: string | undefined): string {
  const known = CATEGORIES.find((candidate) => candidate === category);
  return PLATE_TOKEN[known ?? "latest"];
}

/**
 * `sm` is for the small media boxes — the 56px `compact` thumbnail and the
 * 120px `horizontal` square — where a crest at `md` size would overflow the
 * plate. Everything else uses `md`.
 */
export type ArticleHeroFallbackSize = "sm" | "md";

export function ArticleHeroFallback({
  category,
  clubIds,
  clubs,
  size = "md",
}: {
  /** The edition's primary category; an unknown slug falls back to `latest`. */
  category?: string;
  /** `story_teams` ids for this edition. A crest shows only when there is one. */
  clubIds?: readonly string[];
  /** Club directory, when the surface has one. Without it there is no crest. */
  clubs?: readonly Club[];
  size?: ArticleHeroFallbackSize;
}) {
  const token = plateTokenForCategory(category);
  const soleClub =
    clubIds?.length === 1 ? (clubs ?? []).find((club) => club.id === clubIds[0]) : undefined;

  return (
    <div
      aria-hidden
      data-article-hero-fallback={soleClub ? "crest" : "wordmark"}
      className="absolute inset-0 grid place-items-center overflow-hidden"
      style={{
        backgroundImage: `linear-gradient(to bottom, var(${token}) 0%, color-mix(in oklab, var(${token}) 45%, var(--ui-ink-deep)) 100%)`,
      }}
    >
      <img
        src={wordmark}
        alt=""
        width={1615}
        height={288}
        decoding="async"
        draggable={false}
        data-article-hero-wordmark
        className={cn(
          "select-none object-contain opacity-90",
          size === "sm" ? "w-[72%] max-w-[10rem]" : "w-[52%] max-w-[17rem]",
        )}
      />
      {soleClub && (
        <ClubCrest
          club={soleClub}
          size={size === "sm" ? "sm" : "md"}
          className={cn(
            "absolute start-[7%] top-[7%] rounded-[var(--ui-radius-control)]",
            size === "sm" ? "h-6 w-6" : "h-10 w-10",
          )}
        />
      )}
    </div>
  );
}
