import { describe, expect, it } from "bun:test";

import { BackendError, normalizeBackendError, toPublicBackendError } from "./errors";

describe("backend error contract", () => {
  it("preserves a typed backend error", () => {
    const error = new BackendError("conflict", "The record changed.", {
      status: 409,
      metadata: { expectedVersion: 2 },
    });

    expect(normalizeBackendError(error)).toBe(error);
  });

  it("maps unknown failures to a safe internal error", () => {
    const raw = new Error("database password leaked here");
    const result = toPublicBackendError(raw, "req-123");

    expect(result).toEqual({
      code: "internal",
      message: "An unexpected error occurred.",
      retryable: false,
      requestId: "req-123",
    });
    expect(JSON.stringify(result)).not.toContain(raw.message);
  });

  it("does not expose internal metadata or causes", () => {
    const error = new BackendError("validation_failed", "Invalid input.", {
      status: 422,
      metadata: { databaseConstraint: "private_constraint" },
      cause: new Error("raw postgres error"),
    });

    expect(toPublicBackendError(error)).toEqual({
      code: "validation_failed",
      message: "Invalid input.",
      retryable: false,
    });
  });
});
