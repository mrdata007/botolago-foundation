import { describe, expect, test } from "bun:test";
import { getAdminCopy } from "@/backend/admin/route-access";
import { storyErrorNotice } from "./errors";

describe("story write recovery", () => {
  for (const lang of ["fr", "ar"] as const) {
    test(`${lang}: an expired publisher session requests the existing admin reauthentication flow`, () => {
      expect(storyErrorNotice(new Error("recent_auth_required"), lang)).toEqual({
        error: true,
        text: getAdminCopy(lang).states.recent_auth_required.description,
        reauthenticate: true,
      });
    });
    test(`${lang}: conflicts and ordinary failures do not send the editor to sign-in`, () => {
      expect(storyErrorNotice(new Error("story_conflict"), lang).reauthenticate).toBeUndefined();
      expect(storyErrorNotice(new Error("network"), lang).reauthenticate).toBeUndefined();
      expect(storyErrorNotice(new Error("story_conflict"), lang).text).not.toBe(
        storyErrorNotice(new Error("network"), lang).text,
      );
    });
  }
});
