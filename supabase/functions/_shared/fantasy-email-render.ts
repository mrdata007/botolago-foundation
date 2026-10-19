import type {
  ClaimedEmailDelivery,
  EmailLinkContext,
  RenderedEmail,
} from "./notification-email-types.ts";
import { renderNotificationEmail, unsubscribeUrl } from "./notification-email-render.ts";
import {
  APPROVED_POINTS_READY_VARIANT,
  renderPointsReadyEmail,
} from "./fantasy-points-ready-email.ts";
import { renderTeamReminderEmail } from "./fantasy-team-reminder-email.ts";

/** Production adapter. Readiness fields are supplied only by the trusted claim RPC. */
export function renderAutomatedNotificationEmail(
  delivery: ClaimedEmailDelivery,
  links: EmailLinkContext,
  now = Date.now(),
): RenderedEmail {
  if (!["gameweek_opened", "deadline_24h", "gameweek_finalized"].includes(delivery.type))
    return renderNotificationEmail(delivery, links);
  // Until activation, the claim RPC still emits the original reminder/results
  // contract. An absent marker is legacy; a present but invalid marker fails closed.
  if (delivery.type !== "gameweek_opened" && !("automationVersion" in delivery.payload))
    return renderNotificationEmail(delivery, links);
  if (!("automationVersion" in delivery.payload) || delivery.payload.automationVersion !== 1)
    throw new Error("fantasy_email_requires_trusted_payload");
  const common = {
    language: delivery.language,
    managerName: delivery.recipient.displayName,
    appUrl: links.appUrl,
    unsubscribeUrl: unsubscribeUrl(delivery, links),
  };
  if (delivery.type === "gameweek_finalized") {
    if (delivery.payload.state !== "finalized" || delivery.payload.pendingPlayers !== 0)
      throw new Error("points_not_ready");
    return renderPointsReadyEmail({
      ...common,
      variant: APPROVED_POINTS_READY_VARIANT,
      state: delivery.payload.state,
      pendingPlayers: delivery.payload.pendingPlayers,
      gameweek: delivery.payload.gameweek,
      points: delivery.payload.points,
      totalPoints: delivery.payload.totalPoints,
      overallRank: delivery.payload.overallRank,
    });
  }
  if (delivery.type !== "gameweek_opened" && delivery.type !== "deadline_24h")
    throw new Error("fantasy_email_invalid_moment");
  if (
    !delivery.payload.opensAt ||
    delivery.payload.selectionState !== "open" ||
    delivery.payload.deadlineConfirmed !== true
  )
    throw new Error("team_selection_not_open");
  return renderTeamReminderEmail({
    ...common,
    kind: delivery.type === "gameweek_opened" ? "selection-open" : "deadline-reminder",
    gameweek: delivery.payload.gameweek.sequence,
    opensAt: delivery.payload.opensAt,
    deadlineAt: delivery.payload.deadlineAt,
    now: new Date(now).toISOString(),
    timeZone: delivery.timezone,
    selectionState: delivery.payload.selectionState,
    deadlineConfirmed: true,
  });
}
