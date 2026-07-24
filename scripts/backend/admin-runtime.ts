import { fileURLToPath } from "node:url";

export type AdminEnvironment = "local" | "staging" | "production";

export class AdminRuntimeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AdminRuntimeError";
  }
}

export interface AdminRuntimeGuard {
  readonly environment: AdminEnvironment;
  readonly projectRef: string;
  readonly url: string;
}

type RuntimeValues = Readonly<Record<string, string | undefined>>;

export function isDirectAdminCommand(moduleUrl: string, bunMain = Bun.main): boolean {
  return Boolean(bunMain) && fileURLToPath(moduleUrl) === bunMain;
}

function required(values: RuntimeValues, name: string): string {
  const value = values[name]?.trim();
  if (!value) throw new AdminRuntimeError(`missing_${name.toLowerCase()}`);
  return value;
}

export function deriveSupabaseProjectRef(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AdminRuntimeError("invalid_supabase_url");
  }
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new AdminRuntimeError("invalid_supabase_url");
  }
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return "local";
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
  if (!match) throw new AdminRuntimeError("invalid_supabase_url");
  return match[1]!;
}

export function resolveAdminRuntimeGuard(
  values: RuntimeValues = process.env,
  production?: {
    readonly confirmationVariable: string;
    readonly requiredConfirmation: string;
  },
): AdminRuntimeGuard {
  const environment = required(values, "BOTOLAGO_ADMIN_ENVIRONMENT");
  if (!["local", "staging", "production"].includes(environment)) {
    throw new AdminRuntimeError("invalid_admin_environment");
  }
  const url = required(values, "SUPABASE_URL").replace(/\/+$/, "");
  const projectRef = deriveSupabaseProjectRef(url);
  const expectedProjectRef = required(values, "BOTOLAGO_ADMIN_EXPECTED_PROJECT_REF");
  if (projectRef !== expectedProjectRef) {
    throw new AdminRuntimeError("admin_project_ref_mismatch");
  }
  if (environment === "local" && projectRef !== "local") {
    throw new AdminRuntimeError("admin_environment_mismatch");
  }
  if (environment !== "local" && projectRef === "local") {
    throw new AdminRuntimeError("admin_environment_mismatch");
  }
  if (environment === "production") {
    if (
      !production ||
      values[production.confirmationVariable]?.trim() !== production.requiredConfirmation
    ) {
      throw new AdminRuntimeError("production_not_authorized");
    }
  }
  return { environment: environment as AdminEnvironment, projectRef, url };
}

export function requireServerOnlyKey(
  values: RuntimeValues,
  name: "SUPABASE_SECRET_KEY" | "SUPABASE_SERVICE_ROLE_KEY",
  environment: AdminEnvironment,
): string {
  const key = required(values, name);
  if (
    key.startsWith("sb_publishable_") ||
    key.toLowerCase().includes("replace-me") ||
    key.toLowerCase().includes("<local-")
  ) {
    throw new AdminRuntimeError("server_credential_required");
  }
  if (environment !== "local" && !key.startsWith("sb_secret_") && !key.startsWith("eyJ")) {
    throw new AdminRuntimeError("server_credential_required");
  }
  return key;
}

export function createServerSupabaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    }
    if (
      (key.startsWith("sb_secret_") || key.startsWith("sb_publishable_")) &&
      headers.get("Authorization") === `Bearer ${key}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

export function maskRuntimeEmail(email: string): string {
  const separator = email.lastIndexOf("@");
  if (separator <= 0 || separator === email.length - 1) {
    throw new AdminRuntimeError("invalid_owner_email");
  }
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  const domainSeparator = domain.lastIndexOf(".");
  const domainName = domainSeparator > 0 ? domain.slice(0, domainSeparator) : domain;
  const suffix = domainSeparator > 0 ? domain.slice(domainSeparator) : "";
  return `${local.slice(0, 1)}***@${domainName.slice(0, 1)}***${suffix}`;
}

export function sanitizeOperatorReason(value: string | undefined): string {
  const reason = value?.trim() ?? "";
  if (
    reason.length < 8 ||
    reason.length > 500 ||
    /(password|access.?token|refresh.?token|secret|credential|api.?key|authorization)/i.test(reason)
  ) {
    throw new AdminRuntimeError("invalid_operator_reason");
  }
  return reason;
}
