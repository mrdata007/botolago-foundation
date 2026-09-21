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
import type { ApprovalQueueItemDto } from "@/backend/admin/control-plane-contracts";
import { mapAdminError } from "@/backend/admin/errors";
import {
  ADMIN_PANEL_CLASS,
  AdminBadge,
  AdminDatum,
  AdminEmptyState,
  AdminField,
  AdminNotice,
  AdminSectionHeading,
} from "@/components/admin/AdminSurfaces";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/approvals")({
  ssr: false,
  loader: () => loadAdminStaffRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminApprovalsRoute,
});

/** The shortest reason the server will accept, mirrored here only so the
 *  caller can see why a button is still disabled. The server re-validates. */
const MINIMUM_REASON_LENGTH = 8;

function statusTone(status: ApprovalQueueItemDto["status"]) {
  if (status === "approved") return "positive" as const;
  if (status === "pending") return "warning" as const;
  if (status === "rejected" || status === "cancelled") return "danger" as const;
  return "neutral" as const;
}

function AdminApprovalsRoute() {
  const access = Route.useLoaderData();
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const reads = useMemo(() => new SupabaseAdminControlPlaneRepository(), []);
  const mutations = useMemo(() => new SupabaseAdminSecurityOperationsRepository(), []);
  const [items, setItems] = useState<readonly ApprovalQueueItemDto[]>([]);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (access.state !== "authorized") return;
    try {
      const page = await reads.listApprovals(
        { scope: "all_visible" },
        null,
        50,
        adminRepositoryContext(access),
      );
      setItems(page.items);
    } catch (error) {
      setMessage(
        `${rtl ? "تعذّر تحميل الموافقات" : "Approbations indisponibles"}: ${mapAdminError(error).code}`,
      );
    }
  }, [access, reads, rtl]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const transition = async (
    item: ApprovalQueueItemDto,
    operation: "approve" | "reject" | "cancel" | "execute",
  ) => {
    if (access.state !== "authorized") return;
    setBusyId(item.approvalId);
    setMessage(null);
    try {
      const context = adminRepositoryContext(access);
      const key = crypto.randomUUID();
      if (operation === "approve") {
        await mutations.approve(item.approvalId, item.payloadFingerprint, reason, key, context);
      } else if (operation === "reject") {
        await mutations.reject(item.approvalId, reason, key, context);
      } else if (operation === "cancel") {
        await mutations.cancel(item.approvalId, reason, key, context);
      } else {
        await mutations.executePlatformAdmin(
          item.approvalId,
          item.payloadFingerprint,
          reason,
          key,
          context,
        );
      }
      setMessage(rtl ? "تم تسجيل الانتقال وتدقيقه." : "Transition enregistrée et auditée.");
      await reload();
    } catch (error) {
      setMessage(`${rtl ? "رُفض الانتقال" : "Transition refusée"}: ${mapAdminError(error).code}`);
    } finally {
      setBusyId(null);
    }
  };

  const reasonTooShort = reason.trim().length < MINIMUM_REASON_LENGTH;

  return (
    <AdminFunctionalRoute
      access={access}
      title={rtl ? "الموافقات ذات التحكم المزدوج" : "Approbations à double contrôle"}
      description={
        rtl
          ? "تقتصر المرحلة 7D على تعيين platform_admin."
          : "Phase 7D est limitée à l’affectation platform_admin."
      }
      testId="admin-approvals-queue"
    >
      {access.state === "authorized" && (
        <div className="grid gap-6">
          <section className={`${ADMIN_PANEL_CLASS} p-4`} aria-labelledby="admin-approval-reason">
            <label className="grid gap-2 text-sm">
              <span id="admin-approval-reason" className="font-medium text-slate-200">
                {rtl ? "سبب القرار أو التنفيذ" : "Motif de décision ou d’exécution"}
              </span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={MINIMUM_REASON_LENGTH}
                maxLength={500}
                className={adminFieldClass}
                aria-describedby="admin-approval-reason-hint"
              />
            </label>
            <p id="admin-approval-reason-hint" className="mt-2 text-xs text-slate-400">
              {rtl
                ? "مطلوب قبل أي قرار؛ ثمانية أحرف على الأقل، ويُسجَّل في التدقيق."
                : "Requis avant toute décision : 8 caractères minimum, consigné dans l’audit."}
            </p>
          </section>

          <section aria-labelledby="admin-approvals-heading">
            <AdminSectionHeading id="admin-approvals-heading">
              {rtl ? "الطلبات المرئية" : "Demandes visibles"}
            </AdminSectionHeading>
            {items.length === 0 ? (
              <div className="mt-3">
                <AdminEmptyState testId="admin-approvals-empty">
                  {rtl ? "لا توجد طلبات مرئية." : "Aucune demande visible."}
                </AdminEmptyState>
              </div>
            ) : (
              <ul className="mt-3 grid gap-3">
                {items.map((item) => {
                  const busy = busyId === item.approvalId;
                  const blocked = busy || reasonTooShort;
                  // Exactly the same conditions the buttons below use: the
                  // action strip is simply not drawn when none of them apply.
                  const hasActions =
                    item.status === "pending" ||
                    (item.status === "approved" && item.executionStatus === "not_started");
                  return (
                    <li
                      key={item.approvalId}
                      className={`${ADMIN_PANEL_CLASS} p-4`}
                      data-testid="admin-approval-detail"
                      data-approval-status={item.status}
                    >
                      {/* Operation type and status are machine values: only the
                          value is forced LTR, the card keeps its direction. */}
                      <div className="flex flex-wrap items-center gap-2">
                        <AdminDatum className="text-sm font-semibold text-slate-100">
                          {item.operationType}
                        </AdminDatum>
                        <AdminBadge tone={statusTone(item.status)}>
                          <AdminDatum mono={false}>{item.status}</AdminDatum>
                        </AdminBadge>
                      </div>

                      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                        <AdminField label={rtl ? "معرّف الطلب" : "Identifiant"}>
                          <AdminDatum className="text-xs text-slate-300">
                            {item.approvalId}
                          </AdminDatum>
                        </AdminField>
                        <AdminField label={rtl ? "حالة التنفيذ" : "Exécution"}>
                          <AdminDatum mono={false} className="text-xs text-slate-300">
                            {item.executionStatus}
                          </AdminDatum>
                        </AdminField>
                      </dl>

                      <div
                        className={`mt-4 flex-col gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:flex-wrap ${
                          hasActions ? "flex" : "hidden"
                        }`}
                      >
                        {item.status === "pending" && (
                          <>
                            <button
                              className={`${adminButtonClass} w-full sm:w-auto`}
                              type="button"
                              disabled={blocked}
                              onClick={() => void transition(item, "approve")}
                            >
                              {rtl ? "موافقة" : "Approuver"}
                            </button>
                            <button
                              className={`${adminDangerButtonClass} w-full sm:w-auto`}
                              type="button"
                              disabled={blocked}
                              onClick={() => void transition(item, "reject")}
                            >
                              {rtl ? "رفض" : "Rejeter"}
                            </button>
                            {item.requesterPrincipalId === access.context.staffPrincipalId && (
                              <button
                                className={`${adminDangerButtonClass} w-full sm:w-auto`}
                                type="button"
                                disabled={blocked}
                                onClick={() => void transition(item, "cancel")}
                              >
                                {rtl ? "إلغاء" : "Annuler"}
                              </button>
                            )}
                          </>
                        )}
                        {item.status === "approved" && item.executionStatus === "not_started" && (
                          <button
                            className={`${adminButtonClass} w-full sm:w-auto`}
                            type="button"
                            disabled={blocked}
                            onClick={() => void transition(item, "execute")}
                          >
                            {rtl ? "تنفيذ مرة واحدة" : "Exécuter une fois"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {message && <AdminNotice testId="admin-approvals-message">{message}</AdminNotice>}
        </div>
      )}
    </AdminFunctionalRoute>
  );
}
