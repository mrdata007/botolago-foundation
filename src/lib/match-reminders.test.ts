import { describe, expect, it } from "bun:test";

import { withReminder } from "./match-reminders";

describe("withReminder", () => {
  it("adds a match once, newest last", () => {
    expect(withReminder(["a"], "b", true)).toEqual(["a", "b"]);
    expect(withReminder(["a", "b"], "a", true)).toEqual(["b", "a"]);
  });
  it("removes a match and ignores one that is not there", () => {
    expect(withReminder(["a", "b"], "a", false)).toEqual(["b"]);
    expect(withReminder(["a"], "z", false)).toEqual(["a"]);
  });
  it("keeps only the 200 newest", () => {
    const many = Array.from({ length: 200 }, (_, i) => String(i));
    const next = withReminder(many, "new", true);
    expect(next).toHaveLength(200);
    expect(next[0]).toBe("1");
    expect(next.at(-1)).toBe("new");
  });
});
