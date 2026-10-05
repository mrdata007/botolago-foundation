/**
 * The Android notification channels push alerts are shown in. The sender names
 * one in each message (supabase/functions/_shared/notification-push-types.ts
 * holds the same ids; `push-channels.test.ts` keeps the two agreeing) and the
 * app creates both when it starts, so the ids here must never change once an app
 * is out: a phone keeps a channel under its id and the reader's own settings for
 * it with it.
 */
export const ANDROID_CHANNEL_MATCH = "match_alerts";
export const ANDROID_CHANNEL_FANTASY = "fantasy_reminders";
