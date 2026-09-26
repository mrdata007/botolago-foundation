import { describe, expect, test } from "bun:test";
import { isNotificationEmailUnsubscribeToken } from "./contracts";
import { NotificationError } from "./errors";
import {
  parseNotificationEmailUnsubscribeResponse,
  SupabaseNotificationEmailUnsubscribeRepository,
} from "./supabase-repositories";

describe("unsubscribe_notification_email response", () => {
  test.each(["unsubscribed", "already_unsubscribed", "invalid"] as const)(
    "accepts status %s",
    (status) => {
      expect(parseNotificationEmailUnsubscribeResponse({ status })).toEqual({
        status,
        topic: null,
      });
    },
  );

  test("carries the Pépites topic when the token was a Pépites one", () => {
    expect(
      parseNotificationEmailUnsubscribeResponse({
        status: "unsubscribed",
        topic: "pepites_weekly",
      }),
    ).toEqual({ status: "unsubscribed", topic: "pepites_weekly" });
    expect(() =>
      parseNotificationEmailUnsubscribeResponse({ status: "unsubscribed", topic: "everything" }),
    ).toThrow();
  });

  test("ignores fields it does not know", () => {
    expect(
      parseNotificationEmailUnsubscribeResponse({ status: "unsubscribed", extra: "ignored" }),
    ).toEqual({ status: "unsubscribed", topic: null });
  });

  test.each([
    ["an unknown status", { status: "subscribed" }],
    ["a missing status", {}],
    ["a bare string", "unsubscribed"],
    ["null", null],
  ])("rejects %s as data_unavailable", (_label, value) => {
    let caught: unknown;
    try {
      parseNotificationEmailUnsubscribeResponse(value);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(NotificationError);
    expect((caught as NotificationError).code).toBe("data_unavailable");
  });
});

const TOKEN = "Ab3_-xYz0123456789ABCDEFGHIJKLMN";

describe("unsubscribe token shape", () => {
  test("is exactly 32 characters of base64url", () => {
    expect(TOKEN).toHaveLength(32);
    expect(isNotificationEmailUnsubscribeToken(TOKEN)).toBe(true);
    expect(isNotificationEmailUnsubscribeToken(` ${TOKEN}\n`)).toBe(true);
  });

  test.each([
    ["empty", ""],
    ["31 characters", TOKEN.slice(1)],
    ["33 characters", `${TOKEN}a`],
    ["a character outside base64url", `${TOKEN.slice(1)}=`],
    ["a slash", `${TOKEN.slice(1)}/`],
  ])("rejects %s", (_label, token) => {
    expect(isNotificationEmailUnsubscribeToken(token)).toBe(false);
  });
});

describe("SupabaseNotificationEmailUnsubscribeRepository", () => {
  // These never reach the API: a request would fail here, with no backend
  // configured, instead of answering "invalid".
  test.each([
    ["an empty token", ""],
    ["a blank token", "   "],
    ["a short token", TOKEN.slice(2)],
    ["an oversized token", "a".repeat(2049)],
    ["a malformed token", `${TOKEN.slice(1)}!`],
  ])("answers invalid for %s without a request", async (_label, token) => {
    const repository = new SupabaseNotificationEmailUnsubscribeRepository();
    expect(await repository.unsubscribe(token)).toEqual({ status: "invalid", topic: null });
  });
});
