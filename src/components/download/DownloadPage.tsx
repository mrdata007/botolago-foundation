import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import appIcon from "@/assets/brand/app-icon-256.webp";
import emptyMatches from "@/assets/illustrations/empty-matches.webp";
import podium from "@/assets/illustrations/podium-soon.webp";
import liveBand from "@/assets/photos/home-band-live.webp";
import liveBandSmall from "@/assets/photos/home-band-live-800.webp";
import managerCover from "@/assets/photos/manager-cover.webp";
import newsHeader from "@/assets/photos/news-header.webp";
import profileCover from "@/assets/photos/profile-cover.webp";
import stadiumDay from "@/assets/photos/stadium-day-800.webp";
import stadiumGolden from "@/assets/photos/stadium-golden-800.webp";
import stadiumNight from "@/assets/photos/stadium-night-800.webp";
import welcome from "@/assets/photos/welcome.webp";
import welcomeSmall from "@/assets/photos/welcome-720.webp";
import welcomeWide from "@/assets/photos/welcome-wide.webp";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { STATUS_BAR_INK, StatusBarStrip } from "@/components/shell/StatusBarStrip";
import { ui, UiLivePill, UiPill } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useDarkStatusBand } from "@/lib/system-bars";
import { cn } from "@/lib/utils";
import { SQUAD_RULES } from "@/types/fantasy";

import { QrCode } from "./QrCode";
import { StoreBadges } from "./StoreBadges";

/**
 * The app download page, laid out as a matchday programme: a cover with the
 * promise, the code and the two store badges; five inside spreads, each one
 * real part of the app on its own photo or illustration; a page on Morocco
 * time; and a back cover with the code again and the colophon.
 *
 * Everything said here is something the app does today (PRODUCT.md): no user
 * counts, ratings, prizes or alerts. The squad figures come from the rules
 * the database enforces (`SQUAD_RULES`).
 *
 * The QR code is for a visitor on a computer, so phones (under 768px) get the
 * badges alone: a phone cannot scan its own screen.
 */
export function DownloadPage() {
  // The cover under the clock is dark in both themes: light status-bar icons.
  useDarkStatusBand();
  return (
    <div className={cn("min-h-[100dvh]", ui.surface.page)} data-testid="download-page">
      <StatusBarStrip surface={STATUS_BAR_INK} />
      <main>
        <Cover />
        <Spreads />
        <MoroccoTime />
      </main>
      <BackCover />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cover                                                               */
/* ------------------------------------------------------------------ */

function Cover() {
  const { t } = useI18n();
  // Each spread's anchor and its line on the cover, in page order.
  const coverLines = [
    { id: "en-direct", label: t("download.live_nav") },
    { id: "actualites", label: t("download.news_nav") },
    { id: "fantasy", label: t("download.fantasy_nav") },
    { id: "pronostics", label: t("download.predictions_nav") },
    { id: "pepites", label: t("download.pepites_nav") },
  ];
  return (
    <section
      aria-labelledby="download-title"
      className={cn(
        "relative isolate flex flex-col overflow-hidden md:min-h-[min(100svh,56rem)]",
        "bg-[color:var(--ui-ink-deep)]",
        ui.tone.onMesh,
      )}
    >
      {/* The floodlit stadium from the stands: no player, no club. The
          portrait crop on phones, the wide one from 768px. Decorative. */}
      <picture>
        <source media="(min-width: 768px)" srcSet={welcomeWide} />
        <img
          src={welcomeSmall}
          srcSet={`${welcomeSmall} 720w, ${welcome} 1080w`}
          sizes="100vw"
          alt=""
          aria-hidden
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_40%] opacity-70"
        />
      </picture>
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, color-mix(in oklab, var(--ui-ink-deep) 55%, transparent) 0%, color-mix(in oklab, var(--ui-ink-deep) 35%, transparent) 38%, color-mix(in oklab, var(--ui-ink-deep) 88%, transparent) 72%, var(--ui-ink-deep) 100%)",
        }}
      />

      {/* Masthead: the title on the start side, the season and the
          language on the other, over the programme's rule. */}
      <header
        className={cn(
          "mx-auto flex w-full max-w-6xl items-center gap-3 border-b border-[color:var(--ui-mesh-rule)] pb-3 pt-3",
          ui.space.gutter,
          ui.safe.top,
        )}
      >
        <Logo variant="full" tone="light" size="md" className="me-auto" />
        <span className={cn("hidden sm:inline", ui.text.meta, ui.tone.onMeshMuted)}>
          <bdi>{t("download.season")}</bdi>
        </span>
        <LanguageSwitcher tone="onMesh" />
      </header>

      <div
        className={cn(
          "mx-auto grid w-full max-w-6xl flex-1 content-center items-center gap-x-12 gap-y-8 pb-10 pt-10 md:grid-cols-[minmax(0,1fr)_auto] md:pb-14 md:pt-14",
          ui.space.gutter,
        )}
      >
        <div className="min-w-0">
          <h1
            id="download-title"
            className={cn(
              "text-balance",
              ui.display.hero,
              "md:[font-size:clamp(3.5rem,6.2vw,5.75rem)]",
            )}
          >
            <span className="block">{t("download.title_1")}</span>
            <span className="block text-[color:var(--ui-on-ink)]">{t("download.title_2")}</span>
          </h1>
          <p className={cn("mt-5 max-w-[42ch]", ui.text.subtitle, ui.tone.onMeshMuted)}>
            {t("download.lede")}
          </p>
          <StoreBadges className="mt-8" />
        </div>

        <QrPlate className="hidden md:block" />
      </div>

      {/* Cover lines: what is inside, each a link to its spread. The first
          line's text starts on the gutter, its pill padding outside it. */}
      <nav
        aria-label={t("download.contents")}
        className="border-t border-[color:var(--ui-mesh-rule)] bg-[color:color-mix(in_oklab,var(--ui-ink-deep)_70%,transparent)]"
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-6xl items-center gap-x-1 gap-y-1 overflow-x-auto py-2 [scrollbar-width:none] max-lg:ltr:[mask-image:linear-gradient(to_right,black_85%,transparent)] max-lg:rtl:[mask-image:linear-gradient(to_left,black_85%,transparent)]",
            "ps-[calc(var(--ui-gutter)-0.75rem)] pe-[var(--ui-gutter)]",
          )}
        >
          {coverLines.map((line) => (
            <a
              key={line.id}
              href={`#${line.id}`}
              className={cn(
                "inline-flex shrink-0 items-center whitespace-nowrap px-3",
                ui.space.tap,
                ui.radius.full,
                ui.text.bodyStrong,
                "hover:bg-[color:var(--ui-mesh-glass)]",
                ui.focusOnMesh,
              )}
            >
              {line.label}
            </a>
          ))}
        </div>
      </nav>
    </section>
  );
}

/**
 * The code on its white plate: the one lifted surface on each cover, with
 * what to do in two lines under it.
 */
function QrPlate({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <figure
      className={cn(
        "w-[15.5rem] p-4 lg:w-[17.5rem]",
        ui.surface.scorebox,
        ui.radius.sheet,
        ui.shadow.lifted,
        className,
      )}
    >
      <QrCode label={t("download.qr_label")} />
      <figcaption className="mt-3 px-1 text-center">
        <span className={cn("block", ui.text.bodyStrong)}>{t("download.scan_title")}</span>
        <span
          className={cn(
            "mt-0.5 block",
            ui.text.meta,
            "text-[color:color-mix(in_oklab,var(--ui-on-scorebox)_72%,transparent)]",
          )}
        >
          {t("download.scan_body")}
        </span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Inside spreads                                                      */
/* ------------------------------------------------------------------ */

function Spreads() {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  return (
    <div className="py-6 md:py-10">
      <Spread
        id="en-direct"
        folio={2}
        image={{
          kind: "photo",
          src: liveBand,
          srcSet: `${liveBandSmall} 800w, ${liveBand} 1600w`,
          position: "object-[60%_50%]",
        }}
        title={t("download.live_title")}
        body={t("download.live_body")}
      >
        <UiLivePill size="md" />
        <ul className={cn("mt-4 flex", ui.rule.block)}>
          {[
            t("matches.detail.tab.summary"),
            t("matches.detail.tab.stats_short"),
            t("matches.detail.tab.lineups_short"),
            t("matches.detail.tab.h2h"),
          ].map((label, index) => (
            <li
              key={label}
              className={cn(
                "relative flex h-12 min-w-0 items-center whitespace-nowrap px-2 first:ps-0 sm:px-3",
                ui.display.tab,
                index === 0
                  ? cn(
                      ui.tone.default,
                      "[font-weight:var(--ui-weight-heavy)]",
                      "after:absolute after:inset-x-2 after:bottom-0 after:h-1 after:rounded-full after:bg-[color:var(--ui-ink)] first:after:start-0 sm:after:inset-x-3",
                    )
                  : ui.tone.muted,
              )}
            >
              {label}
            </li>
          ))}
        </ul>
      </Spread>

      <Spread
        id="actualites"
        folio={3}
        side="end"
        image={{ kind: "photo", src: newsHeader, position: "object-[30%_50%]" }}
        title={t("download.news_title")}
        body={t("download.news_body")}
      >
        <Tags
          labels={[
            t("news.tab.latest"),
            t("news.tab.transfers"),
            t("news.tab.analysis"),
            t("news.tab.interviews"),
          ]}
        />
      </Spread>

      <Spread
        id="fantasy"
        folio={4}
        image={{ kind: "photo", src: managerCover, position: "object-[35%_50%]" }}
        title={t("download.fantasy_title")}
        body={t("download.fantasy_body")
          .replace("{size}", nf.format(SQUAD_RULES.totalSize))
          .replace("{budget}", nf.format(SQUAD_RULES.budget))
          .replace("{max}", nf.format(SQUAD_RULES.maxPerClub))}
      >
        <ul className="flex flex-wrap items-center gap-2">
          <Tag>
            {t("home.fantasy_chip_players").replace("{n}", nf.format(SQUAD_RULES.totalSize))}
          </Tag>
          <Tag>{t("home.fantasy_chip_budget").replace("{n}", nf.format(SQUAD_RULES.budget))}</Tag>
          <li>
            <UiPill tone="action">{t("home.fantasy_chip_captain")}</UiPill>
          </li>
        </ul>
      </Spread>

      <Spread
        id="pronostics"
        folio={5}
        side="end"
        image={{ kind: "object", src: emptyMatches }}
        title={t("download.predictions_title")}
        body={t("download.predictions_body")}
      >
        <dl className="grid grid-cols-2">
          <Points n={nf.format(3)} label={t("download.points_exact")} />
          <Points
            n={nf.format(1)}
            label={t("download.points_outcome")}
            className="border-s border-[color:var(--ui-rule)] ps-5"
          />
        </dl>
      </Spread>

      <Spread
        id="pepites"
        folio={6}
        image={{ kind: "object", src: podium }}
        title={t("download.pepites_title")}
        body={t("download.pepites_body")}
      >
        <Tags
          labels={[
            t("download.pepites_u23"),
            t("pepites.tab.top"),
            t("pepites.compare.title"),
            t("pepites.method.title"),
          ]}
        />
      </Spread>
    </div>
  );
}

type SpreadImage =
  | { kind: "photo"; src: string; srcSet?: string; position?: string }
  | { kind: "object"; src: string };

/**
 * One spread of the programme: a picture page and a text page meeting at
 * the fold. Side by side from 1024px (the picture on the reading-start side,
 * or the end side for `side="end"`), stacked picture-first below.
 */
function Spread({
  id,
  folio,
  side = "start",
  image,
  title,
  body,
  children,
}: {
  id: string;
  folio: number;
  side?: "start" | "end";
  image: SpreadImage;
  title: string;
  body: string;
  children: ReactNode;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("mx-auto w-full max-w-6xl scroll-mt-4 py-3 md:py-5", ui.space.gutter)}
    >
      <div
        className={cn(
          "grid overflow-hidden lg:min-h-[28rem] lg:grid-cols-2",
          ui.surface.card,
          ui.radius.sheet,
        )}
      >
        <figure
          className={cn(
            "relative min-h-[14rem] sm:min-h-[20rem]",
            image.kind === "object" && ui.surface.sunken,
            side === "end" && "lg:order-2",
          )}
        >
          {image.kind === "photo" ? (
            <img
              src={image.src}
              srcSet={image.srcSet}
              sizes="(min-width: 1024px) 36rem, 100vw"
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              className={cn("absolute inset-0 h-full w-full object-cover", image.position)}
            />
          ) : (
            <img
              src={image.src}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-contain p-8 sm:p-12"
            />
          )}
        </figure>

        <div className="relative flex min-w-0 flex-col p-5 sm:p-8 lg:p-12">
          <h2 id={`${id}-title`} className={cn("text-balance", ui.display.title)}>
            {title}
          </h2>
          <p className={cn("mt-3 max-w-[46ch]", ui.text.prose, ui.tone.muted)}>{body}</p>
          <div className="mt-6">{children}</div>
          <p
            className={cn(
              "mt-auto flex items-baseline justify-between gap-4 pt-10",
              ui.text.micro,
              ui.tone.faint,
            )}
          >
            <span>
              BotolaGO · <bdi>{t("download.season")}</bdi>
            </span>
            <span className={ui.text.tabular}>{nf.format(folio)}</span>
          </p>
        </div>
      </div>
    </section>
  );
}

function Tags({ labels }: { labels: readonly string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {labels.map((label) => (
        <Tag key={label}>{label}</Tag>
      ))}
    </ul>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <li
      className={cn(
        "inline-flex min-h-9 items-center px-3",
        ui.radius.full,
        ui.surface.sunken,
        ui.text.meta,
        "[font-weight:var(--ui-weight-strong)]",
      )}
    >
      {children}
    </li>
  );
}

/** A scoring rule: the figure large, what earns it under it. */
function Points({ n, label, className }: { n: string; label: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 pe-5", className)}>
      <dt className={cn("order-last", ui.text.meta, ui.tone.muted)}>{label}</dt>
      <dd className={cn(ui.score.lg, ui.tone.ink)}>{n}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Morocco time                                                        */
/* ------------------------------------------------------------------ */

function MoroccoTime() {
  const { t } = useI18n();
  const shots = [
    { src: stadiumDay, label: t("download.time_day") },
    { src: stadiumGolden, label: t("download.time_golden") },
    { src: stadiumNight, label: t("download.time_night") },
  ];
  return (
    <section
      aria-labelledby="heure-du-maroc"
      className={cn("mx-auto w-full max-w-6xl pb-12 pt-8 md:pb-16", ui.space.gutter)}
    >
      <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-end">
        <div className="min-w-0">
          <h2 id="heure-du-maroc" className={cn("text-balance", ui.display.title)}>
            {t("download.time_title")}
          </h2>
          <p className={cn("mt-3", ui.text.prose, ui.tone.muted)}>{t("download.time_body")}</p>
        </div>
        <ul className="grid grid-cols-3 gap-2 sm:gap-3">
          {shots.map((shot) => (
            <li key={shot.label} className="min-w-0">
              <figure>
                <img
                  src={shot.src}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  decoding="async"
                  className={cn("aspect-[4/5] w-full object-cover sm:aspect-[4/3]", ui.radius.card)}
                />
                <figcaption
                  className={cn("mt-2", ui.text.meta, "[font-weight:var(--ui-weight-strong)]")}
                >
                  {shot.label}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Back cover                                                          */
/* ------------------------------------------------------------------ */

function BackCover() {
  const { t } = useI18n();
  return (
    <footer
      aria-labelledby="download-back-title"
      className={cn(
        "relative isolate overflow-hidden bg-[color:var(--ui-ink-deep)]",
        ui.tone.onMesh,
      )}
    >
      {/* The ball on the centre spot under the floodlights. Decorative. */}
      <img
        src={profileCover}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_60%] opacity-45"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, var(--ui-ink-deep) 0%, color-mix(in oklab, var(--ui-ink-deep) 55%, transparent) 40%, color-mix(in oklab, var(--ui-ink-deep) 80%, transparent) 75%, var(--ui-ink-deep) 100%)",
        }}
      />

      <div
        className={cn(
          "mx-auto grid w-full max-w-6xl items-center gap-x-12 gap-y-10 pb-12 pt-14 md:grid-cols-[minmax(0,1fr)_auto] md:pb-16 md:pt-20",
          ui.space.gutter,
        )}
      >
        <div className="min-w-0">
          <img
            src={appIcon}
            alt=""
            aria-hidden
            width={88}
            height={88}
            loading="lazy"
            decoding="async"
            className={cn("h-[88px] w-[88px] rounded-[22.5%]", ui.shadow.lifted)}
          />
          <h2 id="download-back-title" className={cn("mt-6 text-balance", ui.display.hero)}>
            {t("download.back_title")}
          </h2>
          <p className={cn("mt-3", ui.text.subtitle, ui.tone.onMeshMuted)}>
            {t("download.back_body")}
          </p>
          <StoreBadges size="lg" className="mt-8" />
        </div>
        <QrPlate className="hidden md:block" />
      </div>

      <div className={cn("mx-auto w-full max-w-6xl", ui.space.gutter, ui.safe.bottom)}>
        <div
          className={cn(
            "flex flex-col gap-4 border-t border-[color:var(--ui-mesh-rule)] py-6 lg:flex-row lg:items-start lg:justify-between",
          )}
        >
          <div className={cn("max-w-[60ch]", ui.text.meta, ui.tone.onMeshMuted)}>
            <p>{t("download.colophon_operator")}</p>
            <p className="mt-1">{t("download.colophon_independent")}</p>
          </div>
          <nav aria-label={t("download.colophon_label")}>
            <ul className="-ms-3 flex flex-wrap">
              <ColophonLink to="/privacy">{t("profile.legal.privacy")}</ColophonLink>
              <ColophonLink to="/terms">{t("profile.legal.terms")}</ColophonLink>
              <ColophonLink to="/suppression-compte">{t("profile.delete_account")}</ColophonLink>
              <li>
                <a href="mailto:support@botolago.com" className={colophonLinkClass}>
                  <bdi>support@botolago.com</bdi>
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}

const colophonLinkClass = cn(
  "inline-flex items-center whitespace-nowrap px-3 underline-offset-4 hover:underline",
  ui.space.tap,
  ui.radius.full,
  ui.text.meta,
  "[font-weight:var(--ui-weight-strong)]",
  ui.focusOnMesh,
);

function ColophonLink({
  to,
  children,
}: {
  to: "/privacy" | "/terms" | "/suppression-compte";
  children: ReactNode;
}) {
  return (
    <li>
      <Link to={to} className={colophonLinkClass}>
        {children}
      </Link>
    </li>
  );
}
