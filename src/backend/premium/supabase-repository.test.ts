import { describe, expect, it } from "bun:test";

import { onMfaStepUpRequired } from "@/backend/auth/step-up";
import { OFF_REPOSITORY, premiumRepositoryKind } from "@/services/premium";

import { LAUNCH_PRICES, MY_PREMIUM_OFF, PREMIUM_STATUS_OFF } from "./contracts";
import { SupabasePremiumRepository } from "./supabase-repository";

type Result = { data: unknown; error: { code?: string; message?: string } | null };

function fakeApi(answer: (name: string) => Result) {
  const calls: Array<{ name: string; args: Record<string, unknown> | undefined }> = [];
  const api = {
    rpc(name: string, args?: Record<string, unknown>) {
      calls.push({ name, args });
      const result = Promise.resolve(answer(name));
      return Object.assign(result, { abortSignal: () => result });
    },
  };
  return { repository: new SupabasePremiumRepository(api as never), calls };
}

const context = { actorId: "u1", requestId: "r1" };

const STATUS_WIRE = {
  enabled: true,
  checkoutEnabled: false,
  prices: [
    { code: "plus_monthly", periodMonths: 1, renews: true, priceMinor: 2000, currency: "MAD" },
    { code: "plus_yearly", periodMonths: 12, renews: false, priceMinor: 20000, currency: "MAD" },
  ],
  savingMinor: 4000,
  editions: [],
};
const MINE_WIRE = {
  available: true,
  state: "active",
  productCode: "plus_monthly",
  source: "web",
  currentPeriodEnd: "2026-11-13T10:00:00+00:00",
  cancelAtPeriodEnd: false,
};

describe("the Supabase premium repository (finding 5)", () => {
  it("calls api.premium_status and api.get_my_premium, parsed by their schemas", async () => {
    const { repository, calls } = fakeApi((name) => ({
      data: name === "premium_status" ? STATUS_WIRE : MINE_WIRE,
      error: null,
    }));
    expect(await repository.status(context)).toEqual({
      enabled: true,
      checkoutEnabled: false,
      prices: [...LAUNCH_PRICES],
    });
    expect(await repository.mine(context)).toEqual(MINE_WIRE as never);
    expect(calls.map((call) => call.name)).toEqual(["premium_status", "get_my_premium"]);
  });

  it("reads the feature switched off as an answer", async () => {
    const off = fakeApi((name) => ({
      data:
        name === "premium_status"
          ? { enabled: false, checkoutEnabled: false, prices: [], savingMinor: null, editions: [] }
          : { available: false },
      error: null,
    }));
    expect(await off.repository.status(context)).toEqual(PREMIUM_STATUS_OFF);
    expect(await off.repository.mine(context)).toEqual(MY_PREMIUM_OFF);
  });

  it("reads a database the migration has not reached (PGRST202) as off, not as an error", async () => {
    const { repository } = fakeApi(() => ({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    }));
    expect(await repository.status(context)).toEqual(PREMIUM_STATUS_OFF);
    expect(await repository.mine(context)).toEqual(MY_PREMIUM_OFF);
  });

  it("reads {available:false} (preview and not a member, or mode off) as the off answer", async () => {
    const { repository } = fakeApi(() => ({ data: { available: false }, error: null }));
    expect(await repository.mine(context)).toEqual(MY_PREMIUM_OFF);
  });

  it("reads a preview member's answer, without an isMember key, as a member's", async () => {
    const { repository } = fakeApi(() => ({
      data: { ...MINE_WIRE, isMember: true, source: "grant", editions: [], edition: "standard" },
      error: null,
    }));
    expect(await repository.mine(context)).toMatchObject({ available: true, state: "active" });
  });

  it("reads PT403 mfa_required from the membership probe as off, and tells no one", async () => {
    let heard = 0;
    const stop = onMfaStepUpRequired(() => void heard++);
    try {
      const { repository } = fakeApi(() => ({
        data: null,
        error: { code: "PT403", message: "mfa_required" },
      }));
      expect(await repository.mine(context)).toEqual(MY_PREMIUM_OFF);
      // A thrown rejection from the client, not a returned error, reads the same.
      const throwing = new SupabasePremiumRepository({
        rpc: () =>
          Object.assign(Promise.reject({ code: "PT403", message: "mfa_required" }), {
            abortSignal: () => Promise.reject({ code: "PT403", message: "mfa_required" }),
          }),
      } as never);
      expect(await throwing.mine(context)).toEqual(MY_PREMIUM_OFF);
    } finally {
      stop();
    }
    expect(heard).toBe(0);
  });

  it("reads PT401 (no session) as off", async () => {
    const { repository } = fakeApi(() => ({
      data: null,
      error: { code: "PT401", message: "authentication_required" },
    }));
    expect(await repository.mine(context)).toEqual(MY_PREMIUM_OFF);
  });

  it("throws other failures (a network error), which the screens read as off", async () => {
    const { repository } = fakeApi(() => ({
      data: null,
      error: { code: "500", message: "boom" },
    }));
    await expect(repository.mine(context)).rejects.toThrow();
  });

  it("rejects a malformed answer instead of inventing a membership", async () => {
    const { repository } = fakeApi(() => ({ data: { available: true }, error: null }));
    await expect(repository.mine(context)).rejects.toThrow();
  });

  it("serves no receipts and answers « bientôt » to checkout, cancel and restore, with no request", async () => {
    const { repository, calls } = fakeApi(() => ({ data: null, error: null }));
    expect(await repository.receipts(context)).toEqual([]);
    expect(await repository.startCheckout()).toEqual({ status: "soon" });
    expect(await repository.cancel()).toEqual({ status: "soon" });
    expect(await repository.restore()).toEqual({ status: "soon" });
    expect(calls).toEqual([]);
  });
});

describe("which repository a build gets (finding 5)", () => {
  it("reads the database only when the build lets BotolaGO+ exist, outside development", () => {
    expect(premiumRepositoryKind({ dev: false, build: true })).toBe("supabase");
    expect(premiumRepositoryKind({ dev: false, build: false })).toBe("off");
    expect(premiumRepositoryKind({ dev: true, build: false })).toBe("mock");
  });
  it("keeps the off repository silent: off answers, nothing to ask", async () => {
    expect(await OFF_REPOSITORY.status(context)).toEqual(PREMIUM_STATUS_OFF);
    expect(await OFF_REPOSITORY.mine(context)).toEqual(MY_PREMIUM_OFF);
    expect(await OFF_REPOSITORY.receipts(context)).toEqual([]);
  });
});
