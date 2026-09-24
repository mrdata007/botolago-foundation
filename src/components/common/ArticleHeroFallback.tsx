import platePhotoAnalysis from "@/assets/news/plate-analysis.webp";
import platePhotoForYou from "@/assets/news/plate-for-you.webp";
import platePhotoInterviews from "@/assets/news/plate-interviews.webp";
import platePhotoLatest from "@/assets/news/plate-latest.webp";
import platePhotoTransfers from "@/assets/news/plate-transfers.webp";
import type { ArticleCategory } from "@/types/domain";

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
 * Two layers:
 *
 *   1. the category colour (`--news-plate-*`, declared for both themes) as
 *      the ground, which is also what shows while the photo decodes;
 *   2. a stock photograph for the category (a stadium for news, a tactics
 *      board for analysis, a signing desk for transfers, microphones for
 *      interviews, supporters for "for you"), lightly tinted with the same
 *      category colour. It used to be the BotolaGO wordmark, which repeated
 *      on every card and sat under the headline on the lead card.
 *
 * There is no club crest on the plate any more. Every card already names its
 * clubs in the crest row under the headline, so the plate's crest repeated
 * it, collided with the category tag on the image-led card and covered most
 * of the 56px thumbnail.
 *
 * Layout notes that matter more than the art direction:
 *
 *   - It is `absolute inset-0` inside the box `MediaImage` already sizes, so
 *     it inherits that box's size exactly and cannot shift layout in any of
 *     `ArticleCard`'s variants — the photo cards, the row thumbnails — or on
 *     the article hero.
 *   - The gradient runs `to bottom`. An angle in `deg` is a physical
 *     direction and would land on the opposite edge under `dir="rtl"`.
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

/** Where each photo is anchored when a box crops it (the 56px and 120px
 *  squares, the 4:5 card): the microphones sit left of centre, and a centred
 *  square cut through them. */
const PLATE_POSITION: Partial<Record<ArticleCategory, string>> = {
  interviews: "35% 50%",
};

function knownCategory(category: string | undefined): ArticleCategory {
  return CATEGORIES.find((candidate) => candidate === category) ?? "latest";
}

/** Narrows a free-form slug (the detail DTO carries one) to a known category. */
export function plateTokenForCategory(category: string | undefined): string {
  return PLATE_TOKEN[knownCategory(category)];
}

export function ArticleHeroFallback({
  category,
}: {
  /** The edition's primary category; an unknown slug falls back to `latest`. */
  category?: string;
}) {
  const known = knownCategory(category);
  const token = PLATE_TOKEN[known];

  return (
    <div
      aria-hidden
      data-article-hero-fallback="photo"
      className="absolute inset-0 overflow-hidden"
      style={{
        backgroundImage: `linear-gradient(to bottom, var(${token}) 0%, color-mix(in oklab, var(${token}) 45%, var(--ui-ink-deep)) 100%)`,
      }}
    >
      <img
        src={PLATE_PHOTO[known]}
        alt=""
        width={1440}
        height={810}
        loading="lazy"
        decoding="async"
        draggable={false}
        data-article-hero-photo
        className="absolute inset-0 h-full w-full select-none object-cover"
        style={{ objectPosition: PLATE_POSITION[known] ?? "50% 50%" }}
      />
      {/* The category colour over the photo, so a transfers card and an
          analysis card still read as different sections at a glance. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to bottom, color-mix(in oklab, var(${token}) 14%, transparent) 0%, transparent 45%)`,
        }}
      />
    </div>
  );
}
