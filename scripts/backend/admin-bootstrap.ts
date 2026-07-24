import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/backend/generated/database.types";
import {
  collectOwnerReadinessEvidence,
  OwnerReadinessError,
  resolveOwnerEmail,
  selectUniqueConfirmedOwner,
} from "./admin-owner-readiness";
import {
  AdminRuntimeError,
  createServerSupabaseFetch,
  isDirectAdminCommand,
  requireServerOnlyKey,
} from "./admin-runtime";

export interface BootstrapArguments {
  readonly email: string;
  readonly syntheticTest: boolean;
}

type RuntimeValues = Readonly<Record<string, string | undefined>>;

export function parseBootstrapArguments(
  argumentsList: readonly string[],
  values: RuntimeValues = process.env,
): BootstrapArguments {
  const unknownArguments = argumentsList.filter(
    (argument) => !argument.startsWith("--email=") && argument !== "--synthetic-test",
  );
  if (unknownArguments.length > 0) {
    throw new Error(
      'Usage: OWNER_ADMIN_EMAIL="<verified-user-email>" bun run admin:bootstrap [--synthetic-test]',
    );
  }
  let email: string;
  try {
    email = resolveOwnerEmail(
      argumentsList.filter((argument) => argument.startsWith("--email=")),
      values,
    ).email;
  } catch {
    throw new Error("The bootstrap email is invalid.");
  }
  return { email, syntheticTest: argumentsList.includes("--synthetic-test") };
}

export const selectUniqueConfirmedUser = selectUniqueConfirmedOwner;

export async function runBootstrap(
  argumentsList: readonly string[] = Bun.argv.slice(2),
  values: RuntimeValues = process.env,
): Promise<void> {
  const argumentsValue = parseBootstrapArguments(argumentsList, values);
  const readinessValues = {
    ...values,
    OWNER_ADMIN_EMAIL: undefined,
  };
  const evidence = await collectOwnerReadinessEvidence(
    [`--email=${argumentsValue.email}`],
    readinessValues,
    "RUN_BOTOLAGO_OWNER_BOOTSTRAP_PRODUCTION",
  );
  if (argumentsValue.syntheticTest && evidence.runtime.environment === "production") {
    throw new Error("Synthetic bootstrap is forbidden in production.");
  }
  const secretKey = requireServerOnlyKey(
    values,
    "SUPABASE_SECRET_KEY",
    evidence.runtime.environment,
  );

  const client = createClient<Database>(evidence.runtime.url, secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: {
      fetch: createServerSupabaseFetch(secretKey),
      headers: { "X-Client-Info": "botolago-admin-bootstrap/2" },
    },
  });

  const { data, error } = await client.schema("api").rpc("admin_bootstrap_first_platform_admin", {
    p_auth_user_id: evidence.authUserId,
    p_reason: "Initial platform administrator bootstrap",
    p_synthetic_test: argumentsValue.syntheticTest,
  });
  if (error) {
    const stableCode = [
      "staff_principal_not_found",
      "staff_role_conflict",
      "staff_revoked",
      "mfa_required",
      "staff_access_denied",
    ].find((candidate) => error.message.toLowerCase().includes(candidate));
    throw new Error(stableCode ?? "The platform administrator bootstrap failed.");
  }

  const result = data as {
    staffPrincipalId?: string;
    assignmentId?: string;
    role?: string;
    created?: boolean;
  } | null;
  if (
    !result?.staffPrincipalId ||
    !result.assignmentId ||
    result.role !== "platform_admin" ||
    typeof result.created !== "boolean"
  ) {
    throw new Error("The bootstrap RPC returned an invalid response.");
  }

  process.stdout.write(
    `${JSON.stringify({
      event: "admin_owner_bootstrap_completed",
      environment: evidence.runtime.environment,
      projectRef: evidence.runtime.projectRef,
      created: result.created,
      role: result.role,
      staffPrincipalId: result.staffPrincipalId,
      assignmentId: result.assignmentId,
    })}\n`,
  );
}

if (isDirectAdminCommand(import.meta.url)) {
  runBootstrap().catch((error: unknown) => {
    const code =
      error instanceof OwnerReadinessError || error instanceof AdminRuntimeError
        ? error.code
        : error instanceof Error
          ? error.message
          : "owner_bootstrap_failed";
    process.stderr.write(`${JSON.stringify({ event: "admin_owner_bootstrap_failed", code })}\n`);
    process.exitCode = 1;
  });
}
