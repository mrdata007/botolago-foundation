import { describe, expect, it } from "bun:test";
import { ADMIN_CONSOLE_NAV_ITEMS, ADMIN_CONSOLE_SCREENS } from "./admin-console-contracts";

const IMPLEMENTED_ROUTES = new Set([
  "/admin",
  "/admin/staff",
  "/admin/staff/$principalId",
  "/admin/approvals",
  "/admin/audit",
  "/admin/security",
]);

const IMPLEMENTED_OPERATIONS = new Set([
  "get_my_staff_context",
  "admin_list_staff_assignments",
  "admin_resolve_staff_user_exact",
  "admin_create_staff_principal",
  "admin_assign_role",
  "admin_request_approval",
  "admin_get_staff_principal",
  "admin_list_active_assignments",
  "admin_list_assignment_history",
  "admin_emergency_revoke_staff",
  "admin_list_approval_queue",
  "admin_get_approval",
  "admin_approve_request",
  "admin_reject_request",
  "admin_cancel_request",
  "admin_execute_approved_platform_admin",
  "admin_list_audit_events_v2",
  "admin_get_revocation_worker_health",
  "admin_get_session_revocation_status",
]);

describe("Frozen Admin Console contracts", () => {
  it("maps every screen to an implemented route and API contract", () => {
    for (const screen of ADMIN_CONSOLE_SCREENS) {
      expect(IMPLEMENTED_ROUTES.has(screen.route)).toBe(true);
      expect(screen.apiOperations.length).toBeGreaterThan(0);
      for (const operation of screen.apiOperations) {
        expect(IMPLEMENTED_OPERATIONS.has(operation)).toBe(true);
      }
    }
  });

  it("provides complete French/Arabic labels and unique browser test IDs", () => {
    const ids = new Set<string>();
    for (const screen of ADMIN_CONSOLE_SCREENS) {
      expect(screen.labels.fr.trim().length).toBeGreaterThan(0);
      expect(screen.labels.ar.trim().length).toBeGreaterThan(0);
      expect(ids.has(screen.testId)).toBe(false);
      ids.add(screen.testId);
    }
    for (const item of ADMIN_CONSOLE_NAV_ITEMS) {
      expect(item.labels.fr.trim().length).toBeGreaterThan(0);
      expect(item.labels.ar.trim().length).toBeGreaterThan(0);
      expect(ids.has(item.testId)).toBe(false);
      ids.add(item.testId);
    }
  });

  it("marks every destructive action as MFA and recent-auth protected", () => {
    const destructive = ADMIN_CONSOLE_SCREENS.filter((screen) => screen.destructive);
    expect(destructive.length).toBeGreaterThan(0);
    for (const screen of destructive) {
      expect(screen.mfaRequired).toBe(true);
      expect(screen.recentAuthRequired).toBe(true);
    }
  });

  it("keeps dual-control screens on server-backed approval operations", () => {
    const dualControl = ADMIN_CONSOLE_SCREENS.filter((screen) => screen.dualControl);
    expect(dualControl.length).toBeGreaterThan(0);
    expect(
      dualControl.every((screen) =>
        screen.apiOperations.some(
          (operation) =>
            operation.includes("approval") ||
            operation === "admin_request_approval" ||
            operation === "admin_execute_approved_platform_admin",
        ),
      ),
    ).toBe(true);
  });

  it("wires every frozen browser hook into the functional Admin shell", async () => {
    const source = (
      await Promise.all([
        Bun.file(new URL("./admin-console-contracts.ts", import.meta.url)).text(),
        Bun.file(new URL("../../routes/admin.tsx", import.meta.url)).text(),
        Bun.file(new URL("../../routes/admin.staff.tsx", import.meta.url)).text(),
        Bun.file(new URL("../../routes/admin.staff.$principalId.tsx", import.meta.url)).text(),
        Bun.file(new URL("../../routes/admin.approvals.tsx", import.meta.url)).text(),
        Bun.file(new URL("../../routes/admin.audit.tsx", import.meta.url)).text(),
        Bun.file(new URL("../../routes/admin.security.tsx", import.meta.url)).text(),
      ])
    ).join("\n");
    expect(source).toContain("data-testid={ADMIN_STATE_TEST_IDS[state]}");
    expect(source).toContain("data-testid={item.testId}");
    for (const screen of ADMIN_CONSOLE_SCREENS) {
      expect(source).toContain(screen.testId);
    }
    for (const item of ADMIN_CONSOLE_NAV_ITEMS) {
      expect(source).toContain(item.testId);
    }
  });
});
