import { createClient, type User } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/backend/generated/database.types";
import {
  AdminRuntimeError,
  createServerSupabaseFetch,
  isDirectAdminCommand,
  maskRuntimeEmail,
  requireServerOnlyKey,
  resolveAdminRuntimeGuard,
  type AdminRuntimeGuard,
} from "./admin-runtime";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const databaseReadinessSchema = z.object({
  authUserId: z.string().uuid(),
  authUserExists: z.boolean(),
  emailVerified: z.boolean(),
  mfaVerified: z.boolean(),
  staffPrincipalExists: z.boolean(),
  staffPrincipalStatus: z.enum(["active", "suspended", "revoked"]).nullable(),
  activeAssignmentCount: z.number().int().nonnegative(),
  targetHasPlatformAdmin: z.boolean(),
  activePlatformAdminCount: z.number().int().nonnegative(),
  bootstrapEligible: z.boolean(),
  readinessCode: z.enum([
    "eligible",
    "staff_user_not_found",
    "staff_user_not_verified",
    "staff_user_mfa_required",
    "already_bootstrapped",
    "platform_admin_conflict",
    "staff_principal_inactive",
    "staff_role_conflict",
  ]),
});

export type DatabaseReadiness = z.infer<typeof databaseReadinessSchema>;

interface ReadinessRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
}

export class OwnerReadinessError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "OwnerReadinessError";
  }
}

export interface OwnerReadinessInput {
  readonly email: string;
}

export interface OwnerReadinessEvidence {
  readonly runtime: AdminRuntimeGuard;
  readonly authUserId: string;
  readonly maskedEmail: string;
  readonly currentAal: "aal2";
  readonly database: DatabaseReadiness;
}

export interface OwnerReadinessReport {
  readonly event: "admin_owner_readiness";
  readonly environment: AdminRuntimeGuard["environment"];
  readonly projectRef: string;
  readonly maskedEmail: string;
  readonly ready: boolean;
  readonly code: DatabaseReadiness["readinessCode"];
  readonly checks: {
    readonly exactAuthUser: true;
    readonly emailVerified: true;
    readonly mfaVerified: true;
    readonly currentAal2: true;
    readonly identityMatchesSession: true;
    readonly databaseEligible: boolean;
  };
  readonly activePlatformAdminCount: number;
}

type RuntimeValues = Readonly<Record<string, string | undefined>>;

export function resolveOwnerEmail(
  argumentsList: readonly string[],
  values: RuntimeValues = process.env,
): OwnerReadinessInput {
  const emailArguments = argumentsList.filter((argument) => argument.startsWith("--email="));
  const unknownArguments = argumentsList.filter((argument) => !argument.startsWith("--email="));
  const environmentEmail = values.OWNER_ADMIN_EMAIL?.trim();
  if (
    unknownArguments.length > 0 ||
    emailArguments.length > 1 ||
    (emailArguments.length === 1 && environmentEmail)
  ) {
    throw new OwnerReadinessError("invalid_owner_readiness_arguments");
  }
  const email = (
    emailArguments.length === 1 ? emailArguments[0]!.slice("--email=".length) : environmentEmail
  )
    ?.trim()
    .toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new OwnerReadinessError("invalid_owner_email");
  }
  return { email };
}

export function selectUniqueConfirmedOwner(users: readonly User[], email: string): User {
  const matches = users.filter((user) => user.email?.trim().toLowerCase() === email);
  if (matches.length === 0) throw new OwnerReadinessError("staff_user_not_found");
  if (matches.length > 1) throw new OwnerReadinessError("staff_user_ambiguous");
  const user = matches[0]!;
  if (!user.email_confirmed_at) throw new OwnerReadinessError("staff_user_not_verified");
  return user;
}

export function assertOwnerSessionProof(input: {
  readonly authUserId: string;
  readonly sessionUserId: string | null;
  readonly mfaVerified: boolean;
  readonly currentAal: string | null;
}): void {
  if (!input.mfaVerified) throw new OwnerReadinessError("staff_user_mfa_required");
  if (!input.sessionUserId) throw new OwnerReadinessError("owner_session_invalid");
  if (input.sessionUserId !== input.authUserId) {
    throw new OwnerReadinessError("owner_session_identity_mismatch");
  }
  if (input.currentAal !== "aal2") {
    throw new OwnerReadinessError("mfa_assurance_insufficient");
  }
}

async function listAllUsers(
  client: ReturnType<typeof createClient<Database>>,
): Promise<readonly User[]> {
  const users: User[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new OwnerReadinessError("auth_admin_unavailable");
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
  throw new OwnerReadinessError("auth_user_lookup_limit_exceeded");
}

export async function collectOwnerReadinessEvidence(
  argumentsList: readonly string[] = Bun.argv.slice(2),
  values: RuntimeValues = process.env,
  productionConfirmation = "RUN_BOTOLAGO_OWNER_READINESS_PRODUCTION",
): Promise<OwnerReadinessEvidence> {
  const { email } = resolveOwnerEmail(argumentsList, values);
  let runtime: AdminRuntimeGuard;
  try {
    runtime = resolveAdminRuntimeGuard(values, {
      confirmationVariable: "BOTOLAGO_ADMIN_PRODUCTION_CONFIRMATION",
      requiredConfirmation: productionConfirmation,
    });
  } catch (error) {
    if (error instanceof AdminRuntimeError) throw new OwnerReadinessError(error.code);
    throw error;
  }
  let secretKey: string;
  try {
    secretKey = requireServerOnlyKey(values, "SUPABASE_SECRET_KEY", runtime.environment);
  } catch (error) {
    if (error instanceof AdminRuntimeError) throw new OwnerReadinessError(error.code);
    throw error;
  }
  const accessToken = values.OWNER_ADMIN_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new OwnerReadinessError("owner_access_token_required");

  const client = createClient<Database>(runtime.url, secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: {
      fetch: createServerSupabaseFetch(secretKey),
      headers: { "X-Client-Info": "botolago-admin-owner-readiness/1" },
    },
  });
  const user = selectUniqueConfirmedOwner(await listAllUsers(client), email);

  const { data: factorData, error: factorError } = await client.auth.admin.mfa.listFactors({
    userId: user.id,
  });
  if (factorError) throw new OwnerReadinessError("auth_admin_unavailable");
  const mfaVerified = factorData.factors.some((factor) => factor.status === "verified");

  const { data: sessionUserData, error: sessionUserError } = await client.auth.getUser(accessToken);
  if (sessionUserError) throw new OwnerReadinessError("owner_session_invalid");
  const { data: assurance, error: assuranceError } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
  if (assuranceError) throw new OwnerReadinessError("owner_session_invalid");
  assertOwnerSessionProof({
    authUserId: user.id,
    sessionUserId: sessionUserData.user?.id ?? null,
    mfaVerified,
    currentAal: assurance.currentLevel,
  });

  const { data: rawReadiness, error: readinessError } = await (
    client.schema("api") as unknown as ReadinessRpcClient
  ).rpc("admin_get_owner_bootstrap_readiness", { p_auth_user_id: user.id });
  if (readinessError) throw new OwnerReadinessError("owner_readiness_unavailable");
  const parsed = databaseReadinessSchema.safeParse(rawReadiness);
  if (!parsed.success || parsed.data.authUserId !== user.id) {
    throw new OwnerReadinessError("owner_readiness_invalid_response");
  }
  if (
    parsed.data.readinessCode !== "eligible" &&
    parsed.data.readinessCode !== "already_bootstrapped"
  ) {
    throw new OwnerReadinessError(parsed.data.readinessCode);
  }

  return {
    runtime,
    authUserId: user.id,
    maskedEmail: maskRuntimeEmail(email),
    currentAal: "aal2",
    database: parsed.data,
  };
}

export function ownerReadinessReport(evidence: OwnerReadinessEvidence): OwnerReadinessReport {
  return {
    event: "admin_owner_readiness",
    environment: evidence.runtime.environment,
    projectRef: evidence.runtime.projectRef,
    maskedEmail: evidence.maskedEmail,
    ready: evidence.database.readinessCode === "eligible",
    code: evidence.database.readinessCode,
    checks: {
      exactAuthUser: true,
      emailVerified: true,
      mfaVerified: true,
      currentAal2: true,
      identityMatchesSession: true,
      databaseEligible: evidence.database.readinessCode === "eligible",
    },
    activePlatformAdminCount: evidence.database.activePlatformAdminCount,
  };
}

export async function runOwnerReadiness(
  argumentsList: readonly string[] = Bun.argv.slice(2),
  values: RuntimeValues = process.env,
): Promise<OwnerReadinessReport> {
  return ownerReadinessReport(await collectOwnerReadinessEvidence(argumentsList, values));
}

if (isDirectAdminCommand(import.meta.url)) {
  runOwnerReadiness()
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report)}\n`);
    })
    .catch((error: unknown) => {
      const code =
        error instanceof OwnerReadinessError || error instanceof AdminRuntimeError
          ? error.code
          : "owner_readiness_failed";
      process.stderr.write(`${JSON.stringify({ event: "admin_owner_readiness_failed", code })}\n`);
      process.exitCode = 1;
    });
}
