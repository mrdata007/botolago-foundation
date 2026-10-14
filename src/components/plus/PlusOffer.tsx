import { Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type TouchEvent } from "react";

import type { PremiumProductCode } from "@/backend/premium/contracts";
import { useI18n } from "@/i18n/provider";
import { usePremium } from "@/services/use-premium";

import { usePlusProfile } from "./use-plus-profile";
import { PlusLogo } from "./PlusLogo";
import type { PlusContext, PlusStep } from "./plus-steps";
import { PlusPaywallScreen } from "./PlusPaywallScreen";
import { PlusSeasonScreen } from "./PlusSeasonScreen";
import { PlusStyleScreen } from "./PlusStyleScreen";
import { PlusWelcomeScreen } from "./PlusWelcomeScreen";
import { PLUS_NAME, useNow, usePlusCopy, type PlusStyle } from "./plus-copy";

/** The story's progress segments (style, season, subscription); the welcome screen has none. */
const TOTAL = 3;
/** Swipe and arrow keys cannot move past the plan screen; screen 4 comes only from a purchase. */
const LAST_FREE_STEP: PlusStep = 3;
const TOAST_MS = 2600;

// Curva's card share sheet, loaded on the first tap of « Partager ma carte ».
const ShareCardSheet = lazy(() =>
  import("@/components/manager-card/moments/ShareCardSheet").then((m) => ({
    default: m.ShareCardSheet,
  })),
);

/**
 * The BotolaGO+ offer (sketch `#phone`): a quiet always-dark surface over one short paywall
 * (screen 3) that every entry point opens, with a small « Voir l'aperçu » link to a three-screen
 * story (style, season, subscription). The step lives in the address, one history entry per step,
 * so the phone's Back button is « previous step »; the close button leaves the offer.
 * `mode="flow"` is `/curva/plus`; `mode="standalone"` is `/plus` (no swipe, no arrow keys).
 *
 * Nothing here takes money: while checkout is not open the button says « Bientôt disponible ».
 */
export function PlusOffer({
  step: requested,
  via,
  mode = "flow",
  within = 0,
  href,
  onStep,
  onBack,
  onClose,
  onManage,
}: {
  step: PlusStep;
  via?: PlusContext;
  mode?: "flow" | "standalone";
  /** Steps the reader has taken inside the offer: above 0, Back goes to the previous step. */
  within?: number;
  /** This screen's address, where sign-up sends the reader back to. */
  href: string;
  onStep: (step: PlusStep) => void;
  onBack: () => void;
  onClose: () => void;
  onManage: () => void;
}) {
  const { t, lang } = usePlusCopy();
  const { dir: pageDir } = useI18n();
  const premium = usePremium();
  const navigate = useNavigate();
  const { profile, example, card } = usePlusProfile();
  const now = useNow();
  const standalone = mode === "standalone";

  const [style, setStyle] = useState<PlusStyle>("holo");
  const [plan, setPlan] = useState<PremiumProductCode>("plus_yearly");
  const [duelOpen, setDuelOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoaded, setShareLoaded] = useState(false);
  const [toast, setToast] = useState<{ text: string; n: number; tone: "error" | "info" } | null>(
    null,
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Screen 4 is only for a member, whatever the address says.
  const step: PlusStep = requested === 4 && !premium.isMember ? 3 : requested;
  // The story (style, season, subscription) is on while the reader is inside it: on its first two
  // screens, and on the paywall they reached through them. The paywall alone has no progress.
  const inStory = !standalone && (step < 3 || (step === 3 && within > 0));
  const checkoutOpen = premium.checkoutEnabled;
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
    (to: PlusStep) => {
      setDuelOpen(false);
      onStep(to);
    },
    [onStep],
  );
  // Phone Back (or the arrow) can land on a screen with the duel closed.
  useEffect(() => setDuelOpen(false), [step]);

  // Focus the screen's title when the screen changes (not on first paint).
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    titleRef.current?.focus({ preventScroll: true });
  }, [step]);

  // Arrow keys move between the story's screens (not past the plan screen); Escape leaves.
  useEffect(() => {
    // The share sheet handles its own keys: Escape closes it, not the offer.
    if (shareOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      const tag = (target?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (target?.closest?.('[role="radiogroup"]')) return;
      const rtl = lang === "ar";
      const forward = rtl ? "ArrowLeft" : "ArrowRight";
      const backward = rtl ? "ArrowRight" : "ArrowLeft";
      if (event.key === "Escape") onClose();
      else if (!inStory) return;
      else if (event.key === forward && step < LAST_FREE_STEP) go((step + 1) as PlusStep);
      else if (event.key === backward && within > 0 && step < 4) onBack();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shareOpen, inStory, lang, step, within, go, onBack, onClose]);

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
    if (!start || !p || !inStory) return;
    const dx = p.clientX - start.x;
    const dy = p.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const forward = lang === "ar" ? dx > 0 : dx < 0;
    if (forward && step < LAST_FREE_STEP) go((step + 1) as PlusStep);
    else if (!forward && within > 0 && step < 4) onBack();
  };

  const onBuy = async () => {
    // Not signed in: sign up first (a free account), then this same screen again.
    if (!premium.signedIn) {
      void navigate({ to: "/auth/register", search: { next: href } });
      return;
    }
    const result = await premium.startCheckout(plan);
    if (result.status === "ok") go(4);
    else showToast(t("plus.soon"), "error");
  };
  const onRestore = async () => {
    const result = await premium.restore();
    if (result.status !== "ok") showToast(t("plus.s3.restore_soon"), "error");
  };
  const onShare = () => {
    // A rated card goes out as its picture, through the same sheet as Curva's.
    if (card && card.ovr !== null) {
      setShareLoaded(true);
      setShareOpen(true);
      return;
    }
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

  // The example label of the style screen. For a guest it is also the way to the free sign-up.
  const note =
    step !== 1
      ? null
      : example && premium.signedIn
        ? t("plus.note.example")
        : example
          ? t("plus.note.guest")
          : null;

  // Nothing is drawn until the database says the feature shows for this reader: a visitor to whom
  // it does not show (signed out, or not a member while the mode is off or preview) never sees a
  // frame of the offer before the effect above sends them away.
  if (!premium.ready || !premium.enabled) return null;

  const hasBack = !standalone && within > 0 && step < 4;
  // One small link in the corner: the preview from the paywall, the prices from inside the story.
  const sideLink: { to: PlusStep; label: string } | null =
    step === 3
      ? within === 0
        ? { to: 1, label: t("plus.s3.preview") }
        : null
      : step < 3
        ? { to: 3, label: t("plus.prices") }
        : null;

  return (
    <div className="plus-offer" data-step={step} dir={pageDir} lang={lang} data-testid="plus-offer">
      <div className="plus-stage">
        <main className="plus-phone" aria-label={PLUS_NAME}>
          <div className="plus-top">
            <button
              type="button"
              className="plus-icon-btn"
              data-hidden={!hasBack}
              aria-hidden={!hasBack ? true : undefined}
              tabIndex={!hasBack ? -1 : undefined}
              aria-label={t("common.back")}
              onClick={() => (step === 2 && duelOpen ? setDuelOpen(false) : onBack())}
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
              role={inStory ? "progressbar" : undefined}
              aria-hidden={inStory ? undefined : true}
              aria-label={t("plus.progress")}
              aria-valuemin={1}
              aria-valuemax={TOTAL}
              aria-valuenow={step}
              aria-valuetext={t("plus.step_of")
                .replace("{n}", String(step))
                .replace("{total}", String(TOTAL))}
              style={inStory ? undefined : { visibility: "hidden" }}
            >
              {[1, 2, 3].map((n) => (
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
              data-hidden={!sideLink}
              aria-hidden={!sideLink ? true : undefined}
              tabIndex={!sideLink ? -1 : undefined}
              onClick={() => sideLink && go(sideLink.to)}
              data-testid="plus-side-link"
            >
              {sideLink?.label ?? "\u00a0"}
            </button>
          </div>
          {note ? (
            premium.signedIn ? (
              <p className="plus-note">{note}</p>
            ) : (
              <Link
                to="/auth/register"
                search={{ next: href }}
                className="plus-note plus-note--link"
                data-testid="plus-note-signup"
              >
                {note}
              </Link>
            )
          ) : null}

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
                  context={via}
                  checkoutOpen={checkoutOpen}
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
      {card && shareLoaded ? (
        <Suspense fallback={null}>
          <ShareCardSheet open={shareOpen} onOpenChange={setShareOpen} card={card} />
        </Suspense>
      ) : null}
    </div>
  );
}
