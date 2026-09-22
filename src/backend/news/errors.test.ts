import { describe, expect, test } from "bun:test";
import { mapNewsError, NewsError } from "./errors";

function pgError(message: string, code: string): { message: string; code: string } {
  return { message, code };
}

describe("mapNewsError (editorial RPC error mapping)", () => {
  test("maps each editorial Postgres error message to a distinct typed code", () => {
    expect(mapNewsError(pgError("news_editorial_forbidden", "42501")).code).toBe(
      "editorial_forbidden",
    );
    expect(mapNewsError(pgError("news_invalid_status_transition", "22023")).code).toBe(
      "invalid_status_transition",
    );
    expect(mapNewsError(pgError("news_article_not_editable", "22023")).code).toBe(
      "article_not_editable",
    );
    expect(mapNewsError(pgError("news_placement_requires_published_article", "22023")).code).toBe(
      "placement_requires_published_article",
    );
    expect(mapNewsError(pgError("news_editorial_conflict", "40001")).code).toBe(
      "editorial_conflict",
    );
    expect(mapNewsError(pgError("news_slug_or_translation_conflict", "23505")).code).toBe(
      "slug_or_translation_conflict",
    );
    expect(mapNewsError(pgError("news_story_not_found", "P0002")).code).toBe("story_not_found");
  });

  test("collapses every editorial_register_media validation message into invalid_media_payload", () => {
    for (const message of [
      "news_invalid_media_storage_path",
      "news_invalid_media_mime_type",
      "news_invalid_media_dimensions",
      "news_invalid_media_alt_text",
      "news_invalid_media_license_url",
      "news_invalid_media_attribution_url",
    ]) {
      expect(mapNewsError(pgError(message, "22023")).code).toBe("invalid_media_payload");
    }
  });

  test("falls back to unauthorized for a bare 42501 with no recognized editorial message", () => {
    expect(mapNewsError(pgError("permission denied for function", "42501")).code).toBe(
      "unauthorized",
    );
  });

  test("falls back to data_unavailable for an unrecognized error", () => {
    expect(mapNewsError(new Error("boom")).code).toBe("data_unavailable");
  });
});

describe("mapping is idempotent", () => {
  test("an already-mapped error keeps its code (the CMS maps twice)", () => {
    for (const [message, code] of [
      ["news_editorial_forbidden", "42501"],
      ["news_editorial_conflict", "40001"],
      ["news_schedule_must_be_future", "22023"],
      ["news_imported_story_requires_conversion", "22023"],
    ] as const) {
      const once = mapNewsError(pgError(message, code));
      expect(once).toBeInstanceOf(NewsError);
      expect(mapNewsError(once)).toBe(once);
      expect(mapNewsError(once).code).not.toBe("data_unavailable");
    }
  });

  test("the activation errors have their own codes", () => {
    expect(mapNewsError(pgError("news_schedule_must_be_future", "22023")).code).toBe(
      "schedule_must_be_future",
    );
    expect(mapNewsError(pgError("news_imported_story_requires_conversion", "22023")).code).toBe(
      "imported_story_requires_conversion",
    );
    expect(mapNewsError(pgError("news_conversion_reason_required", "22023")).code).toBe(
      "conversion_reason_required",
    );
  });
});
