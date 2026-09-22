import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { loadAdminStaffRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { adminRepositoryContext } from "@/backend/admin/functional-route-helpers";
import { SupabaseAdminControlPlaneRepository } from "@/backend/admin/supabase-control-plane-repository";
import { SupabaseAdminSecurityOperationsRepository } from "@/backend/admin/supabase-security-operations-repository";
import { SupabaseAdminAuthorizationRepository } from "@/backend/admin/supabase-repository";
import type { AssignmentHistoryPageDto, StaffAssignmentDto } from "@/backend/admin/contracts";
import type { StaffPrincipalSummaryDto } from "@/backend/admin/control-plane-contracts";
import { mapAdminError } from "@/backend/admin/errors";
import {
  ADMIN_LABEL_CLASS,
  ADMIN_PANEL_CLASS,
  AdminDatum,
  AdminEmptyState,
  AdminField,
  AdminNotice,
  AdminSectionHeading,
  AdminSkeletonList,
} from "@/components/admin/AdminSurfaces";
import { AdminDestructiveAction } from "@/components/admin/AdminDestructiveAction";
import {
  destructiveActionReducer,
  IDLE_DESTRUCTIVE_ACTION,
} from "@/components/admin/destructive-action";
import { ui, UiBadge } from "@/components/ui-kit";
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

/**
 * The badge tone a principal's status carries.
 *
 * `suspended` is the amber one and maps onto the kit's `caution`, which is a
 * FILL with `--ui-on-caution` on it: the amber measured 1.78:1 as a
 * foreground. It also has to stay distinct from `negative` -- an account held
 * back pending a decision is not a revoked one, and this badge is what an
 * operator reads before choosing between "Restaurer" and the emergency
 * revocation below.
 */
function statusTone(status: StaffPrincipalSummaryDto["status"]) {
  if (status === "active") return "positive" as const;
  if (status === "suspended") return "caution" as const;
  return "negative" as const;
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
  const [message, setMessage] = useState<string | null>(null);
  /**
   * One armed action at a time, carrying the motive typed for *that* action.
   * This page used to hold a single page-level `reason`, which left every
   * assignment row's "Révoquer le rôle" armed with a motive written about a
   * different role. See `components/admin/destructive-action.ts`.
   */
  const [action, dispatch] = useReducer(destructiveActionReducer, IDLE_DESTRUCTIVE_ACTION);

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

  const mutate = async (operation: "suspend" | "restore" | "emergency", reason: string) => {
    if (access.state !== "authorized") return;
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
    }
  };

  const revokeAssignment = async (assignmentId: string, reason: string) => {
    if (access.state !== "authorized") return;
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
    }
  };

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
            {/* A forked copy of ADMIN_LABEL_CLASS used to live here, with a
                bare `tracking-wide`: unprefixed letter-spacing pulls joined
                Arabic letterforms apart. The shared primitive spaces LTR only. */}
            <span className={ADMIN_LABEL_CLASS}>{rtl ? "معرّف الهوية" : "Identifiant"}</span>
            <AdminDatum className={`${ui.text.meta} ${ui.tone.muted}`}>{principalId}</AdminDatum>
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
                    <UiBadge tone={statusTone(principal.status)}>
                      <AdminDatum mono={false}>{principal.status}</AdminDatum>
                    </UiBadge>
                  </AdminField>
                  <AdminField label={rtl ? "سياسة المصادقة" : "Politique AAL"}>
                    <UiBadge tone={principal.mfaRequired ? "positive" : "negative"}>
                      <AdminDatum mono={false}>
                        {principal.mfaRequired ? "MFA required" : "invalid policy"}
                      </AdminDatum>
                    </UiBadge>
                  </AdminField>
                  <AdminField label={rtl ? "الأدوار" : "Rôles"}>
                    {principal.roles.length > 0 ? (
                      <AdminDatum mono={false} className={ui.tone.default}>
                        {principal.roles.map((role) => role.name).join(", ")}
                      </AdminDatum>
                    ) : (
                      // An absence, not a value: `--ui-on-surface-faint` is the
                      // step this system reserves for one.
                      <span className={ui.tone.faint}>{rtl ? "لا شيء" : "Aucun"}</span>
                    )}
                  </AdminField>
                  <AdminField label={rtl ? "طابور الإبطال" : "File d’invalidation"}>
                    {/* A figure, so it goes on the stat ramp rather than on the
                        type ramp with a hand-rolled `tabular-nums` beside it. */}
                    <span className={ui.stat.md}>{principal.pendingSessionRevocationCount}</span>
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
                            <AdminDatum
                              mono={false}
                              className={`[font-weight:var(--ui-weight-heavy)] ${ui.tone.default}`}
                            >
                              {assignment.role}
                            </AdminDatum>
                          </AdminField>
                          <AdminField label={rtl ? "الانتهاء" : "Expiration"}>
                            {assignment.expiresAt ? (
                              <AdminDatum className={`${ui.text.meta} ${ui.tone.muted}`}>
                                {assignment.expiresAt}
                              </AdminDatum>
                            ) : (
                              // Again an absence rather than a value, so it
                              // takes the faint step, not the muted one.
                              <AdminDatum
                                mono={false}
                                className={`${ui.text.meta} ${ui.tone.faint}`}
                              >
                                no expiry
                              </AdminDatum>
                            )}
                          </AdminField>
                        </dl>
                        {/* Revocation is immediate and audited, so it takes a
                            confirm step of its own. The action key carries the
                            assignment id: the motive typed here belongs to this
                            row and cannot arm any other row's revocation. */}
                        <AdminDestructiveAction
                          actionKey={`revoke-assignment:${assignment.assignmentId}`}
                          state={action}
                          dispatch={dispatch}
                          minimumReasonLength={MINIMUM_REASON_LENGTH}
                          rtl={rtl}
                          className="mt-4"
                          testId="admin-assignment-revoke"
                          triggerTestId="admin-assignment-revoke"
                          triggerLabel={rtl ? "إلغاء الدور" : "Révoquer le rôle"}
                          confirmLabel={rtl ? "تأكيد الإلغاء" : "Confirmer la révocation"}
                          confirmPrompt={
                            <>
                              {rtl ? "إلغاء الدور " : "Révoquer le rôle "}
                              <AdminDatum
                                mono={false}
                                className="[font-weight:var(--ui-weight-body)]"
                              >
                                {assignment.role}
                              </AdminDatum>
                              {rtl
                                ? "؟ يُسحب هذا الوصول المميّز فوراً ويُطلب إبطال الجلسة."
                                : " ? Cet accès privilégié est retiré immédiatement et l’invalidation de session est demandée."}
                            </>
                          }
                          onConfirm={(reason) => revokeAssignment(assignment.assignmentId, reason)}
                        />
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
                        <AdminDatum mono={false} className={`${ui.text.body} ${ui.tone.default}`}>
                          {assignment.role}
                        </AdminDatum>
                        <UiBadge>
                          <AdminDatum mono={false}>{assignment.status}</AdminDatum>
                        </UiBadge>
                        <AdminDatum className={`${ui.text.meta} ${ui.tone.muted}`}>
                          {assignment.grantedAt ?? assignment.startsAt ?? "—"}
                        </AdminDatum>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {/* Each operation asks for its own motive inside its own confirm
                  step. The page no longer holds one shared motive that armed
                  every button on screen at once. */}
              <section aria-labelledby="admin-staff-operations-heading">
                <AdminSectionHeading id="admin-staff-operations-heading">
                  {rtl ? "عمليات الوصول" : "Opérations d’accès"}
                </AdminSectionHeading>
                <div
                  className={`mt-3 ${ADMIN_PANEL_CLASS} grid gap-3 p-4`}
                  data-testid="admin-staff-operations"
                >
                  {principal.status === "active" && (
                    <AdminDestructiveAction
                      actionKey="principal:suspend"
                      state={action}
                      dispatch={dispatch}
                      minimumReasonLength={MINIMUM_REASON_LENGTH}
                      rtl={rtl}
                      tone="primary"
                      testId="admin-staff-suspend"
                      triggerTestId="admin-staff-suspend"
                      triggerLabel={rtl ? "تعليق الوصول" : "Suspendre"}
                      confirmLabel={rtl ? "تأكيد التعليق" : "Confirmer la suspension"}
                      confirmPrompt={
                        rtl
                          ? "تعليق الوصول الإداري لهذه الهوية؟ تبقى الأدوار قائمة، ويُرفض كل وصول إلى وحدة الإدارة حتى الاستعادة."
                          : "Suspendre l’accès Admin de ce principal ? Les rôles restent en place et tout accès à la console est refusé jusqu’à restauration."
                      }
                      onConfirm={(reason) => mutate("suspend", reason)}
                    />
                  )}
                  {principal.status === "suspended" && (
                    <AdminDestructiveAction
                      actionKey="principal:restore"
                      state={action}
                      dispatch={dispatch}
                      minimumReasonLength={MINIMUM_REASON_LENGTH}
                      rtl={rtl}
                      tone="primary"
                      testId="admin-staff-restore"
                      triggerTestId="admin-staff-restore"
                      triggerLabel={rtl ? "استعادة الوصول" : "Restaurer"}
                      confirmLabel={rtl ? "تأكيد الاستعادة" : "Confirmer la restauration"}
                      confirmPrompt={
                        rtl
                          ? "استعادة الوصول الإداري لهذه الهوية؟ تعود الأدوار النشطة إلى العمل فوراً."
                          : "Restaurer l’accès Admin de ce principal ? Les rôles actifs reprennent effet immédiatement."
                      }
                      onConfirm={(reason) => mutate("restore", reason)}
                    />
                  )}
                  {principal.status !== "revoked" && (
                    <AdminDestructiveAction
                      actionKey="principal:emergency"
                      state={action}
                      dispatch={dispatch}
                      minimumReasonLength={MINIMUM_REASON_LENGTH}
                      rtl={rtl}
                      testId="admin-emergency-revocation"
                      triggerTestId="admin-emergency-revocation"
                      triggerLabel={rtl ? "إلغاء طارئ" : "Révocation d’urgence"}
                      confirmLabel={rtl ? "تأكيد الإلغاء الطارئ" : "Confirmer la révocation"}
                      confirmPrompt={
                        <>
                          {rtl ? "إلغاء طارئ للهوية " : "Révocation d’urgence du principal "}
                          <AdminDatum className={ui.text.meta}>{principalId}</AdminDatum>
                          {rtl
                            ? "؟ تُسحب كل الأدوار ويُرفض الوصول الإداري فوراً. لا يمكن التراجع عن هذه العملية."
                            : " ? Tous les rôles sont retirés et l’accès Admin est refusé immédiatement. L’opération est irréversible."}
                        </>
                      }
                      onConfirm={(reason) => mutate("emergency", reason)}
                    />
                  )}
                  <p className={`${ui.text.meta} ${ui.tone.muted}`}>
                    {rtl
                      ? "تتطلب كل عملية تأكيداً صريحاً وسبباً خاصاً بها، ويُسجَّل كلاهما في التدقيق."
                      : "Chaque opération exige une confirmation explicite et un motif qui lui est propre; les deux sont consignés dans l’audit."}
                  </p>
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
