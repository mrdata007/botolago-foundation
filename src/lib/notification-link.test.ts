import { describe, expect, it } from "bun:test";

import { notificationDestination, notificationPath } from "./notification-link";

const ID = "6f1e0a62-3b1a-4c53-9a2e-0d1b2c3d4e5f";

describe("notificationDestination", () => {
  it("opens the match for a match notification", () => {
    expect(notificationDestination({ target: "match_detail", entityId: ID }, true)).toEqual({
      to: "/matches/$matchId",
      params: { matchId: ID },
    });
  });
  it("opens the article only while News is on", () => {
    expect(notificationDestination({ target: "article", entityId: ID }, true)).toEqual({
      to: "/news/$articleId",
      params: { articleId: ID },
    });
    expect(notificationDestination({ target: "article", entityId: ID }, false)).toBeNull();
  });
  it("maps the Fantasy targets", () => {
    expect(notificationDestination({ target: "fantasy_team", entityId: null }, true)).toEqual({
      to: "/fantasy/team",
    });
    expect(notificationDestination({ target: "fantasy_points", entityId: null }, true)).toEqual({
      to: "/fantasy/points",
    });
    expect(notificationDestination({ target: "fantasy_transfers", entityId: null }, true)).toEqual({
      to: "/fantasy/transfers",
    });
  });
  it("sends account and security notifications to the profile", () => {
    for (const target of ["profile", "settings", "security_action"] as const) {
      expect(notificationDestination({ target, entityId: null }, true)).toEqual({
        to: "/profile",
      });
    }
  });
  it("has no destination for 'none', or a match with no id", () => {
    expect(notificationDestination({ target: "none", entityId: null }, true)).toBeNull();
    expect(notificationDestination({ target: "match_detail", entityId: null }, true)).toBeNull();
  });
});

describe("notificationPath", () => {
  it("gives a plain path for each destination", () => {
    expect(notificationPath({ target: "match_detail", entityId: ID }, true)).toBe(`/matches/${ID}`);
    expect(notificationPath({ target: "article", entityId: ID }, true)).toBe(`/news/${ID}`);
    expect(notificationPath({ target: "fantasy_points", entityId: null }, true)).toBe(
      "/fantasy/points",
    );
    expect(notificationPath({ target: "security_action", entityId: null }, true)).toBe("/profile");
  });
  it("gives nothing when there is no page", () => {
    expect(notificationPath({ target: "none", entityId: null }, true)).toBeNull();
    expect(notificationPath({ target: "article", entityId: ID }, false)).toBeNull();
  });
});
