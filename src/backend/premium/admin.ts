import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

import { AdminError, mapAdminError } from "@/backend/admin/errors";
import { SupabaseUsersAdminRepository } from "@/backend/admin/users-repository";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { getAdminApi } from "@/integrations/supabase/v2-client";

import { untyped, type CardApi } from "./card-reads";

/**
 * The BotolaGO+ admin console (`/admin/plus`), as migration 20261013100200 returns it:
 *
 *   api.admin_premium_overview()                            counts and settings (premium.read)
 *   api.admin_get_premium_member(user, reason, request)     one member, audited (premium.read)
 *   api.admin_grant_premium(user, ends_at, reason, key)     a complimentary membership (premium.grant)
 *   api.admin_revoke_premium(grant, reason, key)            end one early (premium.grant)
 *
 * and, from 20261013100500, `membersByProduct` on the overview. The Saison (migration
 * 20261016150000) adds:
 *
 *   api.admin_activate_premium_season(user, method, ref, reason, key)   the Saison, once the payment
 *                                                           has been checked (premium.grant)
 *   api.admin_find_premium_member_by_code(code, reason, request)   a member by their BG- code (premium.read)
 *   api.admin_get_premium_payment_details()                 how buyers pay (premium.read)
 *   api.admin_set_premium_payment_details(details, reason, key)   the owner's payment details (premium.grant)
 *
 * Every DTO is what a database function returns; nothing here is an authority. The database
 * re-checks the permission, MFA (AAL2) and, for a grant or a revoke, recent authentication on every
 * call, and writes the audit row. Nothing here carries a payment card, a billing payload, a card of
 * the Manager Card or a Fantasy figure: the functions do not select them.
 */

const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();

/** How a Saison was paid, as the activation records it (`premium_grants.payment_method`). */
export const PAYMENT_METHODS = ["bank_transfer", "cashplus", "wafacash", "free"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PREMIUM_STATES = [
  "active",
  "cancelling",
  "grace",
  "on_hold",
  "expired",
  "refunded",
  "revoked",
] as const;
export const premiumStateSchema = z.enum(PREMIUM_STATES);
export type PremiumState = z.infer<typeof premiumStateSchema>;

export const PREMIUM_SOURCES = ["web", "apple", "google", "grant"] as const;
export const premiumSourceSchema = z.enum(PREMIUM_SOURCES);
export type PremiumSource = z.infer<typeof premiumSourceSchema>;

export const PREMIUM_MODES = ["off", "preview", "on"] as const;
export const premiumModeSchema = z.enum(PREMIUM_MODES);
export type PremiumMode = z.infer<typeof premiumModeSchema>;

export const BILLING_EVENT_TYPES = [
  "purchase",
  "renewal",
  "cancel",
  "uncancel",
  "payment_failed",
  "hold",
  "expire",
  "refund",
  "revoke",
] as const;
export const billingEventTypeSchema = z.enum(BILLING_EVENT_TYPES);
export type BillingEventType = z.infer<typeof billingEventTypeSchema>;

export const BILLING_OUTCOMES = [
  "applied",
  "ignored_state",
  "ignored_stale",
  "ignored_user",
  "ignored_product",
  "rejected_signature",
] as const;
export const billingOutcomeSchema = z.enum(BILLING_OUTCOMES);
export type BillingOutcome = z.infer<typeof billingOutcomeSchema>;

// ---------------------------------------------------------------------------
// Overview: counts and settings, no member
// ---------------------------------------------------------------------------

export const premiumAdminSettingsSchema = z.object({
  mode: premiumModeSchema,
  checkoutEnabled: z.boolean(),
  billingPaused: z.boolean(),
});

/** A product and its price exactly as the database holds it (centimes). Nothing is hard-coded. */
export const premiumAdminProductSchema = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{2,31}$/),
  /** Null for the Saison: it ends with the Fantasy season, not after a number of months. */
  periodMonths: z.number().int().positive().nullable(),
  renews: z.boolean(),
  priceMinor: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  active: z.boolean(),
});

/** States are keys of a sparse object: a state nobody is in is absent, not zero. */
export const premiumStateCountsSchema = z.partialRecord(premiumStateSchema, count);

export const premiumAdminOverviewSchema = z.object({
  settings: premiumAdminSettingsSchema,
  products: z.array(premiumAdminProductSchema),
  membersByState: premiumStateCountsSchema,
  /** Added by 20261013100500: absent from a database that migration has not reached. */
  membersByProduct: z.record(z.string(), premiumStateCountsSchema).optional(),
  liveGrants: count,
  lastEventAt: timestamp.nullable(),
});

// ---------------------------------------------------------------------------
// One member (the audited read)
// ---------------------------------------------------------------------------

export const premiumAdminEntitlementSchema = z.object({
  state: premiumStateSchema,
  effectiveState: premiumStateSchema,
  productCode: z.string(),
  source: premiumSourceSchema,
  currentPeriodStart: timestamp,
  currentPeriodEnd: timestamp,
  graceUntil: timestamp.nullable(),
  cancelRequestedAt: timestamp.nullable(),
  lastEventAt: timestamp,
});

export const premiumAdminGrantSchema = z.object({
  grantId: z.string().uuid(),
  startsAt: timestamp,
  endsAt: timestamp,
  reason: z.string(),
  revokedAt: timestamp.nullable(),
  /** From the Saison migration on; absent or null on an older grant. */
  productCode: z.string().nullable().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
  paymentReference: z.string().nullable().optional(),
  amountMinor: z.number().int().nonnegative().nullable().optional(),
});

/** An outcome, never a payload: the function does not select the payload column. */
export const premiumAdminEventSchema = z.object({
  eventId: z.number().int().positive(),
  providerEventId: z.string(),
  provider: z.string(),
  source: premiumSourceSchema,
  eventType: billingEventTypeSchema,
  productCode: z.string().nullable(),
  occurredAt: timestamp,
  outcome: billingOutcomeSchema,
  stateBefore: z.string().nullable(),
  stateAfter: z.string().nullable(),
  amountMinor: z.number().int().nonnegative().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
});

export const premiumAdminMemberSchema = z.object({
  userId: z.string().uuid(),
  /** Whether the account counts as a member right now (`has_premium`), by any route. */
  isMember: z.boolean(),
  /** Null: the account never held a paid membership. */
  entitlement: premiumAdminEntitlementSchema.nullable(),
  grants: z.array(premiumAdminGrantSchema),
  events: z.array(premiumAdminEventSchema),
});

export const premiumAdminGrantResultSchema = z.object({
  grantId: z.string().uuid(),
  userId: z.string().uuid(),
  startsAt: timestamp,
  endsAt: timestamp,
});

export const premiumAdminRevokeResultSchema = z.object({
  grantId: z.string().uuid(),
  userId: z.string().uuid(),
  revoked: z.literal(true),
});

/** The result of activating a Saison: the grant, which runs to the end of the Fantasy season. */
export const premiumAdminSeasonResultSchema = premiumAdminGrantResultSchema;
export type PremiumAdminSeasonResult = z.infer<typeof premiumAdminSeasonResultSchema>;

/**
 * The payment details the owner types in (`premium_payment_details`, a one-row table). Every field
 * is optional: the buyer's screen shows only what is set, and says « bientôt » without a WhatsApp
 * number. The database answers snake_case columns or camelCase keys; both are read.
 */
const nullableText = z.string().nullable().optional();
export const premiumPaymentDetailsSchema = z
  .preprocess(
    (raw) => {
      if (raw === null || typeof raw !== "object") return raw;
      const row = raw as Record<string, unknown>;
      const pick = (camel: string, snake: string) => row[camel] ?? row[snake] ?? null;
      return {
        bankHolder: pick("bankHolder", "bank_holder"),
        bankName: pick("bankName", "bank_name"),
        rib: pick("rib", "rib"),
        cashplusName: pick("cashplusName", "cashplus_name"),
        whatsappNumber: row.whatsappNumber ?? row.whatsapp_number ?? row.whatsapp ?? null,
        noteFr: pick("noteFr", "note_fr"),
        noteAr: pick("noteAr", "note_ar"),
        updatedAt: pick("updatedAt", "updated_at"),
      };
    },
    z.object({
      bankHolder: nullableText,
      bankName: nullableText,
      rib: nullableText,
      cashplusName: nullableText,
      whatsappNumber: nullableText,
      noteFr: nullableText,
      noteAr: nullableText,
      updatedAt: timestamp.nullable().optional(),
    }),
  )
  .transform((row) => ({
    bankHolder: row.bankHolder ?? null,
    bankName: row.bankName ?? null,
    rib: row.rib ?? null,
    cashplusName: row.cashplusName ?? null,
    whatsappNumber: row.whatsappNumber ?? null,
    noteFr: row.noteFr ?? null,
    noteAr: row.noteAr ?? null,
    updatedAt: row.updatedAt ?? null,
  }));
export type PremiumPaymentDetails = z.infer<typeof premiumPaymentDetailsSchema>;
/** What the form sends: the same fields, text only, empty meaning « not set ». */
export type PremiumPaymentDetailsInput = Omit<PremiumPaymentDetails, "updatedAt">;

export type PremiumAdminSettings = z.infer<typeof premiumAdminSettingsSchema>;
export type PremiumAdminProduct = z.infer<typeof premiumAdminProductSchema>;
export type PremiumAdminOverview = z.infer<typeof premiumAdminOverviewSchema>;
export type PremiumAdminEntitlement = z.infer<typeof premiumAdminEntitlementSchema>;
export type PremiumAdminGrant = z.infer<typeof premiumAdminGrantSchema>;
export type PremiumAdminEvent = z.infer<typeof premiumAdminEventSchema>;
export type PremiumAdminMember = z.infer<typeof premiumAdminMemberSchema>;
export type PremiumAdminGrantResult = z.infer<typeof premiumAdminGrantResultSchema>;
export type PremiumAdminRevokeResult = z.infer<typeof premiumAdminRevokeResultSchema>;

// ---------------------------------------------------------------------------
// Rules mirrored only to explain a disabled button; the database enforces them
// ---------------------------------------------------------------------------

export const PREMIUM_REASON_MIN = 8;
export const PREMIUM_REASON_MAX = 500;
/** The longest grant the database accepts. */
export const PREMIUM_GRANT_MAX_DAYS = 400;

/** The grant lengths offered; each is within the database bound. */
export const PREMIUM_GRANT_DURATIONS = [
  { key: "month", days: 30 },
  { key: "quarter", days: 90 },
  { key: "year", days: 365 },
] as const;
export type PremiumGrantDurationKey = (typeof PREMIUM_GRANT_DURATIONS)[number]["key"];

/** When a grant of that length ends, counted from `now`. */
export function premiumGrantEndsAt(key: PremiumGrantDurationKey, now: Date): string {
  const days = PREMIUM_GRANT_DURATIONS.find((duration) => duration.key === key)?.days ?? 30;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** The reason as the database wants it: trimmed, 8 to 500 characters. */
export function isValidPremiumReason(reason: string): boolean {
  const length = [...reason].length;
  return reason === reason.trim() && length >= PREMIUM_REASON_MIN && length <= PREMIUM_REASON_MAX;
}

/** The payment reference a paid method needs (the receipt's number, the transfer's reference). */
export const PREMIUM_REFERENCE_MIN = 1;
export const PREMIUM_REFERENCE_MAX = 80;
export function isValidPaymentReference(reference: string): boolean {
  const length = [...reference.trim()].length;
  return length >= PREMIUM_REFERENCE_MIN && length <= PREMIUM_REFERENCE_MAX;
}

/** A RIB as the database accepts it: 10 to 40 letters, digits, spaces, dots or hyphens. */
export function isValidRib(value: string): boolean {
  return /^[A-Za-z0-9 .-]{10,40}$/.test(value.trim());
}

/** A WhatsApp number as the database accepts it: 8 to 16 digits, an optional leading plus. */
export function isValidWhatsappNumber(value: string): boolean {
  return /^\+?\d{8,16}$/.test(value.trim());
}

/** The personal code a buyer writes in the transfer: `BG-` and six letters or digits. */
const PAY_CODE = /^BG-[A-Z0-9]{6}$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PremiumLookupQuery =
  | { readonly kind: "id"; readonly userId: string }
  | { readonly kind: "email"; readonly email: string }
  | { readonly kind: "code"; readonly code: string }
  | { readonly kind: "invalid" };

/** An account id, a payment code (`BG-XXXXXX`), or an e-mail (exact, as the user directory matches it); nothing else. */
export function parsePremiumLookupQuery(input: string): PremiumLookupQuery {
  const text = input.trim();
  if (UUID.test(text)) return { kind: "id", userId: text.toLowerCase() };
  if (PAY_CODE.test(text.toUpperCase())) return { kind: "code", code: text.toUpperCase() };
  const at = text.indexOf("@");
  if (at > 0 && at < text.length - 1 && text.length <= 254 && !/\s/.test(text)) {
    return { kind: "email", email: text.toLowerCase() };
  }
  return { kind: "invalid" };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const PREMIUM_ADMIN_ERROR_CODES = [
  "premium_reason_invalid",
  "premium_grant_period_invalid",
  "premium_account_not_found",
  "premium_grant_not_found",
  "premium_grant_already_revoked",
  "validation_failed",
  // The answer did not have the shape the screen was written for.
  "premium_admin_invalid_answer",
  // Not a refusal: the functions are missing because the migration has not reached this database.
  "premium_admin_unavailable",
  // Looking an account up by e-mail.
  "premium_lookup_ambiguous",
  // Activating a Saison.
  "season_already_active",
  "premium_season_unavailable",
  "premium_season_ended",
  "premium_payment_reference_required",
  "premium_payment_method_invalid",
  // The payment details form.
  "premium_payment_details_invalid",
  // Looking an account up by payment code.
  "premium_code_invalid",
  "premium_code_not_found",
] as const;
export type PremiumAdminErrorCode = (typeof PREMIUM_ADMIN_ERROR_CODES)[number];

export class PremiumAdminError extends Error {
  constructor(
    readonly code: PremiumAdminErrorCode,
    readonly cause?: unknown,
  ) {
    super(code, { cause });
    this.name = "PremiumAdminError";
  }
}

/**
 * The refusal a PostgREST error names, or null when it names none of ours. PGRST202 is
 * PostgREST's "no such function": the page was published before the migration reached this database.
 */
export function premiumAdminErrorCode(error: unknown): PremiumAdminErrorCode | null {
  if (error instanceof PremiumAdminError) return error.code;
  const source = error as { message?: unknown; code?: unknown } | null;
  if (source?.code === "PGRST202") return "premium_admin_unavailable";
  const message = typeof source?.message === "string" ? source.message.trim() : "";
  return (PREMIUM_ADMIN_ERROR_CODES as readonly string[]).includes(message)
    ? (message as PremiumAdminErrorCode)
    : null;
}

export function mapPremiumAdminError(error: unknown): PremiumAdminError | AdminError {
  const code = premiumAdminErrorCode(error);
  return code ? new PremiumAdminError(code, error) : mapAdminError(error);
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/** What an account lookup by e-mail found. Never more than one account is returned. */
export type PremiumAccountResolution =
  | { readonly status: "found"; readonly userId: string }
  | { readonly status: "not_found" };

export interface PremiumAdminRepository {
  overview(context: RepositoryContext): Promise<PremiumAdminOverview>;
  /** The audited read: `reason` is written to the admin audit log with this request id. */
  member(userId: string, reason: string, context: RepositoryContext): Promise<PremiumAdminMember>;
  /** An account id from an exact e-mail (the user directory's own exact match). */
  resolveAccount(email: string, context: RepositoryContext): Promise<PremiumAccountResolution>;
  /** The member whose personal payment code this is (audited like `member`). */
  findByCode(code: string, reason: string, context: RepositoryContext): Promise<PremiumAdminMember>;
  /** When a Saison activated now ends: the current Fantasy season's end, or null if unknown. */
  seasonEnd(context: RepositoryContext): Promise<string | null>;
  /** The Saison, after the payment was checked: the grant runs to the end of the season. */
  activateSeason(
    userId: string,
    method: PaymentMethod,
    reference: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<PremiumAdminSeasonResult>;
  getPaymentDetails(context: RepositoryContext): Promise<PremiumPaymentDetails>;
  setPaymentDetails(
    details: PremiumPaymentDetailsInput,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<PremiumPaymentDetails>;
  grant(
    userId: string,
    endsAt: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<PremiumAdminGrantResult>;
  revoke(
    grantId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<PremiumAdminRevokeResult>;
}

type AdminApi = ReturnType<typeof getAdminApi>;

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new PremiumAdminError("premium_admin_invalid_answer", error);
  }
}

function throwIfError(error: PostgrestError | null): void {
  if (error) throw mapPremiumAdminError(error);
}

function requireActor(context: RepositoryContext): void {
  if (!context.actorId) throw new AdminError("staff_access_denied", "Staff access is denied.");
}

async function runRpc<T>(
  request: PromiseLike<T> & { abortSignal(signal: AbortSignal): PromiseLike<T> },
  context: RepositoryContext,
): Promise<T> {
  return await (context.signal ? request.abortSignal(context.signal) : request);
}

export class SupabasePremiumAdminRepository implements PremiumAdminRepository {
  constructor(
    private readonly api: AdminApi | null = null,
    private readonly users: SupabaseUsersAdminRepository = new SupabaseUsersAdminRepository(),
  ) {}

  private client(): AdminApi {
    return this.api ?? getAdminApi();
  }

  /**
   * The Saison's functions are not in `database.types.ts` until the backend branch regenerates it
   * (`card-reads.ts` explains the one cast); drop this when they are.
   */
  private untypedClient() {
    return untyped(this.client() as unknown as CardApi);
  }

  async overview(context: RepositoryContext): Promise<PremiumAdminOverview> {
    requireActor(context);
    const { data, error } = await runRpc(this.client().rpc("admin_premium_overview"), context);
    throwIfError(error);
    return parse(premiumAdminOverviewSchema, data);
  }

  async member(
    userId: string,
    reason: string,
    context: RepositoryContext,
  ): Promise<PremiumAdminMember> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_get_premium_member", {
        p_user_id: userId,
        p_reason: reason,
        p_request_id: context.requestId,
      }),
      context,
    );
    throwIfError(error);
    return parse(premiumAdminMemberSchema, data);
  }

  async findByCode(
    code: string,
    reason: string,
    context: RepositoryContext,
  ): Promise<PremiumAdminMember> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.untypedClient().rpc("admin_find_premium_member_by_code", {
        p_code: code,
        p_reason: reason,
        p_request_id: context.requestId,
      }),
      context,
    );
    throwIfError(error);
    return parse(premiumAdminMemberSchema, data);
  }

  async seasonEnd(context: RepositoryContext): Promise<string | null> {
    requireActor(context);
    // The public status carries the Saison's end (`validUntil`); it is the same answer buyers read.
    try {
      const { data, error } = await runRpc(this.client().rpc("premium_status"), context);
      if (error) return null;
      const prices = (data as { prices?: Array<{ code?: string; validUntil?: unknown }> } | null)
        ?.prices;
      const season = prices?.find((price) => price.code === "plus_season");
      return typeof season?.validUntil === "string" ? season.validUntil : null;
    } catch {
      return null;
    }
  }

  async activateSeason(
    userId: string,
    method: PaymentMethod,
    reference: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<PremiumAdminSeasonResult> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.untypedClient().rpc("admin_activate_premium_season", {
        p_user_id: userId,
        p_payment_method: method,
        // « Offert » has no payment to refer to; the database wants a reference only for a paid one.
        p_payment_reference: method === "free" ? null : reference.trim(),
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
      }),
      context,
    );
    throwIfError(error);
    return parse(premiumAdminSeasonResultSchema, data);
  }

  async getPaymentDetails(context: RepositoryContext): Promise<PremiumPaymentDetails> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.untypedClient().rpc("admin_get_premium_payment_details"),
      context,
    );
    throwIfError(error);
    return parse(premiumPaymentDetailsSchema, data ?? {});
  }

  async setPaymentDetails(
    details: PremiumPaymentDetailsInput,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<PremiumPaymentDetails> {
    requireActor(context);
    const blank = (value: string | null) => (value && value.trim() !== "" ? value.trim() : null);
    const { data, error } = await runRpc(
      this.untypedClient().rpc("admin_set_premium_payment_details", {
        p_details: {
          bankHolder: blank(details.bankHolder),
          bankName: blank(details.bankName),
          rib: blank(details.rib),
          cashplusName: blank(details.cashplusName),
          whatsapp: blank(details.whatsappNumber),
          noteFr: blank(details.noteFr),
          noteAr: blank(details.noteAr),
        },
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
      }),
      context,
    );
    throwIfError(error);
    return parse(premiumPaymentDetailsSchema, data ?? {});
  }

  async resolveAccount(
    email: string,
    context: RepositoryContext,
  ): Promise<PremiumAccountResolution> {
    requireActor(context);
    // An address has one account, so an exact match returns at most one row.
    const page = await this.users.listUsers({ query: email, status: null }, null, 2, context);
    if (page.items.length === 0) return { status: "not_found" };
    if (page.items.length > 1) throw new PremiumAdminError("premium_lookup_ambiguous");
    return { status: "found", userId: page.items[0].userId };
  }

  async grant(
    userId: string,
    endsAt: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<PremiumAdminGrantResult> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_grant_premium", {
        p_user_id: userId,
        p_ends_at: endsAt,
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
      }),
      context,
    );
    throwIfError(error);
    return parse(premiumAdminGrantResultSchema, data);
  }

  async revoke(
    grantId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<PremiumAdminRevokeResult> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_revoke_premium", {
        p_grant_id: grantId,
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
      }),
      context,
    );
    throwIfError(error);
    return parse(premiumAdminRevokeResultSchema, data);
  }
}
