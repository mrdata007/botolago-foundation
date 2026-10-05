import { notificationDeepLinkSchema } from "@/backend/notifications/contracts";
import type { NotificationCardDto } from "@/backend/notifications/contracts";
import { notificationDestination, type NotificationDestination } from "@/lib/notification-link";

/**
 * Where tapping a push alert goes.
 *
 * The sender puts the alert's page in the message's data: `target` and
 * `entityId` (an empty string, or null, when the page has no id). It is the
 * same deep link the in-app inbox opens, so it is read with the same schema
 * and mapped by the same function: whatever the message holds, the app only
 * ever opens one of its own pages, and an unreadable message opens nothing.
 */
export function pushDeepLink(data: unknown): NotificationCardDto["deepLink"] | null {
  if (!data || typeof data !== "object") return null;
  const { target, entityId } = data as Record<string, unknown>;
  const parsed = notificationDeepLinkSchema.safeParse({
    target,
    entityId: typeof entityId === "string" && entityId !== "" ? entityId : null,
  });
  return parsed.success ? parsed.data : null;
}

export function pushDestination(
  data: unknown,
  newsEnabled: boolean,
): NotificationDestination | null {
  const link = pushDeepLink(data);
  return link ? notificationDestination(link, newsEnabled) : null;
}
