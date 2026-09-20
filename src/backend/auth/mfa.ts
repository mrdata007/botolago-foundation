// Thin, testable orchestration over Supabase Auth's official MFA/TOTP APIs
// (`supabase.auth.mfa.*`). Every function here takes the MFA client as an
// explicit dependency (`MfaAuthClient`) rather than importing the app's
// singleton, so tests can inject a fake implementing this same narrow shape
// instead of standing up a real Supabase project.
//
// Never log or persist any value returned from these calls -- the TOTP
// secret, QR payload, verification code, and challenge/access tokens are all
// sensitive. Callers must only ever render them, never console.log/store them.

import { mapMfaError, MfaError } from "./mfa-errors";

interface MfaClientError {
  readonly message?: string;
  readonly status?: number;
}

export type AssuranceLevel = "aal1" | "aal2" | null;

export interface AssuranceLevels {
  readonly currentLevel: AssuranceLevel;
  readonly nextLevel: AssuranceLevel;
}

export interface TotpEnrollment {
  readonly factorId: string;
  /** SVG markup for the enrollment QR code. Render only -- never log. */
  readonly qrCodeSvg: string;
  /** The raw TOTP secret, for manual entry. Render only -- never log. */
  readonly secret: string;
  /** The otpauth:// URI encoded in the QR code. Render only -- never log. */
  readonly uri: string;
}

export interface TotpFactorSummary {
  readonly id: string;
  readonly status: "verified" | "unverified";
  readonly friendlyName: string | null;
  readonly createdAt: string;
}

/**
 * The subset of `supabase.auth.mfa` (the real `GoTrueMFAApi`) this module
 * depends on. The production Supabase client satisfies this structurally --
 * no adapter is needed to pass `supabase.auth.mfa` directly.
 */
export interface MfaAuthClient {
  enroll(params: { factorType: "totp"; friendlyName?: string }): Promise<{
    data: {
      id: string;
      type: string;
      totp: { qr_code: string; secret: string; uri: string };
    } | null;
    error: MfaClientError | null;
  }>;
  challenge(params: { factorId: string }): Promise<{
    data: { id: string } | null;
    error: MfaClientError | null;
  }>;
  verify(params: { factorId: string; challengeId: string; code: string }): Promise<{
    data: unknown | null;
    error: MfaClientError | null;
  }>;
  unenroll(params: { factorId: string }): Promise<{
    data: unknown | null;
    error: MfaClientError | null;
  }>;
  listFactors(): Promise<{
    data: {
      totp: ReadonlyArray<{
        id: string;
        status: "verified" | "unverified";
        friendly_name?: string;
        created_at: string;
      }>;
    } | null;
    error: MfaClientError | null;
  }>;
  getAuthenticatorAssuranceLevel(): Promise<{
    data: { currentLevel: string | null; nextLevel: string | null } | null;
    error: MfaClientError | null;
  }>;
}

const SIX_DIGIT_CODE = /^\d{6}$/;

function normalizeAssuranceLevel(value: string | null): AssuranceLevel {
  return value === "aal1" || value === "aal2" ? value : null;
}

/** Step 1 of enrollment: `supabase.auth.mfa.enroll({ factorType: 'totp' })`. */
export async function enrollTotpFactor(
  mfa: MfaAuthClient,
  friendlyName?: string,
): Promise<TotpEnrollment> {
  const { data, error } = await mfa.enroll({
    factorType: "totp",
    ...(friendlyName ? { friendlyName } : {}),
  });
  if (error || !data) throw mapMfaError(error);
  if (data.type !== "totp" || !data.totp) {
    throw new MfaError("internal", "Unexpected factor type returned by enrollment.");
  }
  return {
    factorId: data.id,
    qrCodeSvg: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

/**
 * Steps 2-3 of enrollment (and login step-up): the official
 * challenge + verify flow -- `supabase.auth.mfa.challenge()` followed by
 * `supabase.auth.mfa.verify()`.
 */
export async function verifyTotpFactor(
  mfa: MfaAuthClient,
  factorId: string,
  code: string,
): Promise<void> {
  const trimmed = code.trim();
  if (!SIX_DIGIT_CODE.test(trimmed)) {
    throw new MfaError("invalid_code", "The verification code must be exactly 6 digits.");
  }

  const challenge = await mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) throw mapMfaError(challenge.error);

  const verified = await mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: trimmed,
  });
  if (verified.error) throw mapMfaError(verified.error);
}

/**
 * `supabase.auth.mfa.unenroll()`. Used to clean up the unverified factor that
 * `enroll()` creates when the user abandons enrollment -- without this, every
 * abandoned attempt leaves a factor behind until GoTrue's per-user limit
 * starts rejecting new enrollments. Removing a *verified* factor additionally
 * requires an AAL2 session, which Supabase enforces server-side.
 */
export async function unenrollFactor(mfa: MfaAuthClient, factorId: string): Promise<void> {
  const { error } = await mfa.unenroll({ factorId });
  if (error) throw mapMfaError(error);
}

/** Lists only verified TOTP factors -- what a security page should show as "enrolled". */
export async function listVerifiedTotpFactors(
  mfa: MfaAuthClient,
): Promise<readonly TotpFactorSummary[]> {
  const { data, error } = await mfa.listFactors();
  if (error || !data) throw mapMfaError(error);
  return (data.totp ?? [])
    .filter((factor) => factor.status === "verified")
    .map((factor) => ({
      id: factor.id,
      status: factor.status,
      friendlyName: factor.friendly_name ?? null,
      createdAt: factor.created_at,
    }));
}

/** `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`. */
export async function getAssuranceLevels(mfa: MfaAuthClient): Promise<AssuranceLevels> {
  const { data, error } = await mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) throw mapMfaError(error);
  return {
    currentLevel: normalizeAssuranceLevel(data.currentLevel),
    nextLevel: normalizeAssuranceLevel(data.nextLevel),
  };
}

/** True when the current session already satisfies AAL2. */
export function isAal2(levels: AssuranceLevels): boolean {
  return levels.currentLevel === "aal2";
}

/**
 * True when the user has a verified TOTP factor but the current session has
 * not stepped up yet -- the condition that should route a freshly-signed-in
 * user through the login MFA challenge instead of straight into the app.
 */
export function requiresLoginChallenge(levels: AssuranceLevels): boolean {
  return levels.currentLevel === "aal1" && levels.nextLevel === "aal2";
}
