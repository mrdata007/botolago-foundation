import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { loadAdminStaffRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { adminRepositoryContext } from "@/backend/admin/functional-route-helpers";
import { SupabaseAdminControlPlaneRepository } from "@/backend/admin/supabase-control-plane-repository";
import { SupabaseAdminSecurityOperationsRepository } from "@/backend/admin/supabase-security-operations-repository";
import type { ApprovalQueueItemDto } from "@/backend/admin/control-plane-contracts";
import { mapAdminError } from "@/backend/admin/errors";
import {
  ADMIN_PANEL_CLASS,
  AdminDatum,
  AdminEmptyState,
  AdminField,
  AdminNotice,
  AdminSectionHeading,
} from "@/components/admin/AdminSurfaces";
import { AdminDestructiveAction } from "@/components/admin/AdminDestructiveAction";
import {
  destructiveActionReducer,
  IDLE_DESTRUCTIVE_ACTION,
} from "@/components/admin/destructive-action";
import { ui, UiBadge } from "@/components/ui-kit";
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

/**
 * The badge tone a queue status carries.
 *
 * `pending` is the amber one, and amber is the reason this maps onto the kit's
 * `caution` rather than onto a colour picked here. `--ui-caution` measured
 * 1.78:1 as a foreground, so it can only ever be a FILL -- `UiBadge` paints it
 * and puts `--ui-on-caution` on top. The two tones it was tempting to reuse
 * instead both say the wrong thing about a request still waiting for a second
 * administrator: `negative` reads as a refusal, `neutral` sits on the sunken
 * surface, which is how this product draws "already dealt with".
 */
function statusTone(status: ApprovalQueueItemDto["status"]) {
  if (status === "approved") return "positive" as const;
  if (status === "pending") return "caution" as const;
  if (status === "rejected" || status === "cancelled") return "negative" as const;
  return "neutral" as const;
}

function AdminApprovalsRoute() {
  const access = Route.useLoaderData();
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const reads = useMemo(() => new SupabaseAdminControlPlaneRepository(), []);
  const mutations = useMemo(() => new SupabaseAdminSecurityOperationsRepository(), []);
  const [items, setItems] = useState<readonly ApprovalQueueItemDto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  /**
   * One armed decision at a time, carrying the motive typed for *that* decision
   * on *that* request. The queue used to hold a single page-level `reason`,
   * so a motive written about one request armed "Rejeter" and "Annuler" on
   * every other row. See `components/admin/destructive-action.ts`.
   */
  const [action, dispatch] = useReducer(destructiveActionReducer, IDLE_DESTRUCTIVE_ACTION);

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
    reason: string,
  ) => {
    if (access.state !== "authorized") return;
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
        <div className="grid gap-6">
          {/* The motive is asked for inside each decision's own confirm step.
              A single page-level field was the defect: it armed every row. */}
          <p
            className={`${ADMIN_PANEL_CLASS} p-4 ${ui.text.meta} ${ui.tone.muted}`}
            data-testid="admin-approval-reason-hint"
          >
            {rtl
              ? "يتطلب كل قرار تأكيداً صريحاً وسبباً خاصاً بذلك الطلب وحده: ثمانية أحرف على الأقل، ويُسجَّل في التدقيق."
              : "Chaque décision exige une confirmation explicite et un motif propre à cette demande : 8 caractères minimum, consigné dans l’audit."}
          </p>

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
                  // Every action key carries this request's own id, so a motive
                  // typed here can never reach another row -- nor another
                  // operation on this same row.
                  const key = (operation: string) => `${operation}:${item.approvalId}`;
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
                        <AdminDatum className={`${ui.text.bodyStrong} ${ui.tone.default}`}>
                          {item.operationType}
                        </AdminDatum>
                        <UiBadge tone={statusTone(item.status)}>
                          <AdminDatum mono={false}>{item.status}</AdminDatum>
                        </UiBadge>
                      </div>

                      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                        <AdminField label={rtl ? "معرّف الطلب" : "Identifiant"}>
                          <AdminDatum className={`${ui.text.meta} ${ui.tone.muted}`}>
                            {item.approvalId}
                          </AdminDatum>
                        </AdminField>
                        <AdminField label={rtl ? "حالة التنفيذ" : "Exécution"}>
                          <AdminDatum mono={false} className={`${ui.text.meta} ${ui.tone.muted}`}>
                            {item.executionStatus}
                          </AdminDatum>
                        </AdminField>
                      </dl>

                      <div
                        className={`mt-4 flex-col gap-2 ${ui.rule.blockStart} pt-4 sm:flex-row sm:flex-wrap ${
                          hasActions ? "flex" : "hidden"
                        }`}
                      >
                        {item.status === "pending" && (
                          <>
                            <AdminDestructiveAction
                              actionKey={key("approve")}
                              state={action}
                              dispatch={dispatch}
                              minimumReasonLength={MINIMUM_REASON_LENGTH}
                              rtl={rtl}
                              tone="primary"
                              testId="admin-approval-approve"
                              triggerTestId="admin-approval-approve"
                              triggerLabel={rtl ? "موافقة" : "Approuver"}
                              confirmLabel={rtl ? "تأكيد الموافقة" : "Confirmer l’approbation"}
                              confirmPrompt={
                                <>
                                  {rtl ? "الموافقة على الطلب " : "Approuver la demande "}
                                  {/* The emphasis inside every confirm prompt
                                      below is the same 600 it always was --
                                      `--ui-weight-body` IS `font-semibold`.
                                      Only its source moves onto the ramp; the
                                      weight that marks the object of a
                                      destructive sentence does not change. */}
                                  <AdminDatum className="[font-weight:var(--ui-weight-body)]">
                                    {item.operationType}
                                  </AdminDatum>
                                  {rtl
                                    ? "؟ تصبح قابلة للتنفيذ بعد ذلك."
                                    : " ? Elle devient exécutable ensuite."}
                                </>
                              }
                              onConfirm={(reason) => transition(item, "approve", reason)}
                            />
                            <AdminDestructiveAction
                              actionKey={key("reject")}
                              state={action}
                              dispatch={dispatch}
                              minimumReasonLength={MINIMUM_REASON_LENGTH}
                              rtl={rtl}
                              testId="admin-approval-reject"
                              triggerTestId="admin-approval-reject"
                              triggerLabel={rtl ? "رفض" : "Rejeter"}
                              confirmLabel={rtl ? "تأكيد الرفض" : "Confirmer le rejet"}
                              confirmPrompt={
                                <>
                                  {rtl ? "رفض الطلب " : "Rejeter la demande "}
                                  <AdminDatum className="[font-weight:var(--ui-weight-body)]">
                                    {item.operationType}
                                  </AdminDatum>
                                  {rtl
                                    ? "؟ القرار نهائي ولا يمكن الموافقة على الطلب بعده."
                                    : " ? La décision est définitive : la demande ne pourra plus être approuvée."}
                                </>
                              }
                              onConfirm={(reason) => transition(item, "reject", reason)}
                            />
                            {item.requesterPrincipalId === access.context.staffPrincipalId && (
                              <AdminDestructiveAction
                                actionKey={key("cancel")}
                                state={action}
                                dispatch={dispatch}
                                minimumReasonLength={MINIMUM_REASON_LENGTH}
                                rtl={rtl}
                                testId="admin-approval-cancel"
                                triggerTestId="admin-approval-cancel"
                                triggerLabel={rtl ? "إلغاء" : "Annuler"}
                                confirmLabel={rtl ? "تأكيد الإلغاء" : "Confirmer l’annulation"}
                                confirmPrompt={
                                  <>
                                    {rtl ? "إلغاء طلبك " : "Annuler votre demande "}
                                    <AdminDatum className="[font-weight:var(--ui-weight-body)]">
                                      {item.operationType}
                                    </AdminDatum>
                                    {rtl
                                      ? "؟ لن يكون بالإمكان الموافقة عليه بعد ذلك."
                                      : " ? Elle ne pourra plus être approuvée."}
                                  </>
                                }
                                onConfirm={(reason) => transition(item, "cancel", reason)}
                              />
                            )}
                          </>
                        )}
                        {item.status === "approved" && item.executionStatus === "not_started" && (
                          <AdminDestructiveAction
                            actionKey={key("execute")}
                            state={action}
                            dispatch={dispatch}
                            minimumReasonLength={MINIMUM_REASON_LENGTH}
                            rtl={rtl}
                            tone="primary"
                            testId="admin-approval-execute"
                            triggerTestId="admin-approval-execute"
                            triggerLabel={rtl ? "تنفيذ مرة واحدة" : "Exécuter une fois"}
                            confirmLabel={rtl ? "تأكيد التنفيذ" : "Confirmer l’exécution"}
                            confirmPrompt={
                              <>
                                {rtl ? "تنفيذ الطلب " : "Exécuter la demande "}
                                <AdminDatum className="[font-weight:var(--ui-weight-body)]">
                                  {item.operationType}
                                </AdminDatum>
                                {rtl
                                  ? "؟ يجري التنفيذ مرة واحدة فقط ولا يمكن التراجع عنه."
                                  : " ? L’exécution n’a lieu qu’une seule fois et ne peut pas être annulée."}
                              </>
                            }
                            onConfirm={(reason) => transition(item, "execute", reason)}
                          />
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
