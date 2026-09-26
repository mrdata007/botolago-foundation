import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ui, UiButton, UiLinkButton, UiModal } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useSplashDone } from "@/lib/launch-sequence";
import { cn } from "@/lib/utils";
import { prizesService } from "@/services/prizes";
import { PRIZE_HERO_ART } from "./prize-art";
import { tierLabel } from "./prize-presentation";

/**
 * Bumping the version shows the welcome once more on every device -- the
 * lever for a new season or a new sponsor. Nothing else about it is stored.
 */
export const PRIZE_WELCOME_STORAGE_KEY = "botolago.prizes.welcome.v1";

function alreadySeen(): boolean {
  try {
    return window.localStorage.getItem(PRIZE_WELCOME_STORAGE_KEY) === "1";
  } catch {
    // Storage blocked (private window, disabled site data): never nag.
    return true;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(PRIZE_WELCOME_STORAGE_KEY, "1");
  } catch {
    /* storage blocked: the popup simply closes */
  }
}

/**
 * The first-visit announcement on the Fantasy hub: "play free, win prizes".
 *
 * Shown once per device, over a team owner's dashboard only: the hub mounts it
 * where `fantasyHubLayout` says `prizeWelcome`, which it never says for a
 * visitor without a team -- signed out, or signed in before creating one --
 * whose first-time proposition names the prizes inline instead (audit
 * 2026-09-25, A16). So its way on is "C'est parti", back to that dashboard;
 * the "Créer une équipe" it offered a visitor without a team could no longer
 * be reached, and is gone. It opens only
 *   - once the launch sequence has let go of the screen (splash finished,
 *     language chosen), so it never sits under the splash or over the chooser;
 *   - when at least one prize is switched on -- there is nothing to announce
 *     otherwise, and the list inside it comes from the admin catalog.
 * Closing it by any means -- either button, the close control, Escape or a
 * tap outside -- counts as seen.
 */
export function PrizeWelcome() {
  const { t, tr, isHydrated, hasChosen } = useI18n();
  const splashDone = useSplashDone();
  const ready = splashDone && isHydrated && hasChosen;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (ready) setDismissed(alreadySeen());
  }, [ready]);

  const prizes = useQuery({
    queryKey: ["prizes", "catalog"],
    queryFn: () => prizesService.listPrizes(),
    enabled: ready && !dismissed,
    staleTime: 5 * 60_000,
  });

  const open = ready && !dismissed && (prizes.data?.length ?? 0) > 0;
  const close = () => {
    markSeen();
    setDismissed(true);
  };

  return (
    <UiModal
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={t("prizes.welcome.title")}
      description={t("prizes.welcome.body")}
      footer={
        <div className="flex flex-col gap-2">
          <UiButton variant="gradient" onClick={close} data-testid="prize-welcome-go">
            {t("prizes.welcome.go")}
          </UiButton>
          <UiLinkButton
            to="/prizes"
            variant="ghost"
            size="sm"
            onClick={close}
            data-testid="prize-welcome-see"
          >
            {t("prizes.welcome.see")}
          </UiLinkButton>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <img
          src={PRIZE_HERO_ART}
          alt=""
          aria-hidden
          decoding="async"
          className="h-28 w-auto object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.2)]"
          data-testid="prize-welcome-art"
        />
        <ul className="grid w-full gap-1.5" data-testid="prize-welcome-list">
          {(prizes.data ?? []).slice(0, 3).map((prize) => (
            <li key={prize.id} className={cn("px-3 py-2", ui.radius.control, ui.surface.sunken)}>
              <p className={cn(ui.text.label, ui.tone.muted)}>{tierLabel(t, prize.tier)}</p>
              <p className={cn(ui.text.bodyStrong, ui.tone.default)}>{tr(prize.name)}</p>
            </li>
          ))}
        </ul>
      </div>
    </UiModal>
  );
}
