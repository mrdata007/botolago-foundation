import { sanitizeAuthCallbackNext } from "@/lib/auth-callback";

export interface MfaFactorCandidate {
  readonly id?: unknown;
  readonly factor_type?: unknown;
  readonly status?: unknown;
}

/** Select only a verified TOTP factor; never challenge an unverified/stale row. */
export function selectVerifiedTotpFactor(
  factors: readonly MfaFactorCandidate[],
): { id: string } | null {
  const factor = factors.find(
    (candidate) =>
      typeof candidate.id === "string" &&
      candidate.id.length > 0 &&
      candidate.factor_type === "totp" &&
      candidate.status === "verified",
  );
  return factor && typeof factor.id === "string" ? { id: factor.id } : null;
}

export function safeMfaReturnPath(value: unknown): string {
  return sanitizeAuthCallbackNext(typeof value === "string" ? value : null);
}

