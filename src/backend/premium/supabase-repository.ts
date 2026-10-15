import type { RepositoryContext } from "@/backend/contracts/repository";
import { isMfaStepUpError } from "@/backend/auth/step-up";
import { ManagerCardError, mapManagerCardError } from "@/backend/manager-card/errors";
import { getManagerCardApi } from "@/integrations/supabase/v2-client";

import { read, untyped, type CardApi, type RpcResult } from "./card-reads";
import {
  MY_PREMIUM_OFF,
  PREMIUM_STATUS_OFF,
  PAYMENT_DETAILS_OFF,
  myPremiumSchema,
  payCodeSchema,
  paymentDetailsSchema,
  premiumStatusWireSchema,
  type MyPremium,
  type PayCode,
  type PaymentDetails,
  type PremiumRepository,
  type PremiumStatus,
} from "./contracts";

/**
 * BotolaGO+ membership, read from the database (migration 20261013100200):
 *
 *   api.premium_status()   public facts for the paywall; anonymous too, never raises
 *   api.get_my_premium()   the caller's membership; `{ available: false }` while the feature is off
 *
 * Both go through the Manager Card's `read` (the `api` schema only, its error mapping, an aborted
 * request stays an abort): a database the migration has not reached (`PGRST202`) answers like the
 * feature switched off, so a build can ship before the database does and show nothing.
 *
 * And, for paying by hand (migration 20261016150000): `api.get_premium_payment_details()` and
 * `api.get_my_premium_pay_code()`. There is no checkout, cancel or restore.
 */
/** Failures of the membership probe that mean "nothing to show", without a word to anyone. */
function quietlyOff(error: unknown): boolean {
  if (isMfaStepUpError(error)) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return code === "PGRST202" || code === "PT401";
}

export class SupabasePremiumRepository implements PremiumRepository {
  constructor(private readonly api: CardApi | null = null) {}

  private client() {
    return untyped(this.api ?? getManagerCardApi());
  }

  async status(context: RepositoryContext): Promise<PremiumStatus> {
    const answer = await read(
      this.client().rpc("premium_status"),
      premiumStatusWireSchema,
      context,
    );
    // The off answer of `read` is `{ available: false }`: a status has no such key.
    return "available" in answer ? PREMIUM_STATUS_OFF : answer;
  }

  /**
   * The caller's membership. This read is asked of EVERY signed-in reader, to discover a preview
   * member (database mode `preview`), so it must be silent for everyone it does not concern:
   *   - `{ available: false }` (mode off, or preview and not a member) reads as off;
   *   - a database without the function (`PGRST202`) reads as off;
   *   - `PT401` (no session) reads as off;
   *   - `PT403 mfa_required` (an enrolled account that holds only an AAL1 session) reads as off and
   *     is NOT reported to the auth layer: a BotolaGO+ probe must never take a reader to the code
   *     challenge or raise the step-up notice. Every read of the reader's own data still does, so
   *     an account that owes the code is sent there by those, not by this.
   * Anything else (network, a malformed answer) is thrown and the screens read it as off.
   */
  async mine(context: RepositoryContext): Promise<MyPremium> {
    const request = this.client().rpc("get_my_premium");
    let response: RpcResult;
    try {
      response = await (context.signal ? request.abortSignal(context.signal) : request);
    } catch (error) {
      if (quietlyOff(error)) return MY_PREMIUM_OFF;
      throw mapManagerCardError(error);
    }
    if (response.error) {
      if (quietlyOff(response.error)) return MY_PREMIUM_OFF;
      throw mapManagerCardError(response.error);
    }
    let answer: MyPremium;
    try {
      answer = myPremiumSchema.parse(response.data);
    } catch (error) {
      throw new ManagerCardError(
        "data_unavailable",
        "The BotolaGO+ membership answer is invalid.",
        error,
      );
    }
    return answer.available ? answer : MY_PREMIUM_OFF;
  }

  /**
   * How to pay (`api.get_premium_payment_details()`, authenticated). Anything that means « not
   * there yet » (no function, no session, step-up owed, mode off) reads as « not available »: the
   * pay screen then says the details are coming and shows no button.
   */
  async getPaymentDetails(context: RepositoryContext): Promise<PaymentDetails> {
    const request = this.client().rpc("get_premium_payment_details");
    let response: RpcResult;
    try {
      response = await (context.signal ? request.abortSignal(context.signal) : request);
    } catch (error) {
      if (quietlyOff(error)) return PAYMENT_DETAILS_OFF;
      throw mapManagerCardError(error);
    }
    if (response.error) {
      if (quietlyOff(response.error)) return PAYMENT_DETAILS_OFF;
      throw mapManagerCardError(response.error);
    }
    try {
      return paymentDetailsSchema.parse(response.data);
    } catch (error) {
      throw new ManagerCardError(
        "data_unavailable",
        "The BotolaGO+ payment details answer is invalid.",
        error,
      );
    }
  }

  /** The caller's personal payment code (`api.get_my_premium_pay_code()`); null while not available. */
  async getMyPayCode(context: RepositoryContext): Promise<PayCode> {
    const request = this.client().rpc("get_my_premium_pay_code");
    let response: RpcResult;
    try {
      response = await (context.signal ? request.abortSignal(context.signal) : request);
    } catch (error) {
      if (quietlyOff(error)) return { code: null };
      throw mapManagerCardError(error);
    }
    if (response.error) {
      if (quietlyOff(response.error)) return { code: null };
      throw mapManagerCardError(response.error);
    }
    try {
      return payCodeSchema.parse(response.data);
    } catch (error) {
      throw new ManagerCardError(
        "data_unavailable",
        "The BotolaGO+ payment code answer is invalid.",
        error,
      );
    }
  }
}
