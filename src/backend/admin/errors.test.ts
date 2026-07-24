import { describe, expect, it } from "bun:test";
import { adminErrorToBackend, mapAdminError } from "./errors";

describe("Admin stable errors", () => {
  it("maps database details without exposing the raw error", () => {
    const raw = {
      code: "PT403",
      message: "mfa_assurance_insufficient",
      details: "sensitive-internal-detail",
    };
    const mapped = mapAdminError(raw);
    expect(mapped.code).toBe("mfa_assurance_insufficient");
    expect(mapped.message).not.toContain("sensitive-internal-detail");
  });

  it("maps approval conflicts to stable backend errors", () => {
    const mapped = adminErrorToBackend({
      code: "PT409",
      message: "approval_payload_mismatch",
    });
    expect(mapped.code).toBe("approval_payload_mismatch");
    expect(mapped.status).toBe(409);
  });

  it("fails unknown database errors closed", () => {
    expect(mapAdminError(new Error("unexpected raw postgres text")).code).toBe(
      "staff_access_denied",
    );
  });
});
