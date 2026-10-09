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
  approvalOperationLabel,
  approvalOperationRole,
  approvalStatusLabel,
  executionStatusLabel,
} from "@/components/admin/admin-labels";
import {
  describeAdminRefusal,
  refusedWith,
  screenNoticeFor,
} from "@/components/admin/admin-refusal";
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
        `${rtl ? "تعذّر تحميل الموافقات" : "Approbations indisponibles"} : ${describeAdminRefusal(
          mapAdminError(error).code,
          lang,
        )}`,
      );
    }
  }, [access, reads, rtl, lang]);

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
      setMessage(
        rtl ? "تم تسجيل القرار وتدقيقه." : "Décision enregistrée et consignée dans l’audit.",
      );
      await reload();
    } catch (error) {
      const code = mapAdminError(error).code;
      setMessage(
        screenNoticeFor(
          code,
          `${rtl ? "رُفض القرار" : "Décision refusée"} : ${describeAdminRefusal(code, lang)}`,
        ),
      );
      // Reported to the confirm step: it keeps the motive, and offers
      // "Se reconnecter" when the sign-in is too old.
      return refusedWith(code);
    }
  };

  /** "« Attribution du rôle … » pour le compte <id>": the request, named. */
  const requestSubject = (item: ApprovalQueueItemDto) => (
    <>
      {"« "}
      <span className="[font-weight:var(--ui-weight-body)]">
        {approvalOperationLabel(item.operationType, lang)}
      </span>
      {" »"}
      {item.targetEntityId && (
        <>
          {rtl ? " للحساب " : " pour le compte "}
          <AdminDatum className="[font-weight:var(--ui-weight-body)]">
            {item.targetEntityId}
          </AdminDatum>
        </>
      )}
    </>
  );

  return (
    <AdminFunctionalRoute
      access={access}
      title={rtl ? "الموافقات ذات التحكم المزدوج" : "Approbations à double contrôle"}
      description={
        rtl
          ? "يمرّ دور واحد اليوم عبر التحكم المزدوج: مدير المنصة. يجب أن يوافق مسؤول ثانٍ على كل طلب قبل تنفيذه."
          : "Un seul rôle passe aujourd’hui par le double contrôle : administrateur de la plateforme. Chaque demande doit être approuvée par un second administrateur avant d’être exécutée."
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
                      {/* What the request does and where it stands, in words.
                          The raw operation and status stay on the element as
                          data, for tests and support; the reader gets the
                          label. */}
                      <div
                        className="flex flex-wrap items-center gap-2"
                        data-operation-type={item.operationType}
                      >
                        <span className={`${ui.text.bodyStrong} ${ui.tone.default}`}>
                          {approvalOperationLabel(item.operationType, lang)}
                        </span>
                        <UiBadge tone={statusTone(item.status)}>
                          {approvalStatusLabel(item.status, lang)}
                        </UiBadge>
                      </div>

                      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                        {approvalOperationRole(item.operationType, lang) && (
                          <AdminField label={rtl ? "الدور" : "Rôle"}>
                            {approvalOperationRole(item.operationType, lang)}
                          </AdminField>
                        )}
                        {/* The queue carries the account's id, not its name:
                            naming the person needs the database to return it. */}
                        {item.targetEntityId && (
                          <AdminField label={rtl ? "الحساب المعني" : "Compte concerné"}>
                            <AdminDatum className={`${ui.text.meta} ${ui.tone.muted}`}>
                              {item.targetEntityId}
                            </AdminDatum>
                          </AdminField>
                        )}
                        <AdminField label={rtl ? "مقدّم الطلب" : "Demandée par"}>
                          {item.requesterPrincipalId === access.context.staffPrincipalId
                            ? rtl
                              ? "أنت"
                              : "Vous"
                            : rtl
                              ? "مسؤول آخر"
                              : "Un autre administrateur"}
                        </AdminField>
                        <AdminField label={rtl ? "حالة التنفيذ" : "Exécution"}>
                          <span data-execution-status={item.executionStatus}>
                            {executionStatusLabel(item.executionStatus, lang)}
                          </span>
                        </AdminField>
                        <AdminField label={rtl ? "معرّف الطلب" : "Identifiant de la demande"}>
                          <AdminDatum className={`${ui.text.meta} ${ui.tone.muted}`}>
                            {item.approvalId}
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
                                  {requestSubject(item)}
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
                                  {requestSubject(item)}
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
                                    {requestSubject(item)}
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
                                {requestSubject(item)}
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
