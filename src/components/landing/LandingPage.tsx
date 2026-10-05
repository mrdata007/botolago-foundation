import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  Repeat,
  Shirt,
  Star,
  Timer,
  Trophy,
  TrendingUp,
  Users,
} from "lucide-react";

import stadiumBand from "@/assets/brand/home-band-stadium.webp";
import stadiumBandSmall from "@/assets/brand/home-band-stadium-800.webp";
import { useAuth } from "@/auth/AuthProvider";
import type { AuthStatus } from "@/services/auth-types";
import { Logo } from "@/components/brand/Logo";
import { joinDeadlineToShow, joinTarget } from "@/components/fantasy/fantasy-hub-layout";
import { formatDeadline, useDeadlineCountdown } from "@/components/fpl/deadline";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { ui, UiLinkButton } from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { track, type AnalyticsEvent } from "@/lib/analytics";
import { PRIZES_ENABLED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import type { PublicPrizeDto } from "@/backend/prizes/contracts";
import { prizesService } from "@/services/prizes";
import { useFantasyAvailability } from "@/services/use-fantasy-availability";
import { SQUAD_RULES } from "@/types/fantasy";
import { DemoPitch } from "./DemoPitch";
import { LandingBotolaNow, LandingPlayersToWatch } from "./LandingLive";
import { landingCta, type LandingCta } from "./landing-cta";

/**
 * The landing page: what BotolaGO Fantasy is, why a Botola fan would enjoy
 * it, and one way in — for a visitor who arrives from a shared link
 * (`/jouer`) or opens `/` for the first time without an account.
 *
 * The story runs: a promise ("Vous connaissez la Botola. À vous de jouer."),
 * the game itself on the real pitch (a demonstration whose armband moves),
 * three steps tied to what the builder enforces, reasons to come back, the
 * prizes when — and only when — the database lists open ones, the questions
 * people ask before joining, and the same invitation again.
 *
 * Every figure comes from where the game keeps it: the squad rules from
 * `SQUAD_RULES`, the scoring extract from the v1 ruleset, the join deadline
 * from the backend's enrolment gameweek (and only while it is ahead), the
 * prizes from the catalog. There are no user counts, winners or ratings,
 * because there is nothing true to put there yet.
 *
 * The primary action is the same everywhere on the page (`landingCta`), and
 * never a guess: it waits, without a label, until the session and the season
 * say which it is.
 */
export function LandingPage({
  onLeave,
  headingLevel = 1,
}: {
  /** Called on the way out of the page by any link — at `/`, so the page is not shown again. */
  onLeave?: () => void;
  /** 1 on `/jouer`; 2 at `/`, where the home page keeps the document's H1. */
  headingLevel?: 1 | 2;
}) {
  const { t, lang } = useI18n();
  const { status, user } = useAuth();
  const { key, source } = useFantasyDataSource();
  const availability = useFantasyAvailability();
  const ready = availability.view.kind === "ready";
  const signedIn = status === "authenticated" && !!user;

  // Whether a signed-in reader already has a team: the summary is `null`
  // without one. Never asked for a visitor (`source === "guest"`).
  const summary = useQuery({
    queryKey: key("summary"),
    queryFn: () => fantasyService.getSummary(),
    enabled: signedIn && ready && source !== "guest",
  });
  const hasTeam = !signedIn
    ? undefined
    : !ready
      ? null
      : summary.isError
        ? null
        : summary.data === undefined
          ? undefined
          : summary.data !== null;
  const cta = landingCta({ authStatus: status, availability: availability.view, hasTeam });

  // The gameweek a team created now would join, for the line under the button.
  const gameweek = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
    enabled: ready,
  });
  const joinBy = joinDeadlineToShow(
    joinTarget(gameweek.data ?? null),
    useDeadlineCountdown(joinTarget(gameweek.data ?? null)?.deadline),
  );

  // The prizes, only when the catalog lists an open one: same key as the hub.
  const prizes = useQuery({
    queryKey: ["prizes", "catalog"],
    queryFn: () => prizesService.listPrizes(),
    enabled: PRIZES_ENABLED,
    staleTime: 5 * 60_000,
  });

  // The funnel counts visitors without an account, the audience that can
  // go on to sign up: once the session says so, once per mount. A manager
  // opening `/jouer` is not a landing view (the events carry no audience to
  // filter on afterwards).
  const viewTracked = useRef(false);
  const measured = signedOutStatus(status);
  useEffect(() => {
    if (!measured || viewTracked.current) return;
    viewTracked.current = true;
    track("landing_view");
  }, [measured]);

  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const Sub = headingLevel === 1 ? "h2" : "h3";
  const SubSub = headingLevel === 1 ? "h3" : "h4";
  const howId = useId();
  const faqId = useId();

  // The sticky bar on a phone: once the hero's button has scrolled away, and
  // never over the final invitation, which carries the same button.
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const finalRef = useRef<HTMLElement>(null);
  const [heroOut, setHeroOut] = useState(false);
  const [finalIn, setFinalIn] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === heroCtaRef.current) {
          // Out above the viewport only: not before the visitor reached it.
          setHeroOut(!entry.isIntersecting && entry.boundingClientRect.top < 0);
        }
        if (entry.target === finalRef.current) setFinalIn(entry.isIntersecting);
      }
    });
    if (heroCtaRef.current) observer.observe(heroCtaRef.current);
    if (finalRef.current) observer.observe(finalRef.current);
    return () => observer.disconnect();
  }, []);
  const showSticky = heroOut && !finalIn && cta.kind !== "pending";

  const scoring: Array<{ label: string; points: number }> = [
    { label: t("landing.scoring_goal_mid"), points: 5 },
    { label: t("landing.scoring_assist"), points: 3 },
    { label: t("landing.scoring_clean_sheet"), points: 4 },
  ];

  return (
    <div className={cn("min-h-[100dvh]", ui.surface.page)} data-testid="landing-page">
      {/* ---------------------------------------------------------- */}
      {/* Hero: the promise, the button, and the game on its pitch    */}
      {/* ---------------------------------------------------------- */}
      <section
        className={cn(
          "relative isolate overflow-hidden",
          "bg-[color:var(--ui-ink-deep)]",
          ui.tone.onMesh,
        )}
      >
        {/* The night-match photograph Home's band already uses: floodlights
            and crowd, no player and no club. Decorative; above the fold. */}
        <img
          src={stadiumBand}
          srcSet={`${stadiumBandSmall} 800w, ${stadiumBand} 1600w`}
          sizes="100vw"
          alt=""
          aria-hidden
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[70%_30%] opacity-60 rtl:-scale-x-100"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(70% 55% at 85% 35%, color-mix(in oklab, var(--ui-accent-sky) 22%, transparent), transparent 70%), linear-gradient(to bottom, color-mix(in oklab, var(--ui-ink-deep) 72%, transparent) 0%, var(--ui-ink-deep) 92%)",
          }}
        />

        <header
          className={cn(
            "mx-auto flex w-full max-w-6xl items-center gap-2 pt-3",
            ui.space.gutter,
            ui.safe.top,
          )}
        >
          <Link
            to="/"
            onClick={onLeave}
            className={cn("me-auto inline-flex items-center", ui.space.tap, ui.focusOnMesh)}
          >
            <Logo variant="full" tone="light" size="md" />
          </Link>
          <LanguageSwitcher tone="onMesh" />
          {status === "authenticated" ? null : (
            <Link
              to="/auth/login"
              search={cta.kind === "create" ? { next: cta.to } : undefined}
              onClick={onLeave}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap px-2 sm:px-3",
                ui.space.tap,
                ui.radius.full,
                ui.text.bodyStrong,
                ui.tone.onMesh,
                "hover:underline underline-offset-4",
                ui.focusOnMesh,
              )}
            >
              {t("landing.sign_in")}
            </Link>
          )}
          <div className="hidden sm:block">
            <PrimaryAction cta={cta} size="sm" event="landing_cta_header" onLeave={onLeave} />
          </div>
        </header>

        <div
          className={cn(
            "mx-auto grid w-full max-w-6xl items-center gap-x-12 gap-y-10 pb-12 pt-8 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:pb-20 lg:pt-16",
            ui.space.gutter,
          )}
        >
          <div className="min-w-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
            <p className={cn(ui.text.label, "text-[color:var(--ui-on-ink)]")}>
              {t("landing.kicker")}
            </p>
            <Heading
              className={cn(
                "mt-3 text-balance",
                ui.display.hero,
                "lg:[font-size:calc(var(--ui-display-hero)*1.4)]",
              )}
            >
              <span className="block">{t("landing.title_1")}</span>
              <span className="block text-[color:var(--ui-on-ink)]">{t("landing.title_2")}</span>
            </Heading>
            <p className={cn("mt-4 max-w-[38ch]", ui.text.subtitle, ui.tone.onMeshMuted)}>
              {t("landing.lede")}
            </p>

            <div ref={heroCtaRef} className="mt-7 flex flex-col gap-3 sm:max-w-sm">
              <PrimaryAction cta={cta} event="landing_cta_hero" onLeave={onLeave} />
              <a
                href={`#${howId}`}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5",
                  ui.space.tap,
                  ui.radius.full,
                  ui.text.bodyStrong,
                  ui.tone.onMesh,
                  "ring-1 ring-[color:var(--ui-mesh-rule)] hover:bg-[color:var(--ui-mesh-glass)]",
                  ui.focusOnMesh,
                )}
              >
                {t("landing.cta_how")}
                <ChevronDown className="h-4 w-4" aria-hidden />
              </a>
            </div>
            {/* The lines under the button arrive with the session and the
                gameweek; below `lg` the pitch sits under them, so their room
                is kept from the first paint rather than pushing it down
                twice (measured CLS 0.11 without this). */}
            <div className="min-h-[8.5rem] lg:min-h-0">
              <HeroStateLine cta={cta} joinBy={joinBy} />
            </div>
          </div>

          <DemoPitch className="mx-auto w-full max-w-[27rem] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-700" />
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* The Botola right now: this round's matches and the table     */}
      {/* ---------------------------------------------------------- */}
      <LandingBotolaNow heading={Sub} onLeave={onLeave} />

      {/* ---------------------------------------------------------- */}
      {/* How it works: three steps, each with the thing it is about   */}
      {/* ---------------------------------------------------------- */}
      <section
        id={howId}
        aria-labelledby={`${howId}-title`}
        className={cn("mx-auto w-full max-w-6xl scroll-mt-4 py-12 lg:py-16", ui.space.gutter)}
      >
        <p className={cn(ui.text.label, ui.tone.ink)}>{t("landing.cta_how")}</p>
        <Sub id={`${howId}-title`} className={cn("mt-2 text-balance", ui.display.title)}>
          {t("landing.how_title")}
        </Sub>
        <ol className="mt-8 grid gap-8 md:grid-cols-3 md:gap-6">
          <Step
            n={1}
            icon={Shirt}
            heading={SubSub}
            title={t("landing.step1_title")}
            body={t("landing.step1_body")
              .replace("{size}", nf.format(SQUAD_RULES.totalSize))
              .replace("{budget}", nf.format(SQUAD_RULES.budget))
              .replace("{max}", nf.format(SQUAD_RULES.maxPerClub))}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Fact>
                {t("home.fantasy_chip_players").replace("{n}", nf.format(SQUAD_RULES.totalSize))}
              </Fact>
              <Fact>
                {t("home.fantasy_chip_budget").replace("{n}", nf.format(SQUAD_RULES.budget))}
              </Fact>
            </div>
            <p className={cn("mt-2", ui.text.meta, ui.tone.muted)}>
              {t("landing.step1_positions")}
            </p>
          </Step>
          <Step
            n={2}
            icon={Star}
            heading={SubSub}
            title={t("landing.step2_title")}
            body={t("landing.step2_body")}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "grid h-9 w-9 place-items-center",
                  ui.radius.full,
                  ui.text.bodyStrong,
                  "text-[color:var(--ui-ink-deep)]",
                )}
                style={{ backgroundImage: "var(--ui-grad-action)" }}
              >
                {t("fantasy.captain")}
              </span>
              <Fact>{t("home.fantasy_chip_captain")}</Fact>
            </div>
            {/* The rule, worked through once: what the armband does to a score. */}
            <p className={cn("mt-2", ui.text.meta, ui.tone.muted)}>
              {t("landing.step2_example")
                .replace("{n}", nf.format(6))
                .replace("{double}", nf.format(12))}
            </p>
          </Step>
          <Step
            n={3}
            icon={TrendingUp}
            heading={SubSub}
            title={t("landing.step3_title")}
            body={t("landing.step3_body")}
          >
            <p className={cn(ui.text.meta, ui.tone.muted)}>{t("landing.scoring_label")}</p>
            <ul className="mt-1.5 grid gap-1.5">
              {scoring.map((row) => (
                <li
                  key={row.label}
                  className={cn("flex items-baseline justify-between gap-3", ui.text.secondary)}
                >
                  <span className="min-w-0">{row.label}</span>
                  <span className={cn("shrink-0", ui.text.bodyStrong, ui.tone.ink)}>
                    {t("landing.points_value").replace("{n}", nf.format(row.points))}
                  </span>
                </li>
              ))}
            </ul>
          </Step>
        </ol>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* The players worth picking                                    */}
      {/* ---------------------------------------------------------- */}
      <LandingPlayersToWatch heading={Sub} onLeave={onLeave} />

      {/* ---------------------------------------------------------- */}
      {/* Why come back, and the prizes when there are open ones      */}
      {/* ---------------------------------------------------------- */}
      <section
        aria-labelledby={`${howId}-why`}
        className={cn(
          "border-y border-[color:var(--ui-rule)]",
          ui.surface.card,
          "rounded-none shadow-none",
        )}
      >
        <div
          className={cn(
            "mx-auto grid w-full max-w-6xl gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:py-16",
            ui.space.gutter,
          )}
        >
          <div className="min-w-0">
            <Sub id={`${howId}-why`} className={cn("text-balance", ui.display.title)}>
              {t("landing.why_title")}
            </Sub>
            <ul className="mt-6 divide-y divide-[color:var(--ui-rule)]">
              <Reason icon={Users} title={t("landing.why1_title")} body={t("landing.why1_body")} />
              <Reason icon={Trophy} title={t("landing.why2_title")} body={t("landing.why2_body")} />
              <Reason icon={Repeat} title={t("landing.why3_title")} body={t("landing.why3_body")} />
            </ul>
            {/* With the prizes in the column beside it, the guest way in sits
                under the reasons: the column is not left half empty. */}
            {prizes.data && prizes.data.length > 0 ? (
              <BrowseInvite heading={SubSub} onLeave={onLeave} className="mt-8" />
            ) : null}
          </div>

          {prizes.data && prizes.data.length > 0 ? (
            <aside
              aria-labelledby={`${howId}-prizes`}
              className={cn("self-start p-5", ui.radius.sheet, "text-[color:var(--ui-ink-deep)]")}
              style={{ backgroundImage: "var(--ui-grad-action)" }}
              data-testid="landing-prizes"
            >
              <Trophy className="h-6 w-6" aria-hidden />
              <SubSub id={`${howId}-prizes`} className={cn("mt-2", ui.display.section)}>
                {t("landing.prizes_title")}
              </SubSub>
              <p className={cn("mt-2", ui.text.secondary)}>{t("landing.prizes_body")}</p>
              <ul className="mt-3 grid gap-2">
                {prizes.data.map((prize) => (
                  <li key={prize.id} className={cn("flex flex-col", ui.text.secondary)}>
                    <span
                      className={cn(
                        ui.text.meta,
                        "[font-weight:var(--ui-weight-heavy)] opacity-80",
                      )}
                    >
                      {tierName(prize.tier, t)}
                    </span>
                    <span className={ui.text.bodyStrong}>{prize.name[lang]}</span>
                  </li>
                ))}
              </ul>
              <p className={cn("mt-3", ui.text.meta, "[font-weight:var(--ui-weight-strong)]")}>
                {t("prizes.free_to_play")}
              </p>
              <Link
                to="/prizes"
                onClick={onLeave}
                className={cn(
                  "mt-3 inline-flex items-center gap-1.5 underline underline-offset-4",
                  ui.space.tap,
                  ui.text.bodyStrong,
                  ui.focus,
                )}
              >
                {t("landing.prizes_link")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </aside>
          ) : (
            // No open prize: the guest way in takes the column instead.
            <BrowseInvite heading={SubSub} onLeave={onLeave} />
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* FAQ: the objections, answered from the current rules         */}
      {/* ---------------------------------------------------------- */}
      <section
        aria-labelledby={faqId}
        className={cn(
          // From 1024px the title and the links sit beside the questions,
          // rather than a narrow column in the middle of an empty width.
          "mx-auto grid w-full max-w-6xl gap-x-12 py-12 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:py-16",
          ui.space.gutter,
        )}
      >
        <div className="min-w-0">
          <Sub id={faqId} className={cn("text-balance", ui.display.title)}>
            {t("landing.faq_title")}
          </Sub>
          <p className={cn("mt-2", ui.text.prose, ui.tone.muted)}>{t("landing.faq_body")}</p>
        </div>
        <div className="min-w-0">
          <div className="mt-6 divide-y divide-[color:var(--ui-rule)] border-y border-[color:var(--ui-rule)] lg:mt-0">
            <Faq q={t("landing.faq_free_q")} a={t("landing.faq_free_a")} />
            <Faq q={t("landing.faq_late_q")} a={t("landing.faq_late_a")} />
            <Faq q={t("landing.faq_points_q")} a={t("landing.faq_points_a")} />
            <Faq q={t("landing.faq_account_q")} a={t("landing.faq_account_a")} />
            <Faq q={t("landing.faq_deadline_q")} a={t("landing.faq_deadline_a")} />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6">
            <Link
              to="/fantasy/rules"
              onClick={onLeave}
              className={cn(
                "inline-flex items-center gap-1.5",
                ui.space.tap,
                ui.text.bodyStrong,
                ui.tone.ink,
                ui.focus,
              )}
            >
              {t("landing.faq_rules")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              to="/fantasy/help"
              onClick={onLeave}
              className={cn(
                "inline-flex items-center gap-1.5",
                ui.space.tap,
                ui.text.bodyStrong,
                ui.tone.ink,
                ui.focus,
              )}
            >
              {t("landing.faq_help")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* The invitation again                                         */}
      {/* ---------------------------------------------------------- */}
      <section
        ref={finalRef}
        aria-labelledby={`${faqId}-final`}
        className={cn(
          "relative isolate overflow-hidden bg-[color:var(--ui-ink-deep)]",
          ui.tone.onMesh,
        )}
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(60% 80% at 50% 0%, color-mix(in oklab, var(--ui-accent-spring) 18%, transparent), transparent 70%)",
          }}
        />
        <div
          className={cn(
            "mx-auto flex w-full max-w-2xl flex-col items-center py-14 text-center lg:py-20",
            ui.space.gutter,
            ui.safe.bottom,
          )}
        >
          <Sub id={`${faqId}-final`} className={cn("text-balance", ui.display.hero)}>
            {t("landing.final_title")}
          </Sub>
          <p className={cn("mt-3 max-w-[40ch]", ui.text.subtitle, ui.tone.onMeshMuted)}>
            {t("landing.final_body")}
          </p>
          <div className="mt-7 w-full sm:max-w-sm">
            <PrimaryAction cta={cta} event="landing_cta_final" onLeave={onLeave} />
          </div>
          <HeroStateLine cta={cta} joinBy={joinBy} />
        </div>
      </section>

      {/* A phone's way in once the hero's button has scrolled away. There is
          no bottom navigation on this page for it to cover. One bottom
          padding, the larger of the home-indicator inset and 12px: it used to
          be `ui.safe.bottom` followed by `pb-3`, and class merging kept only
          the later `pb-3`, so the inset was never applied (BG-0151). */}
      <div
        aria-hidden={!showSticky}
        inert={!showSticky}
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--ui-mesh-rule)] bg-[color:var(--ui-ink-deep)] px-[var(--ui-gutter)] pt-3 sm:hidden",
          "pb-[max(env(safe-area-inset-bottom),0.75rem)] transition-[transform,visibility] duration-300 ease-out motion-reduce:transition-none",
          showSticky ? "visible translate-y-0" : "invisible translate-y-full",
        )}
        data-testid="landing-sticky-cta"
      >
        <PrimaryAction cta={cta} event="landing_cta_sticky" onLeave={onLeave} />
      </div>
    </div>
  );
}

/** One literal call per tier: the i18n gate reads keys statically. */
function tierName(tier: PublicPrizeDto["tier"], t: (key: TranslationKey) => string): string {
  switch (tier) {
    case "gameweek":
      return t("prizes.tier.gameweek");
    case "monthly":
      return t("prizes.tier.monthly");
    case "season":
      return t("prizes.tier.season");
    case "mini_league":
      return t("prizes.tier.mini_league");
  }
}

/** A visitor without an account: the audience the sign-up funnel counts. */
function signedOutStatus(status: AuthStatus): boolean {
  return status === "anonymous" || status === "guest";
}

/** The page's one primary action, in its state's words; the same everywhere. */
function PrimaryAction({
  cta,
  event,
  onLeave,
  size = "md",
}: {
  cta: LandingCta;
  event: AnalyticsEvent;
  onLeave?: () => void;
  size?: "sm" | "md";
}) {
  const { t } = useI18n();
  const { status } = useAuth();
  if (cta.kind === "pending") {
    // The button's place, kept: the label arrives with the state.
    return (
      <span
        role="status"
        aria-label={t("landing.cta_pending")}
        className={cn(
          "block animate-pulse opacity-70",
          ui.radius.full,
          size === "sm" ? "h-11 w-40" : "h-12 w-full",
        )}
        style={{ backgroundImage: "var(--ui-grad-action)" }}
      />
    );
  }
  const label =
    cta.kind === "team"
      ? t("home.view_fantasy_team")
      : cta.kind === "discover"
        ? t("landing.cta_discover")
        : t("fantasy.create.title");
  return (
    <UiLinkButton
      to={cta.to}
      variant="gradient"
      size={size}
      onClick={() => {
        // The funnel's step: a visitor without an account heading for the
        // builder. A signed-in reader's tap is not one (see `landing_view`).
        if (cta.kind === "create" && signedOutStatus(status)) track(event);
        onLeave?.();
      }}
      data-testid={`landing-cta-${event.replace("landing_cta_", "")}`}
      data-cta-kind={cta.kind}
    >
      {label}
      <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
    </UiLinkButton>
  );
}

/**
 * The one line under the button that depends on the season: until when a
 * team made now plays this gameweek, the note that no account is needed to
 * start, or — when entries are closed — that, in words.
 */
function HeroStateLine({
  cta,
  joinBy,
}: {
  cta: LandingCta;
  joinBy: { number: number; deadline: string } | null;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  if (cta.kind === "pending") {
    // Two quiet bars where the lines will be, so the room kept for them is
    // never an empty band while the session and the gameweek arrive.
    return (
      <div aria-hidden className="mt-4 grid max-w-md gap-2.5">
        <span
          className={cn("block h-3.5 w-full bg-[color:var(--ui-mesh-glass)]", ui.radius.full)}
        />
        <span className={cn("block h-3.5 w-2/3 bg-[color:var(--ui-mesh-glass)]", ui.radius.full)} />
      </div>
    );
  }
  if (cta.kind === "team") {
    return (
      <p
        className={cn(
          "mt-4 flex max-w-md items-start gap-2",
          ui.text.secondary,
          ui.tone.onMeshMuted,
        )}
      >
        <Trophy className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{t("landing.team_note")}</span>
      </p>
    );
  }
  if (cta.kind === "discover") {
    return (
      <p
        className={cn(
          "mt-4 flex max-w-md items-start gap-2",
          ui.text.secondary,
          ui.tone.onMeshMuted,
        )}
      >
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{t("fantasy.availability.registration_closed.title")}</span>
      </p>
    );
  }
  return (
    <div className={cn("mt-4 grid max-w-md gap-2", ui.text.secondary, ui.tone.onMeshMuted)}>
      <p>{t("landing.cta_note")}</p>
      {joinBy ? (
        <p className="flex items-start gap-2">
          <Timer className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ui-on-ink)]" aria-hidden />
          <span>
            {t("landing.join_by").replace("{n}", nf.format(joinBy.number))}{" "}
            <bdi className={cn(ui.text.bodyStrong, ui.tone.onMesh)}>
              {formatDeadline(joinBy.deadline, lang, { weekday: "short" })}
            </bdi>
          </span>
        </p>
      ) : null}
    </div>
  );
}

function Step({
  n,
  icon: Icon,
  heading: H,
  title,
  body,
  children,
}: {
  n: number;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  heading: "h3" | "h4";
  title: string;
  body: string;
  children: ReactNode;
}) {
  const { lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  return (
    <li className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center",
            ui.radius.full,
            ui.display.headerSm,
            "bg-[color:var(--ui-ink)] text-[color:var(--ui-on-ink-plain)]",
          )}
        >
          {nf.format(n)}
        </span>
        <Icon className={cn("h-5 w-5", ui.tone.ink)} aria-hidden />
      </div>
      <H className={cn("mt-4", ui.display.teamSm)}>{title}</H>
      <p className={cn("mt-2", ui.text.prose, ui.tone.muted)}>{body}</p>
      {/* `flex-1`: the three boxes end on one line, however short their content. */}
      <div
        className={cn(
          "mt-4 flex flex-1 flex-col justify-center p-4",
          ui.radius.card,
          ui.surface.sunken,
        )}
      >
        {children}
      </div>
    </li>
  );
}

function Fact({ children }: { children: ReactNode }) {
  return (
    <span
      className={cn(
        "px-3 py-1",
        ui.radius.full,
        ui.surface.card,
        ui.text.meta,
        "[font-weight:var(--ui-weight-heavy)]",
      )}
    >
      {children}
    </span>
  );
}

function Reason({
  icon: Icon,
  title,
  body,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-4 py-5 first:pt-0 last:pb-0">
      <Icon className={cn("mt-0.5 h-6 w-6 shrink-0", ui.tone.ink)} aria-hidden />
      <div className="min-w-0">
        <p className={cn(ui.text.subtitle, ui.tone.default)}>{title}</p>
        <p className={cn("mt-1", ui.text.prose, ui.tone.muted)}>{body}</p>
      </div>
    </li>
  );
}

/** Native disclosure: keyboard, screen readers and find-in-page for free. */
function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden",
          ui.text.subtitle,
          ui.tone.default,
          ui.focus,
        )}
      >
        <span className="min-w-0">{q}</span>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none",
            ui.tone.ink,
          )}
          aria-hidden
        />
      </summary>
      <p className={cn("pb-4", ui.text.prose, ui.tone.muted)}>{a}</p>
    </details>
  );
}

/** Guest access stays open: matches, results and the table need no account. */
function BrowseInvite({
  heading: H,
  onLeave,
  className,
}: {
  heading: "h3" | "h4";
  onLeave?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn("self-start p-5", ui.radius.sheet, ui.surface.sunken, className)}>
      <H className={cn(ui.display.teamSm)}>{t("landing.browse_title")}</H>
      <p className={cn("mt-2", ui.text.prose, ui.tone.muted)}>{t("landing.browse_body")}</p>
      <UiLinkButton
        to="/matches"
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={onLeave}
        data-testid="landing-browse"
      >
        {t("landing.browse_cta")}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </UiLinkButton>
    </div>
  );
}
