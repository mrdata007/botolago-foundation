import { describe, expect, it } from "bun:test";
import {
  ADMIN_CONSOLE_NAV_ITEMS,
  ADMIN_CONSOLE_SCREENS,
  ADMIN_STATE_TEST_IDS,
  type AdminConsoleRoute,
} from "./admin-console-contracts";
import { getAdminCopy } from "./route-access";

const IMPLEMENTED_ROUTES = new Set([
  "/admin",
  "/admin/staff",
  "/admin/staff/$principalId",
  "/admin/approvals",
  "/admin/audit",
  "/admin/security",
  "/admin/news",
  "/admin/prizes",
  "/admin/users",
  "/admin/users/$userId",
]);

/**
 * The route file that owns each console route, relative to this test.
 *
 * Typed as a total `Record<AdminConsoleRoute, string>`, so a route added to
 * the contract without a file here fails to compile rather than quietly
 * dropping out of the checks below. Every console route currently has one --
 * there is no screen without a route file, and nothing here is allowed to
 * fall back to "not checked" if that ever changes.
 */
const SCREEN_ROUTE_FILES: Record<AdminConsoleRoute, string> = {
  "/admin": "../../routes/admin.tsx",
  "/admin/staff": "../../routes/admin.staff.tsx",
  "/admin/staff/$principalId": "../../routes/admin.staff.$principalId.tsx",
  "/admin/approvals": "../../routes/admin.approvals.tsx",
  "/admin/audit": "../../routes/admin.audit.tsx",
  "/admin/security": "../../routes/admin.security.tsx",
  "/admin/news": "../../routes/admin.news.tsx",
  "/admin/prizes": "../../routes/admin.prizes.tsx",
  "/admin/users": "../../routes/admin.users.tsx",
  "/admin/users/$userId": "../../routes/admin.users.$userId.tsx",
};

/** Route sources only. `admin-console-contracts.ts` is deliberately NOT read
 *  here: joining it in is what made the old version of the last test pass on
 *  nothing but its own definitions. */
async function readRouteSources(): Promise<Record<AdminConsoleRoute, string>> {
  const entries = await Promise.all(
    (Object.keys(SCREEN_ROUTE_FILES) as AdminConsoleRoute[]).map(
      async (route) =>
        [
          route,
          await Bun.file(new URL(SCREEN_ROUTE_FILES[route], import.meta.url)).text(),
        ] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<AdminConsoleRoute, string>;
}

/**
 * Does this route source actually render that browser hook?
 *
 * Two forms count, and only these two: the DOM attribute itself, and the
 * `testId` prop of a shared Admin surface (`AdminFunctionalRoute`,
 * `AdminSummaryCard`, `AdminEmptyState`, `AdminNotice`...), each of which
 * spreads the value straight onto `data-testid`. Both require the exact
 * string with its closing quote, so `admin-assignments` is not satisfied by
 * `admin-assignments-empty`.
 */
function rendersTestId(source: string, testId: string): boolean {
  return source.includes(`data-testid="${testId}"`) || source.includes(`testId="${testId}"`);
}

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
    expect(visibleTo(["prizes.manage"])).toEqual(["admin-nav-prizes"]);
    expect(visibleTo(["fantasy.manage_rankings"])).not.toContain("admin-nav-prizes");
    expect(visibleTo(["users.read_support"])).toEqual(["admin-nav-users"]);
    // Moderating without reading is not a combination any role grants, and the
    // nav follows the page's own gate: the directory is a read surface.
    expect(visibleTo(["users.moderate"])).not.toContain("admin-nav-users");
  });

  it("links the user directory from the nav, gated on users.read_support", () => {
    const users = ADMIN_CONSOLE_NAV_ITEMS.find((item) => item.route === "/admin/users");
    expect(users?.permission).toBe("users.read_support");
    expect(users?.testId).toBe("admin-nav-users");
    expect(users?.labels.fr).toBe("Utilisateurs");
    expect(users?.labels.ar).toBe("المستخدمون");
    expect(ADMIN_CONSOLE_SCREENS.some((screen) => screen.route === "/admin/users")).toBe(false);
  });

  it("links the prize console from the nav, gated on prizes.manage", () => {
    const prizes = ADMIN_CONSOLE_NAV_ITEMS.find((item) => item.route === "/admin/prizes");
    expect(prizes?.permission).toBe("prizes.manage");
    expect(prizes?.testId).toBe("admin-nav-prizes");
    expect(prizes?.labels.fr).toBe("Lots");
    expect(prizes?.labels.ar).toBe("الجوائز");
    expect(ADMIN_CONSOLE_SCREENS.some((screen) => screen.route === "/admin/prizes")).toBe(false);
  });

  it("points every nav entry at an implemented route file", async () => {
    const sources = await readRouteSources();
    for (const item of ADMIN_CONSOLE_NAV_ITEMS) {
      expect(IMPLEMENTED_ROUTES.has(item.route)).toBe(true);
      const source = sources[item.route];
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

  // The test that used to stand here joined `admin-console-contracts.ts` into
  // the sources it searched and then asserted `source.includes(screen.testId)`.
  // Every testId matched its own definition in that file, so the whole block
  // passed with no route rendering anything at all. The four tests below check
  // the thing it claimed to: that the route component owning a screen carries
  // that screen's hook, read from the ROUTE source only.

  it("renders every route and dialog screen's testId in the route that owns it", async () => {
    const sources = await readRouteSources();
    const owned = ADMIN_CONSOLE_SCREENS.filter((screen) => screen.surface !== "state");
    // Guard against a vacuous pass if the contract is ever emptied or if the
    // surfaces are all reclassified as "state".
    expect(owned.length).toBeGreaterThanOrEqual(15);

    const missing = owned
      .filter((screen) => !rendersTestId(sources[screen.route], screen.testId))
      .map(
        (screen) => `${screen.id} -> ${screen.testId} not in ${SCREEN_ROUTE_FILES[screen.route]}`,
      );
    expect(missing).toEqual([]);
  });

  it("renders every access-state screen through the map /admin actually applies", async () => {
    const shell = (await readRouteSources())["/admin"];
    // The /admin access states are the one indirection: the shell renders a
    // single panel whose hook is looked up in ADMIN_STATE_TEST_IDS. That is
    // asserted here rather than waved through.
    expect(shell).toContain("ADMIN_STATE_TEST_IDS");
    expect(shell).toContain("data-testid={ADMIN_STATE_TEST_IDS[state]}");
    expect(shell).toContain("<AdminStatePanel");

    const stateScreens = ADMIN_CONSOLE_SCREENS.filter((screen) => screen.surface === "state");
    expect(stateScreens.length).toBeGreaterThanOrEqual(5);
    const reachable = new Set<string>(Object.values(ADMIN_STATE_TEST_IDS));
    for (const screen of stateScreens) {
      expect(screen.route).toBe("/admin");
      // Reachable means: some access state the loader can return maps to it.
      expect(reachable.has(screen.testId)).toBe(true);
    }

    // And nothing in the other direction either: every hook the shell can
    // render is a screen the contract declares on /admin.
    const declaredOnShell = new Set(
      ADMIN_CONSOLE_SCREENS.filter((screen) => screen.route === "/admin").map(
        (screen) => screen.testId,
      ),
    );
    for (const testId of reachable) expect(declaredOnShell.has(testId)).toBe(true);

    // Every state the route can be in has an entry, so no state renders
    // `data-testid={undefined}`. The state names are taken from the copy
    // table, which is keyed by `AdminRouteStateName | "loading"`.
    for (const state of Object.keys(getAdminCopy("fr").states)) {
      expect(Object.keys(ADMIN_STATE_TEST_IDS)).toContain(state);
    }
  });

  it("renders the console nav from the contract list, in the shell", async () => {
    const shell = (await readRouteSources())["/admin"];
    expect(shell).toContain("ADMIN_CONSOLE_NAV_ITEMS");
    expect(shell).toContain('data-testid="admin-navigation"');
    // Driven by the list, not by five hand-written links, so a contract entry
    // cannot exist without a link.
    expect(shell).toContain("data-testid={item.testId}");
    expect(shell).toMatch(/ADMIN_CONSOLE_NAV_ITEMS[\s\S]{0,400}\.map\(\(item\)/);
    expect(ADMIN_CONSOLE_NAV_ITEMS.length).toBeGreaterThanOrEqual(5);
  });

  it("can fail: a hook no route renders is not found", async () => {
    const sources = await readRouteSources();
    // The negative control the old test lacked. If this ever passes for a
    // made-up hook, `rendersTestId` has stopped discriminating and every
    // assertion above is worthless.
    for (const source of Object.values(sources)) {
      expect(rendersTestId(source, "admin-screen-that-does-not-exist")).toBe(false);
      // A testId is never satisfied by a longer one that merely starts with it.
      expect(rendersTestId(source, "admin-news-item-slug-extra")).toBe(false);
    }
    // Nothing read here is the contract module itself.
    for (const file of Object.values(SCREEN_ROUTE_FILES)) {
      expect(file.startsWith("../../routes/")).toBe(true);
    }
    // And no contract testId is defined inside a route file, which would let
    // a route "render" a hook only by declaring it.
    for (const source of Object.values(sources)) {
      expect(source).not.toContain("ADMIN_CONSOLE_SCREENS = [");
    }
  });
});

describe("the prizes item's Arabic label", () => {
  it("is the Arabic dictionary's", async () => {
    const { ar } = await import("@/i18n/dictionary-ar");
    const item = ADMIN_CONSOLE_NAV_ITEMS.find((entry) => entry.route === "/admin/prizes");
    expect(item?.labels.ar).toBe(ar["prizes.admin.nav"]);
  });
});
