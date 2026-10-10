import { useSplashDone } from "@/lib/launch-sequence";
import { useI18n } from "@/i18n/provider";

/**
 * Whether the launch sequence has let go of the screen: the splash is over, the page is hydrated
 * and the language is chosen (the PrizeWelcome gate, plan section 5.3). Nothing in Curva plays a
 * beat or counts a view before it, so an arrival never competes with the splash or the language
 * chooser, and a server render never counts a visit.
 */
export function useLaunchGate(): boolean {
  const { isHydrated, hasChosen } = useI18n();
  const splashDone = useSplashDone();
  return splashDone && isHydrated && hasChosen;
}
