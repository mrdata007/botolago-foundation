import { describe, expect, it } from "bun:test";

import { AdminError } from "@/backend/admin/errors";
import { mapPrizeAdminError, SupabasePrizesAdminRepository } from "./admin-repository";
import { PrizeAdminError, type AdminPrizeDraft } from "./contracts";

type Call = { name: string; args: Record<string, unknown> | undefined };

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = { actorId: uuid(1), requestId: "request" };

/** A stand-in for the `api` schema client: records each RPC and answers it. */
function fakeApi(answer: (name: string) => { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const api = {
    rpc(name: string, args?: Record<string, unknown>) {
      calls.push({ name, args });
      const result = Promise.resolve(answer(name));
      return Object.assign(result, { abortSignal: () => result });
    },
  };
  return { api: api as never, calls };
}

const prizeRow = {
  id: uuid(2),
  tier: "season",
  nameFr: "Voyage",
  nameAr: null,
  descriptionFr: "",
  descriptionAr: null,
  estimatedValueMad: 25000,
  sponsorName: null,
  sponsorLogoUrl: null,
  imageUrl: null,
  active: false,
  updatedAt: "2026-09-24T12:00:00Z",
};

const draft: AdminPrizeDraft = {
  id: null,
  tier: "season",
  nameFr: "Voyage",
  nameAr: null,
  descriptionFr: "",
  descriptionAr: null,
  estimatedValueMad: 25000,
  sponsorName: null,
  sponsorLogoUrl: null,
  imageUrl: null,
  active: false,
};

describe("prize admin repository", () => {
  it("sends every no-default argument, as null when empty, so PostgREST can resolve the function", async () => {
    const { api, calls } = fakeApi(() => ({ data: prizeRow, error: null }));
    await new SupabasePrizesAdminRepository(api).savePrize(
      draft,
      "Create the season prize.",
      uuid(3),
      context,
    );
    const args = calls[0]!.args!;
    expect(calls[0]!.name).toBe("admin_save_fantasy_prize");
    for (const key of [
      "p_prize_id",
      "p_name_ar",
      "p_description_ar",
      "p_sponsor_name",
      "p_sponsor_logo_url",
      "p_image_url",
    ]) {
      expect(key in args).toBe(true);
      expect(args[key]).toBeNull();
    }
    expect(args.p_reason).toBe("Create the season prize.");
    expect(args.p_idempotency_key).toBe(uuid(3));
  });

  it("names an override replacement by username, with the team id explicitly null", async () => {
    const { api, calls } = fakeApi(() => ({
      data: null,
      error: { message: "prize_override_team_not_found" },
    }));
    await expect(
      new SupabasePrizesAdminRepository(api).overrideWinner(
        uuid(4),
        "user_four",
        "Provider corrected the statistics.",
        uuid(5),
        context,
      ),
    ).rejects.toBeInstanceOf(PrizeAdminError);
    expect(calls[0]!.args).toMatchObject({ p_fantasy_team_id: null, p_username: "user_four" });
  });

  it("flags by user id or by username, never both", async () => {
    const { api, calls } = fakeApi(() => ({
      data: { userId: uuid(6), flagged: true },
      error: null,
    }));
    const repository = new SupabasePrizesAdminRepository(api);
    await repository.setFlag(
      { username: "user_eight" },
      true,
      "Shares a device.",
      uuid(7),
      context,
    );
    await repository.setFlag({ userId: uuid(6) }, false, "Cleared after review.", uuid(8), context);
    expect(calls[0]!.args).toMatchObject({ p_user_id: null, p_username: "user_eight" });
    expect(calls[1]!.args).toMatchObject({ p_user_id: uuid(6), p_username: null });
  });

  it("refuses to call without an actor", async () => {
    const { api, calls } = fakeApi(() => ({ data: { items: [] }, error: null }));
    await expect(
      new SupabasePrizesAdminRepository(api).listPrizes({ actorId: null, requestId: "r" }),
    ).rejects.toBeInstanceOf(AdminError);
    expect(calls).toHaveLength(0);
  });

  it("treats an unexpected payload as the console's backend refusal", async () => {
    const { api } = fakeApi(() => ({ data: { items: [{ id: "not-a-uuid" }] }, error: null }));
    await expect(new SupabasePrizesAdminRepository(api).listPrizes(context)).rejects.toMatchObject({
      code: "admin_context_unavailable",
    });
  });
});

describe("mapPrizeAdminError", () => {
  it("keeps a named prize refusal and hands anything else to the console mapping", () => {
    expect(mapPrizeAdminError({ message: "prize_tier_already_active" })).toBeInstanceOf(
      PrizeAdminError,
    );
    const access = mapPrizeAdminError({ message: "mfa_assurance_insufficient", code: "PT403" });
    expect(access).toBeInstanceOf(AdminError);
    expect(access.code).toBe("mfa_assurance_insufficient");
  });
});
