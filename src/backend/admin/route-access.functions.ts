import { createServerFn } from "@tanstack/react-start";
import { adminRouteStateSchema } from "./route-access";

export const loadAdminRouteAccess = createServerFn({ method: "POST" }).handler(async () => {
  const { loadAdminRouteAccessForRequest } = await import("./route-access.server");
  return adminRouteStateSchema.parse(await loadAdminRouteAccessForRequest());
});

export const loadAdminStaffRouteAccess = createServerFn({ method: "POST" }).handler(async () => {
  const { loadAdminRouteAccessForPermission } = await import("./route-access.server");
  return adminRouteStateSchema.parse(
    await loadAdminRouteAccessForPermission("security.manage_staff"),
  );
});

export const loadAdminAuditRouteAccess = createServerFn({ method: "POST" }).handler(async () => {
  const { loadAdminRouteAccessForPermission } = await import("./route-access.server");
  return adminRouteStateSchema.parse(
    await loadAdminRouteAccessForPermission("security.read_audit"),
  );
});

export const loadAdminSecurityRouteAccess = createServerFn({ method: "POST" }).handler(async () => {
  const { loadAdminRouteAccessForPermission } = await import("./route-access.server");
  return adminRouteStateSchema.parse(
    await loadAdminRouteAccessForPermission("security.revoke_staff"),
  );
});
