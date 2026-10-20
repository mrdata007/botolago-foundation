import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOptionalAuth } from "@/auth/AuthProvider";
import { WebOnly } from "@/components/native/WebOnly";
import { ui, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import {
  ADVERTISING,
  adSenseReady,
  adsVisitorAllowed,
  validSponsor,
  type AdPlacement,
} from "@/lib/advertising";
import { nativePlatform } from "@/lib/native-app";
import { SUPPORT_EMAIL } from "@/lib/report-content";
import { cn } from "@/lib/utils";
import { premiumKeys, usePremium } from "@/services/use-premium";
import { loadAdSense, requestAd } from "./adsense";

// Google supports inline expandable-width / fixed-height responsive code.
// Do not combine these dimensions with format=auto/full-width expansion.
const SIZES = `.bgo_feed_ad{width:100%;max-width:970px;height:100px}.bgo_article_ad{width:336px;max-width:100%;height:250px}`;

export function AdSpace({ placement, className }: { placement: AdPlacement; className?: string }) {
  const auth = useOptionalAuth();
  const premium = usePremium();
  const client = useQueryClient();
  const status = client.getQueryState(premiumKeys.status);
  const membershipKnown =
    status?.status !== "error" &&
    (!auth?.user || client.getQueryState(premiumKeys.mine(auth.user.id))?.status === "success");
  // A member must never see a sponsor/house ad either. Fail closed while a
  // signed-in visitor's entitlement is unknown, including a failed read.
  const eligible = adsVisitorAllowed({
    ready: premium.ready,
    member: premium.isMember,
    authReady: auth?.status !== "loading",
    membershipKnown,
    native: false,
  });
  if (!eligible) return null;
  return (
    <WebOnly>
      <AdSlot placement={placement} className={className} />
    </WebOnly>
  );
}

/** The placement has its own lifecycle; language/theme changes keep the same ad node. */
function AdSlot({ placement, className }: { placement: AdPlacement; className?: string }) {
  const { t, lang, dir } = useI18n();
  const configured = ADVERTISING.sponsors[placement];
  const sponsor = validSponsor(configured) ? configured : undefined;
  const enabled = !sponsor && adSenseReady(ADVERTISING, placement);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const ad = useRef<HTMLModElement>(null);
  const live = enabled && near && !failed;
  const shape = placement === "articleEnd" ? "bgo_article_ad" : "bgo_feed_ad";

  useEffect(() => {
    if (!enabled || !surface.current || nativePlatform()) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(surface.current);
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    const element = ad.current;
    if (!live || !element || nativePlatform()) return;
    let cancelled = false;
    let pending = false;
    const request = async () => {
      if (cancelled || pending || element.offsetWidth === 0 || nativePlatform()) return;
      pending = true;
      try {
        await loadAdSense(ADVERTISING.publisherId);
        if (!cancelled) requestAd(element);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        pending = false;
      }
    };
    const resize = new ResizeObserver(() => {
      void request();
    });
    const status = new MutationObserver(() => {
      if (element.dataset.adStatus === "unfilled") setFailed(true);
    });
    resize.observe(element);
    status.observe(element, { attributes: true, attributeFilter: ["data-ad-status"] });
    void request();
    return () => {
      cancelled = true;
      resize.disconnect();
      status.disconnect();
    };
  }, [live]);

  return (
    <aside
      lang={lang}
      dir={dir}
      aria-label={t("ads.label")}
      data-ad-placement={placement}
      className={cn("my-8 min-w-0", className)}
    >
      <style>{SIZES}</style>
      <p className={cn("mb-2 text-center", ui.text.micro, ui.tone.muted)}>
        {sponsor ? t("ads.sponsored") : t("ads.label")}
      </p>
      <div ref={surface} data-ad-surface="" className={cn("mx-auto", shape)}>
        {sponsor ? (
          <a
            className={cn("block h-full w-full", ui.focus)}
            href={sponsor.href}
            target="_blank"
            rel="sponsored noopener noreferrer"
          >
            <img
              className="h-full w-full object-contain"
              src={sponsor.image}
              alt={sponsor.alt}
              loading="lazy"
            />
          </a>
        ) : live ? (
          <ins
            ref={ad}
            className={`adsbygoogle ${shape}`}
            style={{ display: "block" }}
            data-ad-client={ADVERTISING.publisherId}
            data-ad-slot={ADVERTISING.units[placement]}
          />
        ) : (
          <UiCard
            padding="none"
            className={cn(
              "flex h-full w-full items-center justify-center gap-3 px-4",
              placement === "articleEnd" && "flex-col text-center",
            )}
          >
            <div className="min-w-0">
              <p className={cn(ui.text.bodyStrong, ui.tone.default)}>{t("ads.placeholder")}</p>
              <p className={cn(ui.text.micro, ui.tone.muted)}>{t("ads.available")}</p>
            </div>
            <a
              className={cn(
                "inline-flex min-h-[var(--ui-tap-min)] shrink-0 items-center",
                ui.text.meta,
                ui.tone.ink,
                ui.focus,
              )}
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("BotolaGO — Partenariat")}`}
            >
              {t("ads.contact")}
            </a>
          </UiCard>
        )}
      </div>
    </aside>
  );
}
