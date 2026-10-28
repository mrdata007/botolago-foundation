import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Article, Club } from "@/types/domain";
import { frText } from "@/i18n/fr-sections";
import { useI18n } from "@/i18n/provider";
import { formatRelativeTime } from "@/lib/format-time";
import { SavedButton } from "@/components/news/SavedButton";
import { articleKicker, fixtureKickerLabel } from "@/components/news/article-kicker";
import { ARABIC_CATEGORY_LABELS } from "@/components/news/category-labels";
import { categoryLabel, clubsForArticle, plateEdgeClass } from "@/components/news/news-data";
import { linkArticleToFixture, type NewsFixture } from "@/components/news/news-fixtures";
import { cn } from "@/lib/utils";
import { ui, UiPill } from "@/components/ui-kit";
import { crestStyle } from "./club-crest-style";
import { MediaImage } from "./FailureAwareImage";
import { ArticleHeroFallback } from "./ArticleHeroFallback";
import { readTimeLabel } from "@/lib/read-time";
import { READING_COLUMN_SIZES, type PhotoFrame } from "@/lib/media";

/**
 * Article card (Option A "Club colours"). Five variant names, two shapes:
 *
 *   - `lead`        the lead story: a photo card on the sheet radius with the
 *                   lifted shadow, a `to bottom` ink-deep scrim, the "À la
 *                   une" pill, a Changa headline and the byline/time/read-time
 *                   line — and the Save control over the photo
 *   - `imageLed`    the same photo card, a size down, for the first "À ne
 *                   pas manquer" story; its pill is the story's tag
 *   - `horizontal`  the Option A row: a card with a 4px club edge on the
 *   - `row`         inline start, the headline, a "tag · time" line and an
 *                   88×68 thumbnail at the inline end, Save on the thumbnail
 *   - `compact`     the same row without Save, its headline held to two
 *                   lines — Home's preview, the second and third featured
 *                   stories. Same thumbnail as the full row: a featured list
 *                   mixes the two, and the board draws every row alike
 *
 * The club colours come from `crestStyle(club)` (the memoised `clubStyle`)
 * of the first club the article names, so the edge, the pill and the crest
 * all read `--ui-club*`. An article that names no club takes its category's
 * plate colour as the edge instead (`plateEdgeClass`).
 *
 * Save is never inside the link (a button inside an `<a>` is invalid and
 * announces twice — `ArticleCard.semantics.test.ts`): it is the link's
 * sibling, placed over the card.
 *
 * Every image goes through `MediaImage` with the branded plate
 * (`ArticleHeroFallback`) as its placeholder, so a missing or broken photo is
 * a deliberate plate, never an empty block (BG-0076).
 *
 * House rules: logical properties only, every `tracking-*` `ltr:`-prefixed,
 * gradients `to bottom`, no literal colour — the copy on a photo is
 * `--ui-on-ink-plain` over an `--ui-ink-deep` scrim.
 */

/**
 * The scrim behind the copy on a photo card. It belongs to the copy block, not
 * to the card: a card-wide ramp (clear for the top fifth) left a three-line
 * Arabic headline, which starts near the top of the card, on almost bare
 * photo. On the copy block it fades in over the extra top padding and is
 * already 72% ink-deep where the pill starts, however long the headline.
 */
const COPY_SCRIM = {
  backgroundImage:
    "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--ui-ink-deep) 72%, transparent) 3rem, color-mix(in oklab, var(--ui-ink-deep) 94%, transparent))",
};

/** Hover, after premierleague.com: the photo zooms in a touch and the title
 *  dims slightly, both at the same quick pace. */
const IMAGE_ZOOM =
  "transition-transform duration-[var(--duration-sheet)] ease-[var(--ease-standard)]";
const TITLE_HOVER =
  "transition-opacity duration-[var(--duration-sheet)] ease-[var(--ease-standard)] group-hover:opacity-85";

/**
 * The photo card's shape at its minimum height, for cutting the photo to fit
 * (`MediaImage`'s `frame`). The card spans the reading column, so its width
 * follows the screen while its height is the `min-h` below. Measured: the lead
 * is 358 × 232px on a 390px phone (≈ 3:2) and 640 × 320px from `sm` (2:1); the
 * `imageLed` card 358 × 200px (≈ 16:9) and 640 × 240px (8:3). A headline long
 * enough to make the card taller gets the same cut, enlarged a little to
 * cover; a wider phone (up to 640px) makes the card wider than the cut, which
 * then loses some of its top and bottom.
 */
const LEAD_FRAME: PhotoFrame = { sizes: READING_COLUMN_SIZES, ratio: 3 / 2, smRatio: 2 };
const IMAGE_LED_FRAME: PhotoFrame = { sizes: READING_COLUMN_SIZES, ratio: 16 / 9, smRatio: 8 / 3 };

/** Press feedback shared by both shapes. */
const PRESS = "press-tile";

/** A small separator dot, tinted from the text around it. */
function Dot({ onPhoto = false }: { onPhoto?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-1 w-1 shrink-0 opacity-60",
        ui.radius.full,
        onPhoto ? "bg-[color:var(--ui-on-ink-muted)]" : "bg-[color:var(--ui-on-surface-muted)]",
      )}
    />
  );
}

/**
 * The emphatic label on a photo card: a 24px pill in the article's club
 * colour (the ink when it names no club), label type. On a photo it needs no
 * ring — the scrim behind it is dark. One line: a long tag ends in an
 * ellipsis rather than wrapping out of a 24px pill.
 */
function CardPill({ children }: { children: ReactNode }) {
  return (
    <UiPill className={cn("h-6 max-w-full px-2.5 py-0", ui.text.label, ui.club.fill)}>
      <span className="min-w-0 truncate">{children}</span>
    </UiPill>
  );
}

export function ArticleCard({
  article,
  variant = "row",
  clubs,
  fixtures,
  flag,
}: {
  article: Article;
  variant?: "row" | "lead" | "compact" | "horizontal" | "imageLed";
  /** The club directory the article's `clubIds` are looked up in. */
  clubs?: readonly Club[];
  /**
   * The current season's fixtures (`useNewsFixtures`). With them a story about
   * two clubs that play a fixture near its publication is drawn with that
   * fixture's score or kick-off time and labelled "Avant-match" / "Résultat".
   * Without them the card is the same, minus those two.
   */
  fixtures?: readonly NewsFixture[];
  /** An editorial flag shown with the card's label — the breaking-news pill. */
  flag?: ReactNode;
}) {
  const { tr, t, lang } = useI18n();
  const contentLanguage = article.language ?? lang;
  const contentAttributes = {
    lang: contentLanguage,
    dir: contentLanguage === "ar" ? "rtl" : "ltr",
  };
  const articleClubs = clubsForArticle(article.clubIds, clubs ?? []);
  const leadClub = articleClubs[0];
  const club = leadClub ? crestStyle(leadClub) : null;
  const fixture = linkArticleToFixture(article, fixtures);
  // The plate's clubs: the fixture's home and away when the story is tied to
  // one, else the story's own order. Never more than two.
  const plateClubs = (() => {
    if (fixture) {
      const home = articleClubs.find((c) => c.id === fixture.homeClubId);
      const away = articleClubs.find((c) => c.id === fixture.awayClubId);
      if (home && away) return [home, away];
    }
    return articleClubs.slice(0, 2);
  })();

  /**
   * The branded plate that stands in for a missing or broken photo (BG-0076).
   * `MediaImage` paints it behind the photo and shows it only when there is no
   * URL or the one we have fails, so a card with a real photo is untouched. A
   * story that names a club gets a plate drawn from it; the stock photographs
   * are for the story that names none.
   */
  const heroPlaceholder = (sizes: string, plateSize: "thumb" | "card") => (
    <ArticleHeroFallback
      category={article.category}
      headline={tr(article.title)}
      sizes={sizes}
      clubs={plateClubs}
      fixture={fixture}
      plateSize={plateSize}
    />
  );

  /**
   * The story's label (`articleKicker`): its editorial tag, in the edition's
   * own language; "Avant-match" / "Résultat" for a story tied to a fixture; a
   * real section; the club's name for a one-club story; else none. An Arabic
   * label read from the French UI resets the label type's tracking itself:
   * Tailwind's `ltr:` also matches inside a `dir="rtl"` subtree of an LTR
   * page, and letter-spacing is inherited, so the pill would pull the joined
   * letters apart (BG-0069).
   */
  const kickerFor = articleKicker({
    tag: article.tag,
    category: article.category,
    clubs: articleClubs,
    clubCount: article.clubIds.length,
    fixture,
  });
  const ownLanguageClass = contentLanguage === "ar" ? "ltr:tracking-normal" : undefined;
  let kicker: ReactNode = null;
  if (kickerFor?.type === "tag" && article.tag) {
    kicker = (
      <span {...contentAttributes} className={ownLanguageClass}>
        {tr(article.tag)}
      </span>
    );
  } else if (kickerFor?.type === "fixture") {
    // In the story's language, like its headline: an Arabic story read from
    // the French UI says "قبل المباراة", not "Avant-match".
    kicker = (
      <span {...contentAttributes} className={ownLanguageClass}>
        {contentLanguage === lang
          ? fixtureKickerLabel(kickerFor.key, t)
          : ((contentLanguage === "ar"
              ? ARABIC_CATEGORY_LABELS[kickerFor.key]
              : frText(kickerFor.key)) ?? fixtureKickerLabel(kickerFor.key, t))}
      </span>
    );
  } else if (kickerFor?.type === "club") {
    kicker = tr(kickerFor.club.shortName);
  } else if (kickerFor?.type === "category") {
    kicker = categoryLabel({ slug: article.category, name: article.category }, t);
  }

  const time = formatRelativeTime(article.publishedAt, lang);
  const readTime = readTimeLabel(article.readMinutes, lang, t);
  const to = "/news/$articleId";
  const params = { articleId: article.id };
  const ariaLabel = tr(article.title);

  if (variant === "lead" || variant === "imageLed") {
    const isLead = variant === "lead";
    return (
      <div className="group relative min-w-0" data-club={club?.["data-club"]} style={club?.style}>
        <Link
          to={to}
          params={params}
          aria-label={ariaLabel}
          className={cn(
            // The photo fills the card and the copy sits in flow at its base,
            // so a long headline (Arabic runs at twice the line height) grows
            // the card instead of being cut off under a fixed aspect ratio.
            "relative isolate flex min-w-0 flex-col justify-end overflow-hidden",
            isLead ? "min-h-[14.5rem] sm:min-h-[20rem]" : "min-h-[12.5rem] sm:min-h-[15rem]",
            "bg-[color:var(--ui-ink-deep)]",
            ui.radius.sheet,
            ui.shadow.lifted,
            ui.focus,
            PRESS,
          )}
        >
          <MediaImage
            src={article.heroUrl}
            alt=""
            fallback={article.heroGradient}
            placeholder={heroPlaceholder(READING_COLUMN_SIZES, "card")}
            loading={isLead ? "eager" : undefined}
            fetchPriority={isLead ? "high" : undefined}
            frame={isLead ? LEAD_FRAME : IMAGE_LED_FRAME}
            className="absolute inset-0"
            imageClassName={cn("group-hover:scale-[1.03]", IMAGE_ZOOM)}
          />
          <div
            className="relative flex min-w-0 flex-col items-start gap-2 px-4 pb-4 pt-12 sm:px-5 sm:pb-5 sm:pt-14"
            style={COPY_SCRIM}
          >
            {/* `max-w-full`: in this `items-start` column a row sizes to its
                content, and a one-line pill has no smaller minimum — without a
                cap a long tag widened the row past the card, where the card's
                overflow clipped it instead of the pill truncating it. */}
            {(isLead || kicker || flag) && (
              <div className="flex max-w-full flex-wrap items-center gap-1.5">
                {(isLead || kicker) && (
                  <CardPill>{isLead ? t("news.section.lead") : kicker}</CardPill>
                )}
                {flag}
              </div>
            )}
            <h3
              {...contentAttributes}
              className={cn(
                "line-clamp-3 max-w-full",
                isLead ? ui.display.teamLg : ui.display.team,
                ui.tone.onInkPlain,
                TITLE_HOVER,
              )}
            >
              {tr(article.title)}
            </h3>
            {isLead && (
              <p
                {...contentAttributes}
                className={cn("line-clamp-2 max-sm:hidden", ui.text.secondary, ui.tone.onInkMuted)}
              >
                {tr(article.excerpt)}
              </p>
            )}
            <p
              className={cn(
                // Wraps rather than truncating: byline, time and read time do
                // not fit one line at 390px in every language.
                "flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5",
                ui.text.meta,
                "[font-weight:var(--ui-weight-strong)]",
                ui.tone.onInkMuted,
              )}
            >
              {isLead && (
                <>
                  <span className="min-w-0 truncate">{tr(article.authorName)}</span>
                  {time && <Dot onPhoto />}
                </>
              )}
              {time && <span>{time}</span>}
              <Dot onPhoto />
              <span>{readTime}</span>
            </p>
          </div>
        </Link>
        {isLead && (
          <SavedButton
            articleId={article.id}
            serverSaved={article.isSaved}
            language={article.language}
            variant="overlay"
            className="absolute end-3 top-3 z-10"
          />
        )}
      </div>
    );
  }

  // `horizontal`, `row` and `compact`: the Option A row.
  const dense = variant === "compact";
  return (
    <div className="group relative min-w-0" data-club={club?.["data-club"]} style={club?.style}>
      <Link
        to={to}
        params={params}
        aria-label={ariaLabel}
        className={cn(
          ui.surface.card,
          ui.focus,
          PRESS,
          "hover:shadow-[var(--ui-shadow-raised)]",
          // Edge (4px) + 14px = the board's 18px to the text. The thumbnail
          // column is a grid track, so it lands at the inline end in both
          // directions; the row aligns to the top so Save stays on the
          // thumbnail's corner however many lines the title takes.
          "grid min-w-0 grid-cols-[minmax(0,1fr)_5.5rem] items-start gap-3.5 py-3 pe-3 ps-3.5",
          leadClub ? ui.edge.start : plateEdgeClass(article.category),
        )}
      >
        <div className="min-w-0">
          {flag && <div className="mb-1.5 flex">{flag}</div>}
          <h3
            {...contentAttributes}
            className={cn(
              dense ? "line-clamp-2" : "line-clamp-3",
              ui.text.bodyStrong,
              ui.tone.default,
              TITLE_HOVER,
            )}
          >
            {tr(article.title)}
          </h3>
          <p
            className={cn(
              "mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1",
              ui.text.meta,
              "[font-weight:var(--ui-weight-strong)]",
              ui.tone.muted,
            )}
          >
            {/* A bold chip in the club's colour, not a grey word: the tag is
                the first thing a reader scans for, and it carries the club. */}
            {kicker && <CardPill>{kicker}</CardPill>}
            {time && <span className="shrink-0">{time}</span>}
          </p>
        </div>
        <MediaImage
          src={article.heroUrl}
          alt=""
          fallback={article.heroGradient}
          placeholder={heroPlaceholder("88px", "thumb")}
          frame={{ sizes: "88px", ratio: 22 / 17 }}
          className={cn("h-17 w-22", ui.radius.track)}
          imageClassName={cn("group-hover:scale-[1.05]", IMAGE_ZOOM)}
        />
      </Link>
      {!dense && (
        <SavedButton
          articleId={article.id}
          serverSaved={article.isSaved}
          language={article.language}
          variant="thumb"
          className="absolute end-4 top-4 z-10"
        />
      )}
    </div>
  );
}
