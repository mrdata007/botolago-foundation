import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { loadAdminStaffRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import {
  adminButtonClass,
  adminFieldClass,
  adminRepositoryContext,
} from "@/backend/admin/functional-route-helpers";
import { SupabaseAdminSecurityOperationsRepository } from "@/backend/admin/supabase-security-operations-repository";
import type {
  DirectlyAssignableAdminRole,
  StaffUserResolutionDto,
} from "@/backend/admin/security-operations-contracts";
import { mapAdminError } from "@/backend/admin/errors";
import {
  ADMIN_PANEL_CLASS,
  AdminBadge,
  AdminDatum,
  AdminField,
  AdminNotice,
  AdminSectionHeading,
} from "@/components/admin/AdminSurfaces";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/staff")({
  ssr: false,
  loader: () => loadAdminStaffRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminStaffRootRoute,
});

/** The shortest reason the server accepts. Mirrored only so the caller can
 *  see why a button stays disabled; the server re-validates every call. */
const MINIMUM_REASON_LENGTH = 8;

/** The directly assignable roles, in the order the console offers them.
 *  `platform_admin` is deliberately absent: it goes through dual control. */
const ASSIGNABLE_ROLES: readonly DirectlyAssignableAdminRole[] = [
  "editor",
  "publisher",
  "content_admin",
  "football_operator",
  "fantasy_operator",
  "notification_operator",
  "support_agent",
  "moderator",
  "security_admin",
];

// This route has a child route ($principalId). Without this, TanStack
// Router still matches it but never renders it: a parent route in a nested
// (dot-separated) file hierarchy must render <Outlet /> itself for a deeper
// match to appear at all -- the exact same defect already found and fixed
// in admin.news.tsx (see that file's comment for the full explanation).
// Missing this made /admin/staff/$principalId silently unreachable: the URL
// changed but the staff list stayed on screen.
function AdminStaffRootRoute() {
  const isChildRoute = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === "/admin/staff/$principalId"),
  });
  return isChildRoute ? <Outlet /> : <AdminStaffRoute />;
}

function AdminStaffRoute() {
  const access = Route.useLoaderData();
  const { lang } = useI18n();
  const repository = useMemo(() => new SupabaseAdminSecurityOperationsRepository(), []);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [role, setRole] = useState<DirectlyAssignableAdminRole>("editor");
  const [expiresAt, setExpiresAt] = useState("");
  const [result, setResult] = useState<StaffUserResolutionDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rtl = lang === "ar";

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (access.state !== "authorized") return;
    setBusy(true);
    setMessage(null);
    try {
      setResult(await repository.resolveStaffUserExact(email, adminRepositoryContext(access)));
    } catch (error) {
      setResult(null);
      setMessage(
        `${rtl ? "تعذّر البحث الآمن" : "Recherche sécurisée impossible"}: ${mapAdminError(error).code}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const createPrincipal = async () => {
    if (access.state !== "authorized" || !result?.found) return;
    setBusy(true);
    setMessage(null);
    try {
      const created = await repository.createStaffPrincipal(
        result.authUserId,
        reason,
        crypto.randomUUID(),
        adminRepositoryContext(access),
      );
      setMessage(
        created.created
          ? rtl
            ? "تم إنشاء هوية الطاقم دون منح أي دور."
            : "Identité staff créée sans rôle implicite."
          : rtl
            ? "هوية الطاقم موجودة بالفعل؛ لم يُمنح أي دور."
            : "L’identité staff existe déjà; aucun rôle n’a été accordé.",
      );
      setResult({
        ...result,
        staffPrincipal: {
          staffPrincipalId: created.staffPrincipalId,
          status: created.status,
          mfaRequired: created.mfaRequired,
        },
      });
    } catch (error) {
      setMessage(`${rtl ? "فشل الإنشاء" : "Création refusée"}: ${mapAdminError(error).code}`);
    } finally {
      setBusy(false);
    }
  };

  const assignRole = async () => {
    if (access.state !== "authorized" || !result?.found || !result.staffPrincipal) return;
    setBusy(true);
    setMessage(null);
    try {
      const assignment = await repository.assignStandardRole(
        {
          targetAuthUserId: result.authUserId,
          role,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          reason,
          reference: "admin-security-operations",
          idempotencyKey: crypto.randomUUID(),
        },
        adminRepositoryContext(access),
      );
      setMessage(
        `${rtl ? "تم منح الدور" : "Rôle accordé"}: ${assignment.role}. ${
          rtl
            ? "طُلب إبطال الجلسة حيثما كان مدعوماً."
            : "Invalidation de session demandée si supportée."
        }`,
      );
    } catch (error) {
      setMessage(`${rtl ? "رُفض منح الدور" : "Affectation refusée"}: ${mapAdminError(error).code}`);
    } finally {
      setBusy(false);
    }
  };

  const requestPlatformAdmin = async () => {
    if (access.state !== "authorized" || !result?.found || !result.staffPrincipal) return;
    setBusy(true);
    setMessage(null);
    try {
      const approval = await repository.requestPlatformAdmin(
        {
          targetAuthUserId: result.authUserId,
          assignmentExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          approvalExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          reason,
          idempotencyKey: crypto.randomUUID(),
        },
        adminRepositoryContext(access),
      );
      setMessage(
        `${rtl ? "تم إنشاء طلب التحكم المزدوج" : "Demande à double contrôle créée"}: ${approval.approvalId}`,
      );
    } catch (error) {
      setMessage(`${rtl ? "رُفض الطلب" : "Demande refusée"}: ${mapAdminError(error).code}`);
    } finally {
      setBusy(false);
    }
  };

  const reasonTooShort = reason.trim().length < MINIMUM_REASON_LENGTH;

  return (
    <AdminFunctionalRoute
      access={access}
      title={rtl ? "إدارة طاقم الإدارة" : "Administration du personnel"}
      description={
        rtl
          ? "بحث مطابق ومدقّق فقط. لا توجد قائمة عامة لمستخدمي المصادقة."
          : "Recherche exacte et auditée uniquement. Aucun annuaire Auth n’est exposé."
      }
      testId="admin-staff-list"
    >
      {access.state === "authorized" && (
        <div className="grid gap-6">
          <section aria-labelledby="admin-staff-lookup-heading">
            <AdminSectionHeading id="admin-staff-lookup-heading">
              {rtl ? "بحث مطابق" : "Recherche exacte"}
            </AdminSectionHeading>
            <form
              className={`mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end ${ADMIN_PANEL_CLASS} p-4`}
              onSubmit={lookup}
              data-testid="admin-user-eligibility"
            >
              <label className="grid gap-2 text-sm">
                <span className="text-slate-300">
                  {rtl ? "البريد الإلكتروني المطابق" : "E-mail exact"}
                </span>
                {/* An address is typed and read left-to-right in both
                    languages; the label above keeps the ambient direction. */}
                <input
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={adminFieldClass}
                  dir="ltr"
                  spellCheck={false}
                  required
                />
              </label>
              <button
                className={`${adminButtonClass} w-full sm:w-auto`}
                disabled={busy}
                type="submit"
              >
                {rtl ? "بحث آمن" : "Résoudre"}
              </button>
            </form>
          </section>

          {message && <AdminNotice testId="admin-staff-message">{message}</AdminNotice>}

          {/* The server already answers this lookup with a bounded error code
              and nothing else; the page shows that code rather than inventing
              a sentence about whether an account exists. */}
          {result && !result.found && (
            <AdminNotice testId="admin-staff-unresolved">
              {rtl ? "لا نتيجة قابلة للاستخدام" : "Aucun résultat exploitable"}
              {" : "}
              <AdminDatum mono className="text-xs">
                {result.errorCode}
              </AdminDatum>
            </AdminNotice>
          )}

          {result?.found && (
            <section aria-labelledby="admin-staff-result-heading">
              <AdminSectionHeading id="admin-staff-result-heading">
                {rtl ? "نتيجة البحث" : "Résultat"}
              </AdminSectionHeading>
              <article className={`mt-3 ${ADMIN_PANEL_CLASS} p-4`} data-testid="admin-staff-result">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <AdminField label={rtl ? "البريد الإلكتروني" : "E-mail"}>
                    <AdminDatum className="text-slate-100">{result.maskedEmail}</AdminDatum>
                  </AdminField>
                  <AdminField label="MFA">
                    <AdminBadge tone={result.mfaVerified ? "positive" : "warning"}>
                      <AdminDatum mono={false}>
                        {result.mfaVerified ? "AAL2 eligible" : "required"}
                      </AdminDatum>
                    </AdminBadge>
                  </AdminField>
                  <AdminField label={rtl ? "معرّف المصادقة" : "UUID Auth"}>
                    <AdminDatum className="text-xs text-slate-300">{result.authUserId}</AdminDatum>
                  </AdminField>
                  <AdminField label={rtl ? "هوية الطاقم" : "Principal"}>
                    <AdminBadge tone={result.staffPrincipal ? "positive" : "neutral"}>
                      <AdminDatum mono={false}>
                        {result.staffPrincipal?.status ?? "none"}
                      </AdminDatum>
                    </AdminBadge>
                  </AdminField>
                </dl>

                {!result.staffPrincipal && (
                  <div className="mt-5 border-t border-slate-800 pt-5">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <label className="grid gap-2 text-sm">
                        <span className="text-slate-300">
                          {rtl ? "سبب الإنشاء" : "Motif de création"}
                        </span>
                        <input
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          minLength={MINIMUM_REASON_LENGTH}
                          maxLength={500}
                          className={adminFieldClass}
                          required
                        />
                      </label>
                      <button
                        type="button"
                        className={`${adminButtonClass} w-full sm:w-auto`}
                        disabled={
                          busy || reasonTooShort || !result.emailVerified || !result.mfaVerified
                        }
                        onClick={createPrincipal}
                        data-testid="admin-create-principal"
                      >
                        {rtl ? "إنشاء الهوية" : "Créer le principal"}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {rtl
                        ? "يتطلب بريداً مؤكداً ومصادقة ثنائية مفعّلة، وثمانية أحرف على الأقل للسبب."
                        : "Exige une adresse vérifiée, une MFA active et un motif d’au moins 8 caractères."}
                    </p>
                  </div>
                )}

                {result.staffPrincipal && (
                  <div className="mt-5 border-t border-slate-800 pt-5">
                    <div className="grid gap-3 sm:grid-cols-2" data-testid="admin-role-assignment">
                      <label className="grid gap-2 text-sm">
                        <span className="text-slate-300">
                          {rtl ? "الدور القياسي" : "Rôle standard"}
                        </span>
                        {/* Role slugs are LTR machine values. */}
                        <select
                          value={role}
                          onChange={(event) =>
                            setRole(event.target.value as DirectlyAssignableAdminRole)
                          }
                          className={adminFieldClass}
                          dir="ltr"
                        >
                          {ASSIGNABLE_ROLES.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="text-slate-300">
                          {rtl ? "انتهاء اختياري" : "Expiration optionnelle"}
                        </span>
                        <input
                          type="datetime-local"
                          value={expiresAt}
                          onChange={(event) => setExpiresAt(event.target.value)}
                          className={adminFieldClass}
                          dir="ltr"
                        />
                      </label>
                      <label className="grid gap-2 text-sm sm:col-span-2">
                        <span className="text-slate-300">{rtl ? "السبب" : "Motif"}</span>
                        <input
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          minLength={MINIMUM_REASON_LENGTH}
                          maxLength={500}
                          className={adminFieldClass}
                          aria-describedby="admin-staff-reason-hint"
                        />
                      </label>
                    </div>
                    <p id="admin-staff-reason-hint" className="mt-2 text-xs text-slate-400">
                      {rtl
                        ? "ثمانية أحرف على الأقل، ويُسجَّل في التدقيق."
                        : "8 caractères minimum, consigné dans l’audit."}
                    </p>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        className={`${adminButtonClass} w-full sm:w-auto`}
                        disabled={busy || reasonTooShort}
                        onClick={() => void assignRole()}
                        data-testid="admin-assign-role"
                      >
                        {rtl ? "منح الدور القياسي" : "Affecter le rôle standard"}
                      </button>
                      <button
                        type="button"
                        className={`${adminButtonClass} w-full sm:w-auto`}
                        disabled={busy || reasonTooShort}
                        onClick={() => void requestPlatformAdmin()}
                        data-testid="admin-request-platform-admin"
                        aria-describedby="admin-platform-request-description"
                      >
                        {rtl ? "طلب platform_admin" : "Demander platform_admin"}
                      </button>
                      <span
                        id="admin-platform-request-description"
                        className="sr-only"
                        data-testid="admin-platform-request"
                      >
                        {rtl
                          ? "ينشئ طلب تحكم مزدوج ولا يمنح الدور مباشرة."
                          : "Crée une demande à double contrôle sans affecter directement le rôle."}
                      </span>
                      <Link
                        to="/admin/staff/$principalId"
                        params={{ principalId: result.staffPrincipal.staffPrincipalId }}
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-200 outline-none transition-colors hover:border-slate-600 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-emerald-400 sm:w-auto"
                      >
                        {rtl ? "فتح سجل الطاقم" : "Ouvrir le dossier staff"}
                      </Link>
                    </div>
                  </div>
                )}
              </article>
            </section>
          )}
        </div>
      )}
    </AdminFunctionalRoute>
  );
}
