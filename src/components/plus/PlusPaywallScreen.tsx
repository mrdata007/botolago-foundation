import { useEffect, useRef, useState, type ReactNode } from "react";

import type { PremiumPrice } from "@/backend/premium/contracts";
import { CardToken } from "@/components/manager-card/CardToken";
import type { CardProfile } from "@/components/manager-card/types";
import type { TranslationKey } from "@/i18n/dictionaries";
import { scrollBehavior } from "@/lib/motion";

import { PlusLogo } from "./PlusLogo";
import type { PlusContext } from "./plus-steps";
import { seasonEndOf, seasonPriceOf } from "./plus-pricing";
import { PLUS_NAME, usePlusCopy } from "./plus-copy";
import { DateText, Money } from "./plus-text";

/**
 * Screen 3, the offer (sketch `#screen-3`) that every entry point opens: the big logo, a headline
 * that says what the reader was looking at, ONE card for the Saison (« Saison 2026/27 · 200 MAD ·
 * Valable jusqu'au {date} »), « Ce que comprend la Saison » as four cards, ONE « Payer ma Saison »
 * button that goes to the pay screen, and the terms link. From 1024 px the card and the benefits sit
 * side by side.
 *
 * The price and the date are read (`plus-pricing.ts`, from the server's list), never typed: one
 * payment, valid until the end of the current Fantasy season, nothing renews.
 */
export function PlusPaywallScreen({
  prices,
  profile,
  context,
  onBuy,
  titleRef,
}: {
  prices: readonly PremiumPrice[];
  profile: CardProfile;
  /** What the reader was looking at; the headline says so. Absent: the general headline. */
  context?: PlusContext;
  onBuy: () => void;
  titleRef: React.Ref<HTMLHeadingElement>;
}) {
  const { t, f } = usePlusCopy();
  const [termsOpen, setTermsOpen] = useState(false);
  const termsRef = useRef<HTMLDetailsElement>(null);

  const price = seasonPriceOf(prices);
  const end = seasonEndOf(prices);
  const logo = <PlusLogo label={PLUS_NAME} />;

  const terms: ReactNode[] = [
    f("plus.terms.once", { price: <Money amount={price.amountMad} /> }),
    end
      ? f("plus.terms.until", { logo, date: <DateText date={end} /> })
      : f("plus.terms.until_end", { logo }),
    t("plus.terms.norenew"),
    t("plus.terms.check"),
    t("plus.terms.after"),
    t("plus.terms.keep"),
  ];

  // Escape closes the terms before it closes the offer: this listener runs first and stops the
  // event, so the offer's own never sees it.
  useEffect(() => {
    if (!termsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setTermsOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [termsOpen]);

  const toggleTerms = () => {
    const next = !termsOpen;
    setTermsOpen(next);
    if (next) {
      requestAnimationFrame(() =>
        termsRef.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() }),
      );
    }
  };

  return (
    <>
      <div className="plus-body">
        <div className="plus-s3-logo">
          <PlusLogo label={PLUS_NAME} />
        </div>
        <h1 className="plus-h plus-s3-h" id="plus-s3-title" tabIndex={-1} ref={titleRef}>
          {headline(t, context)}
        </h1>

        <div className="plus-plans" data-testid="plus-season-card">
          <div className="plus-plan" data-selected="true">
            <span className="plus-plan-main">
              <span className="plus-plan-name" id="plus-season-n">
                {t("plus.season.name")}
              </span>
              <span className="plus-plan-l1" id="plus-season-l1">
                {f("plus.season.l1", { price: <Money amount={price.amountMad} /> })}
              </span>
              <span className="plus-plan-l2" id="plus-season-l2">
                {end
                  ? f("plus.season.l2", { date: <DateText date={end} /> })
                  : t("plus.season.l2_nodate")}
              </span>
            </span>
          </div>
        </div>

        <section className="plus-feats" aria-labelledby="plus-feats-h">
          <h2 className="plus-feats-h" id="plus-feats-h">
            {t("plus.s3.feat_title")}
          </h2>
          <div className="plus-feat">
            <span className="plus-ic" aria-hidden>
              <svg viewBox="0 0 24 24">
                <rect
                  x="6"
                  y="3"
                  width="12"
                  height="18"
                  rx="2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                />
                <path
                  d="M4 4l16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="plus-ft">
              <b>{t("plus.s3.f0.t")}</b>
              <span>{t("plus.s3.f0.d")}</span>
            </span>
          </div>
          <div className="plus-feat">
            <span className="plus-ic plus-ic--card" aria-hidden>
              <CardToken profile={profile} size={44} />
            </span>
            <span className="plus-ft">
              <b>{t("plus.s3.f1.t")}</b>
              <span>{t("plus.s3.f1.d")}</span>
            </span>
          </div>
          <div className="plus-feat">
            <span className="plus-ic" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path
                  d="M4 19V9M10 19V5M16 19v-7M22 19H2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="plus-ft">
              <b>{t("plus.s3.f2.t")}</b>
              <span>{t("plus.s3.f2.d")}</span>
            </span>
          </div>
          <div className="plus-feat">
            <span className="plus-ic" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path
                  d="M7 4v16M17 4v16M3 9h8M13 15h8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="plus-ft">
              <b>{t("plus.s3.f3.t")}</b>
              <span>{t("plus.s3.f3.d")}</span>
            </span>
          </div>
        </section>

        <details
          className="plus-terms-d"
          id="plus-terms-d"
          ref={termsRef}
          open={termsOpen}
          onToggle={(event) => setTermsOpen(event.currentTarget.open)}
        >
          <summary className="plus-sr-only">{t("plus.s3.terms_link")}</summary>
          <ul className="plus-terms">
            {terms.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
      </div>
      <div className="plus-foot">
        <button type="button" className="plus-btn plus-btn--primary" onClick={onBuy}>
          {t("plus.s3.cta")}
        </button>
        <p className="plus-links">
          <button
            type="button"
            className="plus-link-btn"
            aria-controls="plus-terms-d"
            aria-expanded={termsOpen}
            onClick={toggleTerms}
          >
            {t("plus.s3.terms_link")}
          </button>
        </p>
      </div>
    </>
  );
}

/** The headline: the general one, or the one that carries what the reader was looking at. */
function headline(t: (key: TranslationKey) => string, context: PlusContext | undefined): string {
  switch (context) {
    case "season":
      return t("plus.ctx.season");
    case "duel":
      return t("plus.ctx.duel");
    case "career":
      return t("plus.ctx.career");
    case "editions":
      return t("plus.ctx.editions");
    case "rivals":
      return t("plus.ctx.rivals");
    case "briefing":
      return t("plus.ctx.briefing");
    default:
      return t("plus.s3.title");
  }
}
