import { describe, expect, it } from "bun:test";

import { pageTransitionKind, pageTransitionTypes } from "./page-transition";

describe("pageTransitionKind", () => {
  it("goes forward into a page inside the current one", () => {
    expect(pageTransitionKind("/matches", "/matches/12")).toBe("forward");
    expect(pageTransitionKind("/fantasy", "/fantasy/team")).toBe("forward");
  });

  it("goes back out of such a page", () => {
    expect(pageTransitionKind("/matches/12", "/matches")).toBe("back");
  });

  it("fades between the bottom tabs, Home included", () => {
    expect(pageTransitionKind("/", "/matches")).toBe("fade");
    expect(pageTransitionKind("/matches", "/")).toBe("fade");
    expect(pageTransitionKind("/matches", "/fantasy")).toBe("fade");
  });

  it("does not take /matches for a parent of /matchesx", () => {
    expect(pageTransitionKind("/matches", "/matchesx")).toBe("fade");
  });

  it("fades between two pages of the same section", () => {
    expect(pageTransitionKind("/clubs/a", "/clubs/b")).toBe("fade");
  });
});

describe("pageTransitionTypes", () => {
  const base = {
    fromPath: "/matches",
    toPath: "/matches/12",
    pathChanged: true,
    reducedMotion: false,
  };

  it("names the kind", () => {
    expect(pageTransitionTypes(base)).toEqual(["forward"]);
  });

  it("is nothing under reduced motion", () => {
    expect(pageTransitionTypes({ ...base, reducedMotion: true })).toBe(false);
  });

  it("is nothing when only the search or hash changed", () => {
    expect(pageTransitionTypes({ ...base, pathChanged: false })).toBe(false);
  });

  it("is nothing on the first page, which has nothing to move from", () => {
    expect(pageTransitionTypes({ ...base, fromPath: undefined })).toBe(false);
  });
});
