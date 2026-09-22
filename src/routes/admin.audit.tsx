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
  AdminDatum,
  AdminEmptyState,
  AdminNotice,
  AdminSkeletonList,
} from "@/components/admin/AdminSurfaces";
import { ui, UiBadge } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/audit")({
  ssr: false,
  loader: () => loadAdminAuditRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminAuditRoute,
});

/**
 * Outcome colour, so a refusal or a failure is visible before the row is
 * read. Colour is never the only carrier: the outcome word is on screen.
 *
 * `denied` is the amber one and maps onto the kit's `caution`, which paints
 * `--ui-caution` as a FILL and puts `--ui-on-caution` on it. Amber can never
 * be a foreground here: it measured 1.78:1 as text. The distinction the two
 * remaining tones would lose also matters in an audit log -- a refused
 * operation is not a failed one, so `denied` must not borrow `negative`.
 */
function outcomeTone(outcome: AdminAuditPageDto["items"][number]["outcome"]) {
  if (outcome === "succeeded") return "positive" as const;
  if (outcome === "denied") return "caution" as const;
  return "negative" as const;
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
          {/* Kept on `AdminNotice` rather than moved onto `UiAlert`. The kit's
              alert would serve this (it takes `role` now, so the explicit
              `role="alert"` below would survive the swap), but `AdminNotice` is
              also the editorial console's notice -- admin.news, admin.news.new
              and admin.news.$articleEditionId all render it -- and converting
              it in these five routes alone would leave the console with two
              differently shaped notices. It converts centrally, in
              AdminSurfaces, and this call site does not have to change for
              that. `role="alert"` is passed here for the same reason the kit
              added the prop: a failed audit read is urgent whatever colour the
              tone picks, and a role derived from the colour would downgrade
              it to a polite status. */}
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
                    <AdminDatum className={`${ui.text.bodyStrong} ${ui.tone.default}`}>
                      {event.action}
                    </AdminDatum>
                    <UiBadge tone={outcomeTone(event.outcome)}>
                      <AdminDatum mono={false}>{event.outcome}</AdminDatum>
                    </UiBadge>
                  </div>

                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="min-w-0">
                      <dt className={ADMIN_LABEL_CLASS}>{rtl ? "التاريخ" : "Horodatage"}</dt>
                      <dd className={`mt-1 ${ui.text.meta} ${ui.tone.muted}`}>
                        <AdminDatum>{event.occurredAt}</AdminDatum>
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className={ADMIN_LABEL_CLASS}>
                        {rtl ? "معرّف الارتباط" : "Corrélation"}
                      </dt>
                      <dd className={`mt-1 ${ui.text.meta} ${ui.tone.muted}`}>
                        <AdminDatum>{event.correlationId}</AdminDatum>
                      </dd>
                    </div>
                  </dl>

                  {event.reason && (
                    <p
                      className={`mt-3 ${ui.rule.blockStart} pt-3 ${ui.text.secondary} ${ui.tone.muted}`}
                    >
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
