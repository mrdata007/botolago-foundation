import { describe, expect, it } from "bun:test";
import { mapIdentityError } from "./errors";

describe("identity error mapping", () => {
  it.each([
    [{ code: "PT409", message: "USERNAME_TAKEN" }, "username_taken"],
    [{ code: "PT400", message: "INVALID_USERNAME" }, "invalid_username"],
    [{ code: "PT400", message: "RESERVED_USERNAME" }, "reserved_username"],
    [{ code: "PT401", message: "UNAUTHORIZED" }, "unauthorized"],
    [{ code: "PT404", message: "PROFILE_NOT_FOUND" }, "not_found"],
    [{ code: "PT429", message: "RATE_LIMITED" }, "rate_limited"],
    [{ message: "Failed to fetch" }, "network"],
  ] as const)("maps stable backend failures", (source, expected) => {
    expect(mapIdentityError(source).code).toBe(expected);
  });

  it("never exposes an unknown database message", () => {
    const mapped = mapIdentityError({ message: "relation secret_table does not exist" });
    expect(mapped.code).toBe("internal");
    expect(mapped.message).not.toContain("secret_table");
  });
});
