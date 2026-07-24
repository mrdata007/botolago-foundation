import { describe, expect, it } from "bun:test";
import type { User } from "@supabase/supabase-js";
import { parseBootstrapArguments, selectUniqueConfirmedUser } from "./admin-bootstrap";

function user(id: string, email: string, confirmed = true): User {
  return {
    id,
    email,
    email_confirmed_at: confirmed ? "2026-07-24T12:00:00Z" : undefined,
  } as User;
}

describe("Admin bootstrap command", () => {
  it("requires exactly one explicit email and commits no default identity", () => {
    expect(() => parseBootstrapArguments([], {})).toThrow("bootstrap email is invalid");
    expect(() => parseBootstrapArguments(["--email=admin@example.test", "--other"])).toThrow(
      "Usage:",
    );
    expect(parseBootstrapArguments(["--email=STAFF@EXAMPLE.TEST"], {})).toEqual({
      email: "staff@example.test",
      syntheticTest: false,
    });
  });

  it("rejects missing, unverified, and ambiguous users", () => {
    expect(() => selectUniqueConfirmedUser([], "staff@example.test")).toThrow(
      "staff_user_not_found",
    );
    expect(() =>
      selectUniqueConfirmedUser(
        [user("11111111-1111-4111-8111-111111111111", "staff@example.test", false)],
        "staff@example.test",
      ),
    ).toThrow("staff_user_not_verified");
    expect(() =>
      selectUniqueConfirmedUser(
        [
          user("11111111-1111-4111-8111-111111111111", "staff@example.test"),
          user("22222222-2222-4222-8222-222222222222", "STAFF@example.test"),
        ],
        "staff@example.test",
      ),
    ).toThrow("staff_user_ambiguous");
  });

  it("returns the immutable Auth UUID for one verified match", () => {
    expect(
      selectUniqueConfirmedUser(
        [user("11111111-1111-4111-8111-111111111111", "staff@example.test")],
        "staff@example.test",
      ).id,
    ).toBe("11111111-1111-4111-8111-111111111111");
  });
});
