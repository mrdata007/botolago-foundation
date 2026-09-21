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
 *
 * `backend_unauthenticated` is a third, unrelated case: the caller's token
 * verified fine and the control plane then reported an unauthenticated result
 * of its own. Labelling that `invalid_token` would blame a credential that was
 * accepted, and would fold two causes back into one reference -- the exact
 * conflation this exists to remove.
 */
export const UNAUTHENTICATED_REASONS = [
  "missing_token",
  "invalid_token",
  "backend_unauthenticated",
] as const;
export type UnauthenticatedReason = (typeof UNAUTHENTICATED_REASONS)[number];

/**
 * A coarse classification of *why* a presented token failed verification, shown
 * as a support reference so a recurrence is self-diagnosing instead of needing
 * another round of black-box probing.
 *
 * - `expired`      the token's own `exp` had passed. Note this is checked
 *                  before the signature is, so an unverified token can report
 *                  it -- it means "this token claims to be expired", not
 *                  "a session we recognise has run out"
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

function identityRejected(dependencies: AdminRouteDependencies): AdminRouteState {
  const detail = dependencies.describeIdentityFailure?.();
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
    // A throw escaped verification without being classified, so the cause is
    // genuinely unknown. Report no detail rather than naming one: guessing
    // `unverifiable` would accuse the server of an outage on evidence that an
    // anonymous caller can manufacture with a malformed token.
    return identityRejected(dependencies);
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
          // Identity already verified above; this came from the control plane.
          return { state: "unauthenticated", reason: "backend_unauthenticated" };
        }
        return { state: "backend_unavailable" };
    }
  }
}

/**
 * Chooses what a non-authorized Admin panel says and offers.
 *
 * Pure, so the decision is testable without a DOM: which copy block applies,
 * whether signing in again is actually the remedy, and the support reference.
 * Keeping it out of the component is what stops `detail` being computed,
 * carried across the wire, and then quietly ignored at the last step.
 */
export function selectAdminPanel(
  state: AdminRouteStateName | "loading",
  copy: AdminCopy,
  reason?: UnauthenticatedReason,
  detail?: UnauthenticatedDetail,
): {
  content: { title: string; description: string };
  showSignIn: boolean;
  reference: string;
} {
  const reference = [state, reason, detail].filter(Boolean).join("/");

  // Neither of these implicates the reader's credential: either the server
  // could not reach a verdict on it, or the failure arose after it had already
  // been accepted. Signing in again would not help, and "session expired"
  // would be a false diagnosis.
  const serverSideFailure =
    state === "unauthenticated" &&
    (detail === "unverifiable" || reason === "backend_unauthenticated");

  const content = serverSideFailure
    ? copy.verificationUnavailable
    : state === "unauthenticated" && reason === "invalid_token"
      ? copy.invalidToken
      : copy.states[state];

  // Every state a sign-in can actually clear needs a way to sign in;
  // "unauthenticated" used to render a dead end, asking the reader to connect
  // with nothing to click. It stays off where signing in is not the remedy.
  const showSignIn =
    (state === "unauthenticated" && !serverSideFailure) ||
    state === "recent_auth_required" ||
    state === "mfa_required";

  return { content, showSignIn, reference };
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

export type AdminCopy = {
  readonly dir: "ltr" | "rtl";
  readonly title: string;
  readonly states: Record<AdminRouteStateName | "loading", { title: string; description: string }>;
  /** Shown instead of `states.unauthenticated` when the bearer token was rejected. */
  readonly invalidToken: { title: string; description: string };
  /**
   * Shown when the server could not reach a verdict on the credential at all.
   * Distinct from `invalidToken` on purpose: nothing says the reader's session
   * is bad, so telling them to sign in again would be a wrong instruction.
   */
  readonly verificationUnavailable: { title: string; description: string };
  /** Label for the support reference printed on every non-authorized panel. */
  readonly referenceLabel: string;
  readonly labels: {
    identity: string;
    roles: string;
    permissions: string;
    security: string;
    pendingRevocation: string;
    none: string;
    /** Heading above the read-only session context cards. */
    contextHeading: string;
    /** Heading above the console's module cards. */
    modulesHeading: string;
    /** Badge on a module that is described but not yet openable. */
    soon: string;
  };
  readonly sections: readonly string[];
};

const COPY: Record<"fr" | "ar", AdminCopy> = {
  fr: {
    dir: "ltr",
    title: "Administration BotolaGO",
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
    verificationUnavailable: {
      title: "Vérification impossible",
      description:
        "Votre session n’a pas pu être vérifiée pour le moment. Réessayez dans quelques instants — il n’est pas nécessaire de vous reconnecter.",
    },
    referenceLabel: "Réf.",
    labels: {
      identity: "Identité authentifiée",
      roles: "Rôles actifs",
      permissions: "Autorisations",
      security: "Sécurité de session",
      pendingRevocation: "Révocation en attente",
      none: "Aucun",
      contextHeading: "Contexte de session",
      modulesHeading: "Modules d’administration",
      soon: "Bientôt",
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
    verificationUnavailable: {
      title: "تعذّر التحقق",
      description:
        "تعذّر التحقق من جلستك حاليًا. أعد المحاولة بعد قليل — لا حاجة إلى تسجيل الدخول من جديد.",
    },
    referenceLabel: "المرجع",
    labels: {
      identity: "الهوية الموثّقة",
      roles: "الأدوار النشطة",
      permissions: "الصلاحيات",
      security: "أمان الجلسة",
      pendingRevocation: "إلغاء جلسة قيد الانتظار",
      none: "لا يوجد",
      contextHeading: "سياق الجلسة",
      modulesHeading: "وحدات الإدارة",
      soon: "قريبًا",
    },
    sections: ["تعيينات طاقم الإدارة", "قائمة الموافقات", "سجل الأمان", "دليل الأدوار"],
  },
};

export function getAdminCopy(language: "fr" | "ar"): AdminCopy {
  return COPY[language];
}
