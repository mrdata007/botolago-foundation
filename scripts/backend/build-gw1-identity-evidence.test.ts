import { describe, expect, test } from "bun:test";
import { buildEvidence } from "./build-gw1-identity-evidence";

describe("builder input handling", () => {
  test("an explicitly requested corroboration file that does not exist is an error, not a silent omission", async () => {
    await expect(
      buildEvidence({ corroborationPath: "tests/fixtures/identity/does-not-exist.json" }),
    ).rejects.toThrow("not found");
  });
});
