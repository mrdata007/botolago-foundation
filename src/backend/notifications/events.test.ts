import { describe, expect, test } from "bun:test";
import { validateNotificationEvent } from "./events";
import { NotificationError } from "./errors";

const base = {
  eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  sourceEntityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  targetUserId: null,
  occurredAt: "2030-01-01T12:00:00.000Z",
  schemaVersion: 1 as const,
  deduplicationKey: "football:fixture:1:starting",
  correlationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

describe("notification event validation", () => {
  test("accepts the stable match-starting envelope", () => {
    expect(
      validateNotificationEvent({
        ...base,
        eventType: "match_starting",
        sourceDomain: "football",
        payload: { home_team: "Wydad", away_team: "Raja", minutes: 15 },
      }).eventType,
    ).toBe("match_starting");
  });

  test("rejects unsupported Fantasy handling and malformed scores", () => {
    expect(() =>
      validateNotificationEvent({
        ...base,
        eventType: "deadline_24h",
        sourceDomain: "fantasy",
        payload: {},
      }),
    ).toThrow(NotificationError);
    expect(() =>
      validateNotificationEvent({
        ...base,
        eventType: "goal",
        sourceDomain: "football",
        payload: { team: "Wydad", home_score: -1, away_score: 0 },
      }),
    ).toThrow(NotificationError);
  });
});
