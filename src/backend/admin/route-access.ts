import { z } from "zod";
import { staffContextSchema } from "./contracts";
import { AdminError, mapAdminError } from "./errors";

export const adminRouteStateSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unauthenticated") }),
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
}

export async function resolveAdminRouteAccess(
  dependencies: AdminRouteDependencies,
): Promise<AdminRouteState> {
  let identity: Awaited<ReturnType<AdminRouteDependencies["verifyIdentity"]>>;
  try {
    identity = await dependencies.verifyIdentity();
  } catch {
    return { state: "unauthenticated" };
  }
  if (!identity) return { state: "unauthenticated" };

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
          return { state: "unauthenticated" };
        }
        return { state: "backend_unavailable" };
    }
  }
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
    subtitle: "Point d’entrée sécurisé — Phase 7B",
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
        description: "Authentifiez-vous à nouveau avant d’accéder au contrôle opérationnel.",
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
    subtitle: "نقطة دخول آمنة — المرحلة 7B",
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
        description: "سجّل الدخول من جديد قبل الوصول إلى أدوات التحكم.",
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
