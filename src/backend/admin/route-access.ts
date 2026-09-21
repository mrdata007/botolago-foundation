import { z } from "zod";
import { staffContextSchema, type AdminPermission } from "./contracts";
import { AdminError, mapAdminError } from "./errors";

/**
 * Why an Admin request was treated as unauthenticated.
 *
 * `missing_token` and `invalid_token` used to collapse into a bare
 * `unauthenticated` state, which made a production outage undiagnosable: the
 * console said "Authentification requise" both when the browser sent no bearer
 * token at all and when it sent one the server could not verify, and nothing
 * distinguished the two from the outside.
 *
 * Reporting which of the two occurred leaks nothing -- the caller already knows
 * whether it sent a token, and neither value says anything about staff
 * membership or any other account. This mirrors RFC 6750, which distinguishes a
 * missing credential from `error="invalid_token"` for exactly this reason.
 */
export const UNAUTHENTICATED_REASONS = ["missing_token", "invalid_token"] as const;
export type UnauthenticatedReason = (typeof UNAUTHENTICATED_REASONS)[number];

/**
 * A coarse classification of *why* a presented token failed verification, shown
 * as a support reference so a recurrence is self-diagnosing instead of needing
 * another round of black-box probing.
 *
 * - `expired`      the JWT's own `exp` had passed
 * - `rejected`     the Auth server or signature check refused it
 * - `unverifiable` verification could not be completed (JWKS/network failure)
 *
 * Every value describes the caller's own credential and nothing else, so this
 * is safe to surface -- it says nothing about any account, staff membership, or
 * whether the subject even exists.
 */
export const UNAUTHENTICATED_DETAILS = ["expired", "rejected", "unverifiable"] as const;
export type UnauthenticatedDetail = (typeof UNAUTHENTICATED_DETAILS)[number];

export const adminRouteStateSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("unauthenticated"),
    reason: z.enum(UNAUTHENTICATED_REASONS).optional(),
    detail: z.enum(UNAUTHENTICATED_DETAILS).optional(),
  }),
  z.object({ state: z.literal("forbidden") }),
  z.object({ state: z.literal("mfa_required") }),
  z.object({ state: z.literal("recent_auth_required") }),
  z.object({ state: z.literal("suspended") }),
  z.object({ state: z.literal("revoked") }),
  z.object({ state: z.literal("backend_unavailable") }),
  z.object({
    state: z.literal("authorized"),
    identity: z.object({
      userId: z.string().uuid(),
      emailSummary: z.string().max(160).nullable(),
    }),
    context: staffContextSchema,
  }),
]);

export type AdminRouteState = z.infer<typeof adminRouteStateSchema>;
export type AdminRouteStateName = AdminRouteState["state"];

export interface AdminRouteDependencies {
  verifyIdentity(): Promise<{ userId: string; email: string | null } | null>;
  loadContext(userId: string): Promise<unknown>;
  /**
   * Optional: classifies the most recent `verifyIdentity` failure. Kept
   * separate so the identity contract stays `identity | null` and callers that
   * do not classify need no changes.
   */
  describeIdentityFailure?(): UnauthenticatedDetail | undefined;
}

function identityRejected(
  dependencies: AdminRouteDependencies,
  fallback?: UnauthenticatedDetail,
): AdminRouteState {
  const detail = dependencies.describeIdentityFailure?.() ?? fallback;
  return { state: "unauthenticated", reason: "invalid_token", ...(detail ? { detail } : {}) };
}

export async function resolveAdminRouteAccess(
  dependencies: AdminRouteDependencies,
): Promise<AdminRouteState> {
  let identity: Awaited<ReturnType<AdminRouteDependencies["verifyIdentity"]>>;
  // Reaching here means a bearer token was present -- the caller returns
  // `missing_token` before ever constructing these dependencies -- so any
  // failure below is a token the server could not verify, not an absent one.
  try {
    identity = await dependencies.verifyIdentity();
  } catch {
    // A throw escaped verification entirely, so nothing classified it.
    return identityRejected(dependencies, "unverifiable");
  }
  if (!identity) return identityRejected(dependencies);

  try {
    const context = staffContextSchema.parse(await dependencies.loadContext(identity.userId));
    if (context.suspended) return { state: "suspended" };
    if (context.revoked) return { state: "revoked" };
    if (!context.mfaEnrolled || context.currentAal !== "aal2") {
      return { state: "mfa_required" };
    }
    if (!context.recentAuthSufficient) return { state: "recent_auth_required" };
    if (!context.accessAllowed) return { state: "forbidden" };
    return {
      state: "authorized",
      identity: {
        userId: identity.userId,
        emailSummary: maskEmail(identity.email),
      },
      context,
    };
  } catch (error) {
    const mapped = mapAdminError(error);
    switch (mapped.code) {
      case "staff_suspended":
        return { state: "suspended" };
      case "staff_revoked":
        return { state: "revoked" };
      case "mfa_required":
      case "mfa_assurance_insufficient":
        return { state: "mfa_required" };
      case "recent_auth_required":
        return { state: "recent_auth_required" };
      case "staff_access_denied":
      case "permission_missing":
        return { state: "forbidden" };
      default:
        if (error instanceof AdminError && error.code === "unauthenticated") {
          return { state: "unauthenticated", reason: "invalid_token" };
        }
        return { state: "backend_unavailable" };
    }
  }
}

export function requireAdminRoutePermission(
  state: AdminRouteState,
  permission: AdminPermission,
): AdminRouteState {
  if (state.state !== "authorized") return state;
  return state.context.permissions.includes(permission) ? state : { state: "forbidden" };
}

export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const separator = email.lastIndexOf("@");
  if (separator <= 0 || separator === email.length - 1) return null;
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  return `${local.slice(0, 1)}${"*".repeat(Math.min(Math.max(local.length - 1, 2), 8))}@${domain}`;
}

type AdminCopy = {
  readonly dir: "ltr" | "rtl";
  readonly title: string;
  readonly subtitle: string;
  readonly states: Record<AdminRouteStateName | "loading", { title: string; description: string }>;
  /** Shown instead of `states.unauthenticated` when the bearer token was rejected. */
  readonly invalidToken: { title: string; description: string };
  readonly labels: {
    identity: string;
    roles: string;
    permissions: string;
    security: string;
    pendingRevocation: string;
    none: string;
  };
  readonly sections: readonly string[];
};

const COPY: Record<"fr" | "ar", AdminCopy> = {
  fr: {
    dir: "ltr",
    title: "Administration BotolaGO",
    subtitle: "Opérations de sécurité — Phase 7C",
    states: {
      loading: {
        title: "Vérification de l’accès",
        description: "La session et les autorisations sont vérifiées côté serveur.",
      },
      unauthenticated: {
        title: "Authentification requise",
        description: "Connectez-vous avec votre compte BotolaGO avant d’ouvrir cet espace.",
      },
      forbidden: {
        title: "Accès interdit",
        description: "Ce compte ne dispose pas d’un accès administrateur actif.",
      },
      mfa_required: {
        title: "Authentification multifacteur requise",
        description: "Enregistrez ou validez votre second facteur pour continuer.",
      },
      recent_auth_required: {
        title: "Réauthentification requise",
        description: "Authentifiez-vous à nouveau, puis soumettez de nouveau l’opération sensible.",
      },
      suspended: {
        title: "Accès suspendu",
        description: "L’accès administrateur de ce compte est suspendu.",
      },
      revoked: {
        title: "Accès révoqué",
        description: "L’accès administrateur de ce compte a été révoqué.",
      },
      backend_unavailable: {
        title: "Service indisponible",
        description: "Le contexte administrateur ne peut pas être vérifié en toute sécurité.",
      },
      authorized: {
        title: "Accès autorisé",
        description: "Le contexte affiché provient du backend sécurisé.",
      },
    },
    invalidToken: {
      title: "Session expirée",
      description: "Votre session n’est plus valide. Reconnectez-vous, puis rouvrez cet espace.",
    },
    labels: {
      identity: "Identité authentifiée",
      roles: "Rôles actifs",
      permissions: "Autorisations",
      security: "Sécurité de session",
      pendingRevocation: "Révocation en attente",
      none: "Aucun",
    },
    sections: [
      "Affectations du personnel",
      "File d’approbation",
      "Journal de sécurité",
      "Catalogue des rôles",
    ],
  },
  ar: {
    dir: "rtl",
    title: "إدارة BotolaGO",
    subtitle: "عمليات الأمان — المرحلة 7C",
    states: {
      loading: {
        title: "التحقق من الصلاحية",
        description: "يتم التحقق من الجلسة والصلاحيات على الخادم.",
      },
      unauthenticated: {
        title: "تسجيل الدخول مطلوب",
        description: "سجّل الدخول بحساب BotolaGO قبل فتح هذه المساحة.",
      },
      forbidden: {
        title: "الدخول مرفوض",
        description: "هذا الحساب لا يملك صلاحية إدارية نشطة.",
      },
      mfa_required: {
        title: "المصادقة متعددة العوامل مطلوبة",
        description: "سجّل أو أكّد عامل المصادقة الثاني للمتابعة.",
      },
      recent_auth_required: {
        title: "إعادة المصادقة مطلوبة",
        description: "سجّل الدخول من جديد، ثم أرسل العملية الحساسة مرة أخرى.",
      },
      suspended: {
        title: "الصلاحية معلّقة",
        description: "تم تعليق الصلاحية الإدارية لهذا الحساب.",
      },
      revoked: {
        title: "الصلاحية ملغاة",
        description: "تم إلغاء الصلاحية الإدارية لهذا الحساب.",
      },
      backend_unavailable: {
        title: "الخدمة غير متاحة",
        description: "تعذّر التحقق الآمن من السياق الإداري.",
      },
      authorized: {
        title: "الدخول مسموح",
        description: "السياق المعروض صادر عن الخلفية الآمنة.",
      },
    },
    invalidToken: {
      title: "انتهت صلاحية الجلسة",
      description: "لم تعد جلستك صالحة. سجّل الدخول من جديد ثم افتح هذه المساحة.",
    },
    labels: {
      identity: "الهوية الموثّقة",
      roles: "الأدوار النشطة",
      permissions: "الصلاحيات",
      security: "أمان الجلسة",
      pendingRevocation: "إلغاء جلسة قيد الانتظار",
      none: "لا يوجد",
    },
    sections: ["تعيينات طاقم الإدارة", "قائمة الموافقات", "سجل الأمان", "دليل الأدوار"],
  },
};

export function getAdminCopy(language: "fr" | "ar"): AdminCopy {
  return COPY[language];
}
