import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import type { Article, Club } from "@/types/domain";
import { ClubCrest } from "./ClubCrest";
import { useI18n } from "@/i18n/provider";
import { formatRelativeTime } from "@/lib/format-time";
import { SavedButton } from "@/components/news/SavedButton";
import { cn } from "@/lib/utils";
import { ui } from "@/components/ui-kit";
import { MediaImage } from "./FailureAwareImage";
import { ArticleHeroFallback } from "./ArticleHeroFallback";

/**
 * Article card, five variants:
 *   - `lead`        hero editorial card (16:10 image + overlay)
 *   - `row`         standard image-on-top card (default)
 *   - `compact`     media list row
 *   - `horizontal`  side-by-side image + text (dense lists)
 *   - `imageLed`    tall image-first card for "top stories" grid
 *
 * Converted to the shared UI kit (`@/components/ui-kit`): the Fantasy type
 * scale, radii, surfaces and focus ring replace the Design System V2 glass
 * surfaces, the Tailwind type ramp and the ad-hoc rounding. The public props
 * are unchanged.
 *
 * Photo overlays are the one place this card paints on top of an image. The
 * scrim is mixed from `--ui-ink-deep` and the copy uses `--ui-on-ink-plain`,
 * so it is still token-derived and survives a theme switch — no literal black
 * or white anywhere.
 *
 * House rules: logical properties only, every `tracking-*` is `ltr:`-prefixed
 * (Arabic letterforms join and must never be letter-spaced — BG-0069).
 */

/** Scrim painted over a photo so overlaid copy stays legible. */
const scrim = (from: number, via: number) => ({
  backgroundImage: `linear-gradient(to top, color-mix(in oklab, var(--ui-ink-deep) ${from}%, transparent), color-mix(in oklab, var(--ui-ink-deep) ${via}%, transparent) 45%, transparent)`,
});

export function ArticleCard({
  article,
  variant = "row",
  clubs,
}: {
  article: Article;
  variant?: "row" | "lead" | "compact" | "horizontal" | "imageLed";
  /** Optional club directory used to render team crest badges. */
  clubs?: readonly Club[];
}) {
  const { tr, t, lang } = useI18n();
  const contentLanguage = article.language ?? lang;
  const contentAttributes = {
    lang: contentLanguage,
    dir: contentLanguage === "ar" ? "rtl" : "ltr",
  };
  const articleClubs = (clubs ?? []).filter((c) => article.clubIds.includes(c.id)).slice(0, 2);

  /**
   * The branded plate that stands in for a missing or broken hero (BG-0076).
   * Rendered by `MediaImage` behind the photo and shown only when there is no
   * hero URL or the one we have fails, so a card with a real photo is
   * untouched. It is `absolute inset-0`, so every variant keeps the aspect
   * ratio it already declared and nothing shifts.
   */
  const heroPlaceholder = (size: "sm" | "md") => (
    <ArticleHeroFallback
      category={article.category}
      clubIds={article.clubIds}
      clubs={clubs}
      size={size}
    />
  );

  /** Copy that sits on a photo: always the plain-on-ink token, never white. */
  const onPhoto = "text-[color:var(--ui-on-ink-plain)]";

  const crestRow = (tone: "light" | "dark" = "light") =>
    articleClubs.length > 0 ? (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        {articleClubs.map((c) => (
          <span key={c.id} className="inline-flex min-w-0 items-center gap-1">
            <ClubCrest
              club={c}
              size="sm"
              className={cn("h-5 w-5 rounded-[var(--ui-radius-control)]", ui.text.micro)}
            />
            {/* A truncating span's min-content is the full untruncated name,
                and in a grid of cards that minimum propagates out into the
                track and widens the card past the page gutter. A `max-w`
                caps the contribution instead of removing it, so a three-letter
                short name still renders whole and the byline gives ground
                first. */}
            <span
              className={cn(
                "max-w-[8ch] truncate",
                ui.text.micro,
                "[font-weight:var(--ui-weight-heavy)]",
                tone === "dark" ? cn(onPhoto, "opacity-90") : ui.tone.muted,
              )}
            >
              {tr(c.shortName)}
            </span>
          </span>
        ))}
      </span>
    ) : null;

  const time = formatRelativeTime(article.publishedAt, lang);
  const to = "/news/$articleId";
  const params = { articleId: article.id };
  const ariaLabel = tr(article.title);

  /** The card shell: an opaque kit surface with the kit press feedback. */
  const cardShell = cn(
    ui.surface.card,
    ui.focus,
    "block min-w-0 overflow-hidden",
    "transition-[box-shadow,transform] duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
    "hover:shadow-[var(--ui-shadow-raised)] active:translate-y-px",
  );

  /** A dot separator, tinted from the surrounding text. */
  const dot = (tone: "light" | "dark" = "light") => (
    <span
      className={cn(
        "h-1 w-1 shrink-0 rounded-full",
        tone === "dark"
          ? "bg-[color:var(--ui-on-ink-plain)] opacity-50"
          : "bg-[color:var(--ui-on-surface-muted)] opacity-50",
      )}
      aria-hidden
    />
  );

  /** The tag pill used over a photo: surface chip, ink text. */
  const photoTag = (className?: string) =>
    article.tag ? (
      <span
        className={cn(
          "inline-flex items-center px-2.5 py-1",
          ui.radius.full,
          ui.text.label,
          "bg-[color:var(--ui-surface)] text-[color:var(--ui-ink)] shadow-[var(--ui-shadow-card)]",
          className,
        )}
      >
        {tr(article.tag)}
      </span>
    ) : null;

  if (variant === "lead") {
    return (
      <div className="group relative min-w-0">
        <Link to={to} params={params} aria-label={ariaLabel} className={cn(cardShell, "relative")}>
          <MediaImage
            src={article.heroUrl}
            alt=""
            fallback={article.heroGradient}
            placeholder={heroPlaceholder("md")}
            loading="eager"
            fetchPriority="high"
            className="aspect-[16/10] w-full transition-transform duration-500 ease-[var(--ease-standard)] group-hover:scale-[1.02]"
          />
          <div className="absolute inset-0" style={scrim(88, 35)} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
            {photoTag()}
            <h3 {...contentAttributes} className={cn("mt-2.5", ui.text.title, onPhoto)}>
              {tr(article.title)}
            </h3>
            <p
              {...contentAttributes}
              className={cn("mt-1.5 line-clamp-2", ui.text.secondary, onPhoto, "opacity-85")}
            >
              {tr(article.excerpt)}
            </p>
            {articleClubs.length > 0 && <div className="mt-2.5">{crestRow("dark")}</div>}
            <div
              // Wraps rather than truncating: at 390px the byline, the read
              // time and the relative time do not fit on one line in French.
              className={cn(
                "mt-3 flex flex-wrap items-center gap-x-3 gap-y-1",
                ui.text.micro,
                onPhoto,
                "opacity-85",
              )}
            >
              <span className="min-w-0 truncate">{tr(article.authorName)}</span>
              {dot("dark")}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden />
                {article.readMinutes} {t("news.read_min")}
              </span>
              {time && (
                <>
                  {dot("dark")}
                  <span>{time}</span>
                </>
              )}
            </div>
          </div>
        </Link>
        <div className="absolute end-3 top-3 z-10">
          <SavedButton articleId={article.id} variant="overlay" />
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <Link
        to={to}
        params={params}
        aria-label={ariaLabel}
        className={cn(cardShell, "flex items-center gap-3 p-3", ui.space.row)}
      >
        <MediaImage
          src={article.heroUrl}
          alt=""
          fallback={article.heroGradient}
          placeholder={heroPlaceholder("sm")}
          className={cn("h-14 w-14 shrink-0", ui.radius.control)}
        />
        <div className="min-w-0 flex-1">
          <h4
            {...contentAttributes}
            className={cn("line-clamp-2", ui.text.bodyStrong, ui.tone.default)}
          >
            {tr(article.title)}
          </h4>
          <div
            className={cn("mt-1 flex min-w-0 items-center gap-1.5", ui.text.micro, ui.tone.muted)}
          >
            {crestRow()}
            <span className="min-w-0 truncate">{tr(article.authorName)}</span>
            {time && (
              <>
                {dot()}
                <span className="shrink-0">{time}</span>
              </>
            )}
          </div>
        </div>
      </Link>
    );
  }

  if (variant === "horizontal") {
    return (
      <div className="group relative min-w-0">
        <Link
          to={to}
          params={params}
          aria-label={ariaLabel}
          className={cn(cardShell, "grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 p-2")}
        >
          <div className={cn("relative overflow-hidden", ui.radius.control)}>
            <MediaImage
              src={article.heroUrl}
              alt=""
              fallback={article.heroGradient}
              placeholder={heroPlaceholder("sm")}
              className="aspect-square w-full transition-transform duration-500 ease-[var(--ease-standard)] group-hover:scale-[1.05]"
            />
          </div>
          <div className="flex min-w-0 flex-col justify-between py-1 pe-1">
            <div className="min-w-0">
              {article.tag && (
                <div className={cn(ui.text.label, "text-[color:var(--ui-ink)]")}>
                  {tr(article.tag)}
                </div>
              )}
              <h3
                {...contentAttributes}
                className={cn("mt-0.5 line-clamp-3", ui.text.bodyStrong, ui.tone.default)}
              >
                {tr(article.title)}
              </h3>
              {articleClubs.length > 0 && <div className="mt-1.5">{crestRow()}</div>}
            </div>
            <div
              className={cn(
                "mt-2 flex items-center justify-between gap-2 pe-10",
                ui.text.micro,
                ui.tone.muted,
              )}
            >
              <span className="inline-flex min-w-0 items-center gap-1">
                {time && <span className="min-w-0 truncate">{time}</span>}
                {time && dot()}
                <Clock className="h-3 w-3 shrink-0" aria-hidden />
                <span className="shrink-0">
                  {article.readMinutes} {t("news.read_min")}
                </span>
              </span>
            </div>
          </div>
        </Link>
        <SavedButton
          articleId={article.id}
          variant="icon"
          className="absolute bottom-2 end-2 z-10 h-9 w-9"
        />
      </div>
    );
  }

  if (variant === "imageLed") {
    return (
      <Link
        to={to}
        params={params}
        aria-label={ariaLabel}
        className={cn(cardShell, "group relative")}
      >
        <div className="relative overflow-hidden">
          <MediaImage
            src={article.heroUrl}
            alt=""
            fallback={article.heroGradient}
            placeholder={heroPlaceholder("md")}
            className="aspect-[4/5] w-full transition-transform sm:aspect-[16/9] duration-500 ease-[var(--ease-standard)] group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0" style={scrim(85, 25)} aria-hidden />
          {photoTag("absolute start-3 top-3")}
          <div className="absolute inset-x-0 bottom-0 p-3">
            <h3 {...contentAttributes} className={cn("line-clamp-3", ui.text.subtitle, onPhoto)}>
              {tr(article.title)}
            </h3>
            {articleClubs.length > 0 && <div className="mt-1.5">{crestRow("dark")}</div>}
            <div
              className={cn("mt-1.5 flex items-center gap-2", ui.text.micro, onPhoto, "opacity-85")}
            >
              {time && <span>{time}</span>}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden />
                {article.readMinutes} {t("news.read_min")}
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // default: row
  return (
    <div className="group relative min-w-0">
      <Link to={to} params={params} aria-label={ariaLabel} className={cardShell}>
        <div className="relative overflow-hidden">
          <MediaImage
            src={article.heroUrl}
            alt=""
            fallback={article.heroGradient}
            placeholder={heroPlaceholder("md")}
            className="aspect-[16/8] w-full transition-transform duration-500 ease-[var(--ease-standard)] group-hover:scale-[1.03]"
          />
        </div>
        <div className="p-4">
          {article.tag && (
            <div className={cn(ui.text.label, "text-[color:var(--ui-ink)]")}>{tr(article.tag)}</div>
          )}
          <h3
            {...contentAttributes}
            className={cn("mt-1 line-clamp-2", ui.text.subtitle, ui.tone.default)}
          >
            {tr(article.title)}
          </h3>
          <p
            {...contentAttributes}
            className={cn("mt-1.5 line-clamp-2", ui.text.meta, ui.tone.muted)}
          >
            {tr(article.excerpt)}
          </p>
          {articleClubs.length > 0 && <div className="mt-2.5">{crestRow()}</div>}
          <div
            className={cn(
              "mt-3 flex items-center justify-between gap-2 pe-10",
              ui.text.micro,
              ui.tone.muted,
            )}
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate">{tr(article.authorName)}</span>
              {time && (
                <>
                  {dot()}
                  <span className="shrink-0">{time}</span>
                </>
              )}
              {dot()}
              <span className="inline-flex shrink-0 items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden />
                {article.readMinutes} {t("news.read_min")}
              </span>
            </span>
          </div>
        </div>
      </Link>
      <SavedButton
        articleId={article.id}
        variant="icon"
        className="absolute bottom-3 end-3 z-10 h-9 w-9"
      />
    </div>
  );
}
