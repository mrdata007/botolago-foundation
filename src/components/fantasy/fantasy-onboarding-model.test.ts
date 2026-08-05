import { describe, expect, test } from "bun:test";

import { dictionaries } from "@/i18n/dictionaries";
import {
  FANTASY_ONBOARDING_STORAGE_KEY,
  completeFantasyOnboarding,
  fantasyOnboardingSteps,
  hasCompletedFantasyOnboarding,
} from "./fantasy-onboarding-model";

describe("Fantasy onboarding model", () => {
  test("keeps the four teaching steps in task order", () => {
    expect(fantasyOnboardingSteps.map((step) => step.id)).toEqual([
      "squad",
      "lineup",
      "live",
      "manage",
    ]);
  });

  test("ships every step in French and Arabic", () => {
    for (const step of fantasyOnboardingSteps) {
      expect(dictionaries.fr[step.titleKey]).toBeTruthy();
      expect(dictionaries.fr[step.bodyKey]).toBeTruthy();
      expect(dictionaries.ar[step.titleKey]).toBeTruthy();
      expect(dictionaries.ar[step.bodyKey]).toBeTruthy();
    }
  });

  test("persists completion with the existing device-level marker", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(hasCompletedFantasyOnboarding(storage)).toBe(false);
    expect(completeFantasyOnboarding(storage)).toBe(true);
    expect(values.get(FANTASY_ONBOARDING_STORAGE_KEY)).toBe("1");
    expect(hasCompletedFantasyOnboarding(storage)).toBe(true);
  });

  test("fails open when browser storage is unavailable", () => {
    expect(
      hasCompletedFantasyOnboarding({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(true);
    expect(
      completeFantasyOnboarding({
        setItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(false);
  });
});
