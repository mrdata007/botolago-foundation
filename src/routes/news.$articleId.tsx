import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Share2 } from "lucide-react";
import { getArticleWithLanguageFallback, getNewsRepository, newsService } from "@/services/news";
import { AppShell } from "@/components/shell/AppShell";
import { ArticleCard } from "@/components/common/ArticleCard";
import { ClubCrest } from "@/components/common/ClubCrest";
import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import { SavedButton } from "@/components/news/SavedButton";
import { ErrorState, LoadingState } from "@/components/common/States";
import {
  ui,
  UiBackButton,
  UiCard,
  UiHeader,
  UiIconButton,
  UiLinkButton,
  UiPill,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useBackTo } from "@/lib/back-navigation";
import { formatFullDate, formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { clubStyle } from "@/lib/club-palette";
import { MediaImage } from "@/components/common/FailureAwareImage";
import { ArticleHeroFallback } from "@/components/common/ArticleHeroFallback";
import { crestStyle } from "@/components/common/club-crest-style";
import { readTimeLabel } from "@/lib/read-time";
import { dictionaries } from "@/i18n/dictionaries";
import { FULL_COLUMN_SIZES, resolveMediaUrl } from "@/lib/media";
import { buildArticleHead, buildCanonicalArticleUrl } from "@/lib/article-meta";
import {
  bylineInitials,
  categoryLabel,
  formatArticleDate,
  gradientTokenForId,
  presentNewsTeam,
  publicNewsContext,
} from "@/components/news/news-data";
import { articleBodyClass, PULL_QUOTE_CSS } from "@/components/news/article-reading";
import { NEWS_ENABLED } from "@/lib/feature-flags";

export const Route = createFileRoute("/news/$articleId")({
  // While News is hidden (owner decision — see `@/lib/feature-flags`) article
  // permalinks redirect to Home rather than 404; the full rationale is on the
  // parent route in `news.tsx`. The parent's `beforeLoad` already redirects
  // before this route is reached, on SSR and on client navigation alike; this
  // repeat guard keeps the child honest if the route tree is ever reshaped,
  // and runs before the loader so no News RPC is issued and no article meta or
  // JSON-LD is ever built.
  beforeLoad: () => {
    if (!NEWS_ENABLED) throw redirect({ to: "/", replace: true });
  },
  loader: async ({ params, context }) => {
    try {
      return await context.queryClient.ensureQueryData({
        queryKey: ["news", "article-detail-v2", "fr", params.articleId],
        queryFn: () =>
          getArticleWithLanguageFallback(
            getNewsRepository(),
            params.articleId,
            "fr",
            publicNewsContext(),
          ),
      });
    } catch {
      return null;
    }
  },
  head: ({ loaderData, params }) => buildArticleHead(loaderData, params.articleId),
  component: ArticlePage,
});

/** A separator dot, on the muted foreground so it follows the theme. */
function Dot() {
  return (
    <span
      aria-hidden
      className={cn(
        "h-1 w-1 shrink-0 bg-[color:var(--ui-on-surface-muted)] opacity-60",
        ui.radius.full,
      )}
    />
  );
}

/** The photo's base darkens a little where the sheet rises over it (A-Article). */
const HERO_SCRIM = {
  backgroundImage:
    "linear-gradient(to bottom, transparent 55%, color-mix(in oklab, var(--ui-ink-deep) 45%, transparent))",
};

/**
 * The white sheet that rises over the hero: 24px of overlap, the sheet radius
 * on its top corners. `relative` so it paints over the (positioned) photo.
 */
const SHEET_TOP = "relative -mt-6 rounded-t-[var(--ui-radius-sheet)] bg-[color:var(--ui-surface)]";

/**
 * The article's own bar, in place of the wordmark bar (A-Article): the soft
 * "← Retour" pill at the start, round Save and Share at the end. `status`
 * hangs just under the bar, over the page (the "Lien copié" confirmation).
 * On a wide screen the kit keeps the controls over the 672px reading column.
 */
function ArticleBar({
  onBack,
  actions,
  status,
}: {
  onBack: () => void;
  actions?: ReactNode;
  status?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <UiHeader
      sticky
      leading={<UiBackButton onClick={onBack} label={t("article.back")} />}
      trailing={actions}
    >
      {status}
    </UiHeader>
  );
}

function ArticlePage() {
  const { articleId } = Route.useParams();
  const { t, tr, lang, dir } = useI18n();
  // Articles and matches are the pages most often opened from a shared link,
  // where there is no in-app entry to go back to; fall back to the listing.
  const goBack = useBackTo("/news");
  const [copied, setCopied] = useState(false);
  const initialArticle = Route.useLoaderData();

  const articleQ = useQuery({
    queryKey: ["news", "article-detail-v2", lang, articleId],
    queryFn: () =>
      getArticleWithLanguageFallback(getNewsRepository(), articleId, lang, publicNewsContext()),
    initialData: lang === "fr" ? (initialArticle ?? undefined) : undefined,
  });
  const relatedQ = useQuery({
    queryKey: ["news", "related", lang, articleId],
    queryFn: () => newsService.getRelated(articleId, lang),
    enabled: !!articleQ.data,
  });
  // The club directory for the related cards and the Clubs chips. Presented
  // here, not by `newsService.getTeamFilters`: its presenter turns a missing
  // club colour into a literal navy the club palette would paint on every
  // club (see `presentNewsTeam`).
  const clubsQ = useQuery({
    queryKey: ["news", "team-filters-v2", lang],
    queryFn: async () =>
      (await getNewsRepository().getTeamFilters(lang, publicNewsContext())).map(presentNewsTeam),
  });
  const article = articleQ.data;
  const related = relatedQ.data ?? [];

  if (articleQ.isLoading) {
    return (
      <AppShell backgroundVariant="news" topBar={<ArticleBar onBack={goBack} />}>
        <LoadingState />
      </AppShell>
    );
  }

  if (articleQ.isError) {
    return (
      <AppShell backgroundVariant="news" topBar={<ArticleBar onBack={goBack} />}>
        <div className="mt-8">
          <ErrorState onRetry={() => void articleQ.refetch()} />
        </div>
      </AppShell>
    );
  }

  if (!article) {
    return (
      <AppShell backgroundVariant="news" topBar={<ArticleBar onBack={goBack} />}>
        <UiCard padding="lg" className="mt-8 text-center">
          <h1 className={cn(ui.display.header, ui.tone.default)}>{t("article.not_found_title")}</h1>
          <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
            {t("article.not_found_desc")}
          </p>
          <UiLinkButton to="/news" variant="ink" className="mt-4">
            {t("article.back")}
          </UiLinkButton>
        </UiCard>
      </AppShell>
    );
  }

  const contentLanguage = article.language ?? lang;
  const contentDir = contentLanguage === "ar" ? "rtl" : "ltr";
  const clubs = clubsQ.data ?? [];
  // The detail's teams are only {id, slug, name}; the directory adds the
  // crest code and the colour data. A team the directory does not know keeps
  // its chip, without a crest.
  const articleClubs = article.teams.map((team) => ({
    team,
    club: clubs.find((club) => club.id === team.id),
  }));
  // The article's colour — the pill, the pull quote — is its first club's:
  // from the directory when it has the club, else from the team's own slug and
  // name, which the club palette resolves through the kit table.
  const firstClub = articleClubs[0];
  const colour = firstClub
    ? firstClub.club
      ? crestStyle(firstClub.club)
      : clubStyle({ id: firstClub.team.id, slug: firstClub.team.slug, name: firstClub.team.name })
    : null;
  const topicTags = article.taxonomies.filter((tax) => tax.type !== "category");
  const byline = article.author?.name ?? article.publisher?.name;
  const heroUrl = resolveMediaUrl(article.hero);
  const caption = [article.hero?.caption, article.hero?.credit].filter(Boolean).join(" — ");
  const deck = article.subtitle ?? article.summary;
  const hasDistinctUpdate =
    !!article.updatedAt &&
    article.updatedAt !== article.publishedAt &&
    Math.abs(Date.parse(article.updatedAt) - Date.parse(article.publishedAt)) > 60_000;

  const canonicalUrl = buildCanonicalArticleUrl(article.id);
  const share = async () => {
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await (navigator as unknown as { share: (d: ShareData) => Promise<void> }).share({
          title: article.title,
          text: article.subtitle ?? article.summary,
          url: canonicalUrl,
        });
        return;
      }
    } catch {
      /* user cancelled or blocked */
    }
    try {
      await navigator.clipboard.writeText(canonicalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <AppShell
      backgroundVariant="news"
      // The reading page is white from the bar down (A-Article): the sheet
      // over the photo simply continues to the foot of the page.
      className="bg-[color:var(--ui-surface)]"
      topBar={
        <ArticleBar
          onBack={goBack}
          actions={
            <>
              <SavedButton articleId={article.id} variant="soft" />
              <UiIconButton aria-label={t("article.share")} onClick={share}>
                <Share2 aria-hidden />
              </UiIconButton>
            </>
          }
          status={
            // Always in the tree, so the confirmation is announced when it
            // appears; a live region mounted with its text is often not.
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none absolute inset-x-0 top-full mt-2 flex justify-center"
            >
              {copied && (
                <span
                  className={cn(
                    "px-4 py-2",
                    ui.radius.full,
                    ui.surface.inkPlain,
                    ui.shadow.lifted,
                    ui.text.meta,
                    "[font-weight:var(--ui-weight-heavy)]",
                  )}
                >
                  {t("article.share_copied")}
                </span>
              )}
            </div>
          }
        />
      }
    >
      {/* The reader's pull-quote rules (see `article-reading.ts`). */}
      <style>{PULL_QUOTE_CSS}</style>

      {/* Edge to edge on a phone: out of the screen gutter, and up over the
          column's top padding (UiScreen's pt-4, md:pt-6), to meet the bar. */}
      <div className="-mx-[var(--ui-gutter)] -mt-4 md:-mt-6">
        {/* Hero image — outside the <article>, whose `figure img` is the body's own */}
        <figure>
          <div className="relative aspect-[2/1] md:aspect-[16/7]">
            <MediaImage
              src={heroUrl}
              alt={article.hero?.alt ?? article.title}
              fallback={gradientTokenForId(article.id)}
              // Same branded plate the cards use (BG-0076): a reader who taps a
              // hero-less card must not land on a second empty block.
              placeholder={
                <ArticleHeroFallback
                  category={article.primaryCategory?.slug}
                  headline={article.title}
                />
              }
              loading="eager"
              fetchPriority="high"
              frame={{ sizes: FULL_COLUMN_SIZES, ratio: 2, mdRatio: 16 / 7 }}
              className="absolute inset-0 animate-in fade-in duration-500"
            />
            <span aria-hidden className="absolute inset-0" style={HERO_SCRIM} />
          </div>
          {/* The sheet's overlap would cover a caption under the photo, so the
              caption and credit open the sheet instead — still the figure's
              own caption, and still the first on the page. */}
          {caption && (
            <figcaption
              dir={contentDir}
              className={cn(SHEET_TOP, "px-5 pt-4", ui.text.micro, ui.tone.muted)}
            >
              {caption}
            </figcaption>
          )}
        </figure>

        {/* The article — the sheet (continued) */}
        <article
          lang={contentLanguage}
          dir={contentDir}
          data-club={colour?.["data-club"]}
          style={colour?.style}
          className={cn(
            "relative bg-[color:var(--ui-surface)] px-5 pb-2",
            "animate-in fade-in-0 slide-in-from-bottom-1 duration-500 ease-out",
            caption ? "pt-3" : cn(SHEET_TOP, "pt-5"),
          )}
        >
          {/* Category pill, in the article's club colour */}
          {article.primaryCategory && (
            <UiPill
              className={cn(
                "h-6 max-w-full px-2.5 py-0",
                ui.text.label,
                // An Arabic edition read from the French UI: `ltr:` still
                // matches inside this dir="rtl" subtree, so the label's
                // tracking is reset here, or it pulls the joined letters
                // apart (BG-0069).
                contentLanguage === "ar" && "ltr:tracking-normal",
                ui.club.fill,
                // A white or yellow kit stays a shape on the white sheet.
                ui.club.ring,
              )}
            >
              {/* In the article's own language, like the headline around it:
                  an edition served in the other language must not carry a
                  UI-language label under the wrong lang tag. One line: a
                  long category ends in an ellipsis inside the 24px pill. */}
              <span className="min-w-0 truncate">
                {categoryLabel(
                  article.primaryCategory,
                  (key) => (dictionaries[contentLanguage] as Record<string, string>)[key] ?? key,
                )}
              </span>
            </UiPill>
          )}

          {/* Headline — the display face at the section step: the board's
              27px snaps to the nearest step, and at 22 a headline keeps the
              board's two lines at 390px (34 took three to four). */}
          <h1
            className={cn(
              "mt-3",
              ui.display.section,
              ui.tone.default,
              // Arabic from the French UI: the display leading is the Latin
              // one there; the flat step is looser.
              contentLanguage === "ar" && "leading-[var(--ui-leading-flat)]",
            )}
          >
            {article.title}
          </h1>

          {/* Byline — the reader's language: the date and read time are UI copy */}
          <div lang={lang} dir={dir} className="mt-4 flex items-center gap-2.5">
            {byline && (
              <span
                aria-hidden
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center",
                  ui.radius.full,
                  ui.surface.inkPlain,
                  ui.text.label,
                )}
              >
                {bylineInitials(byline)}
              </span>
            )}
            <div className="min-w-0">
              {byline && (
                <p
                  className={cn(
                    "truncate",
                    ui.text.meta,
                    "[font-weight:var(--ui-weight-heavy)]",
                    ui.tone.default,
                  )}
                >
                  <span className="sr-only">{`${t("article.by")} `}</span>
                  {byline}
                </p>
              )}
              <p
                className={cn("flex flex-wrap items-center gap-x-1.5", ui.text.meta, ui.tone.muted)}
              >
                <span>
                  <span className="sr-only">{`${t("article.published")} `}</span>
                  <time
                    dateTime={article.publishedAt}
                    title={formatFullDate(article.publishedAt, lang)}
                  >
                    {formatArticleDate(article.publishedAt, lang)}
                  </time>
                </span>
                <Dot />
                <span>{readTimeLabel(article.readingTimeMinutes, lang, t)}</span>
                {hasDistinctUpdate && (
                  <>
                    <Dot />
                    <span>
                      {`${t("article.updated")} `}
                      <time
                        dateTime={article.updatedAt}
                        title={formatFullDate(article.updatedAt, lang)}
                      >
                        {formatRelativeTime(article.updatedAt, lang)}
                      </time>
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Deck / subtitle — the lead paragraph */}
          {deck && <p className={cn("mt-5", ui.text.bodyStrong, ui.tone.default)}>{deck}</p>}

          {/* The same story in the other language, when that edition is public
              (the API lists no other kind). Its label is written in the target
              language, so a reader who cannot read this page can still find it. */}
          {(article.translations ?? []).map((translation) => (
            <UiLinkButton
              key={translation.id}
              to="/news/$articleId"
              params={{ articleId: translation.id }}
              variant="outline"
              size="sm"
              className="mt-4"
              lang={translation.language}
              dir={translation.language === "ar" ? "rtl" : "ltr"}
              hrefLang={translation.language}
              data-testid="article-translation-link"
            >
              {translation.language === "ar"
                ? "اقرأ هذا المقال بالعربية"
                : "Lire cet article en français"}
            </UiLinkButton>
          ))}

          {/* Body — pre-sanitized server-side HTML. `editorial-body` styles
              the injected HTML itself (shared with the CMS preview); the
              reading type and the pull quote come from `article-reading.ts`.
              No spacing utility here: the blob is this wrapper's only child. */}
          <div
            className={cn("editorial-body mt-4 max-w-[68ch]", articleBodyClass(contentLanguage))}
            dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
          />

          {/* Licensed content says where it comes from, in the article's own
              language, linking the original. Only licensed stories have one. */}
          {article.source && (
            <p
              lang={contentLanguage}
              dir={contentDir}
              className={cn("mt-4", ui.text.meta, ui.tone.muted)}
              data-testid="article-source"
            >
              {contentLanguage === "ar" ? "المصدر: " : "Source : "}
              {article.source.url ? (
                <a
                  href={article.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("underline underline-offset-4", ui.tone.default)}
                >
                  {article.source.name}
                </a>
              ) : (
                <span className={ui.tone.default}>{article.source.name}</span>
              )}
            </p>
          )}
        </article>

        <div className="px-5">
          {/* Clubs and topics — outside the <article>, whose h2s are the body's */}
          {(articleClubs.length > 0 || topicTags.length > 0) && (
            <section className={cn("mt-6 pt-5", ui.rule.blockStart)}>
              {articleClubs.length > 0 && (
                <>
                  {/* `ui.text.label` letter-spaces Latin only (BG-0069). */}
                  <h2 className={cn(ui.text.label, ui.tone.muted)}>{t("article.clubs")}</h2>
                  {/* Static: there is no club page to link to yet. */}
                  <ul className="mt-2.5 flex flex-wrap gap-2">
                    {articleClubs.map(({ team, club }) => (
                      <li
                        key={team.id}
                        className={cn(
                          "inline-flex max-w-full items-center gap-2 py-1.5 pe-4",
                          club ? "ps-1.5" : "ps-4",
                          ui.radius.full,
                          ui.surface.sunken,
                          ui.text.meta,
                          "[font-weight:var(--ui-weight-heavy)]",
                        )}
                      >
                        {club && <ClubCrest club={club} size="xs" />}
                        <span className="min-w-0 truncate">{club ? tr(club.name) : team.name}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {topicTags.length > 0 && (
                <ul
                  lang={contentLanguage}
                  dir={contentDir}
                  className={cn("flex flex-wrap gap-1.5", articleClubs.length > 0 && "mt-3")}
                >
                  {topicTags.map((tag) => (
                    <li
                      key={tag.id}
                      className={cn(
                        "inline-flex items-center px-3 py-1",
                        ui.radius.full,
                        ui.surface.sunken,
                        ui.text.meta,
                        "[font-weight:var(--ui-weight-strong)]",
                        ui.tone.muted,
                      )}
                    >
                      {tag.name}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Related */}
          {related.length > 0 && (
            <Section className="mt-7 sm:mt-8">
              <SectionHeader title={t("article.related")} />
              <div className="grid gap-2.5">
                {related.map((a) => (
                  <ArticleCard key={a.id} article={a} variant="horizontal" clubs={clubs} />
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
