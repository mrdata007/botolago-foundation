import { Link } from "@tanstack/react-router";
import { ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Section } from "@/components/common/Section";
import { ui, UiCard, UiIconButton } from "@/components/ui-kit";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { hasWelcomed, markWelcomeDone } from "@/lib/welcome";

/**
 * Whether the invitation is for this reader: an anonymous visitor who has not
 * been welcomed yet. Read after mount (localStorage), so the server and the
 * first client render agree on there being no card.
 */
export function useFantasyInvitation(): { show: boolean; dismiss: () => void } {
  const { status } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setMounted(true), []);
  return {
    show: mounted && status === "anonymous" && !dismissed && !hasWelcomed(),
    dismiss: () => {
      markWelcomeDone();
      setDismissed(true);
    },
  };
}

/**
 * A first visit's way into the game, inside Home rather than in its place.
 *
 * `/` used to swap Home for the landing page once the splash had gone, so a
 * newcomer's first real screen was a different page from the one the server
 * had sent (a layout jump, and the live scores hidden behind a sales pitch).
 * Home now stays. This compact card sits under the first screen's content, so
 * that its late arrival (it reads localStorage after mount) moves nothing the
 * reader has already seen, and invites an anonymous visitor to the landing
 * page (`/jouer`, which stays reachable by its own address). Closing it is
 * the welcome: `markWelcomeDone`, as leaving the landing page was.
 */
export function FantasyInvitationCard({ className }: { className?: string }) {
  const { t } = useI18n();
  const { show, dismiss } = useFantasyInvitation();
  if (!show) return null;
  return (
    <Section className={className}>
      <UiCard
        as="aside"
        aria-label={t("landing.kicker")}
        testId="home-fantasy-invitation"
        className="relative"
      >
        <p className={cn("pe-12", ui.text.label, ui.tone.muted)}>{t("landing.kicker")}</p>
        <p className={cn("mt-1 pe-12", ui.display.section, ui.tone.default)}>
          {t("landing.title_2")}
        </p>
        <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{t("landing.lede")}</p>
        <Link
          to="/jouer"
          className={cn(
            "mt-2 inline-flex items-center gap-1.5",
            ui.space.tap,
            ui.text.bodyStrong,
            ui.tone.ink,
            ui.focus,
          )}
        >
          {t("landing.cta_discover")}
          {/* A drawn arrow, mirrored in Arabic by styles.css. */}
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
        <UiIconButton
          aria-label={t("common.close")}
          onClick={dismiss}
          className="absolute end-2 top-2"
        >
          <X className="h-4 w-4" aria-hidden />
        </UiIconButton>
      </UiCard>
    </Section>
  );
}
