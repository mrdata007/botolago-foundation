import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ANDROID_CHANNEL_FANTASY, ANDROID_CHANNEL_MATCH } from "./push-channels";

describe("Android notification channels", () => {
  test("the app creates the channels the sender names", () => {
    const sender = readFileSync(
      join(import.meta.dir, "../../supabase/functions/_shared/notification-push-types.ts"),
      "utf8",
    );
    expect(sender).toContain(`export const ANDROID_CHANNEL_MATCH = "${ANDROID_CHANNEL_MATCH}";`);
    expect(sender).toContain(
      `export const ANDROID_CHANNEL_FANTASY = "${ANDROID_CHANNEL_FANTASY}";`,
    );
  });

  test("their ids are the ones apps already installed would hold", () => {
    expect([ANDROID_CHANNEL_MATCH, ANDROID_CHANNEL_FANTASY]).toEqual([
      "match_alerts",
      "fantasy_reminders",
    ]);
  });
});
