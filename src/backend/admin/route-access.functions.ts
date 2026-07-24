import { createServerFn } from "@tanstack/react-start";
import { adminRouteStateSchema } from "./route-access";

export const loadAdminRouteAccess = createServerFn({ method: "POST" }).handler(async () => {
  const { loadAdminRouteAccessForRequest } = await import("./route-access.server");
  return adminRouteStateSchema.parse(await loadAdminRouteAccessForRequest());
});
