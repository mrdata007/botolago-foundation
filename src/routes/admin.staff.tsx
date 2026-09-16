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
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/staff")({
  ssr: false,
  loader: () => loadAdminStaffRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminStaffRoute,
});

function AdminStaffRoute() {
  const isDetail = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === "/admin/staff/$principalId"),
  });
  return isDetail ? <Outlet /> : <AdminStaffPage />;
}

function AdminStaffPage() {
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
        <>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_auto]"
            onSubmit={lookup}
            data-testid="admin-user-eligibility"
          >
            <label className="grid gap-2 text-sm">
              <span>{rtl ? "البريد الإلكتروني المطابق" : "E-mail exact"}</span>
              <input
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={adminFieldClass}
                required
              />
            </label>
            <button className={`${adminButtonClass} self-end`} disabled={busy} type="submit">
              {rtl ? "بحث آمن" : "Résoudre"}
            </button>
          </form>

          {message && (
            <p className="mt-4 text-sm text-amber-200" role="status">
              {message}
            </p>
          )}

          {result?.found && (
            <article className="mt-5 rounded-lg border border-slate-700 p-4">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-400">E-mail</dt>
                  <dd>{result.maskedEmail}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">MFA</dt>
                  <dd>{result.mfaVerified ? "AAL2 eligible" : "required"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">UUID Auth</dt>
                  <dd className="break-all">{result.authUserId}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Principal</dt>
                  <dd>{result.staffPrincipal?.status ?? "none"}</dd>
                </div>
              </dl>

              {!result.staffPrincipal && (
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <label className="grid gap-2 text-sm">
                    <span>{rtl ? "سبب الإنشاء" : "Motif de création"}</span>
                    <input
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      minLength={8}
                      maxLength={500}
                      className={adminFieldClass}
                      required
                    />
                  </label>
                  <button
                    type="button"
                    className={`${adminButtonClass} self-end`}
                    disabled={
                      busy ||
                      reason.trim().length < 8 ||
                      !result.emailVerified ||
                      !result.mfaVerified
                    }
                    onClick={createPrincipal}
                    data-testid="admin-create-principal"
                  >
                    {rtl ? "إنشاء الهوية" : "Créer le principal"}
                  </button>
                </div>
              )}

              {result.staffPrincipal && (
                <>
                  <div
                    className="mt-5 grid gap-3 sm:grid-cols-2"
                    data-testid="admin-role-assignment"
                  >
                    <label className="grid gap-2 text-sm">
                      <span>{rtl ? "الدور القياسي" : "Rôle standard"}</span>
                      <select
                        value={role}
                        onChange={(event) =>
                          setRole(event.target.value as DirectlyAssignableAdminRole)
                        }
                        className={adminFieldClass}
                      >
                        {[
                          "editor",
                          "publisher",
                          "content_admin",
                          "football_operator",
                          "fantasy_operator",
                          "notification_operator",
                          "support_agent",
                          "moderator",
                          "security_admin",
                        ].map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm">
                      <span>{rtl ? "انتهاء اختياري" : "Expiration optionnelle"}</span>
                      <input
                        type="datetime-local"
                        value={expiresAt}
                        onChange={(event) => setExpiresAt(event.target.value)}
                        className={adminFieldClass}
                      />
                    </label>
                    <label className="grid gap-2 text-sm sm:col-span-2">
                      <span>{rtl ? "السبب" : "Motif"}</span>
                      <input
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        minLength={8}
                        maxLength={500}
                        className={adminFieldClass}
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className={adminButtonClass}
                      disabled={busy || reason.trim().length < 8}
                      onClick={() => void assignRole()}
                      data-testid="admin-assign-role"
                    >
                      {rtl ? "منح الدور القياسي" : "Affecter le rôle standard"}
                    </button>
                    <button
                      type="button"
                      className={adminButtonClass}
                      disabled={busy || reason.trim().length < 8}
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
                      className="inline-flex min-h-11 items-center rounded-lg border border-slate-600 px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                      {rtl ? "فتح سجل الطاقم" : "Ouvrir le dossier staff"}
                    </Link>
                  </div>
                </>
              )}
            </article>
          )}
        </>
      )}
    </AdminFunctionalRoute>
  );
}
