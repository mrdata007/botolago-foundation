export const MAX_DELETION_BATCH_SIZE = 25;
export const MAX_AVATAR_OBJECTS_PER_USER = 32;

export type AccountDeletionFailureCode =
  | "avatar_list_failed"
  | "avatar_limit_exceeded"
  | "avatar_shape_unexpected"
  | "avatar_delete_failed"
  | "auth_delete_failed"
  | "unexpected_worker_failure";

export class AccountDeletionStepError extends Error {
  readonly code: AccountDeletionFailureCode | "failure_record_unavailable";

  constructor(code: AccountDeletionFailureCode | "failure_record_unavailable") {
    super(code);
    this.name = "AccountDeletionStepError";
    this.code = code;
  }
}

class AccountDeletionRequestError extends Error {}

export interface AccountDeletionPreview {
  readonly due: number;
  readonly ready: number;
  readonly blocked: number;
  readonly reconcile: number;
}

export type AccountDeletionClaim =
  | { readonly action: "none" }
  | { readonly action: "blocked" }
  | {
      readonly action: "delete" | "finalize";
      readonly requestId: string;
      readonly userId: string;
      readonly claimToken: string;
    };

export interface AccountDeletionGateway {
  preview(limit: number): Promise<AccountDeletionPreview>;
  claim(workerId: string, leaseSeconds: number): Promise<AccountDeletionClaim>;
  listAvatarPaths(userId: string): Promise<readonly string[]>;
  deleteAvatarPaths(paths: readonly string[]): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
  finalize(requestId: string, claimToken: string): Promise<void>;
  fail(
    requestId: string,
    claimToken: string,
    code: AccountDeletionFailureCode,
  ): Promise<{ readonly completed: boolean }>;
}

export interface AccountDeletionRunResult {
  readonly mode: "execute";
  readonly claimed: number;
  readonly completed: number;
  readonly reconciled: number;
  readonly failed: number;
  readonly blocked: number;
  readonly remainingMayExist: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertExecutionSettings(limit: number, leaseSeconds: number, workerId: string): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_DELETION_BATCH_SIZE) {
    throw new AccountDeletionStepError("unexpected_worker_failure");
  }
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 600) {
    throw new AccountDeletionStepError("unexpected_worker_failure");
  }
  if (!UUID_PATTERN.test(workerId)) {
    throw new AccountDeletionStepError("unexpected_worker_failure");
  }
}

function failureCode(error: unknown): AccountDeletionFailureCode {
  return error instanceof AccountDeletionStepError && error.code !== "failure_record_unavailable"
    ? error.code
    : "unexpected_worker_failure";
}

function validateAvatarPaths(userId: string, paths: readonly string[]): void {
  if (paths.length > MAX_AVATAR_OBJECTS_PER_USER) {
    throw new AccountDeletionStepError("avatar_limit_exceeded");
  }
  const escapedUserId = userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expected = new RegExp(`^${escapedUserId}/avatar\\.(?:jpg|jpeg|png|webp)$`, "i");
  if (!UUID_PATTERN.test(userId) || paths.some((path) => !expected.test(path))) {
    throw new AccountDeletionStepError("avatar_shape_unexpected");
  }
}

/**
 * Executes a bounded batch. A claimed job is never reported as completed until
 * the database finalize RPC verifies that the Auth user is actually absent.
 */
export async function executeAccountDeletionBatch(
  gateway: AccountDeletionGateway,
  options: {
    readonly limit: number;
    readonly leaseSeconds: number;
    readonly workerId: string;
  },
): Promise<AccountDeletionRunResult> {
  assertExecutionSettings(options.limit, options.leaseSeconds, options.workerId);
  let claimed = 0;
  let completed = 0;
  let reconciled = 0;
  let failed = 0;
  let blocked = 0;
  let exhausted = true;

  for (let index = 0; index < options.limit; index += 1) {
    const claim = await gateway.claim(options.workerId, options.leaseSeconds);
    if (claim.action === "none") {
      exhausted = false;
      break;
    }
    claimed += 1;

    if (claim.action === "blocked") {
      blocked += 1;
      continue;
    }

    if (claim.action === "finalize") {
      await gateway.finalize(claim.requestId, claim.claimToken);
      completed += 1;
      reconciled += 1;
      continue;
    }

    try {
      const avatarPaths = await gateway.listAvatarPaths(claim.userId);
      validateAvatarPaths(claim.userId, avatarPaths);
      if (avatarPaths.length > 0) await gateway.deleteAvatarPaths(avatarPaths);
      await gateway.deleteAuthUser(claim.userId);
      await gateway.finalize(claim.requestId, claim.claimToken);
      completed += 1;
    } catch (error: unknown) {
      let failureResult: { readonly completed: boolean };
      try {
        failureResult = await gateway.fail(claim.requestId, claim.claimToken, failureCode(error));
      } catch {
        throw new AccountDeletionStepError("failure_record_unavailable");
      }
      if (failureResult.completed) {
        completed += 1;
        reconciled += 1;
      } else {
        failed += 1;
      }
    }
  }

  return {
    mode: "execute",
    claimed,
    completed,
    reconciled,
    failed,
    blocked,
    remainingMayExist: exhausted,
  };
}

export function constantTimeSecretEqual(candidate: string | null, expected: string): boolean {
  if (expected.length < 32 || expected.length > 128 || !candidate || candidate.length > 128) {
    return false;
  }
  const encoder = new TextEncoder();
  const left = encoder.encode(candidate);
  const right = encoder.encode(expected);
  let difference = left.length ^ right.length;
  for (let index = 0; index < 128; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

type ParsedRequest =
  | { readonly mode: "dry-run"; readonly limit: number }
  | { readonly mode: "execute"; readonly limit: number };

async function parseRequest(request: Request): Promise<ParsedRequest> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 1024) {
    throw new AccountDeletionRequestError("request_too_large");
  }
  let value: unknown;
  try {
    value = text ? JSON.parse(text) : null;
  } catch {
    throw new AccountDeletionRequestError("invalid_request");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountDeletionRequestError("invalid_request");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(["mode", "limit", "confirmation"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new AccountDeletionRequestError("invalid_request");
  }
  const limit = record.limit === undefined ? MAX_DELETION_BATCH_SIZE : record.limit;
  if (
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_DELETION_BATCH_SIZE
  ) {
    throw new AccountDeletionRequestError("invalid_request");
  }
  if (record.mode === "dry-run" && record.confirmation === undefined) {
    return { mode: "dry-run", limit };
  }
  if (record.mode === "execute" && record.confirmation === "DELETE_DUE_ACCOUNTS") {
    return { mode: "execute", limit };
  }
  throw new AccountDeletionRequestError("invalid_request");
}

export async function handleAccountDeletionWorkerRequest(
  request: Request,
  dependencies: {
    readonly workerSecret: string;
    readonly gateway: AccountDeletionGateway;
    readonly randomUUID?: () => string;
  },
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(405, { ok: false, code: "method_not_allowed" });
  }
  if (
    !constantTimeSecretEqual(
      request.headers.get("x-botolago-account-deletion-key"),
      dependencies.workerSecret,
    )
  ) {
    return jsonResponse(401, { ok: false, code: "unauthorized" });
  }

  try {
    const command = await parseRequest(request);
    if (command.mode === "dry-run") {
      const preview = await dependencies.gateway.preview(command.limit);
      return jsonResponse(200, { ok: true, mode: "dry-run", ...preview });
    }

    const result = await executeAccountDeletionBatch(dependencies.gateway, {
      limit: command.limit,
      leaseSeconds: 120,
      workerId: (dependencies.randomUUID ?? (() => crypto.randomUUID()))(),
    });
    return jsonResponse(200, { ok: true, ...result });
  } catch (error: unknown) {
    if (error instanceof AccountDeletionRequestError) {
      return jsonResponse(400, { ok: false, code: error.message });
    }
    const code =
      error instanceof AccountDeletionStepError ? error.code : "account_deletion_worker_failed";
    return jsonResponse(500, { ok: false, code });
  }
}
