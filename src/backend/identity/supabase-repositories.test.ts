import { describe, expect, it } from "bun:test";
import { isUuid } from "./supabase-repositories";

describe("identity repository contract helpers", () => {
  it("accepts canonical UUIDs and rejects mock/provider keys", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuid("war")).toBe(false);
    expect(isUuid("a1")).toBe(false);
  });
});
