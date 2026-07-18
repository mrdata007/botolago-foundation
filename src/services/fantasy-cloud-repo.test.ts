import { describe, it, expect } from "vitest";
import {
  FantasyCloudError,
  mapSupabaseError,
} from "./fantasy-cloud-repo";

describe("mapSupabaseError", () => {
  it("preserves an existing FantasyCloudError", () => {
    const e = new FantasyCloudError("network", "boom");
    expect(mapSupabaseError(e)).toBe(e);
  });
  it("maps 40001 to version_conflict", () => {
    const mapped = mapSupabaseError({ code: "40001", message: "Version conflict: expected 1, got 2" });
    expect(mapped.code).toBe("version_conflict");
  });
  it("maps 42501 / Not authenticated to unauthenticated", () => {
    expect(mapSupabaseError({ code: "42501", message: "" }).code).toBe("unauthenticated");
    expect(mapSupabaseError({ message: "Not authenticated" }).code).toBe("unauthenticated");
  });
  it("maps P0002 / not found to not_found", () => {
    expect(mapSupabaseError({ code: "P0002", message: "" }).code).toBe("not_found");
    expect(mapSupabaseError({ message: "row not found" }).code).toBe("not_found");
  });
  it("maps PGRST301 / RLS message to permission_denied", () => {
    expect(mapSupabaseError({ code: "PGRST301", message: "" }).code).toBe("permission_denied");
    expect(mapSupabaseError({ message: "row-level security policy" }).code).toBe("permission_denied");
  });
  it("maps network-like messages to network", () => {
    expect(mapSupabaseError({ message: "Failed to fetch" }).code).toBe("network");
    expect(mapSupabaseError({ message: "NetworkError when attempting" }).code).toBe("network");
  });
  it("maps 22P02 / check violations to validation", () => {
    expect(mapSupabaseError({ code: "22P02", message: "invalid input syntax" }).code).toBe("validation");
  });
  it("falls back to unknown", () => {
    expect(mapSupabaseError({ message: "weird" }).code).toBe("unknown");
    expect(mapSupabaseError(null).code).toBe("unknown");
  });
});
