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
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/approvals")({
  ssr: false,
  loader: () => loadAdminStaffRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminApprovalsRoute,
});

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
        <>
          <label className="grid gap-2 text-sm">
            <span>{rtl ? "سبب القرار أو التنفيذ" : "Motif de décision ou d’exécution"}</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={8}
              maxLength={500}
              className={adminFieldClass}
            />
          </label>
          {items.length === 0 ? (
            <p className="mt-5 text-sm text-slate-400">
              {rtl ? "لا توجد طلبات مرئية." : "Aucune demande visible."}
            </p>
          ) : (
            <ul className="mt-5 grid gap-3">
              {items.map((item) => (
                <li
                  key={item.approvalId}
                  className="rounded-lg border border-slate-700 p-4"
                  data-testid="admin-approval-detail"
                >
                  <p className="break-all text-sm font-medium">
                    {item.operationType} · {item.status}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{item.approvalId}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.status === "pending" && (
                      <>
                        <button
                          className={adminButtonClass}
                          type="button"
                          disabled={busyId === item.approvalId || reason.trim().length < 8}
                          onClick={() => void transition(item, "approve")}
                        >
                          {rtl ? "موافقة" : "Approuver"}
                        </button>
                        <button
                          className={adminDangerButtonClass}
                          type="button"
                          disabled={busyId === item.approvalId || reason.trim().length < 8}
                          onClick={() => void transition(item, "reject")}
                        >
                          {rtl ? "رفض" : "Rejeter"}
                        </button>
                        {item.requesterPrincipalId === access.context.staffPrincipalId && (
                          <button
                            className={adminDangerButtonClass}
                            type="button"
                            disabled={busyId === item.approvalId || reason.trim().length < 8}
                            onClick={() => void transition(item, "cancel")}
                          >
                            {rtl ? "إلغاء" : "Annuler"}
                          </button>
                        )}
                      </>
                    )}
                    {item.status === "approved" && item.executionStatus === "not_started" && (
                      <button
                        className={adminButtonClass}
                        type="button"
                        disabled={busyId === item.approvalId || reason.trim().length < 8}
                        onClick={() => void transition(item, "execute")}
                      >
                        {rtl ? "تنفيذ مرة واحدة" : "Exécuter une fois"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
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
