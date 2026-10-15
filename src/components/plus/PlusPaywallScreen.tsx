import { useEffect, useRef, useState, type ReactNode } from "react";

import type { PremiumPrice, PremiumProductCode } from "@/backend/premium/contracts";
import { CardToken } from "@/components/manager-card/CardToken";
import type { CardProfile } from "@/components/manager-card/types";
import type { TranslationKey } from "@/i18n/dictionaries";
import { scrollBehavior } from "@/lib/motion";

import { PlusLogo } from "./PlusLogo";
import type { PlusContext } from "./plus-steps";
import { billingCalendar, priceOf, yearlyPerMonth, yearlySaving } from "./plus-pricing";
import { PLUS_NAME, usePlusCopy } from "./plus-copy";
import { DateText, Money } from "./plus-text";

/**
 * Screen 3, the paywall (sketch `#screen-3`, the plan-card layout) that every entry point opens: the
 * big logo, a headline that says what the reader was looking at, the selected plan card with the
 * « Le plus avantageux » chip and a check, a link revealing the other plan, « Avantages de
 * l'abonnement » as four cards, ONE « S'abonner » button (« Bientôt disponible » and disabled while
 * checkout is not open), and the terms and restore links. From 1024 px the plans and the benefits
 * sit side by side.
 *
 * Prices, dates and the saving are computed (`plus-pricing.ts`), never typed: 20 MAD a month, 200
 * MAD a year (12 months from purchase, no automatic renewal), saving 40 MAD against 12 monthly
 * payments.
 */
export function PlusPaywallScreen({
  now,
  prices,
  plan,
  onPlan,
  profile,
  context,
  checkoutOpen = true,
  onBuy,
  onRestore,
  titleRef,
}: {
  now: Date;
  prices: readonly PremiumPrice[];
  plan: PremiumProductCode;
  onPlan: (plan: PremiumProductCode) => void;
  profile: CardProfile;
  /** What the reader was looking at; the headline says so. Absent: the general headline. */
  context?: PlusContext;
  /** false (before launch): the button is disabled and says « Bientôt disponible ». */
  checkoutOpen?: boolean;
  onBuy: () => void;
  onRestore: () => void;
  titleRef: React.Ref<HTMLHeadingElement>;
}) {
  const { t, f, count } = usePlusCopy();
  const [open, setOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [announce, setAnnounce] = useState("");
  const termsRef = useRef<HTMLDetailsElement>(null);

  const cal = billingCalendar(now);
  const saving = yearlySaving(now, prices);
  const monthly = priceOf("plus_monthly", prices);
  const yearly = priceOf("plus_yearly", prices);
  const isYearly = plan === "plus_yearly";

  const yearlyL1 = f("plus.yearly.l1", { price: <Money amount={yearly.amountMad} /> });
  const yearlyL2 = saving.show
    ? f("plus.yearly.l2_saving", {
        pm: <Money amount={yearlyPerMonth(prices)} decimals />,
        saving: <Money amount={saving.saving} />,
      })
    : f("plus.yearly.l2", { pm: <Money amount={yearlyPerMonth(prices)} decimals /> });
  const monthlyL1 = f("plus.monthly.l1", { price: <Money amount={monthly.amountMad} /> });
  const monthlyL2 = f("plus.monthly.l2", { date: <DateText date={cal.nextMonthly} short /> });

  const terms: ReactNode[] = isYearly
    ? [
        f("plus.terms.yearly1", {
          logo: <PlusLogo label={PLUS_NAME} />,
          date: <DateText date={cal.yearlyUntil} />,
        }),
        t("plus.terms.yearly2"),
        ...(saving.show
          ? [
              f("plus.terms.basis", {
                n: count(saving.months, "payments"),
                calc: (
                  <bdi dir="ltr">
                    {monthly.amountMad} MAD × {saving.months}
                  </bdi>
                ),
                total: <Money amount={saving.monthlyTotal} />,
              }),
            ]
          : []),
        t("plus.terms.after_yearly"),
        t("plus.terms.keep"),
      ]
    : [
        f("plus.terms.monthly1", { date: <DateText date={cal.nextMonthly} /> }),
        f("plus.terms.monthly2", { date: <DateText date={cal.nextMonthly} /> }),
        t("plus.terms.reminder"),
        t("plus.terms.after_monthly"),
        t("plus.terms.keep"),
      ];

  // The chosen plan is announced in words, once, when it changes (not on first render).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const slug = isYearly ? "yearly" : "monthly";
    const line = (part: string) =>
      document.getElementById(`plus-plan-${slug}-${part}`)?.textContent ?? "";
    setAnnounce(
      [isYearly ? t("plus.yearly.name") : t("plus.monthly.name"), line("l1"), line("l2")].join(
        ". ",
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

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

        <fieldset className="plus-plans" data-open={open}>
          <legend className="plus-sr-only">{t("plus.s3.plans_legend")}</legend>
          <PlanCard
            code="plus_yearly"
            chosen={isYearly}
            onChoose={onPlan}
            best
            name={t("plus.yearly.name")}
            l1={yearlyL1}
            l2={yearlyL2}
          />
          <PlanCard
            code="plus_monthly"
            chosen={!isYearly}
            onChoose={onPlan}
            name={t("plus.monthly.name")}
            l1={monthlyL1}
            l2={monthlyL2}
          />
        </fieldset>
        <button
          type="button"
          className="plus-all"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span>{open ? t("plus.s3.fewer_plans") : t("plus.s3.all_plans")}</span>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path
              d="M7 10l5 5 5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

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
        <p className="plus-sr-only" role="status">
          {announce}
        </p>
      </div>
      <div className="plus-foot">
        <button
          type="button"
          className="plus-btn plus-btn--primary"
          disabled={!checkoutOpen}
          aria-describedby={checkoutOpen ? undefined : "plus-soon-line"}
          onClick={onBuy}
        >
          {checkoutOpen ? t("plus.s3.cta") : t("plus.s3.soon")}
        </button>
        {checkoutOpen ? null : (
          <p className="plus-rule-line" id="plus-soon-line">
            {t("plus.s3.soon_line")}
          </p>
        )}
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
          {checkoutOpen ? (
            <>
              <span aria-hidden>·</span>
              <button type="button" className="plus-link-btn" onClick={onRestore}>
                {t("plus.s3.restore")}
              </button>
            </>
          ) : null}
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

function PlanCard({
  code,
  chosen,
  onChoose,
  best = false,
  name,
  l1,
  l2,
}: {
  code: PremiumProductCode;
  chosen: boolean;
  onChoose: (code: PremiumProductCode) => void;
  best?: boolean;
  name: string;
  l1: ReactNode;
  l2: ReactNode;
}) {
  const { t } = usePlusCopy();
  const slug = code === "plus_yearly" ? "yearly" : "monthly";
  return (
    <label className="plus-plan" data-selected={chosen}>
      <input
        className="plus-radio"
        type="radio"
        name="plus-plan"
        value={code}
        checked={chosen}
        onChange={() => onChoose(code)}
        aria-labelledby={`plus-plan-${slug}-n plus-plan-${slug}-l1`}
        aria-describedby={`plus-plan-${slug}-l2`}
      />
      <span className="plus-plan-main">
        {best ? (
          <span className="plus-chip">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path
                d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"
                fill="currentColor"
              />
            </svg>
            <span>{t("plus.s3.best")}</span>
          </span>
        ) : null}
        <span className="plus-plan-name" id={`plus-plan-${slug}-n`}>
          {name}
        </span>
        <span className="plus-plan-l1" id={`plus-plan-${slug}-l1`}>
          {l1}
        </span>
        <span className="plus-plan-l2" id={`plus-plan-${slug}-l2`}>
          {l2}
        </span>
      </span>
      <span className="plus-tick" aria-hidden>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path
            d="M6.5 12.5l3.6 3.6 7.4-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </label>
  );
}
