import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Article, Club } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { formatRelativeTime } from "@/lib/format-time";
import { SavedButton } from "@/components/news/SavedButton";
import { categoryLabel, clubsForArticle, plateEdgeClass } from "@/components/news/news-data";
import { cn } from "@/lib/utils";
import { ui, UiPill } from "@/components/ui-kit";
import { crestStyle } from "./club-crest-style";
import { MediaImage } from "./FailureAwareImage";
import { ArticleHeroFallback } from "./ArticleHeroFallback";
import { readTimeLabel } from "@/lib/read-time";

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

/** Press feedback shared by both shapes. */
const PRESS =
  "transition-[box-shadow,transform] duration-[var(--duration-quick)] ease-[var(--ease-standard)] active:translate-y-px";

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
  flag,
}: {
  article: Article;
  variant?: "row" | "lead" | "compact" | "horizontal" | "imageLed";
  /** The club directory the article's `clubIds` are looked up in. */
  clubs?: readonly Club[];
  /** An editorial flag shown with the card's label — the breaking-news pill. */
  flag?: ReactNode;
}) {
  const { tr, t, lang } = useI18n();
  const contentLanguage = article.language ?? lang;
  const contentAttributes = {
    lang: contentLanguage,
    dir: contentLanguage === "ar" ? "rtl" : "ltr",
  };
  const leadClub = clubsForArticle(article.clubIds, clubs ?? [])[0];
  const club = leadClub ? crestStyle(leadClub) : null;

  /**
   * The branded plate that stands in for a missing or broken photo (BG-0076).
   * `MediaImage` paints it behind the photo and shows it only when there is no
   * URL or the one we have fails, so a card with a real photo is untouched.
   */
  const heroPlaceholder = () => <ArticleHeroFallback category={article.category} />;

  /**
   * The story's label: its editorial tag, in the edition's own language, or
   * else its category in the reader's. An Arabic tag read from the French UI
   * resets the label type's tracking itself: Tailwind's `ltr:` also matches
   * inside a `dir="rtl"` subtree of an LTR page, and letter-spacing is
   * inherited, so the pill would pull the joined letters apart (BG-0069).
   */
  const kicker = article.tag ? (
    <span
      {...contentAttributes}
      className={contentLanguage === "ar" ? "ltr:tracking-normal" : undefined}
    >
      {tr(article.tag)}
    </span>
  ) : (
    categoryLabel({ slug: article.category, name: article.category }, t)
  );

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
            placeholder={heroPlaceholder()}
            loading={isLead ? "eager" : undefined}
            fetchPriority={isLead ? "high" : undefined}
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
            <div className="flex max-w-full flex-wrap items-center gap-1.5">
              <CardPill>{isLead ? t("news.section.lead") : kicker}</CardPill>
              {flag}
            </div>
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
              "mt-1 flex min-w-0 items-center gap-1.5",
              ui.text.meta,
              "[font-weight:var(--ui-weight-strong)]",
              ui.tone.muted,
            )}
          >
            <span className="min-w-0 truncate">{kicker}</span>
            {time && (
              <>
                <Dot />
                <span className="shrink-0">{time}</span>
              </>
            )}
          </p>
        </div>
        <MediaImage
          src={article.heroUrl}
          alt=""
          fallback={article.heroGradient}
          placeholder={heroPlaceholder()}
          className={cn("h-17 w-22", ui.radius.track)}
          imageClassName={cn("group-hover:scale-[1.05]", IMAGE_ZOOM)}
        />
      </Link>
      {!dense && (
        <SavedButton articleId={article.id} variant="thumb" className="absolute end-4 top-4 z-10" />
      )}
    </div>
  );
}
