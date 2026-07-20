import { describe, expect, it } from "bun:test";
import { normalizeCanonicalUsername, validateCanonicalUsername } from "./username";

describe("canonical username rules", () => {
  it("normalizes casing and boundary whitespace deterministically", () => {
    expect(normalizeCanonicalUsername("  Amine_User  ")).toBe("amine_user");
  });

  it.each(["ab", "a".repeat(21), "bad name", "أمين", "équipe", "_starts_wrong"])(
    "rejects invalid username %s",
    (candidate) => expect(validateCanonicalUsername(candidate)).toBe("invalid"),
  );

  it.each(["admin", "BOTOLAGO", " Support "])("rejects reserved username %s", (candidate) => {
    expect(validateCanonicalUsername(candidate)).toBe("reserved");
  });

  it.each(["amine", "amine_7", "amine-test"])("accepts username %s", (candidate) => {
    expect(validateCanonicalUsername(candidate)).toBeNull();
  });
});
