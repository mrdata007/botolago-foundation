import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadAdminStaffRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import {
  adminButtonClass,
  adminDangerButtonClass,
  adminFieldClass,
  adminRepositoryContext,
} from "@/backend/admin/functional-route-helpers";
import { SupabaseAdminControlPlaneRepository } from "@/backend/admin/supabase-control-plane-repository";
import { SupabaseAdminSecurityOperationsRepository } from "@/backend/admin/supabase-security-operations-repository";
import { SupabaseAdminAuthorizationRepository } from "@/backend/admin/supabase-repository";
import type { AssignmentHistoryPageDto, StaffAssignmentDto } from "@/backend/admin/contracts";
import type { StaffPrincipalSummaryDto } from "@/backend/admin/control-plane-contracts";
import { mapAdminError } from "@/backend/admin/errors";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/staff/$principalId")({
  ssr: false,
  loader: () => loadAdminStaffRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminStaffDetailRoute,
});

function AdminStaffDetailRoute() {
  const access = Route.useLoaderData();
  const { principalId } = Route.useParams();
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const reads = useMemo(() => new SupabaseAdminControlPlaneRepository(), []);
  const mutations = useMemo(() => new SupabaseAdminSecurityOperationsRepository(), []);
  const assignmentReads = useMemo(() => new SupabaseAdminAuthorizationRepository(), []);
  const [principal, setPrincipal] = useState<StaffPrincipalSummaryDto | null>(null);
  const [assignments, setAssignments] = useState<readonly StaffAssignmentDto[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<AssignmentHistoryPageDto["items"]>([]);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (access.state !== "authorized") return;
    try {
      const context = adminRepositoryContext(access);
      const [principalResult, assignmentResult, historyResult] = await Promise.all([
        reads.getStaffPrincipal(principalId, context),
        assignmentReads.listActiveAssignments(principalId, context),
        assignmentReads.listAssignmentHistory(principalId, null, 50, context),
      ]);
      setPrincipal(principalResult);
      setAssignments(assignmentResult);
      setAssignmentHistory(historyResult.items);
    } catch (error) {
      setMessage(
        `${rtl ? "تعذّر تحميل السجل" : "Dossier indisponible"}: ${mapAdminError(error).code}`,
      );
    }
  }, [access, assignmentReads, principalId, reads, rtl]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const mutate = async (operation: "suspend" | "restore" | "emergency") => {
    if (access.state !== "authorized") return;
    setBusy(true);
    setMessage(null);
    const input = { staffPrincipalId: principalId, reason, idempotencyKey: crypto.randomUUID() };
    try {
      if (operation === "suspend") {
        await mutations.suspendStaff(input, adminRepositoryContext(access));
      } else if (operation === "restore") {
        await mutations.restoreStaff(input, adminRepositoryContext(access));
      } else {
        await mutations.emergencyRevokeStaff(input, adminRepositoryContext(access));
      }
      setMessage(
        rtl
          ? "تم تحديث الوصول الإداري فوراً، وطُلب إبطال الجلسة حيثما كان مدعوماً."
          : "Accès Admin mis à jour immédiatement; invalidation de session demandée si supportée.",
      );
      await reload();
    } catch (error) {
      setMessage(`${rtl ? "رُفضت العملية" : "Opération refusée"}: ${mapAdminError(error).code}`);
    } finally {
      setBusy(false);
    }
  };

  const revokeAssignment = async (assignmentId: string) => {
    if (access.state !== "authorized") return;
    setBusy(true);
    setMessage(null);
    try {
      await mutations.revokeRole(
        assignmentId,
        reason,
        crypto.randomUUID(),
        adminRepositoryContext(access),
      );
      setMessage(
        rtl
          ? "أُلغي الوصول المميّز فوراً وطُلب إبطال الجلسة."
          : "Accès privilégié révoqué immédiatement; invalidation de session demandée.",
      );
      await reload();
    } catch (error) {
      setMessage(`${rtl ? "رُفض الإلغاء" : "Révocation refusée"}: ${mapAdminError(error).code}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminFunctionalRoute
      access={access}
      title={rtl ? "سجل عضو الطاقم" : "Dossier du membre du personnel"}
      description={principalId}
      testId="admin-staff-detail"
    >
      {access.state === "authorized" && (
        <>
          {!principal && !message && <p className="text-sm text-slate-400">Loading…</p>}
          {principal && (
            <>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-400">Status</dt>
                  <dd>{principal.status}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">AAL policy</dt>
                  <dd>{principal.mfaRequired ? "MFA required" : "invalid policy"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Roles</dt>
                  <dd>{principal.roles.map((role) => role.name).join(", ") || "none"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Revocation queue</dt>
                  <dd>{principal.pendingSessionRevocationCount}</dd>
                </div>
              </dl>
              <ul
                className="mt-5 grid gap-2"
                aria-label={rtl ? "الأدوار النشطة" : "Rôles actifs"}
                data-testid="admin-assignments"
              >
                {assignments.map((assignment) => (
                  <li
                    key={assignment.assignmentId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 p-3 text-sm"
                  >
                    <span>
                      {assignment.role} · {assignment.expiresAt ?? "no expiry"}
                    </span>
                    <button
                      type="button"
                      className={adminDangerButtonClass}
                      disabled={busy || reason.trim().length < 8}
                      onClick={() => void revokeAssignment(assignment.assignmentId)}
                    >
                      {rtl ? "إلغاء الدور" : "Révoquer le rôle"}
                    </button>
                  </li>
                ))}
              </ul>
              <section
                className="mt-6 rounded-lg border border-slate-700 p-4"
                data-testid="admin-assignment-history"
                aria-labelledby="admin-assignment-history-title"
              >
                <h3 id="admin-assignment-history-title" className="font-semibold">
                  {rtl ? "سجل التعيينات" : "Historique des affectations"}
                </h3>
                {assignmentHistory.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-400">
                    {rtl ? "لا يوجد سجل محفوظ." : "Aucun historique conservé."}
                  </p>
                ) : (
                  <ol className="mt-3 grid gap-2">
                    {assignmentHistory.map((assignment) => (
                      <li
                        key={assignment.assignmentId}
                        className="rounded border border-slate-800 p-3 text-sm"
                      >
                        {assignment.role} · {assignment.status} ·{" "}
                        {assignment.grantedAt ?? assignment.startsAt ?? "—"}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
              <label className="mt-5 grid gap-2 text-sm">
                <span>{rtl ? "سبب العملية (مطلوب)" : "Motif de l’opération (requis)"}</span>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  minLength={8}
                  maxLength={500}
                  className={adminFieldClass}
                />
              </label>
              <div className="mt-4 flex flex-wrap gap-3">
                {principal.status === "active" && (
                  <button
                    className={adminButtonClass}
                    type="button"
                    disabled={busy || reason.trim().length < 8}
                    onClick={() => void mutate("suspend")}
                  >
                    {rtl ? "تعليق الوصول" : "Suspendre"}
                  </button>
                )}
                {principal.status === "suspended" && (
                  <button
                    className={adminButtonClass}
                    type="button"
                    disabled={busy || reason.trim().length < 8}
                    onClick={() => void mutate("restore")}
                  >
                    {rtl ? "استعادة الوصول" : "Restaurer"}
                  </button>
                )}
                {principal.status !== "revoked" && (
                  <button
                    className={adminDangerButtonClass}
                    type="button"
                    disabled={busy || reason.trim().length < 8}
                    onClick={() => void mutate("emergency")}
                    data-testid="admin-emergency-revocation"
                  >
                    {rtl ? "إلغاء طارئ" : "Révocation d’urgence"}
                  </button>
                )}
              </div>
            </>
          )}
          {message && (
            <p className="mt-4 text-sm text-amber-200" role="status">
              {message}
            </p>
          )}
        </>
      )}
    </AdminFunctionalRoute>
  );
}
