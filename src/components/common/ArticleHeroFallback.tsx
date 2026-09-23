import platePhotoAnalysis from "@/assets/news/plate-analysis.webp";
import platePhotoForYou from "@/assets/news/plate-for-you.webp";
import platePhotoInterviews from "@/assets/news/plate-interviews.webp";
import platePhotoLatest from "@/assets/news/plate-latest.webp";
import platePhotoTransfers from "@/assets/news/plate-transfers.webp";
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
 * Three layers:
 *
 *   1. the category colour (`--news-plate-*`, declared for both themes) as
 *      the ground, which is also what shows while the photo decodes;
 *   2. a stock photograph for the category (a stadium for news, a tactics
 *      board for analysis, a signing desk for transfers, microphones for
 *      interviews, supporters for "for you"), lightly tinted with the same
 *      category colour. It used to be the BotolaGO wordmark, which repeated
 *      on every card and sat under the headline on the lead card;
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
 *   - The photos carry no text, logos or faces, so they never pass for the
 *     article's own picture of a real event.
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

/** One stock photograph per category, for the same exhaustive set. */
const PLATE_PHOTO: Record<ArticleCategory, string> = {
  for_you: platePhotoForYou,
  latest: platePhotoLatest,
  transfers: platePhotoTransfers,
  analysis: platePhotoAnalysis,
  interviews: platePhotoInterviews,
};

/** The stock photograph for a free-form slug; unknown falls back to `latest`. */
function platePhotoForCategory(category: string | undefined): string {
  const known = CATEGORIES.find((candidate) => candidate === category);
  return PLATE_PHOTO[known ?? "latest"];
}

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
      data-article-hero-fallback={soleClub ? "crest" : "photo"}
      className="absolute inset-0 overflow-hidden"
      style={{
        backgroundImage: `linear-gradient(to bottom, var(${token}) 0%, color-mix(in oklab, var(${token}) 45%, var(--ui-ink-deep)) 100%)`,
      }}
    >
      <img
        src={platePhotoForCategory(category)}
        alt=""
        width={960}
        height={540}
        loading="lazy"
        decoding="async"
        draggable={false}
        data-article-hero-photo
        className="absolute inset-0 h-full w-full select-none object-cover"
      />
      {/* The category colour over the photo, so a transfers card and an
          analysis card still read as different sections at a glance. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to bottom, color-mix(in oklab, var(${token}) 30%, transparent) 0%, transparent 70%)`,
        }}
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
