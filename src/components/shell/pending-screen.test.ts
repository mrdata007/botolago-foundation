import { describe, expect, test } from "bun:test";

import { pendingHidesBottomNav, pendingWithoutShell } from "./pending-screen-rules";

describe("pending screen frame", () => {
  test("hides the bottom bar exactly where the detail pages do", () => {
    for (const path of ["/matches/12", "/news/abc", "/clubs/x", "/journee/7"]) {
      expect(pendingHidesBottomNav(path)).toBe(true);
    }
    for (const path of ["/", "/news", "/matches", "/matches/standings", "/fantasy", "/clubs"]) {
      expect(pendingHidesBottomNav(path)).toBe(false);
    }
  });

  test("draws no app frame on the admin and auth screens", () => {
    expect(pendingWithoutShell("/admin/users")).toBe(true);
    expect(pendingWithoutShell("/auth/login")).toBe(true);
    expect(pendingWithoutShell("/fantasy")).toBe(false);
    expect(pendingWithoutShell("/administration")).toBe(false);
  });
});
