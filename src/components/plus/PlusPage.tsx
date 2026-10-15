import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { useOfferHistory } from "./use-leave-offer";

import { useI18n } from "@/i18n/provider";
import { usePremium } from "@/services/use-premium";

import { PlusLogo } from "./PlusLogo";
import { PlusOffer } from "./PlusOffer";
import { DEFAULT_PLUS_STEP, type PlusContext, type PlusStep } from "./plus-steps";
import { PLUS_NAME, usePlusCopy } from "./plus-copy";

/**
 * `/curva/plus`: the offer. Without a `step` it is the short paywall every entry point opens
 * (`?via=season|duel|career|editions` says what the reader was looking at); `?step=1` opens the
 * three-screen story, `?step=4` the welcome after a purchase returns. A member sees their
 * subscription instead of a sales screen, except on screen 4.
 */
export function CurvaPlusPage({ step, via }: { step?: PlusStep; via?: PlusContext }) {
  const premium = usePremium();
  const navigate = useNavigate();
  const { within, back, leave, carry, href } = useOfferHistory("/curva");
  const manage = useCallback(() => void navigate({ to: "/profile" }), [navigate]);
  const goStep = useCallback(
    (next: PlusStep) =>
      void navigate({ to: "/curva/plus", search: { step: next, ...(via ? { via } : {}) } }),
    [navigate, via],
  );
  const current = step ?? DEFAULT_PLUS_STEP;
  if (premium.ready && premium.isMember && current !== 4) return <MemberNote onClose={leave} />;
  return (
    <PlusOffer
      step={current}
      via={via}
      mode="flow"
      within={within}
      href={href}
      onStep={goStep}
      onBack={back}
      onClose={leave}
      onManage={manage}
      onCarry={carry}
    />
  );
}

/**
 * `/plus`: the paywall on its own, the same screen as `/curva/plus` without the story's progress.
 * « Voir l'aperçu » opens the story. A member sees their subscription instead.
 */
export function PlusPage() {
  const premium = usePremium();
  const navigate = useNavigate();
  const { leave, carry, href } = useOfferHistory("/");
  const manage = useCallback(() => void navigate({ to: "/profile" }), [navigate]);
  const goStep = useCallback(
    (next: PlusStep) => {
      // The story is the same offer on another page: Close there still leaves from here.
      carry();
      void navigate({ to: "/curva/plus", search: { step: next } });
    },
    [navigate, carry],
  );
  if (premium.ready && premium.isMember) return <MemberNote onClose={leave} />;
  return (
    <PlusOffer
      step={3}
      mode="standalone"
      href={href}
      onStep={goStep}
      onBack={leave}
      onClose={leave}
      onManage={manage}
      onCarry={carry}
    />
  );
}

function MemberNote({ onClose }: { onClose: () => void }) {
  const { t } = usePlusCopy();
  const { dir, lang } = useI18n();
  return (
    <div className="plus-offer" dir={dir} lang={lang} data-testid="plus-member">
      <div className="plus-stage">
        <main className="plus-phone" aria-label={PLUS_NAME}>
          <div className="plus-top">
            <span />
            <span />
            <button
              type="button"
              className="plus-icon-btn"
              aria-label={t("common.close")}
              onClick={onClose}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="plus-steps">
            <section className="plus-step">
              <div className="plus-body" style={{ justifyContent: "center" }}>
                <div className="plus-s3-logo">
                  <PlusLogo label={PLUS_NAME} />
                </div>
                <h1 className="plus-h">{t("plus.page.member_title")}</h1>
                <p className="plus-lede">{t("plus.page.member_body")}</p>
              </div>
              <div className="plus-foot">
                <Link to="/profile" className="plus-btn plus-btn--primary">
                  {t("plus.s4.manage")}
                </Link>
                <Link to="/curva" className="plus-btn plus-btn--text">
                  {t("plus.page.back")}
                </Link>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
