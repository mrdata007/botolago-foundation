import { createClient, type User } from "@supabase/supabase-js";
import type { Database } from "../../src/backend/generated/database.types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface BootstrapArguments {
  readonly email: string;
  readonly syntheticTest: boolean;
}

export function parseBootstrapArguments(argumentsList: readonly string[]): BootstrapArguments {
  const emailArguments = argumentsList.filter((argument) => argument.startsWith("--email="));
  const unknownArguments = argumentsList.filter(
    (argument) => !argument.startsWith("--email=") && argument !== "--synthetic-test",
  );
  if (emailArguments.length !== 1 || unknownArguments.length > 0) {
    throw new Error(
      'Usage: bun run admin:bootstrap --email="<verified-user-email>" [--synthetic-test]',
    );
  }
  const email = emailArguments[0]!.slice("--email=".length).trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new Error("The bootstrap email is invalid.");
  }
  return { email, syntheticTest: argumentsList.includes("--synthetic-test") };
}

export function selectUniqueConfirmedUser(users: readonly User[], email: string): User {
  const matches = users.filter((user) => user.email?.trim().toLowerCase() === email);
  if (matches.length === 0) throw new Error("No matching Supabase Auth user was found.");
  if (matches.length > 1) throw new Error("The Supabase Auth user lookup was ambiguous.");
  const user = matches[0]!;
  if (!user.email_confirmed_at) throw new Error("The matching Supabase Auth user is unverified.");
  return user;
}

function requiredEnvironment(name: "SUPABASE_URL" | "SUPABASE_SECRET_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required in the trusted server environment.`);
  return value;
}

async function listAllUsers(
  client: ReturnType<typeof createClient<Database>>,
): Promise<readonly User[]> {
  const users: User[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Supabase Auth user lookup failed.");
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
  throw new Error("Supabase Auth user lookup exceeded the bounded pagination limit.");
}

export async function runBootstrap(argumentsList = Bun.argv.slice(2)): Promise<void> {
  const argumentsValue = parseBootstrapArguments(argumentsList);
  const url = requiredEnvironment("SUPABASE_URL");
  const secretKey = requiredEnvironment("SUPABASE_SECRET_KEY");
  if (secretKey.startsWith("sb_publishable_")) {
    throw new Error("SUPABASE_SECRET_KEY must be a server-only Secret API key.");
  }

  const client = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { "X-Client-Info": "botolago-admin-bootstrap/1" } },
  });

  const user = selectUniqueConfirmedUser(await listAllUsers(client), argumentsValue.email);
  const { data: factorData, error: factorError } = await client.auth.admin.mfa.listFactors({
    userId: user.id,
  });
  if (factorError) throw new Error("Supabase Auth MFA lookup failed.");
  if (!factorData.factors.some((factor) => factor.status === "verified")) {
    throw new Error("The matching Supabase Auth user has no verified MFA factor.");
  }

  const { data, error } = await client.schema("api").rpc("admin_bootstrap_first_platform_admin", {
    p_auth_user_id: user.id,
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
    `Platform administrator ${result.created ? "created" : "already present"}; ` +
      `principal=${result.staffPrincipalId} assignment=${result.assignmentId}\n`,
  );
}

if (import.meta.main) {
  runBootstrap().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "The bootstrap command failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
