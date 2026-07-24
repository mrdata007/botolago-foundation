import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadAdminSecurityRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { adminRepositoryContext } from "@/backend/admin/functional-route-helpers";
import { SupabaseAdminControlPlaneRepository } from "@/backend/admin/supabase-control-plane-repository";
import type {
  RevocationStatusDto,
  RevocationWorkerHealthDto,
} from "@/backend/admin/control-plane-contracts";
import { mapAdminError } from "@/backend/admin/errors";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/security")({
  ssr: false,
  loader: () => loadAdminSecurityRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminSecurityRoute,
});

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
        <>
          {health && (
            <dl className="grid gap-3 text-sm sm:grid-cols-4" data-testid="admin-worker-health">
              <div>
                <dt className="text-slate-400">Queued</dt>
                <dd>{health.queue.pending}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Processing</dt>
                <dd>{health.queue.processing}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Retry</dt>
                <dd>{health.queue.retrying}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Dead-letter</dt>
                <dd>{health.queue.deadLetter}</dd>
              </div>
            </dl>
          )}
          <form
            className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"
            onSubmit={loadRevocation}
            data-testid="admin-revocation-status"
          >
            <label className="grid gap-2 text-sm">
              <span>{rtl ? "معرّف عضو الطاقم" : "Identifiant du principal"}</span>
              <input
                value={principalId}
                onChange={(event) => setPrincipalId(event.target.value)}
                className="min-h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 text-slate-100"
                inputMode="text"
                required
              />
            </label>
            <button
              className="min-h-11 self-end rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950"
              type="submit"
            >
              {rtl ? "فحص الحالة" : "Vérifier l’état"}
            </button>
          </form>
          {revocation && (
            <dl className="mt-4 grid gap-3 rounded-lg border border-slate-700 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-400">{rtl ? "الوصول الإداري" : "Accès Admin"}</dt>
                <dd>
                  {revocation.pendingCount === 0
                    ? rtl
                      ? "لا توجد عملية معلّقة"
                      : "Aucune action en attente"
                    : `${revocation.pendingCount} pending`}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">{rtl ? "إجراء المزوّد" : "Action fournisseur"}</dt>
                <dd>
                  {revocation.latest
                    ? `${revocation.latest.status} · ${revocation.latest.resultCode ?? revocation.latest.lastErrorCode ?? "bounded"}`
                    : "not_requested"}
                </dd>
              </div>
            </dl>
          )}
          <p className="mt-5 rounded-lg border border-slate-700 p-4 text-sm text-slate-300">
            {rtl
              ? "لا يوجد زر متصفح لتشغيل عامل service-role. الاستدعاء اليدوي محمي وخارج واجهة المستخدم."
              : "Aucun bouton navigateur ne peut lancer le worker service-role. L’invocation manuelle reste protégée et hors UI."}
          </p>
          {message && (
            <p className="mt-4 text-sm text-amber-200" role="alert">
              {message}
            </p>
          )}
        </>
      )}
    </AdminFunctionalRoute>
  );
}
