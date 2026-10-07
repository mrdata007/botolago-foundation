import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
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
import {
  ADMIN_LABEL_CLASS,
  ADMIN_PANEL_CLASS,
  AdminDatum,
  AdminField,
  AdminIconTile,
  AdminNotice,
  AdminSectionHeading,
} from "@/components/admin/AdminSurfaces";
import {
  NO_REVOCATION_REQUESTED,
  pendingCountLabel,
  REVOCATION_QUEUE_LABELS,
  revocationRequestStatusLabel,
} from "@/components/admin/admin-labels";
import { describeAdminRefusal } from "@/components/admin/admin-refusal";
import { ui, UiBadge, UiButton, UiInput } from "@/components/ui-kit";
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
      {/* The counter's name in the reader's language: it used to be the
          English queue term ("Queued", "Dead-letter"). */}
      <dt className={ADMIN_LABEL_CLASS}>{label}</dt>
      {/* A queue depth is a figure a reader scans down a row of four cells, so
          it belongs on the stat ramp: `ui.stat.lg` carries the size, the
          weight AND the tabular figures, which were hand-rolled here as a bare
          `tabular-nums`. The alarm step is `--ui-negative`, which is legible as
          text in both themes -- unlike `--ui-caution`, which is a fill only. */}
      <dd
        className={`mt-1 ${ui.stat.lg} ${
          alarming && value > 0 ? ui.tone.negative : ui.tone.default
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
          `${rtl ? "تعذّر تحميل حالة طابور الإبطال" : "État de la file d’invalidation indisponible"} : ${describeAdminRefusal(mapAdminError(error).code, lang)}`,
        ),
      );
  }, [access, repository, rtl, lang]);

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
        `${rtl ? "تعذّر تحميل حالة الإلغاء" : "État de révocation indisponible"} : ${describeAdminRefusal(mapAdminError(error).code, lang)}`,
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
                <QueueStat
                  label={REVOCATION_QUEUE_LABELS.pending[lang]}
                  value={health.queue.pending}
                />
                <QueueStat
                  label={REVOCATION_QUEUE_LABELS.processing[lang]}
                  value={health.queue.processing}
                />
                <QueueStat
                  label={REVOCATION_QUEUE_LABELS.retrying[lang]}
                  value={health.queue.retrying}
                />
                <QueueStat
                  label={REVOCATION_QUEUE_LABELS.deadLetter[lang]}
                  value={health.queue.deadLetter}
                  alarming
                />
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
              {/* A UUID is typed and read left-to-right even in Arabic, so
                  `dir` is forced on the field; `UiInput` renders and wires the
                  label itself, so the hand-built label/span/input trio goes. */}
              <UiInput
                label={rtl ? "معرّف عضو الطاقم" : "Identifiant du principal"}
                value={principalId}
                onChange={(event) => setPrincipalId(event.target.value)}
                fieldClassName="font-mono"
                dir="ltr"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                required
              />
              <UiButton className="sm:w-auto" type="submit">
                {rtl ? "فحص الحالة" : "Vérifier l’état"}
              </UiButton>
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
                    // Was `text-amber-200`: the amber as a FOREGROUND, which is
                    // the one thing this colour can never be -- `--ui-caution`
                    // measured 1.78:1 as text. `UiBadge tone="caution"` paints
                    // the amber as the fill and puts `--ui-on-caution` on it,
                    // and a pending count is a state token rather than a
                    // sentence, which is what the badge is for.
                    <UiBadge tone="caution">
                      {pendingCountLabel(revocation.pendingCount, lang)}
                    </UiBadge>
                  )}
                </AdminField>
                <AdminField label={rtl ? "إجراء المزوّد" : "Action fournisseur"}>
                  {/* The state in words; the provider's own result or error
                      code, when there is one, stays beside it as data. */}
                  {revocation.latest ? (
                    <span data-revocation-status={revocation.latest.status}>
                      {revocationRequestStatusLabel(revocation.latest.status, lang)}
                      {(revocation.latest.resultCode ?? revocation.latest.lastErrorCode) && (
                        <>
                          {" · "}
                          <AdminDatum className={`${ui.text.meta} ${ui.tone.muted}`}>
                            {revocation.latest.resultCode ?? revocation.latest.lastErrorCode}
                          </AdminDatum>
                        </>
                      )}
                    </span>
                  ) : (
                    NO_REVOCATION_REQUESTED[lang]
                  )}
                </AdminField>
              </dl>
            )}
          </section>

          <section className={`${ADMIN_PANEL_CLASS} flex items-start gap-3 p-4`}>
            <AdminIconTile icon={ShieldAlert} />
            <p className={`min-w-0 flex-1 ${ui.text.secondary} ${ui.tone.muted}`}>
              {rtl
                ? "لا يمكن تشغيل معالجة هذا الطابور من المتصفح: تجري على الخادم، وتشغيلها يدوياً محمي ويتم خارج هذه الواجهة."
                : "Le traitement de cette file ne se lance pas depuis le navigateur : il tourne sur le serveur, et son lancement manuel reste protégé, hors de cette interface."}
            </p>
          </section>

          {/* Kept on `AdminNotice` rather than moved onto `UiAlert`, for the
              same reason as admin.audit: this component is also the editorial
              console's notice (admin.news and its two editor routes render
              it), so swapping it here alone would leave the console with two
              differently shaped notices. It converts centrally, in
              AdminSurfaces, and forwards `role` exactly as `UiAlert` now does.
              `role="alert"` is stated explicitly because this message is the
              revocation queue's alarm: "the worker health could not be read"
              is urgent whatever tone the colour picks, and a role derived from
              the tone would announce it as a polite status. */}
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
