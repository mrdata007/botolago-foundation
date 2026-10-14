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
  | "/admin/stories"
  | "/admin/prizes"
  | "/admin/plus"
  | "/admin/users"
  | "/admin/users/$userId"
  | "/admin/pepites"
  | "/admin/pepites/donnees"
  | "/admin/football/player-mappings"
  | "/admin/football/sofascore-players";

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

export type AdminNavGroupId = "team" | "content" | "community" | "plus" | "football";

/** The icon an entry is drawn with. A key, not a component: this file stays free of React. */
export type AdminNavIcon =
  | "staff"
  | "approvals"
  | "audit"
  | "security"
  | "stories"
  | "news"
  | "pepites"
  | "prizes"
  | "users"
  | "plus"
  | "data"
  | "mapping"
  | "players";

/** The nav's groups, in display order. A group with no visible entry is not drawn. */
export const ADMIN_CONSOLE_NAV_GROUPS = [
  { id: "team", labels: { fr: "Équipe", ar: "الفريق" } },
  { id: "content", labels: { fr: "Contenu", ar: "المحتوى" } },
  { id: "community", labels: { fr: "Communauté", ar: "المجتمع" } },
  { id: "plus", labels: { fr: "Abonnements", ar: "الاشتراكات" } },
  { id: "football", labels: { fr: "Football", ar: "كرة القدم" } },
] as const satisfies readonly {
  readonly id: AdminNavGroupId;
  readonly labels: { readonly fr: string; readonly ar: string };
}[];

// Rendered by the Admin shell, filtered on the caller's server-resolved
// permissions: an entry here is a link, never an authority. Each target route
// re-checks its own permission in its loader.
//
// The list is in display order and grouped: the shell's chips and the home
// page's cards are both drawn from it, so a new entry appears in both on its
// own. `hint` is the one line the home card carries under the label.
export const ADMIN_CONSOLE_NAV_ITEMS = [
  // Équipe
  {
    route: "/admin/staff",
    permission: "security.manage_staff",
    testId: "admin-nav-staff",
    group: "team",
    icon: "staff",
    labels: { fr: "Personnel", ar: "طاقم الإدارة" },
    hint: { fr: "Rôles et accès de l’équipe", ar: "أدوار الفريق وصلاحياته" },
  },
  {
    route: "/admin/approvals",
    permission: "security.manage_staff",
    testId: "admin-nav-approvals",
    group: "team",
    icon: "approvals",
    labels: { fr: "Approbations", ar: "الموافقات" },
    hint: { fr: "Demandes en attente d’une seconde personne", ar: "طلبات تنتظر موافقة شخص ثانٍ" },
  },
  {
    route: "/admin/audit",
    permission: "security.read_audit",
    testId: "admin-nav-audit",
    group: "team",
    icon: "audit",
    labels: { fr: "Audit", ar: "سجل الأمان" },
    hint: { fr: "Qui a fait quoi, et quand", ar: "من فعل ماذا ومتى" },
  },
  {
    route: "/admin/security",
    permission: "security.revoke_staff",
    testId: "admin-nav-security",
    group: "team",
    icon: "security",
    labels: { fr: "Sécurité", ar: "الأمان" },
    hint: { fr: "Révocation des sessions", ar: "إلغاء الجلسات" },
  },
  // Contenu
  {
    route: "/admin/stories",
    permission: "editorial.read",
    testId: "admin-nav-stories",
    group: "content",
    icon: "stories",
    labels: { fr: "Stories", ar: "القصص" },
    hint: { fr: "Les stories de l’accueil", ar: "قصص الصفحة الرئيسية" },
  },
  {
    route: "/admin/news",
    permission: "editorial.read",
    testId: "admin-nav-news",
    group: "content",
    icon: "news",
    labels: { fr: "Actualités", ar: "الأخبار" },
    hint: { fr: "Articles et éditions", ar: "المقالات والإصدارات" },
  },
  // Pépites: only in a build where Pépites is on (`PEPITES_ENABLED`), like
  // its public pages.
  ...(PEPITES_ENABLED
    ? ([
        {
          route: "/admin/pepites",
          permission: "pepites.edit",
          testId: "admin-nav-pepites",
          group: "content",
          icon: "pepites",
          labels: { fr: "Pépites", ar: "Pépites" },
          hint: { fr: "Les jeunes joueurs à suivre", ar: "اللاعبون الشباب المتابَعون" },
        },
      ] as const)
    : ([] as const)),
  // Communauté
  {
    route: "/admin/prizes",
    permission: "prizes.manage",
    testId: "admin-nav-prizes",
    group: "community",
    icon: "prizes",
    labels: {
      fr: fr["prizes.admin.nav"],
      // Written out like the other items' labels: importing the Arabic
      // dictionary here put all of it in every page's first download, because
      // the admin shell's loading screen stays in the main bundle.
      // admin-console-contracts.test.ts checks it against the dictionary.
      ar: "الجوائز",
    },
    hint: { fr: "Lots et gagnants", ar: "الجوائز والفائزون" },
  },
  {
    route: "/admin/users",
    permission: "users.read_support",
    testId: "admin-nav-users",
    group: "community",
    icon: "users",
    labels: { fr: "Utilisateurs", ar: "المستخدمون" },
    hint: { fr: "Retrouver un compte, aider un utilisateur", ar: "البحث عن حساب ومساعدة مستخدم" },
  },
  // Abonnements: counts, the audited member read, grants. Reading needs premium.read; grant and
  // revoke need premium.grant (recent authentication). The database checks both again. It sits
  // next to Utilisateurs: both are about one account.
  {
    route: "/admin/plus",
    permission: "premium.read",
    testId: "admin-nav-plus",
    group: "plus",
    icon: "plus",
    labels: { fr: "Abonnements", ar: "الاشتراكات" },
    hint: {
      fr: "Abonnés, offres du personnel, réglages",
      ar: "المشتركون وهدايا الفريق والإعدادات",
    },
  },
  // Football
  ...(PEPITES_ENABLED
    ? ([
        {
          route: "/admin/pepites/donnees",
          permission: "football.read_operations",
          testId: "admin-nav-pepites-data",
          group: "football",
          icon: "data",
          labels: { fr: "Données joueurs", ar: "بيانات اللاعبين" },
          hint: { fr: "Fiches et statistiques des joueurs", ar: "بطاقات اللاعبين وإحصاءاتهم" },
        },
      ] as const)
    : ([] as const)),
  // Player mapping: the reviewer queue for provider players. Reading needs
  // football.read_operations; proposing and approving need
  // football.manage_mappings, which the database checks on every call.
  {
    route: "/admin/football/player-mappings",
    permission: "football.read_operations",
    testId: "admin-nav-player-mappings",
    group: "football",
    icon: "mapping",
    labels: { fr: "Rapprochement joueurs", ar: "مطابقة اللاعبين" },
    hint: { fr: "Relier les joueurs du fournisseur aux nôtres", ar: "ربط لاعبي المزوّد بلاعبينا" },
  },
  // SofaScore players the automatic matcher held: confirm the right player.
  // Same rule as above: reading needs football.read_operations, confirming
  // needs football.manage_mappings, both checked again by the database.
  {
    route: "/admin/football/sofascore-players",
    permission: "football.read_operations",
    testId: "admin-nav-sofascore-players",
    group: "football",
    icon: "players",
    labels: { fr: "Joueurs SofaScore à confirmer", ar: "لاعبو SofaScore بانتظار التأكيد" },
    hint: { fr: "Confirmer le bon joueur", ar: "تأكيد اللاعب الصحيح" },
  },
] as const satisfies readonly {
  readonly route: Exclude<
    AdminConsoleRoute,
    "/admin" | "/admin/staff/$principalId" | "/admin/users/$userId"
  >;
  readonly permission: AdminPermission;
  readonly testId: string;
  readonly group: AdminNavGroupId;
  readonly icon: AdminNavIcon;
  readonly labels: { readonly fr: string; readonly ar: string };
  readonly hint: { readonly fr: string; readonly ar: string };
}[];

export type AdminNavItem = (typeof ADMIN_CONSOLE_NAV_ITEMS)[number];

/**
 * The entries a caller may see, in group order: one `{ group, items }` per group that has at least
 * one visible entry. Filtering is on the caller's own permissions; the target route checks again.
 */
export function groupAdminNavItems(permissions: readonly string[]): {
  group: (typeof ADMIN_CONSOLE_NAV_GROUPS)[number];
  items: AdminNavItem[];
}[] {
  return ADMIN_CONSOLE_NAV_GROUPS.map((group) => ({
    group,
    items: ADMIN_CONSOLE_NAV_ITEMS.filter(
      (item) => item.group === group.id && permissions.includes(item.permission),
    ),
  })).filter((entry) => entry.items.length > 0);
}

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
