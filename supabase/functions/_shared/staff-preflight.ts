// A cheap staff pre-flight for Edge Functions that act for a signed-in staff
// member: authenticate → THIS → read the body → execute.
//
// It never replaces the authorization in the database. The RPC each function
// finally calls as the caller (has_editorial_role, admin_assert_permission,
// assert_mfa_step_up) still decides. What the pre-flight adds is ordering: a
// signed-in account that could never pass that gate is refused before its
// request body is read, parsed, sanitized or buffered, and before any
// service-role call is made on its behalf.
//
// `api.get_my_staff_context()`, called with the caller's own JWT, raises for
// a non-staff caller and reports `accessAllowed` (active principal, verified
// e-mail, enrolled MFA and an aal2 session) plus the effective permission
// list. Every permission checked here requires MFA in the database
// (app_private.admin_permissions.requires_mfa) or is an editorial role, so
// requiring `accessAllowed` is never stricter than the database's own gate.
// Anything the context does not positively confirm counts as refused.

export const EDITORIAL_WRITE_PERMISSIONS = ["editorial.write", "editorial.publish"] as const;
export const PLAYER_PHOTO_PERMISSIONS = ["football.correct"] as const;

export function staffContextAllows(context: unknown, anyOf: readonly string[]): boolean {
  if (!context || typeof context !== "object") return false;
  const { accessAllowed, permissions } = context as {
    accessAllowed?: unknown;
    permissions?: unknown;
  };
  if (accessAllowed !== true || !Array.isArray(permissions)) return false;
  return permissions.some(
    (permission) => typeof permission === "string" && anyOf.includes(permission),
  );
}

interface StaffContextClient {
  schema(name: "api"): {
    rpc(
      name: string,
      args: Record<string, unknown>,
    ): PromiseLike<{ data: unknown; error: unknown }>;
  };
}

// True only when the caller's own staff context grants one of `anyOf`.
export async function callerMayAct(
  userClient: StaffContextClient,
  anyOf: readonly string[],
): Promise<boolean> {
  try {
    const result = await userClient.schema("api").rpc("get_my_staff_context", {});
    return !result.error && staffContextAllows(result.data, anyOf);
  } catch {
    return false;
  }
}
