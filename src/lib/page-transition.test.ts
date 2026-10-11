import { describe, expect, it } from "bun:test";

import { liveNavItems, primaryNavItems } from "@/components/shell/primary-nav";
import {
  SAME_LEVEL_ROOTS,
  defaultViewTransition,
  pageTransitionKind,
  pageTransitionTypes,
  supportsTypedViewTransitions,
  viewTransitionOption,
} from "./page-transition";

describe("pageTransitionKind", () => {
  it("goes forward into a page inside the current one", () => {
    expect(pageTransitionKind("/matches", "/matches/12")).toBe("forward");
    expect(pageTransitionKind("/fantasy", "/fantasy/team")).toBe("forward");
  });

  it("goes back out of such a page", () => {
    expect(pageTransitionKind("/matches/12", "/matches")).toBe("back");
  });

  it("does not move between the bottom tabs, Home included", () => {
    expect(pageTransitionKind("/", "/matches")).toBe("none");
    expect(pageTransitionKind("/matches", "/")).toBe("none");
    expect(pageTransitionKind("/matches", "/fantasy")).toBe("none");
    expect(pageTransitionKind("/news", "/matches/")).toBe("none");
  });

  it("covers every destination the bottom nav can offer", () => {
    for (const item of [...primaryNavItems, ...liveNavItems]) {
      expect(SAME_LEVEL_ROOTS).toContain(item.to);
    }
  });

  it("does not move between Matches, Classement and Pronostics", () => {
    expect(pageTransitionKind("/matches", "/matches/standings")).toBe("none");
    expect(pageTransitionKind("/matches/standings", "/matches")).toBe("none");
    expect(pageTransitionKind("/matches/standings", "/pronostics")).toBe("none");
    expect(pageTransitionKind("/pronostics", "/matches")).toBe("none");
  });

  it("does not move when a bottom tab is tapped from deep inside another section", () => {
    expect(pageTransitionKind("/matches/12", "/fantasy")).toBe("none");
    expect(pageTransitionKind("/fantasy/team", "/")).toBe("none");
    expect(pageTransitionKind("/news/an-article", "/matches")).toBe("none");
  });

  it("still slides into and out of a page inside a section", () => {
    expect(pageTransitionKind("/matches/standings", "/matches/12")).toBe("fade");
    expect(pageTransitionKind("/pronostics", "/pronostics/ligues")).toBe("forward");
    expect(pageTransitionKind("/pronostics/ligues", "/pronostics")).toBe("back");
    expect(pageTransitionKind("/matches/12", "/matches/standings")).toBe("fade");
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

  it("is nothing between same-level destinations", () => {
    expect(pageTransitionTypes({ ...base, toPath: "/matches/standings" })).toBe(false);
    expect(pageTransitionTypes({ ...base, toPath: "/fantasy" })).toBe(false);
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

describe("viewTransitionOption", () => {
  it("keeps the typed transitions where the browser supports transition types", () => {
    expect(viewTransitionOption(true)).toBe(defaultViewTransition);
  });

  it("turns page transitions off where types are unsupported, so same-level moves never cross-fade", () => {
    expect(viewTransitionOption(false)).toBe(false);
  });

  it("reads type support from CSS.supports", () => {
    expect(supportsTypedViewTransitions({ supports: () => true })).toBe(true);
    expect(supportsTypedViewTransitions({ supports: () => false })).toBe(false);
    expect(supportsTypedViewTransitions({})).toBe(false);
  });
});
