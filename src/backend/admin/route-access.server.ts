import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/backend/generated/database.types";
import { IS_DEMO_MODE } from "@/config/app-mode";
import type { AdminPermission } from "./contracts";
import { AdminControlPlaneService } from "./control-plane-service";
import { requireAdminRoutePermission, resolveAdminRouteAccess } from "./route-access";
import { SupabaseAdminControlPlaneRepository } from "./supabase-control-plane-repository";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export async function loadAdminRouteAccessForRequest() {
  if (IS_DEMO_MODE) return { state: "backend_unavailable" as const };
  const request = getRequest();
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return { state: "backend_unavailable" as const };
  if (!token) return { state: "unauthenticated" as const };

  const client = createClient<Database>(url, publishableKey, {
    global: {
      fetch: createSupabaseFetch(publishableKey),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const repository = new SupabaseAdminControlPlaneRepository(
    client.schema("api") as unknown as ConstructorParameters<
      typeof SupabaseAdminControlPlaneRepository
    >[0],
  );
  const service = new AdminControlPlaneService(repository);

  return resolveAdminRouteAccess({
    verifyIdentity: async () => {
      const { data, error } = await client.auth.getClaims(token);
      const claims = data?.claims;
      const userId = claims?.sub;
      if (error || typeof userId !== "string") return null;
      return {
        userId,
        email: typeof claims?.email === "string" ? claims.email : null,
      };
    },
    loadContext: (userId) =>
      service.getCurrentStaffContext({
        actorId: userId,
        requestId: crypto.randomUUID(),
      }),
  });
}

export async function loadAdminRouteAccessForPermission(permission: AdminPermission) {
  const state = await loadAdminRouteAccessForRequest();
  return requireAdminRoutePermission(state, permission);
}
