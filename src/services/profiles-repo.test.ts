import { describe, expect, it } from "bun:test";
import { isStorageRefusal } from "./profiles-repo";

// Since 20260926003100 the avatars bucket's policies also require the account's
// second factor, when it has one. Storage then refuses the upload of a session
// that owes its code, and says only that its policy refused. The auth service
// tells that apart from a failed upload by this answer, then asks the session.
describe("isStorageRefusal", () => {
  it("recognises Storage's policy refusal, however it is sent", () => {
    // HTTP 403.
    expect(isStorageRefusal({ status: 403, statusCode: "403", message: "Unauthorized" })).toBe(
      true,
    );
    // HTTP 400 with the refusal in the body, as storage-api has long sent it.
    expect(
      isStorageRefusal({
        status: 400,
        statusCode: "403",
        message: "new row violates row-level security policy",
      }),
    ).toBe(true);
    expect(
      isStorageRefusal({ status: 400, message: "new row violates row-level security policy" }),
    ).toBe(true);
  });

  it("does not take other failures for a refusal", () => {
    expect(isStorageRefusal({ status: 413, statusCode: "413", message: "Payload too large" })).toBe(
      false,
    );
    expect(isStorageRefusal({ status: 500, statusCode: "500", message: "Internal" })).toBe(false);
    expect(isStorageRefusal(new TypeError("Failed to fetch"))).toBe(false);
    expect(isStorageRefusal(null)).toBe(false);
    expect(isStorageRefusal("403")).toBe(false);
  });
});
