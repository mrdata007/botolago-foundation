import { describe, expect, it } from "bun:test";
import { ADMIN_CONSOLE_NAV_ITEMS, ADMIN_CONSOLE_SCREENS } from "./admin-console-contracts";

const IMPLEMENTED_ROUTES = new Set([
  "/admin",
  "/admin/staff",
  "/admin/staff/$principalId",
  "/admin/approvals",
  "/admin/audit",
  "/admin/security",
  "/admin/news",
]);

// Route files backing each console nav target, relative to this test.
const NAV_ROUTE_FILES: Record<string, string> = {
  "/admin/staff": "../../routes/admin.staff.tsx",
  "/admin/approvals": "../../routes/admin.approvals.tsx",
  "/admin/audit": "../../routes/admin.audit.tsx",
  "/admin/security": "../../routes/admin.security.tsx",
  "/admin/news": "../../routes/admin.news.tsx",
};

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

  it("links the News CMS from the console nav, gated on editorial.read", () => {
    const news = ADMIN_CONSOLE_NAV_ITEMS.find((item) => item.route === "/admin/news");
    expect(news).toBeDefined();
    expect(news?.permission).toBe("editorial.read");
    expect(news?.testId).toBe("admin-nav-news");
    expect(news?.labels.fr).toBe("Actualités");
    expect(news?.labels.ar).toBe("الأخبار");
  });

  it("shows a nav entry only to a principal holding its permission", () => {
    // Mirrors the filter the Admin shell applies to ADMIN_CONSOLE_NAV_ITEMS.
    const visibleTo = (permissions: readonly string[]) =>
      ADMIN_CONSOLE_NAV_ITEMS.filter((item) => permissions.includes(item.permission)).map(
        (item) => item.testId,
      );

    expect(visibleTo(["editorial.read"])).toEqual(["admin-nav-news"]);
    expect(visibleTo(["editorial.write"])).toEqual([]);
    expect(visibleTo([])).toEqual([]);
    expect(visibleTo(["security.manage_staff"])).not.toContain("admin-nav-news");
    expect(visibleTo(["security.read_audit", "editorial.read"])).toEqual([
      "admin-nav-audit",
      "admin-nav-news",
    ]);
  });

  it("points every nav entry at an implemented route file", async () => {
    for (const item of ADMIN_CONSOLE_NAV_ITEMS) {
      expect(IMPLEMENTED_ROUTES.has(item.route)).toBe(true);
      const file = NAV_ROUTE_FILES[item.route];
      expect(file).toBeDefined();
      const source = await Bun.file(new URL(file, import.meta.url)).text();
      expect(source).toContain(`createFileRoute("${item.route}")`);
      // The link is never the authority: the route re-checks access server-side.
      expect(source).toContain("loader:");
    }
  });

  it("keeps ADMIN_CONSOLE_SCREENS scoped to the frozen security surface", () => {
    // Deliberate: the screens contract pins Phase 7C/7D security screens to
    // `admin_*` RPCs and MFA/dual-control decisions. The Editorial CMS is not
    // part of it, so /admin/news is a nav target only.
    expect(ADMIN_CONSOLE_SCREENS.some((screen) => screen.route === "/admin/news")).toBe(false);
    for (const screen of ADMIN_CONSOLE_SCREENS) {
      expect(screen.apiOperations.every((operation) => operation.startsWith("admin_"))).toBe(
        screen.permission !== null,
      );
    }
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
