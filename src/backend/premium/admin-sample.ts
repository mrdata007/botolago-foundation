import type { RepositoryContext } from "@/backend/contracts/repository";

import {
  PremiumAdminError,
  type PremiumAccountResolution,
  type PremiumAdminGrant,
  type PremiumAdminGrantResult,
  type PremiumAdminMember,
  type PremiumAdminOverview,
  type PremiumAdminRepository,
  type PremiumAdminRevokeResult,
  type PremiumAdminSeasonResult,
  type PremiumPaymentDetails,
  type PremiumPaymentDetailsInput,
  type PaymentMethod,
  isValidPaymentReference,
  isValidRib,
  isValidWhatsappNumber,
} from "./admin";

/**
 * SAMPLE data for the BotolaGO+ admin screen, for `/dev/plus-admin-sample` (development servers
 * only) and for looking at the screen. Every account, id and date is invented and lives in memory.
 * No database, no network, no Supabase client; nothing here is imported by a production route.
 *
 *   Lookup ids:  the three constants below. E-mail: `karim@example.test` is the active member.
 */
export const SAMPLE_ACCOUNTS = {
  /** A web monthly member, with a purchase, a renewal and one event the screen ignored. */
  active: "5a000000-0000-4000-8000-000000000001",
  /** Never paid; holds a live comp from staff. */
  comp: "5a000000-0000-4000-8000-000000000002",
  /** Never paid, no comp. */
  none: "5a000000-0000-4000-8000-000000000003",
} as const;
export const SAMPLE_EMAIL = "karim@example.test";
/** The payment code of the account that has never paid (…0003): EXAMPLE data. */
export const SAMPLE_PAY_CODE = "BG-7K4M9X";

const DAY = 86_400_000;
const iso = (offsetDays: number, now: number) => new Date(now + offsetDays * DAY).toISOString();

export interface SampleOptions {
  /** `error`: the overview fails with this code. */
  failOverviewWith?: string;
  /** Every grant and revoke is refused with this code (e.g. `recent_auth_required`). */
  failWriteWith?: string;
  /** Omit the by-product counts, as a database that migration 20261013100500 has not reached does. */
  withoutByProduct?: boolean;
  /** `none`: the Saison's end is not known (the premium status does not carry it). */
  seasonEnd?: string | null;
  /** The payment details are not set yet. */
  noPaymentDetails?: boolean;
  /** The mode the overview reports (default: preview). */
  mode?: "off" | "preview" | "on";
  /** Every account is unknown. */
  empty?: boolean;
  now?: number;
}

export class InMemoryPremiumAdminRepository implements PremiumAdminRepository {
  private readonly now: number;
  private grants: Record<string, PremiumAdminGrant[]>;
  private eventId = 40;
  private details: PremiumPaymentDetails;
  /** The audited reads this repository answered, so a test can check the reason went with them. */
  readonly audit: { userId: string; reason: string; requestId: string }[] = [];

  constructor(private readonly options: SampleOptions = {}) {
    this.now = options.now ?? Date.now();
    const now = this.now;
    this.details = options.noPaymentDetails
      ? {
          bankHolder: null,
          bankName: null,
          rib: null,
          cashplusName: null,
          whatsappNumber: null,
          noteFr: null,
          noteAr: null,
          updatedAt: null,
        }
      : {
          // EXAMPLES: the real ones are typed by the owner in this very form.
          bankHolder: "BotolaGO SARL",
          bankName: "Banque exemple",
          rib: "000 000 0000000000000000 00",
          cashplusName: "BotolaGO SARL",
          whatsappNumber: "+212600000000",
          noteFr: null,
          noteAr: null,
          updatedAt: iso(-3, now),
        };
    this.grants = {
      [SAMPLE_ACCOUNTS.comp]: [
        {
          grantId: "5a900000-0000-4000-8000-000000000001",
          startsAt: iso(-10, now),
          endsAt: iso(80, now),
          reason: "Presse : journaliste invité pour la saison de lancement.",
          revokedAt: null,
        },
        {
          grantId: "5a900000-0000-4000-8000-000000000002",
          startsAt: iso(-200, now),
          endsAt: iso(-170, now),
          reason: "Geste commercial après un double paiement.",
          revokedAt: iso(-190, now),
        },
        {
          grantId: "5a900000-0000-4000-8000-000000000003",
          startsAt: iso(-400, now),
          endsAt: iso(-230, now),
          reason: "Virement reçu et vérifié.",
          revokedAt: null,
          productCode: "plus_season",
          paymentMethod: "bank_transfer",
          paymentReference: "VIR-2026-0412",
          amountMinor: 20000,
        },
      ],
    };
  }

  async overview(): Promise<PremiumAdminOverview> {
    if (this.options.failOverviewWith) {
      throw new Error(this.options.failOverviewWith);
    }
    const live = Object.values(this.grants).filter((list) =>
      list.some((g) => !g.revokedAt && Date.parse(g.endsAt) > this.now),
    ).length;
    return {
      settings: {
        mode: this.options.mode ?? "preview",
        checkoutEnabled: false,
        billingPaused: false,
      },
      products: [
        {
          code: "plus_season",
          periodMonths: null,
          renews: false,
          priceMinor: 20000,
          currency: "MAD",
          active: true,
        },
        {
          code: "plus_monthly",
          periodMonths: 1,
          renews: true,
          priceMinor: 2000,
          currency: "MAD",
          active: false,
        },
        {
          code: "plus_yearly",
          periodMonths: 12,
          renews: false,
          priceMinor: 20000,
          currency: "MAD",
          active: false,
        },
      ],
      membersByState: { active: 42, cancelling: 5, grace: 2, on_hold: 1, expired: 17, refunded: 3 },
      ...(this.options.withoutByProduct
        ? {}
        : {
            membersByProduct: {
              plus_season: { active: 8 },
              plus_monthly: { active: 30, cancelling: 5, grace: 2, on_hold: 1, expired: 14 },
              plus_yearly: { active: 12, expired: 3, refunded: 3 },
            },
          }),
      liveGrants: live,
      lastEventAt: iso(0, this.now - 3 * 3_600_000),
    };
  }

  async resolveAccount(email: string): Promise<PremiumAccountResolution> {
    if (this.options.empty) return { status: "not_found" };
    return email === SAMPLE_EMAIL
      ? { status: "found", userId: SAMPLE_ACCOUNTS.active }
      : { status: "not_found" };
  }

  async member(
    userId: string,
    reason: string,
    context: RepositoryContext,
  ): Promise<PremiumAdminMember> {
    const known = Object.values(SAMPLE_ACCOUNTS) as string[];
    if (this.options.empty || !known.includes(userId)) {
      throw new PremiumAdminError("premium_account_not_found");
    }
    this.audit.push({ userId, reason, requestId: context.requestId });
    const now = this.now;
    const grants = this.grants[userId] ?? [];
    const liveGrant = grants.some(
      (g) => !g.revokedAt && Date.parse(g.startsAt) <= now && Date.parse(g.endsAt) > now,
    );
    if (userId === SAMPLE_ACCOUNTS.active) {
      return {
        userId,
        isMember: true,
        entitlement: {
          state: "cancelling",
          effectiveState: "cancelling",
          productCode: "plus_monthly",
          source: "web",
          currentPeriodStart: iso(-12, now),
          currentPeriodEnd: iso(18, now),
          graceUntil: null,
          cancelRequestedAt: iso(-2, now),
          lastEventAt: iso(-2, now),
        },
        grants,
        events: [
          {
            eventId: 43,
            providerEventId: "evt_sample_0043",
            provider: "psp_test",
            source: "web",
            eventType: "cancel",
            productCode: "plus_monthly",
            occurredAt: iso(-2, now),
            outcome: "applied",
            stateBefore: "active",
            stateAfter: "cancelling",
            amountMinor: null,
            currency: null,
          },
          {
            eventId: 42,
            providerEventId: "evt_sample_0042",
            provider: "psp_test",
            source: "web",
            eventType: "payment_failed",
            productCode: "plus_monthly",
            occurredAt: iso(-8, now),
            outcome: "ignored_state",
            stateBefore: "active",
            stateAfter: "active",
            amountMinor: 2000,
            currency: "MAD",
          },
          {
            eventId: 41,
            providerEventId: "evt_sample_0041",
            provider: "psp_test",
            source: "web",
            eventType: "purchase",
            productCode: "plus_monthly",
            occurredAt: iso(-12, now),
            outcome: "applied",
            stateBefore: "none",
            stateAfter: "active",
            amountMinor: 2000,
            currency: "MAD",
          },
        ],
      };
    }
    return { userId, isMember: liveGrant, entitlement: null, grants, events: [] };
  }

  async seasonEnd(): Promise<string | null> {
    return this.options.seasonEnd === undefined
      ? "2027-05-31T20:00:00.000Z"
      : this.options.seasonEnd;
  }

  async findByCode(
    code: string,
    reason: string,
    context: RepositoryContext,
  ): Promise<PremiumAdminMember> {
    if (this.options.empty || code !== SAMPLE_PAY_CODE) {
      throw new PremiumAdminError("premium_code_not_found");
    }
    return this.member(SAMPLE_ACCOUNTS.none, reason, context);
  }

  async activateSeason(
    userId: string,
    method: PaymentMethod,
    reference: string,
    reason: string,
  ): Promise<PremiumAdminSeasonResult> {
    if (this.options.failWriteWith) {
      throw new Error(this.options.failWriteWith);
    }
    const ends = await this.seasonEnd();
    if (!ends) throw new PremiumAdminError("premium_season_unavailable");
    if (method !== "free" && !isValidPaymentReference(reference)) {
      throw new PremiumAdminError("premium_payment_reference_required");
    }
    const already = (this.grants[userId] ?? []).some(
      (g) => !g.revokedAt && Date.parse(g.endsAt) >= Date.parse(ends),
    );
    if (already) throw new PremiumAdminError("season_already_active");
    const item: PremiumAdminGrant = {
      grantId: `5a900000-0000-4000-8000-0000000002${String(++this.eventId).padStart(2, "0")}`,
      startsAt: new Date(this.now).toISOString(),
      endsAt: ends,
      reason,
      revokedAt: null,
      productCode: "plus_season",
      paymentMethod: method,
      paymentReference: method === "free" ? null : reference.trim(),
      amountMinor: method === "free" ? 0 : 20000,
    };
    this.grants[userId] = [item, ...(this.grants[userId] ?? [])];
    return { grantId: item.grantId, userId, startsAt: item.startsAt, endsAt: ends };
  }

  async getPaymentDetails(): Promise<PremiumPaymentDetails> {
    return this.details;
  }

  async setPaymentDetails(details: PremiumPaymentDetailsInput): Promise<PremiumPaymentDetails> {
    if (this.options.failWriteWith) {
      throw new Error(this.options.failWriteWith);
    }
    if (
      (details.whatsappNumber && !isValidWhatsappNumber(details.whatsappNumber)) ||
      (details.rib && !isValidRib(details.rib))
    ) {
      throw new PremiumAdminError("premium_payment_details_invalid");
    }
    this.details = { ...details, updatedAt: new Date(this.now).toISOString() };
    return this.details;
  }

  async grant(userId: string, endsAt: string, reason: string): Promise<PremiumAdminGrantResult> {
    if (this.options.failWriteWith) {
      throw new Error(this.options.failWriteWith);
    }
    const item: PremiumAdminGrant = {
      grantId: `5a900000-0000-4000-8000-0000000001${String(++this.eventId).padStart(2, "0")}`,
      startsAt: new Date(this.now).toISOString(),
      endsAt,
      reason,
      revokedAt: null,
    };
    this.grants[userId] = [item, ...(this.grants[userId] ?? [])];
    return { grantId: item.grantId, userId, startsAt: item.startsAt, endsAt };
  }

  async revoke(grantId: string): Promise<PremiumAdminRevokeResult> {
    if (this.options.failWriteWith) {
      throw new Error(this.options.failWriteWith);
    }
    for (const [userId, list] of Object.entries(this.grants)) {
      const found = list.find((g) => g.grantId === grantId);
      if (!found) continue;
      if (found.revokedAt) throw new PremiumAdminError("premium_grant_already_revoked");
      found.revokedAt = new Date(this.now).toISOString();
      return { grantId, userId, revoked: true };
    }
    throw new PremiumAdminError("premium_grant_not_found");
  }
}
