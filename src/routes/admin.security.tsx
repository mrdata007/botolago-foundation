import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadAdminSecurityRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import {
  adminButtonClass,
  adminFieldClass,
  adminRepositoryContext,
} from "@/backend/admin/functional-route-helpers";
import { SupabaseAdminControlPlaneRepository } from "@/backend/admin/supabase-control-plane-repository";
import type {
  RevocationStatusDto,
  RevocationWorkerHealthDto,
} from "@/backend/admin/control-plane-contracts";
import { mapAdminError } from "@/backend/admin/errors";
import {
  ADMIN_LABEL_CLASS,
  ADMIN_PANEL_CLASS,
  AdminDatum,
  AdminField,
  AdminIconTile,
  AdminNotice,
  AdminSectionHeading,
} from "@/components/admin/AdminSurfaces";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/security")({
  ssr: false,
  loader: () => loadAdminSecurityRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminSecurityRoute,
});

/** One queue counter. Two per row on a phone, four from `sm` up. */
function QueueStat({
  label,
  value,
  alarming,
}: {
  label: string;
  value: number;
  alarming?: boolean;
}) {
  return (
    <div className={`${ADMIN_PANEL_CLASS} p-3`}>
      {/* The counter name is an English queue term: LTR data, while the cell
          itself keeps the ambient direction. */}
      <dt className={ADMIN_LABEL_CLASS}>
        <AdminDatum mono={false}>{label}</AdminDatum>
      </dt>
      <dd
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          alarming && value > 0 ? "text-rose-300" : "text-slate-100"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function AdminSecurityRoute() {
  const access = Route.useLoaderData();
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const repository = useMemo(() => new SupabaseAdminControlPlaneRepository(), []);
  const [health, setHealth] = useState<RevocationWorkerHealthDto | null>(null);
  const [principalId, setPrincipalId] = useState("");
  const [revocation, setRevocation] = useState<RevocationStatusDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (access.state !== "authorized") return;
    repository
      .getWorkerHealth(adminRepositoryContext(access))
      .then(setHealth)
      .catch((error) =>
        setMessage(
          `${rtl ? "تعذّر تحميل حالة العامل" : "État du worker indisponible"}: ${mapAdminError(error).code}`,
        ),
      );
  }, [access, repository, rtl]);

  const loadRevocation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (access.state !== "authorized") return;
    setMessage(null);
    try {
      setRevocation(
        await repository.getRevocationStatus(principalId.trim(), adminRepositoryContext(access)),
      );
    } catch (error) {
      setRevocation(null);
      setMessage(
        `${rtl ? "تعذّر تحميل حالة الإلغاء" : "État de révocation indisponible"}: ${mapAdminError(error).code}`,
      );
    }
  };

  return (
    <AdminFunctionalRoute
      access={access}
      title={rtl ? "حالة إبطال الوصول المميّز" : "État d’invalidation des accès privilégiés"}
      description={
        rtl
          ? "رفض صلاحيات Admin فوري. إبطال جلسات المزود مطلوب فقط حيثما كان مدعوماً."
          : "Le refus d’accès Admin est immédiat. L’invalidation fournisseur est seulement demandée lorsqu’elle est supportée."
      }
      testId="admin-security-status"
    >
      {access.state === "authorized" && (
        <div className="grid gap-6">
          <section aria-labelledby="admin-worker-health-heading">
            <AdminSectionHeading id="admin-worker-health-heading">
              {rtl ? "طابور الإبطال" : "File d’invalidation"}
            </AdminSectionHeading>
            {health ? (
              <dl
                className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"
                data-testid="admin-worker-health"
              >
                <QueueStat label="Queued" value={health.queue.pending} />
                <QueueStat label="Processing" value={health.queue.processing} />
                <QueueStat label="Retry" value={health.queue.retrying} />
                <QueueStat label="Dead-letter" value={health.queue.deadLetter} alarming />
              </dl>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden>
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className={`${ADMIN_PANEL_CLASS} h-[72px] animate-pulse`} />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="admin-revocation-lookup-heading">
            <AdminSectionHeading id="admin-revocation-lookup-heading">
              {rtl ? "فحص عضو الطاقم" : "Vérifier un principal"}
            </AdminSectionHeading>
            <form
              className={`mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end ${ADMIN_PANEL_CLASS} p-4`}
              onSubmit={loadRevocation}
              data-testid="admin-revocation-status"
            >
              <label className="grid gap-2 text-sm">
                <span className="text-slate-300">
                  {rtl ? "معرّف عضو الطاقم" : "Identifiant du principal"}
                </span>
                {/* A UUID is typed and read left-to-right even in Arabic. */}
                <input
                  value={principalId}
                  onChange={(event) => setPrincipalId(event.target.value)}
                  className={`${adminFieldClass} font-mono`}
                  dir="ltr"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </label>
              <button className={`${adminButtonClass} w-full sm:w-auto`} type="submit">
                {rtl ? "فحص الحالة" : "Vérifier l’état"}
              </button>
            </form>

            {revocation && (
              <dl className={`mt-3 grid gap-4 sm:grid-cols-2 ${ADMIN_PANEL_CLASS} p-4`}>
                <AdminField label={rtl ? "الوصول الإداري" : "Accès Admin"}>
                  {revocation.pendingCount === 0 ? (
                    rtl ? (
                      "لا توجد عملية معلّقة"
                    ) : (
                      "Aucune action en attente"
                    )
                  ) : (
                    <span className="text-amber-200">
                      <AdminDatum mono={false}>{`${revocation.pendingCount} pending`}</AdminDatum>
                    </span>
                  )}
                </AdminField>
                <AdminField label={rtl ? "إجراء المزوّد" : "Action fournisseur"}>
                  <AdminDatum mono={false}>
                    {revocation.latest
                      ? `${revocation.latest.status} · ${revocation.latest.resultCode ?? revocation.latest.lastErrorCode ?? "bounded"}`
                      : "not_requested"}
                  </AdminDatum>
                </AdminField>
              </dl>
            )}
          </section>

          <section className={`${ADMIN_PANEL_CLASS} flex items-start gap-3 p-4`}>
            <AdminIconTile icon={ShieldAlert} />
            <p className="min-w-0 flex-1 text-sm leading-6 text-slate-300">
              {rtl
                ? "لا يوجد زر متصفح لتشغيل عامل service-role. الاستدعاء اليدوي محمي وخارج واجهة المستخدم."
                : "Aucun bouton navigateur ne peut lancer le worker service-role. L’invocation manuelle reste protégée et hors UI."}
            </p>
          </section>

          {message && (
            <AdminNotice tone="alert" role="alert" testId="admin-security-message">
              {message}
            </AdminNotice>
          )}
        </div>
      )}
    </AdminFunctionalRoute>
  );
}
