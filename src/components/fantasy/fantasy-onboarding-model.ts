import type { TranslationKey } from "@/i18n/dictionaries";

export const FANTASY_ONBOARDING_STORAGE_KEY = "botolago.fantasy.onboarded";

export type FantasyOnboardingStepId = "squad" | "lineup" | "live" | "manage";

export interface FantasyOnboardingStep {
  id: FantasyOnboardingStepId;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}

export const fantasyOnboardingSteps = [
  {
    id: "squad",
    titleKey: "fantasy.onboarding.step1_title",
    bodyKey: "fantasy.onboarding.step1_body",
  },
  {
    id: "lineup",
    titleKey: "fantasy.onboarding.step2_title",
    bodyKey: "fantasy.onboarding.step2_body",
  },
  {
    id: "live",
    titleKey: "fantasy.onboarding.step3_title",
    bodyKey: "fantasy.onboarding.step3_body",
  },
  {
    id: "manage",
    titleKey: "fantasy.onboarding.step4_title",
    bodyKey: "fantasy.onboarding.step4_body",
  },
] as const satisfies readonly FantasyOnboardingStep[];

export interface FantasyOnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function hasCompletedFantasyOnboarding(
  storage: Pick<FantasyOnboardingStorage, "getItem">,
): boolean {
  try {
    return storage.getItem(FANTASY_ONBOARDING_STORAGE_KEY) === "1";
  } catch {
    // A guide should never trap a user when browser storage is unavailable.
    return true;
  }
}

export function completeFantasyOnboarding(
  storage: Pick<FantasyOnboardingStorage, "setItem">,
): boolean {
  try {
    storage.setItem(FANTASY_ONBOARDING_STORAGE_KEY, "1");
    return true;
  } catch {
    return false;
  }
}
