import { describe, expect, it } from "bun:test";

import { queryKeyNamesAccount } from "@/auth/account-queries";

import { forViewer, pepitesKeys } from "./use-pepites";

describe("Pépites answers and their reader", () => {
  it("never keeps a staff preview under the anonymous key", () => {
    const preview = { available: true as const, preview: true, found: true };
    expect(forViewer("anon", preview)).toEqual({ available: false });
    expect(forViewer("staff-uid", preview)).toBe(preview);
    const open = { available: true as const, preview: false, found: true };
    expect(forViewer("anon", open)).toBe(open);
  });

  it("names the account in every key, so signing out forgets its answers", () => {
    const uid = "11111111-1111-4111-8111-111111111111";
    const keys = [
      pepitesKeys.version(uid),
      pepitesKeys.home(uid, "v1"),
      pepitesKeys.player(uid, "v1", "p"),
      pepitesKeys.matches(uid, "p"),
      pepitesKeys.edition(uid, null, 3),
      pepitesKeys.methodology(uid),
      pepitesKeys.weeklyEmail(uid),
    ];
    for (const key of keys) expect(queryKeyNamesAccount(key, uid)).toBe(true);
    expect(queryKeyNamesAccount(pepitesKeys.version("anon"), uid)).toBe(false);
  });
});
