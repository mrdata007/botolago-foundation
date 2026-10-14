import { useRouterState } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import type { JSX } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { useCurvaCopy } from "@/components/manager-card/copy";
import { PlusEmbed } from "@/components/plus/PlusLockedSection";
import { CumChart } from "@/components/plus/plus-season-charts";
import { EXAMPLE_VIEW, SeasonProvider } from "@/components/plus/plus-season-context";
import { useSeasonFmt } from "@/components/plus/plus-season-fmt";
import { SAMPLE_CARD_PROFILE } from "@/components/plus/plus-sample";
import { ui, UiCard, UiLinkButton, UiPageTitle } from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { sanitizeAuthCallbackNext } from "@/lib/auth-callback";
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

/** The example league the blurred preview draws: a made-up table, never anyone's data. */
const EXAMPLE_ROWS: readonly { name: string; points: number; own?: true }[] = [
  { name: "Yassine", points: 655 },
  { name: "Sami", points: 631 },
  { name: "Karim B.", points: 612, own: true },
  { name: "Omar", points: 598 },
  { name: "Hamza", points: 571 },
];

/**
 * Curva for a signed-out visitor (`/curva` and everything under it): one lock screen. A blurred,
 * dimmed, inert example of Curva behind (a made-up card, table and season: no read of any kind),
 * one headline that carries what they wanted, « Créer mon compte » first and « Se connecter »
 * second, both coming back to the address they asked for (`next`, sanitised like every other).
 * Nothing real can show through the blur: the preview is drawn from example data only.
 */
export function CurvaLockScreen(): JSX.Element {
  const { t } = useI18n();
  const copy = useCurvaCopy();
  const { pathname, next } = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      next: sanitizeAuthCallbackNext(
        `${state.location.pathname}${state.location.searchStr}${state.location.hash ? `#${state.location.hash}` : ""}`,
      ),
    }),
  });
  const beat = useStageBeat({ kind: "guest", counted: null });
  const { jAxis } = useSeasonFmt();
  useViewEvent("curva_view_guest");
  return (
    <FantasyFrame bottomNav topBar="always" className={STICKY_COLUMN_CLASS}>
      <UiPageTitle title={copy.nav} />
      <div className="relative isolate overflow-hidden" data-testid="curva-lock">
        <div
          aria-hidden="true"
          inert
          className="pointer-events-none select-none pb-6 [filter:blur(10px)_saturate(0.8)]"
          data-testid="curva-lock-preview"
        >
          <CardStage profile={SAMPLE_CARD_PROFILE} beat={beat} />
          <div className={cn("mt-4 flex flex-col gap-4", ui.space.gutter)}>
            <UiCard padding="none" className="overflow-hidden">
              <ul>
                {EXAMPLE_ROWS.map((row, index) => (
                  <li
                    key={row.name}
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-3",
                      index > 0 && ui.rule.blockStart,
                      row.own && ui.surface.sunken,
                    )}
                  >
                    <span className={cn(ui.text.bodyStrong, ui.tone.default)}>
                      {index + 1} · {row.name}
                    </span>
                    <span className={cn(ui.text.bodyStrong, ui.tone.default)}>{row.points}</span>
                  </li>
                ))}
              </ul>
            </UiCard>
            <PlusEmbed className="plus-embed--night max-h-40">
              <SeasonProvider view={EXAMPLE_VIEW}>
                <div className="plus-body ps-body">
                  <CumChart
                    a={EXAMPLE_VIEW.S.cumYou}
                    b={EXAMPLE_VIEW.S.cumLeague}
                    bKind="ref"
                    jAxis={jAxis}
                    label=""
                  />
                </div>
              </SeasonProvider>
            </PlusEmbed>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[color:var(--ui-surface-page)] opacity-70"
        />
        <section
          aria-labelledby="curva-lock-title"
          className={cn("absolute inset-x-0 top-0 mx-auto max-w-md pt-6", ui.space.gutter)}
        >
          <UiCard padding="lg" className="flex flex-col items-center gap-3 text-center">
            <span
              aria-hidden
              className={cn(
                "grid h-12 w-12 place-items-center",
                ui.radius.full,
                ui.surface.sunken,
                ui.tone.ink,
              )}
            >
              <Lock className="h-6 w-6" />
            </span>
            <h2
              id="curva-lock-title"
              className={cn("text-balance", ui.display.section, ui.tone.default)}
            >
              {lockTitle(t, lockTitleKey(pathname))}
            </h2>
            <p className={cn("text-pretty", ui.text.secondary, ui.tone.muted)}>
              {t("lock.curva.body")}
            </p>
            <div className="mt-2 flex w-full flex-col gap-3">
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
          </UiCard>
        </section>
      </div>
    </FantasyFrame>
  );
}
