import { describe, expect, test } from "bun:test";
import { renderAutomatedNotificationEmail } from "./fantasy-email-render.ts";
import {
  runEmailDispatch,
  emailDispatchConfiguration,
  type EmailRpcClient,
} from "./notification-email-dispatch.ts";
import { renderNotificationEmail, unsubscribeUrl } from "./notification-email-render.ts";
import type { ClaimedEmailDelivery } from "./notification-email-types.ts";

const now = Date.parse("2026-10-24T18:00:00Z");
const links = { appUrl: "https://botolago.com" };
function delivery(
  type: "gameweek_opened" | "deadline_24h" | "gameweek_finalized",
  language: "fr" | "ar" = "fr",
): ClaimedEmailDelivery {
  const common = {
    id: "11111111-1111-4111-8111-111111111111",
    notificationId: "22222222-2222-4222-8222-222222222222",
    attemptNumber: 1,
    language,
    timezone: "Africa/Casablanca",
    recipient: { email: "manager@example.test", displayName: "Amine" },
    favoriteTeamId: null,
    unsubscribeToken: "A".repeat(32),
  };
  if (type === "gameweek_finalized")
    return {
      ...common,
      type,
      payload: {
        automationVersion: 1,
        gameweek: 5,
        points: 76,
        overallRank: null,
        totalPoints: null,
        state: "finalized",
        pendingPlayers: 0,
        calculationVersion: 1,
      },
    };
  return {
    ...common,
    type,
    payload: {
      automationVersion: 1,
      gameweek: { id: "33333333-3333-4333-8333-333333333333", sequence: 5, name: "GW5" },
      opensAt: "2026-10-22T08:00:00Z",
      deadlineAt: "2026-10-25T18:00:00Z",
      selectionState: "open",
      deadlineConfirmed: true,
    },
  };
}

describe("trusted Fantasy email production adapter", () => {
  for (const type of ["deadline_24h", "gameweek_finalized"] as const)
    test(`${type} preserves the legacy claim contract during deployment before activation`, () => {
      const base = delivery(type);
      if (base.type === "gameweek_opened") throw new Error("fixture");
      const payload = { ...base.payload };
      delete payload.automationVersion;
      const legacy = { ...base, payload } as ClaimedEmailDelivery;
      expect(renderAutomatedNotificationEmail(legacy, links, now)).toEqual(
        renderNotificationEmail(legacy, links),
      );
    });
  for (const type of ["gameweek_opened", "deadline_24h", "gameweek_finalized"] as const)
    for (const language of ["fr", "ar"] as const)
      test(`${type} in ${language} uses the selected brand, exact values and matching destination`, () => {
        const email = renderAutomatedNotificationEmail(delivery(type, language), links, now);
        expect(email.html).toContain("/email/botolago-wordmark-light.png");
        expect(email.html).toContain(`dir="${language === "ar" ? "rtl" : "ltr"}"`);
        expect(email.text).toContain(
          `https://botolago.com/fantasy/${type === "gameweek_finalized" ? "points" : "team"}`,
        );
        expect(email.text).toContain(type === "gameweek_finalized" ? "76" : "18:00");
        expect(email.text).toContain("unsubscribe?token=");
      });
  test("old queue payloads and provisional or incomplete scores never render a score-ready message", () => {
    const base = delivery("gameweek_finalized");
    if (base.type !== "gameweek_finalized") throw new Error("fixture");
    for (const payload of [
      { ...base.payload, automationVersion: undefined },
      { ...base.payload, state: undefined },
      { ...base.payload, pendingPlayers: 1 },
    ])
      expect(() => renderAutomatedNotificationEmail({ ...base, payload }, links, now)).toThrow();
  });
  test("a queued selection email cannot render after the deadline", () => {
    expect(() =>
      renderAutomatedNotificationEmail(
        delivery("deadline_24h"),
        links,
        Date.parse("2026-10-25T18:00:00Z"),
      ),
    ).toThrow("team_selection_not_open");
  });
});

describe("send-time validation through the real dispatcher", () => {
  async function dispatch(
    allowed: boolean | "database-error",
    type: "gameweek_opened" | "deadline_24h" | "gameweek_finalized" = "deadline_24h",
  ) {
    const item = delivery(type);
    const calls: { name: string; args?: Record<string, unknown> }[] = [];
    const bodies: Record<string, unknown>[] = [];
    let claimed = false;
    const client: EmailRpcClient = {
      schema: () => ({
        rpc: async (name, args) => {
          calls.push({ name, args });
          if (name === "service_claim_email_deliveries") {
            const items = claimed ? [] : [item];
            claimed = true;
            return { data: items, error: null };
          }
          if (name === "service_validate_fantasy_email_delivery")
            return allowed === "database-error"
              ? { data: null, error: { message: "unavailable" } }
              : { data: allowed, error: null };
          return { data: true, error: null };
        },
      }),
    };
    const action = runEmailDispatch(
      emailDispatchConfiguration({ RESEND_API_KEY: "re_test_0123456789abcdef" }),
      {
        environment: {},
        client,
        render: (row, context) => renderAutomatedNotificationEmail(row, context, now),
        unsubscribeUrl,
        now: () => now,
        sleep: async () => {},
        fetch: async (_url, init) => {
          calls.push({ name: "provider" });
          bodies.push(JSON.parse(String(init?.body)));
          return new Response(JSON.stringify({ id: "accepted-1" }), { status: 200 });
        },
      },
    );
    return { action, calls, bodies };
  }
  for (const type of ["gameweek_opened", "deadline_24h", "gameweek_finalized"] as const)
    test(`${type} is authorized immediately before one provider send, with one-click unsubscribe`, async () => {
      const run = await dispatch(true, type);
      const result = await run.action;
      expect(result.sent).toBe(1);
      expect(run.bodies).toHaveLength(1);
      expect(run.calls.map((call) => call.name)).toEqual([
        "service_claim_email_deliveries",
        "service_validate_fantasy_email_delivery",
        "provider",
        "service_record_notification_delivery_attempt",
      ]);
      expect(run.calls[1]!.args).toMatchObject({
        p_recipient_email: "manager@example.test",
        p_time_zone: "Africa/Casablanca",
      });
      expect(run.bodies[0]!.headers).toHaveProperty("List-Unsubscribe");
    });
  test("a deadline, points, consent, account-address or eligibility change cancels without a provider call", async () => {
    const run = await dispatch(false);
    const result = await run.action;
    expect(result.sent).toBe(0);
    expect(run.bodies).toHaveLength(0);
    expect(run.calls.at(-1)?.args).toMatchObject({
      p_outcome: "cancelled",
      p_stable_error_code: "email_no_longer_eligible",
    });
  });
  test("a database error at the send boundary keeps the claim recoverable without sending", async () => {
    const run = await dispatch("database-error");
    await expect(run.action).rejects.toThrow("database_unavailable");
    expect(run.bodies).toHaveLength(0);
    expect(
      run.calls.some((call) => call.name === "service_record_notification_delivery_attempt"),
    ).toBe(false);
  });
});
