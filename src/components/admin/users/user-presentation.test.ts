import { describe, expect, test } from "bun:test";
import {
  banStatusLabel,
  userAdminErrorMessage,
  userDisplayName,
  userInitial,
} from "./user-presentation";

const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/;

describe("user presentation", () => {
  test("names an account by its display name, then its username", () => {
    expect(userDisplayName({ displayName: "Karim Benali", username: "karim_10" }, "fr")).toBe(
      "Karim Benali",
    );
    expect(userDisplayName({ displayName: null, username: "karim_10" }, "fr")).toBe("@karim_10");
    expect(userDisplayName({ displayName: null, username: null }, "fr")).toBe("Compte sans nom");
    expect(userDisplayName({ displayName: null, username: null }, "ar")).toBe("حساب بلا اسم");
  });

  test("draws the first letter, whatever the script", () => {
    expect(userInitial({ displayName: "karim", username: null })).toBe("K");
    expect(userInitial({ displayName: "ليلى", username: null })).toBe("ل");
    expect(userInitial({ displayName: null, username: null })).toBe("?");
  });

  test("says how long a ban lasts, with Latin digits in Arabic too", () => {
    expect(banStatusLabel(null, "fr")).toBe("Banni sans limite de durée");
    expect(banStatusLabel(null, "ar")).toBe("محظور بلا مدة محددة");
    const until = banStatusLabel("2026-10-01T12:00:00+00:00", "ar");
    expect(until.startsWith("محظور حتى ")).toBe(true);
    expect(until).toContain("2026");
    expect(until).not.toMatch(ARABIC_INDIC_DIGITS);
    expect(banStatusLabel("2026-10-01T12:00:00+00:00", "fr")).toContain("Banni jusqu’au");
  });

  test("words every refusal the directory can meet, and names an unknown one", () => {
    expect(userAdminErrorMessage("staff_account_protected", "fr")).toContain("Personnel");
    expect(userAdminErrorMessage("recent_auth_required", "fr")).toContain("15 minutes");
    expect(userAdminErrorMessage("users_admin_unavailable", "ar")).toContain("20260924160000");
    expect(userAdminErrorMessage("something_new", "fr")).toContain("something_new");
  });
});
