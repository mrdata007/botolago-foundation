import { fr } from "@/i18n/dictionary-fr";
import { PEPITES_ENABLED } from "@/lib/feature-flags";
import type { AdminPermission } from "./contracts";

export type AdminConsoleRoute =
  | "/admin"
  | "/admin/staff"
  | "/admin/staff/$principalId"
  | "/admin/approvals"
  | "/admin/audit"
  | "/admin/security"
  | "/admin/news"
  | "/admin/prizes"
  | "/admin/users"
  | "/admin/users/$userId"
  | "/admin/pepites"
  | "/admin/pepites/donnees";

export type AdminConsoleSurface = "route" | "state" | "dialog";

export interface AdminConsoleScreenContract {
  readonly id: string;
  readonly route: AdminConsoleRoute;
  readonly surface: AdminConsoleSurface;
  readonly permission: AdminPermission | null;
  readonly apiOperations: readonly string[];
  readonly testId: string;
  readonly mfaRequired: boolean;
  readonly recentAuthRequired: boolean;
  readonly dualControl: boolean;
  readonly destructive: boolean;
  readonly labels: {
    readonly fr: string;
    readonly ar: string;
  };
}

// The frozen Phase 7C/7D security-console surface: every screen, dialog and
// state of the staff/approvals/audit/security flows, each pinned to an
// implemented `admin_*` RPC and to an MFA/recent-auth/dual-control decision
// taken in that phase. It is NOT an index of every route reachable under
// /admin -- later consoles (Editorial CMS and the rest) are gated by their own
// loaders and carry no Phase 7D security posture, so they do not belong here.
// Adding one would assert MFA/dual-control semantics nobody specified for it.
export const ADMIN_CONSOLE_SCREENS = [
  {
    id: "access-gate",
    route: "/admin",
    surface: "state",
    permission: null,
    apiOperations: ["get_my_staff_context"],
    testId: "admin-access-gate",
    mfaRequired: true,
    recentAuthRequired: false,
    dualControl: false,
    destructive: false,
    labels: { fr: "Contrôle d’accès", ar: "بوابة الوصول" },
  },
  {
    id: "home",
    route: "/admin",
    surface: "route",
    permission: null,
    apiOperations: ["get_my_staff_context"],
    testId: "admin-home",
    mfaRequired: true,
    recentAuthRequired: false,
    dualControl: false,
    destructive: false,
    labels: { fr: "Accueil Admin", ar: "الرئيسية الإدارية" },
  },
  {
    id: "staff-list",
    route: "/admin/staff",
    surface: "route",
    permission: "security.manage_staff",
    apiOperations: ["admin_list_staff_assignments"],
    testId: "admin-staff-list",
    mfaRequired: true,
    recentAuthRequired: false,
    dualControl: false,
    destructive: false,
    labels: { fr: "Personnel", ar: "طاقم الإدارة" },
  },
  {
    id: "user-eligibility-lookup",
    route: "/admin/staff",
    surface: "route",
    permission: "security.manage_staff",
    apiOperations: ["admin_resolve_staff_user_exact", "admin_create_staff_principal"],
    testId: "admin-user-eligibility",
    mfaRequired: true,
    recentAuthRequired: true,
    dualControl: false,
    destructive: false,
    labels: { fr: "Éligibilité du compte", ar: "أهلية الحساب" },
  },
  {
    id: "role-assignment",
    route: "/admin/staff",
    surface: "dialog",
    permission: "security.manage_staff",
    apiOperations: ["admin_assign_role"],
    testId: "admin-role-assignment",
    mfaRequired: true,
    recentAuthRequired: true,
    dualControl: false,
    destructive: false,
    labels: { fr: "Affecter un rôle", ar: "تعيين دور" },
  },
  {
    id: "platform-admin-request",
    route: "/admin/staff",
    surface: "dialog",
    permission: "security.manage_staff",
    apiOperations: ["admin_request_approval"],
    testId: "admin-platform-request",
    mfaRequired: true,
    recentAuthRequired: true,
    dualControl: true,
    destructive: false,
    labels: { fr: "Demander platform_admin", ar: "طلب platform_admin" },
  },
  {
    id: "staff-detail",
    route: "/admin/staff/$principalId",
    surface: "route",
    permission: "security.manage_staff",
    apiOperations: ["admin_get_staff_principal"],
    testId: "admin-staff-detail",
    mfaRequired: true,
    recentAuthRequired: false,
    dualControl: false,
    destructive: false,
    labels: { fr: "Détail du personnel", ar: "تفاصيل عضو الطاقم" },
  },
  {
    id: "assignments",
    route: "/admin/staff/$principalId",
    surface: "route",
    permission: "security.manage_staff",
    apiOperations: ["admin_list_active_assignments"],
    testId: "admin-assignments",
    mfaRequired: true,
    recentAuthRequired: false,
    dualControl: false,
    destructive: false,
    labels: { fr: "Affectations actives", ar: "التعيينات النشطة" },
  },
  {
    id: "assignment-history",
    route: "/admin/staff/$principalId",
    surface: "route",
    permission: "security.manage_staff",
    apiOperations: ["admin_list_assignment_history"],
    testId: "admin-assignment-history",
    mfaRequired: true,
    recentAuthRequired: false,
    dualControl: false,
    destructive: false,
    labels: { fr: "Historique des affectations", ar: "سجل التعيينات" },
  },
  {
    id: "emergency-revocation",
    route: "/admin/staff/$principalId",
    surface: "dialog",
    permission: "security.revoke_staff",
    apiOperations: ["admin_emergency_revoke_staff"],
    testId: "admin-emergency-revocation",
    mfaRequired: true,
    recentAuthRequired: true,
    dualControl: false,
    destructive: true,
    labels: { fr: "Révocation d’urgence", ar: "الإلغاء الطارئ" },
  },
  {
    id: "approvals-queue",
    route: "/admin/approvals",
    surface: "route",
    permission: "security.manage_staff",
    apiOperations: ["admin_list_approval_queue"],
    testId: "admin-approvals-queue",
    mfaRequired: true,
    recentAuthRequired: false,
    dualControl: true,
    destructive: false,
    labels: { fr: "File d’approbation", ar: "قائمة الموافقات" },
  },
  {
    id: "approval-detail",
    route: "/admin/approvals",
    surface: "route",
    permission: "security.manage_staff",
    apiOperations: [
      "admin_get_approval",
      "admin_approve_request",
      "admin_reject_request",
      "admin_cancel_request",
      "admin_execute_approved_platform_admin",
    ],
    testId: "admin-approval-detail",
    mfaRequired: true,
    recentAuthRequired: true,
    dualControl: true,
    destructive: false,
    labels: { fr: "Détail de l’approbation", ar: "تفاصيل الموافقة" },
  },
  {
    id: "audit-log",
    route: "/admin/audit",
    surface: "route",
    permission: "security.read_audit",
    apiOperations: ["admin_list_audit_events_v2"],
    testId: "admin-audit-log",
    mfaRequired: true,
    recentAuthRequired: false,
    dualControl: false,
    destructive: false,
    labels: { fr: "Journal d’audit", ar: "سجل التدقيق" },
  },
  {
    id: "security-status",
    route: "/admin/security",
    surface: "route",
    permission: "security.revoke_staff",
    apiOperations: ["admin_get_revocation_worker_health"],
    testId: "admin-security-status",
    mfaRequired: true,
    recentAuthRequired: false,
    dualControl: false,
    destructive: false,
    labels: { fr: "État de sécurité", ar: "حالة الأمان" },
  },
  {
    id: "revocation-status",
    route: "/admin/security",
    surface: "route",
    permission: "security.revoke_staff",
    apiOperations: ["admin_get_session_revocation_status"],
    testId: "admin-revocation-status",
    mfaRequired: true,
    recentAuthRequired: false,
    dualControl: false,
    destructive: false,
    labels: { fr: "État de révocation", ar: "حالة الإلغاء" },
  },
  {
    id: "worker-health",
    route: "/admin/security",
    surface: "route",
    permission: "security.revoke_staff",
    apiOperations: ["admin_get_revocation_worker_health"],
    testId: "admin-worker-health",
    mfaRequired: true,
    recentAuthRequired: false,
    dualControl: false,
    destructive: false,
    labels: { fr: "Santé du worker", ar: "سلامة العامل" },
  },
  {
    id: "mfa-required",
    route: "/admin",
    surface: "state",
    permission: null,
    apiOperations: ["get_my_staff_context"],
    testId: "admin-mfa-required",
    mfaRequired: true,
    recentAuthRequired: false,
    dualControl: false,
    destructive: false,
    labels: { fr: "MFA requise", ar: "المصادقة المتعددة مطلوبة" },
  },
  {
    id: "recent-auth-required",
    route: "/admin",
    surface: "state",
    permission: null,
    apiOperations: ["get_my_staff_context"],
    testId: "admin-recent-auth-required",
    mfaRequired: true,
    recentAuthRequired: true,
    dualControl: false,
    destructive: false,
    labels: { fr: "Réauthentification requise", ar: "إعادة المصادقة مطلوبة" },
  },
  {
    id: "suspended-revoked",
    route: "/admin",
    surface: "state",
    permission: null,
    apiOperations: ["get_my_staff_context"],
    testId: "admin-access-revoked",
    mfaRequired: true,
    recentAuthRequired: false,
    dualControl: false,
    destructive: false,
    labels: { fr: "Accès suspendu ou révoqué", ar: "الوصول معلّق أو ملغى" },
  },
  {
    id: "backend-unavailable",
    route: "/admin",
    surface: "state",
    permission: null,
    apiOperations: ["get_my_staff_context"],
    testId: "admin-backend-unavailable",
    mfaRequired: false,
    recentAuthRequired: false,
    dualControl: false,
    destructive: false,
    labels: { fr: "Backend indisponible", ar: "الخلفية غير متاحة" },
  },
  {
    id: "permission-denied",
    route: "/admin",
    surface: "state",
    permission: null,
    apiOperations: ["get_my_staff_context"],
    testId: "admin-permission-denied",
    mfaRequired: true,
    recentAuthRequired: false,
    dualControl: false,
    destructive: false,
    labels: { fr: "Permission refusée", ar: "الصلاحية مرفوضة" },
  },
] as const satisfies readonly AdminConsoleScreenContract[];

// Rendered by the Admin shell, filtered on the caller's server-resolved
// permissions: an entry here is a link, never an authority. Each target route
// re-checks its own permission in its loader.
export const ADMIN_CONSOLE_NAV_ITEMS = [
  {
    route: "/admin/staff",
    permission: "security.manage_staff",
    testId: "admin-nav-staff",
    labels: { fr: "Personnel", ar: "طاقم الإدارة" },
  },
  {
    route: "/admin/approvals",
    permission: "security.manage_staff",
    testId: "admin-nav-approvals",
    labels: { fr: "Approbations", ar: "الموافقات" },
  },
  {
    route: "/admin/audit",
    permission: "security.read_audit",
    testId: "admin-nav-audit",
    labels: { fr: "Audit", ar: "سجل الأمان" },
  },
  {
    route: "/admin/security",
    permission: "security.revoke_staff",
    testId: "admin-nav-security",
    labels: { fr: "Sécurité", ar: "الأمان" },
  },
  {
    route: "/admin/news",
    permission: "editorial.read",
    testId: "admin-nav-news",
    labels: { fr: "Actualités", ar: "الأخبار" },
  },
  {
    route: "/admin/users",
    permission: "users.read_support",
    testId: "admin-nav-users",
    labels: { fr: "Utilisateurs", ar: "المستخدمون" },
  },
  {
    route: "/admin/prizes",
    permission: "prizes.manage",
    testId: "admin-nav-prizes",
    labels: {
      fr: fr["prizes.admin.nav"],
      // Written out like the other items' labels: importing the Arabic
      // dictionary here put all of it in every page's first download, because
      // the admin shell's loading screen stays in the main bundle.
      // admin-console-contracts.test.ts checks it against the dictionary.
      ar: "الجوائز",
    },
  },
  // Pépites: only in a build where Pépites is on (`PEPITES_ENABLED`), like
  // its public pages.
  ...(PEPITES_ENABLED
    ? ([
        {
          route: "/admin/pepites",
          permission: "pepites.edit",
          testId: "admin-nav-pepites",
          labels: { fr: "Pépites", ar: "Pépites" },
        },
        {
          route: "/admin/pepites/donnees",
          permission: "football.read_operations",
          testId: "admin-nav-pepites-data",
          labels: { fr: "Données joueurs", ar: "بيانات اللاعبين" },
        },
      ] as const)
    : ([] as const)),
] as const satisfies readonly {
  readonly route: Exclude<
    AdminConsoleRoute,
    "/admin" | "/admin/staff/$principalId" | "/admin/users/$userId"
  >;
  readonly permission: AdminPermission;
  readonly testId: string;
  readonly labels: { readonly fr: string; readonly ar: string };
}[];

export const ADMIN_STATE_TEST_IDS = {
  loading: "admin-access-gate",
  unauthenticated: "admin-access-gate",
  forbidden: "admin-permission-denied",
  mfa_required: "admin-mfa-required",
  recent_auth_required: "admin-recent-auth-required",
  suspended: "admin-access-revoked",
  revoked: "admin-access-revoked",
  backend_unavailable: "admin-backend-unavailable",
  authorized: "admin-home",
} as const;
