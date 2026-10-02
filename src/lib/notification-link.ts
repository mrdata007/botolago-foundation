import type { NotificationCardDto } from "@/backend/notifications/contracts";

/** Where tapping a notification goes. `null`: the notification is read-only. */
export type NotificationDestination =
  | { to: "/matches/$matchId"; params: { matchId: string } }
  | { to: "/news/$articleId"; params: { articleId: string } }
  | { to: "/fantasy/team" }
  | { to: "/fantasy/points" }
  | { to: "/fantasy/transfers" }
  | { to: "/profile" };

/**
 * The page a notification's deep link opens. `newsEnabled` is the News
 * switch: while News is hidden its article page sends everyone Home, so an
 * article notification then has nowhere to go and stays read-only.
 */
export function notificationDestination(
  link: NotificationCardDto["deepLink"],
  newsEnabled: boolean,
): NotificationDestination | null {
  switch (link.target) {
    case "match_detail":
      return link.entityId ? { to: "/matches/$matchId", params: { matchId: link.entityId } } : null;
    case "article":
      return newsEnabled && link.entityId
        ? { to: "/news/$articleId", params: { articleId: link.entityId } }
        : null;
    case "fantasy_team":
      return { to: "/fantasy/team" };
    case "fantasy_points":
      return { to: "/fantasy/points" };
    case "fantasy_transfers":
      return { to: "/fantasy/transfers" };
    case "profile":
    case "settings":
    case "security_action":
      return { to: "/profile" };
    case "none":
      return null;
  }
}
