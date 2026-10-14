import { describe, expect, it } from "bun:test";

import { plusAccess } from "@/components/plus/plus-access";
import {
  LAUNCH_PRICES,
  MY_PREMIUM_OFF,
  PREMIUM_STATUS_OFF,
  type MyPremium,
  type PremiumStatus,
} from "@/backend/premium/contracts";

import { derivePremium } from "./use-premium";

/**
 * Who sees BotolaGO+ in each database mode (docs/product/botolago-plus-staff-preview-brief.md).
 * The database speaks through two answers:
 *   - `premium_status()`: `enabled` only in mode `on`; in `off` and `preview` it discloses nothing;
 *   - `get_my_premium()`: `{ available: false }` in `off`, and in `preview` for non-members;
 *     `{ available: true, ... }` for members in `preview`, and for every signed-in reader in `on`.
 */
const STATUS_ON: PremiumStatus = {
  enabled: true,
  checkoutEnabled: false,
  prices: [...LAUNCH_PRICES],
};
const MEMBER: MyPremium = {
  available: true,
  state: "active",
  productCode: "plus_monthly",
  source: "grant",
  currentPeriodEnd: "2026-11-13T10:00:00+00:00",
  cancelAtPeriodEnd: true,
};
const NON_MEMBER_ON: MyPremium = {
  available: true,
  state: "none",
  productCode: null,
  source: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};
const EXPIRED_ON: MyPremium = { ...NON_MEMBER_ON, state: "expired" };

type Mode = "off" | "preview" | "on";
type Reader = "signed-out" | "non-member" | "member";

/** What the database answers for a mode and a reader. `undefined` is "the RPC gave nothing". */
function answers(mode: Mode, reader: Reader) {
  const status = mode === "on" ? STATUS_ON : PREMIUM_STATUS_OFF;
  let mine: MyPremium | undefined;
  if (reader === "signed-out")
    mine = undefined; // never asked
  else if (mode === "off") mine = MY_PREMIUM_OFF;
  else if (mode === "preview") mine = reader === "member" ? MEMBER : MY_PREMIUM_OFF;
  else mine = reader === "member" ? MEMBER : NON_MEMBER_ON;
  return { status, mine };
}

function access(status: PremiumStatus | undefined, mine: MyPremium | undefined, signedIn: boolean) {
  const view = derivePremium(status, mine, signedIn);
  return plusAccess({
    surfaces: true,
    ready: true,
    enabled: view.enabled,
    isMember: view.isMember,
  });
}

describe("who sees BotolaGO+, by database mode and reader", () => {
  const expected: Record<Mode, Record<Reader, "off" | "locked" | "member">> = {
    off: { "signed-out": "off", "non-member": "off", member: "off" },
    preview: { "signed-out": "off", "non-member": "off", member: "member" },
    // Unchanged from before the preview: the status alone is "on". Every in-app surface that
    // draws a lock is behind a signed-in area (Curva, Profil), and the offer routes need no session.
    on: { "signed-out": "locked", "non-member": "locked", member: "member" },
  };
  for (const mode of ["off", "preview", "on"] as const) {
    for (const reader of ["signed-out", "non-member", "member"] as const) {
      it(`mode ${mode}, ${reader}: ${expected[mode][reader]}`, () => {
        // Mode "off" has no members (the database answers {available:false} to all), so the
        // "member" reader there is a person who holds a grant while the feature is off.
        const { status, mine } = answers(mode, reader);
        expect(access(status, mine, reader !== "signed-out")).toBe(expected[mode][reader]);
      });
    }
  }

  it("a signed-out reader never sees it while the status is off, whatever the answers claim", () => {
    for (const status of [PREMIUM_STATUS_OFF, undefined]) {
      for (const mine of [MEMBER, NON_MEMBER_ON, MY_PREMIUM_OFF, undefined]) {
        expect(access(status, mine, false)).toBe("off");
      }
    }
    expect(derivePremium(PREMIUM_STATUS_OFF, MEMBER, false)).toMatchObject({
      enabled: false,
      isMember: false,
      state: "none",
    });
  });

  it("a non-member never gets `locked` while the status is off (preview and off)", () => {
    for (const mine of [MY_PREMIUM_OFF, undefined, NON_MEMBER_ON, EXPIRED_ON]) {
      expect(access(PREMIUM_STATUS_OFF, mine, true)).toBe("off");
      expect(access(undefined, mine, true)).toBe("off");
    }
  });

  it("a status or membership RPC that is missing or failed reads as off", () => {
    expect(access(undefined, undefined, true)).toBe("off");
    expect(access(undefined, undefined, false)).toBe("off");
    expect(access(PREMIUM_STATUS_OFF, undefined, true)).toBe("off");
    // A failed membership read in mode on: enabled, not a member: the lock, as before this change.
    expect(access(STATUS_ON, undefined, true)).toBe("locked");
  });

  it("a preview member is enabled and member for that reader only, with no checkout or prices", () => {
    const view = derivePremium(PREMIUM_STATUS_OFF, MEMBER, true);
    expect(view).toMatchObject({
      enabled: true,
      isMember: true,
      state: "active",
      productCode: "plus_monthly",
      checkoutEnabled: false,
      prices: [],
      signedIn: true,
    });
    expect(view.periodEnd?.toISOString()).toBe("2026-11-13T10:00:00.000Z");
  });

  it("an available answer that is not a member state does not switch the feature on", () => {
    for (const state of ["none", "expired", "refunded", "revoked", "on_hold"] as const) {
      const view = derivePremium(PREMIUM_STATUS_OFF, { ...NON_MEMBER_ON, state }, true);
      expect(view).toMatchObject({ enabled: false, isMember: false, state: "none" });
    }
  });

  it("mode on is unchanged: members, locks, expired readers and checkout", () => {
    expect(derivePremium(STATUS_ON, MEMBER, true)).toMatchObject({ enabled: true, isMember: true });
    expect(derivePremium(STATUS_ON, NON_MEMBER_ON, true)).toMatchObject({
      enabled: true,
      isMember: false,
      state: "none",
    });
    expect(derivePremium(STATUS_ON, EXPIRED_ON, true)).toMatchObject({
      enabled: true,
      isMember: false,
      state: "expired",
    });
    expect(derivePremium(STATUS_ON, MEMBER, false)).toMatchObject({
      enabled: true,
      isMember: false,
    });
    const checkout = { ...STATUS_ON, checkoutEnabled: true };
    expect(derivePremium(checkout, MEMBER, true).checkoutEnabled).toBe(true);
    expect(derivePremium(PREMIUM_STATUS_OFF, MEMBER, true).checkoutEnabled).toBe(false);
  });
});
