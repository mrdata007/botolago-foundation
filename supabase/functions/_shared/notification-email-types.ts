// Contract between the database and the email dispatcher.
//
// `api.service_claim_email_deliveries` (migration
// 20260924140100_notification_email_delivery.sql) returns an array of
// `ClaimedEmailDelivery`. The payload of each one is the event's safe_payload,
// written by `app_private.notification_email_plan` (or, for
// `gameweek_finalized`, by `api.service_enqueue_gameweek_finalized_notifications`)
// and enriched at claim time. The renderer turns one of these into a subject,
// an HTML body and a plain-text body; nothing else reaches the provider.
//
// Every string here is data from the database. The renderer escapes all of it.

export const EMAIL_NOTIFICATION_TYPES = [
  "matchday_preview",
  "matchday_results",
  "round_preview",
  "match_starting",
  "deadline_24h",
  "gameweek_finalized",
  "pepites_weekly",
] as const;

export type EmailNotificationType = (typeof EMAIL_NOTIFICATION_TYPES)[number];
export type EmailLanguage = "fr" | "ar";

/** A club's display names in both launch languages. */
export interface EmailTeam {
  readonly id: string;
  readonly name: { readonly fr: string; readonly ar: string };
  readonly shortName: { readonly fr: string; readonly ar: string };
}

/**
 * One match. `kickoffAt` is UTC. `timeConfirmed` is false when the provider
 * still carries its 00:00 UTC placeholder: the date is known, the time is not.
 */
export interface EmailFixture {
  readonly id: string;
  readonly kickoffAt: string;
  readonly timeConfirmed: boolean;
  /** app.fixture_status, e.g. not_started, finished, postponed. */
  readonly status: string;
  readonly home: EmailTeam;
  readonly away: EmailTeam;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
}

export interface MatchdayPreviewPayload {
  /** Morocco-local calendar date, YYYY-MM-DD. */
  readonly date: string;
  readonly fixtures: readonly EmailFixture[];
}

export interface MatchdayResultsPayload {
  readonly date: string;
  /** Finished matches carry scores; postponed/cancelled ones are listed too. */
  readonly fixtures: readonly EmailFixture[];
}

export interface RoundPreviewPayload {
  readonly round: { readonly id: string; readonly number: number | null; readonly name: string };
  readonly fixtures: readonly EmailFixture[];
}

export interface MatchStartingPayload {
  readonly fixture: EmailFixture;
  readonly minutes: number;
}

export interface DeadlinePayload {
  readonly gameweek: { readonly id: string; readonly sequence: number; readonly name: string };
  readonly deadlineAt: string;
}

export interface GameweekFinalizedPayload {
  /** Gameweek sequence number. */
  readonly gameweek: number;
  readonly points: number;
  /** Added at claim time; null when the ranking is not available. */
  readonly overallRank: number | null;
  readonly totalPoints: number | null;
}

/** One line of a Pépites Top 10, fixed when the edition was published. */
export interface PepitesWeeklyEntry {
  readonly rank: number;
  readonly playerId: string;
  readonly name: string;
  /** Null when the player's club is not known. */
  readonly club: EmailTeam | null;
  /** 0-100, rounded. */
  readonly score: number;
}

/**
 * The weekly Pépites email (app_private.pepites_weekly_email_payload). Written
 * once at publication; the email is rendered from it and nothing else.
 */
export interface PepitesWeeklyPayload {
  readonly editionId: string;
  readonly seasonId: string;
  /** The season's week number: the edition page is /pepites/semaine/{week}. */
  readonly week: number;
  readonly round: number;
  readonly publishedAt: string;
  /** Set when this edition corrects an earlier one of the same week. */
  readonly correctsEditionId: string | null;
  readonly entries: readonly PepitesWeeklyEntry[];
}

export type EmailPayloadByType = {
  readonly matchday_preview: MatchdayPreviewPayload;
  readonly matchday_results: MatchdayResultsPayload;
  readonly round_preview: RoundPreviewPayload;
  readonly match_starting: MatchStartingPayload;
  readonly deadline_24h: DeadlinePayload;
  readonly gameweek_finalized: GameweekFinalizedPayload;
  readonly pepites_weekly: PepitesWeeklyPayload;
};

/** What an unsubscribe token turns off: all product email, or one topic. */
export type EmailUnsubscribeTopic = "pepites_weekly";

interface ClaimedEmailDeliveryBase {
  /** Delivery id. Also the provider idempotency key. */
  readonly id: string;
  readonly notificationId: string;
  readonly attemptNumber: number;
  readonly language: EmailLanguage;
  /** IANA timezone the user reads times in; Africa/Casablanca by default. */
  readonly timezone: string;
  readonly recipient: { readonly email: string; readonly displayName: string | null };
  /** The user's favourite club, used to put their match first. */
  readonly favoriteTeamId: string | null;
  /** Single-use-per-link token for the one-click unsubscribe page. */
  readonly unsubscribeToken: string;
  /** Null: the token turns off all product email. Else only that topic. */
  readonly unsubscribeTopic?: EmailUnsubscribeTopic | null;
  /** When the delivery was first claimed for sending (ISO). */
  readonly firstAttemptAt?: string | null;
  /**
   * SHA-256 of the request body its first attempt sent, when one was
   * recorded. A retry must send exactly that body under the same key.
   */
  readonly bodySha256?: string | null;
}

export type ClaimedEmailDelivery = {
  [K in EmailNotificationType]: ClaimedEmailDeliveryBase & {
    readonly type: K;
    readonly payload: EmailPayloadByType[K];
  };
}[EmailNotificationType];

/** What the renderer produces for one delivery. */
export interface RenderedEmail {
  readonly subject: string;
  /** Short line most inboxes show after the subject. */
  readonly preheader: string;
  readonly html: string;
  readonly text: string;
}

/** Links the renderer builds. Only these routes are ever linked. */
export interface EmailLinkContext {
  /** Public site origin without a trailing slash, e.g. https://botolago.com */
  readonly appUrl: string;
}
