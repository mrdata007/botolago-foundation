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
import {
  ADMIN_PANEL_CLASS,
  AdminBadge,
  AdminDatum,
  AdminEmptyState,
  AdminField,
  AdminNotice,
  AdminSectionHeading,
  AdminSkeletonList,
} from "@/components/admin/AdminSurfaces";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/staff/$principalId")({
  ssr: false,
  loader: () => loadAdminStaffRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminStaffDetailRoute,
});

/** The shortest reason the server accepts. Mirrored only so the caller can
 *  see why an action stays disabled; the server re-validates every call. */
const MINIMUM_REASON_LENGTH = 8;

function statusTone(status: StaffPrincipalSummaryDto["status"]) {
  if (status === "active") return "positive" as const;
  if (status === "suspended") return "warning" as const;
  return "danger" as const;
}

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

  const reasonTooShort = reason.trim().length < MINIMUM_REASON_LENGTH;

  return (
    <AdminFunctionalRoute
      access={access}
      title={rtl ? "سجل عضو الطاقم" : "Dossier du membre du personnel"}
      description={
        rtl
          ? "الأدوار النشطة، وسجل التعيينات، وعمليات الوصول الإداري لهذه الهوية."
          : "Rôles actifs, historique des affectations et opérations d’accès de ce principal."
      }
      testId="admin-staff-detail"
    >
      {access.state === "authorized" && (
        <div className="grid gap-6">
          {/* The principal id is a UUID: only the value is forced LTR, the
              label keeps the ambient direction. It used to be handed to the
              shell as a bare description string, where it could not be. */}
          <p className={`${ADMIN_PANEL_CLASS} flex flex-wrap items-baseline gap-x-2 gap-y-1 p-3`}>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {rtl ? "معرّف الهوية" : "Identifiant"}
            </span>
            <AdminDatum className="text-xs text-slate-300">{principalId}</AdminDatum>
          </p>

          {!principal && !message && <AdminSkeletonList rows={2} testId="admin-staff-loading" />}

          {principal && (
            <>
              <section aria-labelledby="admin-principal-heading">
                <AdminSectionHeading id="admin-principal-heading">
                  {rtl ? "حالة الهوية" : "État du principal"}
                </AdminSectionHeading>
                <dl className={`mt-3 grid gap-4 sm:grid-cols-2 ${ADMIN_PANEL_CLASS} p-4`}>
                  <AdminField label={rtl ? "الحالة" : "Statut"}>
                    <AdminBadge tone={statusTone(principal.status)}>
                      <AdminDatum mono={false}>{principal.status}</AdminDatum>
                    </AdminBadge>
                  </AdminField>
                  <AdminField label={rtl ? "سياسة المصادقة" : "Politique AAL"}>
                    <AdminBadge tone={principal.mfaRequired ? "positive" : "danger"}>
                      <AdminDatum mono={false}>
                        {principal.mfaRequired ? "MFA required" : "invalid policy"}
                      </AdminDatum>
                    </AdminBadge>
                  </AdminField>
                  <AdminField label={rtl ? "الأدوار" : "Rôles"}>
                    {principal.roles.length > 0 ? (
                      <AdminDatum mono={false} className="text-slate-100">
                        {principal.roles.map((role) => role.name).join(", ")}
                      </AdminDatum>
                    ) : (
                      <span className="text-slate-400">{rtl ? "لا شيء" : "Aucun"}</span>
                    )}
                  </AdminField>
                  <AdminField label={rtl ? "طابور الإبطال" : "File d’invalidation"}>
                    <span className="text-lg font-semibold tabular-nums">
                      {principal.pendingSessionRevocationCount}
                    </span>
                  </AdminField>
                </dl>
              </section>

              <section aria-labelledby="admin-assignments-heading">
                <AdminSectionHeading id="admin-assignments-heading">
                  {rtl ? "الأدوار النشطة" : "Rôles actifs"}
                </AdminSectionHeading>
                <ul
                  className="mt-3 grid gap-3"
                  aria-label={rtl ? "الأدوار النشطة" : "Rôles actifs"}
                  data-testid="admin-assignments"
                >
                  {assignments.length === 0 ? (
                    <li>
                      <AdminEmptyState testId="admin-assignments-empty">
                        {rtl ? "لا يوجد دور نشط." : "Aucun rôle actif."}
                      </AdminEmptyState>
                    </li>
                  ) : (
                    assignments.map((assignment) => (
                      <li
                        key={assignment.assignmentId}
                        className={`${ADMIN_PANEL_CLASS} p-4`}
                        data-testid="admin-assignment"
                      >
                        <dl className="grid gap-3 sm:grid-cols-2">
                          <AdminField label={rtl ? "الدور" : "Rôle"}>
                            <AdminDatum mono={false} className="font-semibold text-slate-100">
                              {assignment.role}
                            </AdminDatum>
                          </AdminField>
                          <AdminField label={rtl ? "الانتهاء" : "Expiration"}>
                            {assignment.expiresAt ? (
                              <AdminDatum className="text-xs text-slate-300">
                                {assignment.expiresAt}
                              </AdminDatum>
                            ) : (
                              <AdminDatum mono={false} className="text-xs text-slate-400">
                                no expiry
                              </AdminDatum>
                            )}
                          </AdminField>
                        </dl>
                        {/* Revocation is immediate and audited: the required
                            motive above is the gate, unchanged here. */}
                        <button
                          type="button"
                          className={`${adminDangerButtonClass} mt-4 w-full sm:w-auto`}
                          disabled={busy || reasonTooShort}
                          onClick={() => void revokeAssignment(assignment.assignmentId)}
                        >
                          {rtl ? "إلغاء الدور" : "Révoquer le rôle"}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </section>

              <section
                data-testid="admin-assignment-history"
                aria-labelledby="admin-assignment-history-title"
              >
                <AdminSectionHeading id="admin-assignment-history-title">
                  {rtl ? "سجل التعيينات" : "Historique des affectations"}
                </AdminSectionHeading>
                {assignmentHistory.length === 0 ? (
                  <div className="mt-3">
                    <AdminEmptyState testId="admin-assignment-history-empty">
                      {rtl ? "لا يوجد سجل محفوظ." : "Aucun historique conservé."}
                    </AdminEmptyState>
                  </div>
                ) : (
                  <ol className="mt-3 grid gap-2">
                    {assignmentHistory.map((assignment) => (
                      <li
                        key={assignment.assignmentId}
                        className={`${ADMIN_PANEL_CLASS} flex flex-wrap items-center gap-x-3 gap-y-1 p-3`}
                        data-testid="admin-assignment-history-item"
                      >
                        <AdminDatum mono={false} className="text-sm font-medium text-slate-100">
                          {assignment.role}
                        </AdminDatum>
                        <AdminBadge>
                          <AdminDatum mono={false}>{assignment.status}</AdminDatum>
                        </AdminBadge>
                        <AdminDatum className="text-xs text-slate-400">
                          {assignment.grantedAt ?? assignment.startsAt ?? "—"}
                        </AdminDatum>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className={`${ADMIN_PANEL_CLASS} p-4`} aria-labelledby="admin-staff-reason">
                <label className="grid gap-2 text-sm">
                  <span id="admin-staff-reason" className="font-medium text-slate-200">
                    {rtl ? "سبب العملية (مطلوب)" : "Motif de l’opération (requis)"}
                  </span>
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    minLength={MINIMUM_REASON_LENGTH}
                    maxLength={500}
                    className={adminFieldClass}
                    aria-describedby="admin-staff-reason-hint"
                  />
                </label>
                <p id="admin-staff-reason-hint" className="mt-2 text-xs text-slate-400">
                  {rtl
                    ? "ثمانية أحرف على الأقل. يُطبَّق على الإلغاء والتعليق والاستعادة، ويُسجَّل في التدقيق."
                    : "8 caractères minimum. Vaut pour la révocation, la suspension et la restauration; consigné dans l’audit."}
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {principal.status === "active" && (
                    <button
                      className={`${adminButtonClass} w-full sm:w-auto`}
                      type="button"
                      disabled={busy || reasonTooShort}
                      onClick={() => void mutate("suspend")}
                    >
                      {rtl ? "تعليق الوصول" : "Suspendre"}
                    </button>
                  )}
                  {principal.status === "suspended" && (
                    <button
                      className={`${adminButtonClass} w-full sm:w-auto`}
                      type="button"
                      disabled={busy || reasonTooShort}
                      onClick={() => void mutate("restore")}
                    >
                      {rtl ? "استعادة الوصول" : "Restaurer"}
                    </button>
                  )}
                  {principal.status !== "revoked" && (
                    <button
                      className={`${adminDangerButtonClass} w-full sm:w-auto`}
                      type="button"
                      disabled={busy || reasonTooShort}
                      onClick={() => void mutate("emergency")}
                      data-testid="admin-emergency-revocation"
                    >
                      {rtl ? "إلغاء طارئ" : "Révocation d’urgence"}
                    </button>
                  )}
                </div>
              </section>
            </>
          )}

          {message && <AdminNotice testId="admin-staff-detail-message">{message}</AdminNotice>}
        </div>
      )}
    </AdminFunctionalRoute>
  );
}
