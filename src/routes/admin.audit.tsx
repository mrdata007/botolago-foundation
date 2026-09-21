import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadAdminAuditRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { adminRepositoryContext } from "@/backend/admin/functional-route-helpers";
import { SupabaseAdminControlPlaneRepository } from "@/backend/admin/supabase-control-plane-repository";
import type { AdminAuditPageDto } from "@/backend/admin/contracts";
import { mapAdminError } from "@/backend/admin/errors";
import {
  ADMIN_LABEL_CLASS,
  ADMIN_PANEL_CLASS,
  AdminBadge,
  AdminDatum,
  AdminEmptyState,
  AdminNotice,
  AdminSkeletonList,
} from "@/components/admin/AdminSurfaces";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/audit")({
  ssr: false,
  loader: () => loadAdminAuditRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminAuditRoute,
});

/** Outcome colour, so a refusal or a failure is visible before the row is
 *  read. Colour is never the only carrier: the outcome word is on screen. */
function outcomeTone(outcome: AdminAuditPageDto["items"][number]["outcome"]) {
  if (outcome === "succeeded") return "positive" as const;
  if (outcome === "denied") return "warning" as const;
  return "danger" as const;
}

function AdminAuditRoute() {
  const access = Route.useLoaderData();
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const repository = useMemo(() => new SupabaseAdminControlPlaneRepository(), []);
  const [page, setPage] = useState<AdminAuditPageDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (access.state !== "authorized") return;
    repository
      .listAudit({}, null, 50, adminRepositoryContext(access))
      .then(setPage)
      .catch((error) =>
        setMessage(
          `${rtl ? "تعذّر تحميل السجل" : "Audit indisponible"}: ${mapAdminError(error).code}`,
        ),
      );
  }, [access, repository, rtl]);

  return (
    <AdminFunctionalRoute
      access={access}
      title={rtl ? "سجل الأمان للقراءة فقط" : "Journal de sécurité en lecture seule"}
      description={
        rtl
          ? "لا تُعرض الأسرار أو حمولات المصادقة الخاصة."
          : "Aucun secret ni payload Auth privé n’est exposé."
      }
      testId="admin-audit-log"
    >
      {access.state === "authorized" && (
        <div className="grid gap-4">
          {message && (
            <AdminNotice tone="alert" role="alert" testId="admin-audit-message">
              {message}
            </AdminNotice>
          )}

          {!page && !message && <AdminSkeletonList rows={3} testId="admin-audit-loading" />}

          {page?.items.length === 0 && (
            <AdminEmptyState testId="admin-audit-empty">
              {rtl ? "لا توجد أحداث." : "Aucun événement."}
            </AdminEmptyState>
          )}

          {page && page.items.length > 0 && (
            <ol className="grid gap-3">
              {page.items.map((event) => (
                <li
                  key={event.id}
                  className={`${ADMIN_PANEL_CLASS} p-4`}
                  data-testid="admin-audit-event"
                >
                  {/* The action slug and the outcome are machine values: the
                      label around them keeps the ambient direction, only the
                      data is forced LTR. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminDatum className="text-sm font-semibold text-slate-100">
                      {event.action}
                    </AdminDatum>
                    <AdminBadge tone={outcomeTone(event.outcome)}>
                      <AdminDatum mono={false}>{event.outcome}</AdminDatum>
                    </AdminBadge>
                  </div>

                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="min-w-0">
                      <dt className={ADMIN_LABEL_CLASS}>{rtl ? "التاريخ" : "Horodatage"}</dt>
                      <dd className="mt-1 text-xs text-slate-300">
                        <AdminDatum>{event.occurredAt}</AdminDatum>
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className={ADMIN_LABEL_CLASS}>
                        {rtl ? "معرّف الارتباط" : "Corrélation"}
                      </dt>
                      <dd className="mt-1 text-xs text-slate-300">
                        <AdminDatum>{event.correlationId}</AdminDatum>
                      </dd>
                    </div>
                  </dl>

                  {event.reason && (
                    <p className="mt-3 border-t border-slate-800 pt-3 text-sm leading-6 text-slate-300">
                      {event.reason}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </AdminFunctionalRoute>
  );
}
