import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadAdminAuditRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { adminRepositoryContext } from "@/backend/admin/functional-route-helpers";
import { SupabaseAdminControlPlaneRepository } from "@/backend/admin/supabase-control-plane-repository";
import type { AdminAuditPageDto } from "@/backend/admin/contracts";
import { mapAdminError } from "@/backend/admin/errors";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/audit")({
  ssr: false,
  loader: () => loadAdminAuditRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminAuditRoute,
});

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
    >
      {access.state === "authorized" && (
        <>
          {page?.items.length === 0 && (
            <p className="text-sm text-slate-400">{rtl ? "لا توجد أحداث." : "Aucun événement."}</p>
          )}
          <ol className="grid gap-3">
            {page?.items.map((event) => (
              <li key={event.id} className="rounded-lg border border-slate-700 p-4 text-sm">
                <p className="font-medium">
                  {event.action} · {event.outcome}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {event.occurredAt} · {event.correlationId}
                </p>
                <p className="mt-2 text-slate-300">{event.reason}</p>
              </li>
            ))}
          </ol>
          {message && (
            <p className="text-sm text-amber-200" role="alert">
              {message}
            </p>
          )}
        </>
      )}
    </AdminFunctionalRoute>
  );
}
