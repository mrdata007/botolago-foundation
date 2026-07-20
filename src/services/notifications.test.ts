import { describe, expect, test } from "bun:test";
import { NotificationError } from "@/backend/notifications/errors";
import { selectNotificationsDataMode } from "./notifications";

describe("notifications data mode", () => {
  test("uses explicit modes", () => {
    expect(selectNotificationsDataMode("mock", false)).toBe("mock");
    expect(selectNotificationsDataMode("supabase", true)).toBe("supabase");
  });

  test("fails closed in production", () => {
    expect(() => selectNotificationsDataMode(undefined, true)).toThrow(NotificationError);
    expect(() => selectNotificationsDataMode("mock", true)).toThrow(NotificationError);
    expect(selectNotificationsDataMode(undefined, false)).toBe("mock");
  });
});
