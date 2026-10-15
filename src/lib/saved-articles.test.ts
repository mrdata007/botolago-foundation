import { describe, expect, test } from "bun:test";

import type { TranslationKey } from "@/i18n/dictionaries";
import { dictionaries } from "@/i18n/dictionaries";
import { reportSavedMutationFailure } from "./saved-articles";

/**
 * Audit UX-001: a save or an unsave the server refuses is told to the reader
 * (the bookmark has already rolled back and is the way to try again), once, and
 * a refusal for want of the one-time code is left to the auth layer's notice.
 */

function harness() {
  const said: string[] = [];
  const stepUps: number[] = [];
  return {
    said,
    stepUps,
    notify: {
      stepUp: () => void stepUps.push(1),
      error: (message: string) => void said.push(message),
    },
  };
}

const tFr = (key: TranslationKey) => dictionaries.fr[key];
const tAr = (key: TranslationKey) => dictionaries.ar[key];

describe("a failed save or unsave", () => {
  test("a failed unsave is announced with its own sentence", () => {
    const h = harness();
    reportSavedMutationFailure(new Error("network"), true, tFr, h.notify);
    expect(h.said).toEqual([dictionaries.fr["news.saved.remove_error"]]);
    expect(h.stepUps).toEqual([]);
  });

  test("a failed save is announced with a different sentence", () => {
    const h = harness();
    reportSavedMutationFailure(new Error("network"), false, tFr, h.notify);
    expect(h.said).toEqual([dictionaries.fr["news.saved.save_error"]]);
  });

  test("the sentence follows the reader's language", () => {
    const h = harness();
    reportSavedMutationFailure(new Error("network"), true, tAr, h.notify);
    expect(h.said).toEqual([dictionaries.ar["news.saved.remove_error"]]);
  });

  test("a refusal for want of the one-time code goes to the auth notice, not a second toast", () => {
    const h = harness();
    reportSavedMutationFailure({ code: "PT403", message: "mfa_required" }, true, tFr, h.notify);
    expect(h.stepUps).toEqual([1]);
    expect(h.said).toEqual([]);
  });
});
