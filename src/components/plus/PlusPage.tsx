import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { useLeaveOffer } from "./use-leave-offer";

import { useI18n } from "@/i18n/provider";
import { usePremium } from "@/services/use-premium";

import { PlusLogo } from "./PlusLogo";
import { PlusOffer } from "./PlusOffer";
import type { PlusStep } from "./plus-steps";
import { PLUS_NAME, usePlusCopy } from "./plus-copy";

/**
 * `/curva/plus`: the four-screen offer. `step` comes from the address (`?step=3` for the paywall,
 * `?step=4` after a purchase returns); screen 4 shows only for a member.
 */
export function CurvaPlusPage({ step }: { step?: PlusStep }) {
  const navigate = useNavigate();
  const leave = useLeaveOffer("/curva");
  const manage = useCallback(() => void navigate({ to: "/profile" }), [navigate]);
  return <PlusOffer initialStep={step ?? 1} mode="flow" onClose={leave} onManage={manage} />;
}

/**
 * `/plus`: the paywall on its own. A member sees a short note and the way to Profil instead of
 * being offered what they already have.
 */
export function PlusPage() {
  const premium = usePremium();
  const navigate = useNavigate();
  const leave = useLeaveOffer("/");
  const manage = useCallback(() => void navigate({ to: "/profile" }), [navigate]);
  if (premium.ready && premium.isMember) return <MemberNote onClose={leave} />;
  return <PlusOffer mode="standalone" onClose={leave} onManage={manage} />;
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
          <div className="plus-body" style={{ justifyContent: "center", flex: 1 }}>
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
        </main>
      </div>
    </div>
  );
}
