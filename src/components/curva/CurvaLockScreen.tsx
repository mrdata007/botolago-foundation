import { useRouterState } from "@tanstack/react-router";
import type { JSX } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { useCurvaCopy } from "@/components/manager-card/copy";
import { SAMPLE_CARD_PROFILE } from "@/components/plus/plus-sample";
import { ui, UiLinkButton, UiPageTitle } from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { authReturnTarget } from "@/lib/auth-callback";
import { cn } from "@/lib/utils";

import { CardStage } from "./CardStage";
import { STICKY_COLUMN_CLASS } from "./figures";
import { useStageBeat } from "./use-stage-beat";
import { useViewEvent } from "./use-view-event";

/** What the guest wanted, from the address: the headline names it. */
export function lockTitleKey(pathname: string): TranslationKey {
  if (pathname.startsWith("/curva/carte")) return "lock.curva.title.card";
  if (pathname.startsWith("/curva/les-votres")) return "lock.curva.title.people";
  if (pathname.startsWith("/curva/classement")) return "lock.curva.title.ranking";
  if (pathname.startsWith("/curva/saisons")) return "lock.curva.title.seasons";
  if (pathname.startsWith("/curva/plus")) return "lock.curva.title.plus";
  return "lock.curva.title.home";
}

/** The headline for that key, each spelled as a literal key (the i18n gate counts a computed key as W4). */
function lockTitle(t: (key: TranslationKey) => string, key: TranslationKey): string {
  switch (key) {
    case "lock.curva.title.card":
      return t("lock.curva.title.card");
    case "lock.curva.title.people":
      return t("lock.curva.title.people");
    case "lock.curva.title.ranking":
      return t("lock.curva.title.ranking");
    case "lock.curva.title.seasons":
      return t("lock.curva.title.seasons");
    case "lock.curva.title.plus":
      return t("lock.curva.title.plus");
    default:
      return t("lock.curva.title.home");
  }
}

/**
 * Curva for a signed-out visitor (`/curva` and everything under it): one lock screen. The real
 * Manager Card front, drawn by the card's own renderer from the example profile (marked
 * « Exemple » on its face; no read of any kind), as a teaser of what an account gets; under it one
 * headline that carries what they wanted, one line, « Créer mon compte » first and « Se connecter »
 * second, both coming back to the address they asked for (`next`, sanitised like every other).
 * No blurred page and no padlock: the card says what is behind the door.
 */
export function CurvaLockScreen(): JSX.Element {
  const { t } = useI18n();
  const copy = useCurvaCopy();
  const { pathname, next } = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      next: authReturnTarget(state.location),
    }),
  });
  const beat = useStageBeat({ kind: "guest", counted: null });
  useViewEvent("curva_view_guest");
  return (
    <FantasyFrame bottomNav topBar="always" className={STICKY_COLUMN_CLASS}>
      <UiPageTitle title={copy.nav} />
      <div data-testid="curva-lock">
        <div aria-hidden="true" inert data-testid="curva-lock-preview">
          <CardStage profile={SAMPLE_CARD_PROFILE} beat={beat} fitHeight />
        </div>
        <section
          aria-labelledby="curva-lock-title"
          className={cn(
            "mx-auto flex max-w-md flex-col items-center gap-2 pb-8 pt-2 text-center",
            ui.space.gutter,
          )}
        >
          <h2
            id="curva-lock-title"
            className={cn("text-balance", ui.display.section, ui.tone.default)}
          >
            {lockTitle(t, lockTitleKey(pathname))}
          </h2>
          <p className={cn("text-pretty", ui.text.secondary, ui.tone.muted)}>
            {t("lock.curva.body")}
          </p>
          <div className="mt-3 flex w-full flex-col gap-3">
            <UiLinkButton
              to="/auth/register"
              search={{ next }}
              variant="gradient"
              onClick={() => track("curva_guest_cta")}
              data-testid="curva-lock-register"
            >
              {t("lock.curva.create")}
            </UiLinkButton>
            <UiLinkButton
              to="/auth/login"
              search={{ next }}
              variant="ghost"
              onClick={() => track("curva_guest_cta")}
              data-testid="curva-lock-signin"
            >
              {t("lock.curva.signin")}
            </UiLinkButton>
          </div>
        </section>
      </div>
    </FantasyFrame>
  );
}
