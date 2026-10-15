import { describe, expect, test } from "bun:test";

import { AdminError } from "@/backend/admin/errors";
import type { SupabaseUsersAdminRepository } from "@/backend/admin/users-repository";

import {
  isValidPremiumReason,
  mapPremiumAdminError,
  parsePremiumLookupQuery,
  PREMIUM_GRANT_DURATIONS,
  PREMIUM_GRANT_MAX_DAYS,
  premiumAdminErrorCode,
  premiumAdminMemberSchema,
  premiumAdminOverviewSchema,
  premiumGrantEndsAt,
  PremiumAdminError,
  SupabasePremiumAdminRepository,
} from "./admin";

// Timestamps as PostgreSQL serialises a timestamptz into jsonb.
const T0 = "2026-10-13T10:00:00.123456+00:00";
const USER = "e8a00000-0000-4000-8000-000000000011";
const GRANT = "e8a40000-0000-4000-8000-000000000001";

const OVERVIEW = {
  settings: { mode: "preview", checkoutEnabled: false, billingPaused: false },
  products: [
    {
      code: "plus_monthly",
      periodMonths: 1,
      renews: true,
      priceMinor: 2000,
      currency: "MAD",
      active: true,
    },
    {
      code: "plus_yearly",
      periodMonths: 12,
      renews: false,
      priceMinor: 20000,
      currency: "MAD",
      active: true,
    },
  ],
  membersByState: { active: 3, refunded: 1 },
  membersByProduct: { plus_monthly: { active: 2 }, plus_yearly: { active: 1, refunded: 1 } },
  liveGrants: 2,
  lastEventAt: T0,
};

const MEMBER = {
  userId: USER,
  isMember: true,
  entitlement: {
    state: "active",
    effectiveState: "active",
    productCode: "plus_monthly",
    source: "web",
    currentPeriodStart: T0,
    currentPeriodEnd: "2026-11-13T10:00:00+00:00",
    graceUntil: null,
    cancelRequestedAt: null,
    lastEventAt: T0,
  },
  grants: [
    {
      grantId: GRANT,
      startsAt: T0,
      endsAt: "2026-12-13T10:00:00+00:00",
      reason: "Press partner",
      revokedAt: null,
    },
  ],
  events: [
    {
      eventId: 12,
      providerEventId: "evt_1",
      provider: "test",
      source: "web",
      eventType: "purchase",
      productCode: "plus_monthly",
      occurredAt: T0,
      outcome: "applied",
      stateBefore: "none",
      stateAfter: "active",
      amountMinor: 2000,
      currency: "MAD",
    },
  ],
};

describe("overview contract", () => {
  test("parses as the database sends it, and keeps the price in centimes", () => {
    const parsed = premiumAdminOverviewSchema.parse(OVERVIEW);
    expect(parsed.products.map((p) => [p.code, p.priceMinor, p.currency])).toEqual([
      ["plus_monthly", 2000, "MAD"],
      ["plus_yearly", 20000, "MAD"],
    ]);
    expect(parsed.membersByState.active).toBe(3);
    expect(parsed.membersByState.on_hold).toBeUndefined();
  });

  test("a database without the by-product counts still parses", () => {
    const { membersByProduct: _omitted, ...older } = OVERVIEW;
    expect(premiumAdminOverviewSchema.parse(older).membersByProduct).toBeUndefined();
  });

  test("a state or a mode the screen does not know is an error, not a half-drawn screen", () => {
    expect(() =>
      premiumAdminOverviewSchema.parse({ ...OVERVIEW, membersByState: { frozen: 1 } }),
    ).toThrow();
    expect(() =>
      premiumAdminOverviewSchema.parse({
        ...OVERVIEW,
        settings: { ...OVERVIEW.settings, mode: "beta" },
      }),
    ).toThrow();
  });
});

describe("member contract", () => {
  test("parses a member with grants and an outcome-only timeline", () => {
    const parsed = premiumAdminMemberSchema.parse(MEMBER);
    expect(parsed.events[0].outcome).toBe("applied");
    expect(Object.keys(parsed.events[0])).not.toContain("payload");
  });

  test("an account that never paid has no entitlement", () => {
    expect(
      premiumAdminMemberSchema.parse({ ...MEMBER, isMember: false, entitlement: null, events: [] })
        .entitlement,
    ).toBeNull();
  });
});

describe("lookup input", () => {
  test("an account id is used as is, lowercased", () => {
    expect(parsePremiumLookupQuery(`  ${USER.toUpperCase()} `)).toEqual({
      kind: "id",
      userId: USER,
    });
  });
  test("an e-mail is lowercased and trimmed", () => {
    expect(parsePremiumLookupQuery(" Karim@Example.TEST ")).toEqual({
      kind: "email",
      email: "karim@example.test",
    });
  });
  test("a name, a half address or nothing is not a lookup", () => {
    for (const text of ["", "karim", "@x.test", "karim@", "a b@c.test"]) {
      expect(parsePremiumLookupQuery(text).kind).toBe("invalid");
    }
  });
});

describe("reason and grant length", () => {
  test("the reason is trimmed text of 8 to 500 characters", () => {
    expect(isValidPremiumReason("short")).toBe(false);
    expect(isValidPremiumReason(" padded reason ")).toBe(false);
    expect(isValidPremiumReason("Press partner.")).toBe(true);
    expect(isValidPremiumReason("é".repeat(500))).toBe(true);
    expect(isValidPremiumReason("é".repeat(501))).toBe(false);
  });
  test("every offered length is inside the database bound", () => {
    for (const duration of PREMIUM_GRANT_DURATIONS) {
      expect(duration.days).toBeGreaterThan(0);
      expect(duration.days).toBeLessThanOrEqual(PREMIUM_GRANT_MAX_DAYS);
    }
    const now = new Date("2026-10-14T00:00:00.000Z");
    expect(premiumGrantEndsAt("month", now)).toBe("2026-11-13T00:00:00.000Z");
    expect(premiumGrantEndsAt("year", now)).toBe("2027-10-14T00:00:00.000Z");
  });
});

describe("errors", () => {
  test("a refusal the database names keeps its name", () => {
    expect(premiumAdminErrorCode({ message: "premium_reason_invalid", code: "PT400" })).toBe(
      "premium_reason_invalid",
    );
    expect(premiumAdminErrorCode({ message: "premium_grant_already_revoked" })).toBe(
      "premium_grant_already_revoked",
    );
  });
  test("a function the database does not have yet is its own state", () => {
    expect(
      premiumAdminErrorCode({ code: "PGRST202", message: "Could not find the function" }),
    ).toBe("premium_admin_unavailable");
  });
  test("an access refusal falls through to the admin errors", () => {
    const mapped = mapPremiumAdminError({ message: "recent_auth_required", code: "PT403" });
    expect(mapped).toBeInstanceOf(AdminError);
    expect((mapped as AdminError).code).toBe("recent_auth_required");
    expect(mapPremiumAdminError({ message: "mfa_assurance_insufficient" })).toBeInstanceOf(
      AdminError,
    );
  });
});

type Call = { name: string; args: unknown };

/** A fake `api` client that records the calls and answers from a table. */
function fakeApi(answers: Record<string, { data?: unknown; error?: unknown }>) {
  const calls: Call[] = [];
  const api = {
    rpc(name: string, args?: unknown) {
      calls.push({ name, args });
      const answer = answers[name] ?? { data: null, error: null };
      const result = { data: answer.data ?? null, error: answer.error ?? null };
      return Object.assign(Promise.resolve(result), { abortSignal: () => Promise.resolve(result) });
    },
  };
  return { api: api as never, calls };
}

const context = { actorId: USER, requestId: "11111111-1111-4111-8111-111111111111" };

describe("repository", () => {
  test("the audited read sends the reason and the request id", async () => {
    const { api, calls } = fakeApi({ admin_get_premium_member: { data: MEMBER } });
    const member = await new SupabasePremiumAdminRepository(api).member(
      USER,
      "Support ticket 4471",
      context,
    );
    expect(member.userId).toBe(USER);
    expect(calls).toEqual([
      {
        name: "admin_get_premium_member",
        args: { p_user_id: USER, p_reason: "Support ticket 4471", p_request_id: context.requestId },
      },
    ]);
  });

  test("grant and revoke send the idempotency key and the reason", async () => {
    const { api, calls } = fakeApi({
      admin_grant_premium: { data: { grantId: GRANT, userId: USER, startsAt: T0, endsAt: T0 } },
      admin_revoke_premium: { data: { grantId: GRANT, userId: USER, revoked: true } },
    });
    const repository = new SupabasePremiumAdminRepository(api);
    const key = "22222222-2222-4222-8222-222222222222";
    await repository.grant(USER, "2026-11-13T00:00:00.000Z", "Press partner.", key, context);
    await repository.revoke(GRANT, "Granted by mistake.", key, context);
    expect(calls).toEqual([
      {
        name: "admin_grant_premium",
        args: {
          p_user_id: USER,
          p_ends_at: "2026-11-13T00:00:00.000Z",
          p_reason: "Press partner.",
          p_idempotency_key: key,
        },
      },
      {
        name: "admin_revoke_premium",
        args: { p_grant_id: GRANT, p_reason: "Granted by mistake.", p_idempotency_key: key },
      },
    ]);
  });

  test("the Saison: activation, code lookup and the payment details use the contract's names", async () => {
    const { api, calls } = fakeApi({
      admin_activate_premium_season: {
        data: {
          grantId: GRANT,
          userId: USER,
          startsAt: T0,
          endsAt: T0,
          productCode: "plus_season",
        },
      },
      admin_find_premium_member_by_code: { data: MEMBER },
      admin_get_premium_payment_details: {
        data: { whatsapp: "+212600000000", rib: "000 000 0000", updatedAt: T0 },
      },
      admin_set_premium_payment_details: { data: { whatsapp: "+212600000000" } },
    });
    const repository = new SupabasePremiumAdminRepository(api);
    const key = "22222222-2222-4222-8222-222222222222";
    await repository.activateSeason(
      USER,
      "bank_transfer",
      " VIR-1 ",
      "Reçu vérifié.",
      key,
      context,
    );
    await repository.activateSeason(USER, "free", "ignored", "Geste de l'équipe.", key, context);
    await repository.findByCode("BG-7K4M9X", "Support ticket 4471", context);
    const details = await repository.getPaymentDetails(context);
    expect(details).toMatchObject({
      whatsappNumber: "+212600000000",
      rib: "000 000 0000",
      bankName: null,
    });
    await repository.setPaymentDetails(
      {
        bankHolder: " ",
        bankName: null,
        rib: "000 000 0000",
        cashplusName: null,
        whatsappNumber: "+212600000000",
        noteFr: null,
        noteAr: null,
      },
      "Premiers réglages.",
      key,
      context,
    );
    expect(calls[0]).toEqual({
      name: "admin_activate_premium_season",
      args: {
        p_user_id: USER,
        p_payment_method: "bank_transfer",
        p_payment_reference: "VIR-1",
        p_reason: "Reçu vérifié.",
        p_idempotency_key: key,
      },
    });
    expect(calls[1]?.args?.p_payment_reference).toBeNull();
    expect(calls[2]).toEqual({
      name: "admin_find_premium_member_by_code",
      args: {
        p_code: "BG-7K4M9X",
        p_reason: "Support ticket 4471",
        p_request_id: context.requestId,
      },
    });
    expect(calls[4]?.args?.p_details).toEqual({
      bankHolder: null,
      bankName: null,
      rib: "000 000 0000",
      cashplusName: null,
      whatsapp: "+212600000000",
      noteFr: null,
      noteAr: null,
    });
  });

  test("a payment code is a lookup of its own, and a grant may carry its payment", () => {
    expect(parsePremiumLookupQuery(" bg-7k4m9x ")).toEqual({ kind: "code", code: "BG-7K4M9X" });
    const parsed = premiumAdminMemberSchema.parse({
      ...MEMBER,
      grants: [
        {
          grantId: GRANT,
          startsAt: T0,
          endsAt: T0,
          reason: "Virement vérifié.",
          revokedAt: null,
          productCode: "plus_season",
          paymentMethod: "cashplus",
          paymentReference: "CP-88",
          amountMinor: 20000,
        },
      ],
    });
    expect(parsed.grants[0]).toMatchObject({ paymentMethod: "cashplus", amountMinor: 20000 });
  });

  test("a database refusal surfaces under its own name", async () => {
    const { api } = fakeApi({
      admin_grant_premium: { error: { message: "premium_grant_period_invalid", code: "PT400" } },
    });
    const failure = await new SupabasePremiumAdminRepository(api)
      .grant(USER, T0, "Press partner.", "key", context)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PremiumAdminError);
    expect((failure as PremiumAdminError).code).toBe("premium_grant_period_invalid");
  });

  test("an answer of the wrong shape is an error", async () => {
    const { api } = fakeApi({ admin_premium_overview: { data: { settings: null } } });
    const failure = await new SupabasePremiumAdminRepository(api)
      .overview(context)
      .catch((error: unknown) => error);
    expect((failure as PremiumAdminError).code).toBe("premium_admin_invalid_answer");
  });

  test("nothing is called without an actor", async () => {
    const { api, calls } = fakeApi({});
    const failure = await new SupabasePremiumAdminRepository(api)
      .overview({ actorId: null, requestId: context.requestId })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AdminError);
    expect(calls).toHaveLength(0);
  });

  test("an e-mail resolves through the user directory's exact match", async () => {
    const users = {
      listUsers: async (filters: { query: string | null }) => ({
        items: filters.query === "karim@example.test" ? [{ userId: USER }] : [],
        nextCursor: null,
      }),
    } as unknown as SupabaseUsersAdminRepository;
    const repository = new SupabasePremiumAdminRepository(fakeApi({}).api, users);
    expect(await repository.resolveAccount("karim@example.test", context)).toEqual({
      status: "found",
      userId: USER,
    });
    expect(await repository.resolveAccount("nobody@example.test", context)).toEqual({
      status: "not_found",
    });
  });
});
