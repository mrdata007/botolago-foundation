import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";

import type { PremiumProductCode } from "@/backend/premium/contracts";
import { useI18n } from "@/i18n/provider";
import { usePremium } from "@/services/use-premium";

import { usePlusProfile } from "./use-plus-profile";
import { PlusLogo } from "./PlusLogo";
import { clampStep, type PlusStep } from "./plus-steps";
import { PlusPaywallScreen } from "./PlusPaywallScreen";
import { PlusSeasonScreen } from "./PlusSeasonScreen";
import { PlusStyleScreen } from "./PlusStyleScreen";
import { PlusWelcomeScreen } from "./PlusWelcomeScreen";
import { PLUS_NAME, useNow, usePlusCopy, type PlusStyle } from "./plus-copy";

const TOTAL = 4;
/** Swipe and arrow keys cannot move past the plan screen; screen 4 comes only from a purchase. */
const LAST_FREE_STEP: PlusStep = 3;
const TOAST_MS = 2600;

/**
 * The BotolaGO+ offer (sketch `#phone`): a quiet always-dark surface with a back button, four
 * progress segments and a close button, over four screens. `mode="flow"` is the four-screen path
 * (`/curva/plus`); `mode="standalone"` is the paywall alone for people who tapped « Voir les
 * prix » (`/plus`): no progress, no back.
 *
 * Nothing here takes money: « S'abonner » calls the checkout stub, which answers « bientôt ».
 */
export function PlusOffer({
  initialStep = 1,
  mode = "flow",
  onClose,
  onManage,
}: {
  initialStep?: PlusStep;
  mode?: "flow" | "standalone";
  onClose: () => void;
  onManage: () => void;
}) {
  const { t, lang } = usePlusCopy();
  const { dir: pageDir } = useI18n();
  const premium = usePremium();
  const { profile, example } = usePlusProfile();
  const now = useNow();
  const standalone = mode === "standalone";

  const [style, setStyle] = useState<PlusStyle>("holo");
  const [plan, setPlan] = useState<PremiumProductCode>("plus_yearly");
  const [requested, setStep] = useState<PlusStep>(standalone ? 3 : initialStep);
  const [duelOpen, setDuelOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; n: number; tone: "error" | "info" } | null>(
    null,
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Screen 4 is only for a member, whatever the address says.
  const step: PlusStep = requested === 4 && !premium.isMember ? 3 : requested;
  const prices = premium.prices;

  // The database (mocked for now) says the feature is not on: leave, as Curva does.
  useEffect(() => {
    if (premium.ready && !premium.enabled) onClose();
  }, [premium.ready, premium.enabled, onClose]);

  const showToast = useCallback((text: string, tone: "error" | "info" = "info") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast((prev) => ({ text, n: (prev?.n ?? 0) + 1, tone }));
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const go = useCallback(
    (to: number) => {
      if (standalone) return;
      setDuelOpen(false);
      setStep(clampStep(Math.max(1, Math.min(TOTAL, to))));
    },
    [standalone],
  );

  // Focus the screen's title when the screen changes (not on first paint).
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    titleRef.current?.focus({ preventScroll: true });
  }, [step]);

  // Arrow keys move between screens (not past the plan screen); Escape leaves.
  useEffect(() => {
    if (standalone) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      const tag = (target?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (target?.closest?.('[role="radiogroup"]')) return;
      const rtl = lang === "ar";
      const forward = rtl ? "ArrowLeft" : "ArrowRight";
      const backward = rtl ? "ArrowRight" : "ArrowLeft";
      if (event.key === forward && step < LAST_FREE_STEP) go(step + 1);
      else if (event.key === backward && step > 1 && step < TOTAL) go(step - 1);
      else if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [standalone, lang, step, go, onClose]);

  // Swipe along the reading direction, never past the plan screen.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (event: TouchEvent) => {
    if ((event.target as HTMLElement).closest("input, textarea, select, [data-no-swipe]")) return;
    const p = event.touches[0];
    if (p) touch.current = { x: p.clientX, y: p.clientY };
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    const p = event.changedTouches[0];
    if (!start || !p || standalone) return;
    const dx = p.clientX - start.x;
    const dy = p.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const forward = lang === "ar" ? dx > 0 : dx < 0;
    if (forward && step < LAST_FREE_STEP) go(step + 1);
    else if (!forward && step > 1 && step < TOTAL) go(step - 1);
  };

  const onBuy = async () => {
    const result = await premium.startCheckout(plan);
    if (result.status === "ok") go(4);
    else showToast(t("plus.soon"), "error");
  };
  const onRestore = async () => {
    const result = await premium.restore();
    if (result.status !== "ok") showToast(t("plus.s3.restore_soon"), "error");
  };
  const onShare = () => {
    const text = t("plus.s4.share_text");
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        void navigator.share({ text }).catch(() => undefined);
        return;
      }
    } catch {
      // fall through to the toast
    }
    showToast(t("plus.s4.shared"));
  };

  const note =
    standalone || step === 3 || step === 2
      ? null
      : example && premium.signedIn
        ? t("plus.note.example")
        : example
          ? t("plus.note.guest")
          : null;

  return (
    <div className="plus-offer" data-step={step} dir={pageDir} lang={lang} data-testid="plus-offer">
      <div className="plus-stage">
        <main className="plus-phone" aria-label={PLUS_NAME}>
          <div className="plus-top">
            <button
              type="button"
              className="plus-icon-btn"
              data-hidden={standalone || step === 1 || step === TOTAL}
              aria-hidden={standalone || step === 1 || step === TOTAL ? true : undefined}
              tabIndex={standalone || step === 1 || step === TOTAL ? -1 : undefined}
              aria-label={t("common.back")}
              onClick={() => (step === 2 && duelOpen ? setDuelOpen(false) : go(step - 1))}
            >
              <svg
                className="plus-flip"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <div
              className="plus-progress"
              role={standalone ? undefined : "progressbar"}
              aria-hidden={standalone ? true : undefined}
              aria-label={t("plus.progress")}
              aria-valuemin={1}
              aria-valuemax={TOTAL}
              aria-valuenow={step}
              aria-valuetext={t("plus.step_of")
                .replace("{n}", String(step))
                .replace("{total}", String(TOTAL))}
              style={standalone ? { visibility: "hidden" } : undefined}
            >
              {[1, 2, 3, 4].map((n) => (
                <i key={n} style={{ ["--f" as string]: n <= step ? 1 : 0 }} />
              ))}
            </div>
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
          <div className="plus-sub">
            <span className="plus-brand" dir="ltr">
              <PlusLogo label={PLUS_NAME} />
            </span>
            <button
              type="button"
              className="plus-link"
              data-hidden={standalone || step >= 3}
              aria-hidden={standalone || step >= 3 ? true : undefined}
              tabIndex={standalone || step >= 3 ? -1 : undefined}
              onClick={() => go(3)}
            >
              {t("plus.prices")}
            </button>
          </div>
          {note ? <p className="plus-note">{note}</p> : null}

          <div className="plus-steps" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <section
              className={`plus-step plus-s${step}`}
              data-step={step}
              aria-labelledby={`plus-s${step}-title`}
            >
              {step === 1 ? (
                <PlusStyleScreen
                  profile={profile}
                  style={style}
                  onStyle={setStyle}
                  onNext={() => go(2)}
                  titleRef={titleRef}
                />
              ) : null}
              {step === 2 ? (
                <PlusSeasonScreen
                  onNext={() => go(3)}
                  titleRef={titleRef}
                  duelOpen={duelOpen}
                  onDuel={setDuelOpen}
                />
              ) : null}
              {step === 3 ? (
                <PlusPaywallScreen
                  now={now}
                  prices={prices}
                  plan={plan}
                  onPlan={setPlan}
                  profile={profile}
                  onViewEditions={() => (standalone ? undefined : go(1))}
                  onBuy={() => void onBuy()}
                  onRestore={() => void onRestore()}
                  titleRef={titleRef}
                />
              ) : null}
              {step === 4 ? (
                <PlusWelcomeScreen
                  profile={profile}
                  style={style}
                  productCode={premium.productCode}
                  periodEnd={premium.periodEnd}
                  onOpen={onClose}
                  onManage={onManage}
                  onShare={onShare}
                  titleRef={titleRef}
                />
              ) : null}
            </section>
          </div>
          <div
            className="plus-toast"
            role="status"
            aria-live="polite"
            data-show={toast !== null}
            data-tone={toast?.tone}
          >
            {toast?.text ?? ""}
          </div>
        </main>
      </div>
    </div>
  );
}
