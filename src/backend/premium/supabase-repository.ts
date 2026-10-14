import type { RepositoryContext } from "@/backend/contracts/repository";
import { getManagerCardApi } from "@/integrations/supabase/v2-client";

import { read, untyped, type CardApi } from "./card-reads";
import {
  MY_PREMIUM_OFF,
  PREMIUM_STATUS_OFF,
  myPremiumSchema,
  premiumStatusWireSchema,
  type MyPremium,
  type PremiumActionResult,
  type PremiumReceipt,
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
 * Checkout, cancelling, restoring and the receipts list are not served yet: they answer « bientôt »
 * and an empty list, exactly as the off repository does (lanes F and G).
 */
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

  async mine(context: RepositoryContext): Promise<MyPremium> {
    const answer = await read(this.client().rpc("get_my_premium"), myPremiumSchema, context);
    return answer.available ? answer : MY_PREMIUM_OFF;
  }

  async receipts(_context: RepositoryContext): Promise<readonly PremiumReceipt[]> {
    return [];
  }

  async startCheckout(): Promise<PremiumActionResult> {
    return { status: "soon" };
  }

  async cancel(): Promise<PremiumActionResult> {
    return { status: "soon" };
  }

  async restore(): Promise<PremiumActionResult> {
    return { status: "soon" };
  }
}
