import { describe, expect, it, spyOn } from "bun:test";

import { onMfaStepUpRequired } from "@/backend/auth/step-up";

import { ManagerCardError, mapManagerCardError } from "./errors";

describe("mapManagerCardError", () => {
  it.each([
    [{ code: "PGRST202", message: "Could not find the function" }, "unavailable"],
    [{ code: "PT401", message: "x" }, "unauthenticated"],
    [{ code: "401", message: "x" }, "unauthenticated"],
    [{ code: "42501", message: "permission denied for function" }, "unauthenticated"],
    [{ code: "PT404", message: "x" }, "not_found"],
    [{ code: "PT400", message: "bad key" }, "invalid_request"],
    [{ code: "22023", message: "bad key" }, "invalid_request"],
    [new TypeError("Failed to fetch"), "network"],
    [{ message: "NetworkError when attempting to fetch resource." }, "network"],
    [{ message: "Load failed" }, "network"],
    [
      { code: "57014", message: "canceling statement due to statement timeout" },
      "data_unavailable",
    ],
    [{ name: "AbortError", message: "aborted" }, "data_unavailable"],
    ["a string", "data_unavailable"],
    [null, "data_unavailable"],
  ])("maps %j to %s", (raw, code) => {
    expect(mapManagerCardError(raw).code).toBe(code as never);
  });

  it("maps the second-factor refusal and tells the auth layer", () => {
    let told = 0;
    const off = onMfaStepUpRequired(() => (told += 1));
    const error = mapManagerCardError({ code: "PT403", message: "mfa_required" });
    off();
    expect(error.code).toBe("mfa_required");
    expect(told).toBe(1);
  });

  it("does not treat another PT403 as the second factor", () => {
    expect(mapManagerCardError({ code: "PT403", message: "account_banned" }).code).toBe(
      "data_unavailable",
    );
  });

  it("returns an error it already mapped as it is, and keeps the cause", () => {
    const mapped = new ManagerCardError("not_found", "x");
    expect(mapManagerCardError(mapped)).toBe(mapped);
    const cause = { code: "PGRST202", message: "m" };
    expect(mapManagerCardError(cause).cause).toBe(cause);
  });

  it("never logs", () => {
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((method) =>
      spyOn(console, method).mockImplementation(() => {}),
    );
    mapManagerCardError({ code: "PGRST202" });
    mapManagerCardError(new Error("boom"));
    const calls = spies.reduce((total, spy) => total + spy.mock.calls.length, 0);
    for (const spy of spies) spy.mockRestore();
    expect(calls).toBe(0);
  });
});
