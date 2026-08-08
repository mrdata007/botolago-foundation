import { createServerFn } from "@tanstack/react-start";
import { IS_DEMO_MODE } from "@/config/app-mode";
import { adminRouteStateSchema } from "./route-access";

function demoUnavailable() {
  return adminRouteStateSchema.parse({ state: "backend_unavailable" });
}

export const loadAdminRouteAccess = createServerFn({ method: "POST" }).handler(async () => {
  if (IS_DEMO_MODE) return demoUnavailable();
  const { loadAdminRouteAccessForRequest } = await import("./route-access.server");
  return adminRouteStateSchema.parse(await loadAdminRouteAccessForRequest());
});

export const loadAdminStaffRouteAccess = createServerFn({ method: "POST" }).handler(async () => {
  if (IS_DEMO_MODE) return demoUnavailable();
  const { loadAdminRouteAccessForPermission } = await import("./route-access.server");
  return adminRouteStateSchema.parse(
    await loadAdminRouteAccessForPermission("security.manage_staff"),
  );
});

export const loadAdminAuditRouteAccess = createServerFn({ method: "POST" }).handler(async () => {
  if (IS_DEMO_MODE) return demoUnavailable();
  const { loadAdminRouteAccessForPermission } = await import("./route-access.server");
  return adminRouteStateSchema.parse(
    await loadAdminRouteAccessForPermission("security.read_audit"),
  );
});

export const loadAdminSecurityRouteAccess = createServerFn({ method: "POST" }).handler(async () => {
  if (IS_DEMO_MODE) return demoUnavailable();
  const { loadAdminRouteAccessForPermission } = await import("./route-access.server");
  return adminRouteStateSchema.parse(
    await loadAdminRouteAccessForPermission("security.revoke_staff"),
  );
});
