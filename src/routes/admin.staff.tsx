import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useMemo, useReducer, useState } from "react";
import { loadAdminStaffRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { adminRepositoryContext } from "@/backend/admin/functional-route-helpers";
import { SupabaseAdminSecurityOperationsRepository } from "@/backend/admin/supabase-security-operations-repository";
import type {
  DirectlyAssignableAdminRole,
  StaffUserResolutionDto,
} from "@/backend/admin/security-operations-contracts";
import { mapAdminError } from "@/backend/admin/errors";
import {
  ADMIN_PANEL_CLASS,
  AdminDatum,
  AdminField,
  AdminNotice,
  AdminSectionHeading,
} from "@/components/admin/AdminSurfaces";
import { AdminDestructiveAction } from "@/components/admin/AdminDestructiveAction";
import {
  destructiveActionReducer,
  isBusy,
  IDLE_DESTRUCTIVE_ACTION,
} from "@/components/admin/destructive-action";
import { ui, UiBadge, UiButton, UiInput, UiLinkButton, UiSelect } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/staff")({
  ssr: false,
  loader: () => loadAdminStaffRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminStaffRootRoute,
});

/** The shortest reason the server accepts. Mirrored only so the caller can
 *  see why a button stays disabled; the server re-validates every call. */
const MINIMUM_REASON_LENGTH = 8;

/** The directly assignable roles, in the order the console offers them.
 *  `platform_admin` is deliberately absent: it goes through dual control. */
const ASSIGNABLE_ROLES: readonly DirectlyAssignableAdminRole[] = [
  "editor",
  "publisher",
  "content_admin",
  "football_operator",
  "fantasy_operator",
  "notification_operator",
  "support_agent",
  "moderator",
  "security_admin",
];

// This route has a child route ($principalId). Without this, TanStack
// Router still matches it but never renders it: a parent route in a nested
// (dot-separated) file hierarchy must render <Outlet /> itself for a deeper
// match to appear at all -- the exact same defect already found and fixed
// in admin.news.tsx (see that file's comment for the full explanation).
// Missing this made /admin/staff/$principalId silently unreachable: the URL
// changed but the staff list stayed on screen.
function AdminStaffRootRoute() {
  const isChildRoute = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === "/admin/staff/$principalId"),
  });
  return isChildRoute ? <Outlet /> : <AdminStaffRoute />;
}

function AdminStaffRoute() {
  const access = Route.useLoaderData();
  const { lang } = useI18n();
  const repository = useMemo(() => new SupabaseAdminSecurityOperationsRepository(), []);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DirectlyAssignableAdminRole>("editor");
  const [expiresAt, setExpiresAt] = useState("");
  const [result, setResult] = useState<StaffUserResolutionDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * One armed action at a time, carrying the motive typed for *that* action.
   * This page used to hold a single page-level `reason` bound to two inputs and
   * read by three mutations: a motive typed into "Motif de création" silently
   * armed "Affecter le rôle standard" and "Demander platform_admin" as well, so
   * a stray tap granted privilege with a motive written about something else.
   * See `components/admin/destructive-action.ts` for why this is structural.
   */
  const [action, dispatch] = useReducer(destructiveActionReducer, IDLE_DESTRUCTIVE_ACTION);
  const rtl = lang === "ar";

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (access.state !== "authorized") return;
    setBusy(true);
    setMessage(null);
    try {
      setResult(await repository.resolveStaffUserExact(email, adminRepositoryContext(access)));
    } catch (error) {
      setResult(null);
      setMessage(
        `${rtl ? "تعذّر البحث الآمن" : "Recherche sécurisée impossible"}: ${mapAdminError(error).code}`,
      );
    } finally {
      setBusy(false);
    }
  };

  /** The motive comes from the confirm step that armed this call, and nowhere
   *  else. The repository call, its arguments and its idempotency key are
   *  exactly what they were. */
  const createPrincipal = async (reason: string) => {
    if (access.state !== "authorized" || !result?.found) return;
    setMessage(null);
    try {
      const created = await repository.createStaffPrincipal(
        result.authUserId,
        reason,
        crypto.randomUUID(),
        adminRepositoryContext(access),
      );
      setMessage(
        created.created
          ? rtl
            ? "تم إنشاء هوية الطاقم دون منح أي دور."
            : "Identité staff créée sans rôle implicite."
          : rtl
            ? "هوية الطاقم موجودة بالفعل؛ لم يُمنح أي دور."
            : "L’identité staff existe déjà; aucun rôle n’a été accordé.",
      );
      setResult({
        ...result,
        staffPrincipal: {
          staffPrincipalId: created.staffPrincipalId,
          status: created.status,
          mfaRequired: created.mfaRequired,
        },
      });
    } catch (error) {
      setMessage(`${rtl ? "فشل الإنشاء" : "Création refusée"}: ${mapAdminError(error).code}`);
    }
  };

  const assignRole = async (reason: string) => {
    if (access.state !== "authorized" || !result?.found || !result.staffPrincipal) return;
    setMessage(null);
    try {
      const assignment = await repository.assignStandardRole(
        {
          targetAuthUserId: result.authUserId,
          role,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          reason,
          reference: "admin-security-operations",
          idempotencyKey: crypto.randomUUID(),
        },
        adminRepositoryContext(access),
      );
      setMessage(
        `${rtl ? "تم منح الدور" : "Rôle accordé"}: ${assignment.role}. ${
          rtl
            ? "طُلب إبطال الجلسة حيثما كان مدعوماً."
            : "Invalidation de session demandée si supportée."
        }`,
      );
    } catch (error) {
      setMessage(`${rtl ? "رُفض منح الدور" : "Affectation refusée"}: ${mapAdminError(error).code}`);
    }
  };

  const requestPlatformAdmin = async (reason: string) => {
    if (access.state !== "authorized" || !result?.found || !result.staffPrincipal) return;
    setMessage(null);
    try {
      const approval = await repository.requestPlatformAdmin(
        {
          targetAuthUserId: result.authUserId,
          assignmentExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          approvalExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          reason,
          idempotencyKey: crypto.randomUUID(),
        },
        adminRepositoryContext(access),
      );
      setMessage(
        `${rtl ? "تم إنشاء طلب التحكم المزدوج" : "Demande à double contrôle créée"}: ${approval.approvalId}`,
      );
    } catch (error) {
      setMessage(`${rtl ? "رُفض الطلب" : "Demande refusée"}: ${mapAdminError(error).code}`);
    }
  };

  return (
    <AdminFunctionalRoute
      access={access}
      title={rtl ? "إدارة طاقم الإدارة" : "Administration du personnel"}
      description={
        rtl
          ? "بحث مطابق ومدقّق فقط. لا توجد قائمة عامة لمستخدمي المصادقة."
          : "Recherche exacte et auditée uniquement. Aucun annuaire Auth n’est exposé."
      }
      testId="admin-staff-list"
    >
      {access.state === "authorized" && (
        <div className="grid gap-6">
          <section aria-labelledby="admin-staff-lookup-heading">
            <AdminSectionHeading id="admin-staff-lookup-heading">
              {rtl ? "بحث مطابق" : "Recherche exacte"}
            </AdminSectionHeading>
            <form
              className={`mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end ${ADMIN_PANEL_CLASS} p-4`}
              onSubmit={lookup}
              data-testid="admin-user-eligibility"
            >
              {/* An address is typed and read left-to-right in both languages,
                  so `dir` is forced on the field itself; the label `UiInput`
                  renders keeps the ambient direction. The label/span/input
                  trio this replaces spelled out the field recipe by hand. */}
              <UiInput
                label={rtl ? "البريد الإلكتروني المطابق" : "E-mail exact"}
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                dir="ltr"
                spellCheck={false}
                required
              />
              {/* Also held while a mutation runs: resolving a second account
                  under an armed confirm step would leave that step naming one
                  person and acting on another. */}
              <UiButton className="sm:w-auto" disabled={busy || isBusy(action)} type="submit">
                {rtl ? "بحث آمن" : "Résoudre"}
              </UiButton>
            </form>
          </section>

          {message && <AdminNotice testId="admin-staff-message">{message}</AdminNotice>}

          {/* The server already answers this lookup with a bounded error code
              and nothing else; the page shows that code rather than inventing
              a sentence about whether an account exists. */}
          {result && !result.found && (
            <AdminNotice testId="admin-staff-unresolved">
              {rtl ? "لا نتيجة قابلة للاستخدام" : "Aucun résultat exploitable"}
              {" : "}
              <AdminDatum mono className={ui.text.meta}>
                {result.errorCode}
              </AdminDatum>
            </AdminNotice>
          )}

          {result?.found && (
            <section aria-labelledby="admin-staff-result-heading">
              <AdminSectionHeading id="admin-staff-result-heading">
                {rtl ? "نتيجة البحث" : "Résultat"}
              </AdminSectionHeading>
              <article className={`mt-3 ${ADMIN_PANEL_CLASS} p-4`} data-testid="admin-staff-result">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <AdminField label={rtl ? "البريد الإلكتروني" : "E-mail"}>
                    <AdminDatum className={ui.tone.default}>{result.maskedEmail}</AdminDatum>
                  </AdminField>
                  <AdminField label="MFA">
                    {/* "MFA required" is the amber state, and amber is a FILL
                        here, never a foreground: `--ui-caution` measured
                        1.78:1 as text, so `UiBadge tone="caution"` paints it
                        and puts `--ui-on-caution` on top. It must also not
                        borrow `negative`: an account without MFA is not a
                        refused one, it is one that cannot be granted anything
                        yet -- which is exactly what the disabled "Créer le
                        principal" below depends on. */}
                    <UiBadge tone={result.mfaVerified ? "positive" : "caution"}>
                      <AdminDatum mono={false}>
                        {result.mfaVerified ? "AAL2 eligible" : "required"}
                      </AdminDatum>
                    </UiBadge>
                  </AdminField>
                  <AdminField label={rtl ? "معرّف المصادقة" : "UUID Auth"}>
                    <AdminDatum className={`${ui.text.meta} ${ui.tone.muted}`}>
                      {result.authUserId}
                    </AdminDatum>
                  </AdminField>
                  <AdminField label={rtl ? "هوية الطاقم" : "Principal"}>
                    <UiBadge tone={result.staffPrincipal ? "positive" : "neutral"}>
                      <AdminDatum mono={false}>
                        {result.staffPrincipal?.status ?? "none"}
                      </AdminDatum>
                    </UiBadge>
                  </AdminField>
                </dl>

                {!result.staffPrincipal && (
                  <div className={`mt-5 ${ui.rule.blockStart} pt-5`}>
                    {/* The motive is asked for inside this action's own confirm
                        step, keyed by the resolved account: it can arm nothing
                        else on the page. */}
                    <AdminDestructiveAction
                      actionKey={`create-principal:${result.authUserId}`}
                      state={action}
                      dispatch={dispatch}
                      minimumReasonLength={MINIMUM_REASON_LENGTH}
                      rtl={rtl}
                      tone="primary"
                      testId="admin-create-principal"
                      triggerTestId="admin-create-principal"
                      disabled={!result.emailVerified || !result.mfaVerified}
                      triggerLabel={rtl ? "إنشاء الهوية" : "Créer le principal"}
                      confirmLabel={rtl ? "تأكيد الإنشاء" : "Confirmer la création"}
                      confirmPrompt={
                        <>
                          {rtl ? "إنشاء هوية الطاقم لـ " : "Créer l’identité staff de "}
                          {/* The emphasis inside every confirm prompt on this
                              page is the same 600 it always was --
                              `--ui-weight-body` IS `font-semibold`. Only its
                              source moves onto the ramp; the weight that marks
                              the account a grant is about does not change. */}
                          <AdminDatum mono={false} className="[font-weight:var(--ui-weight-body)]">
                            {result.maskedEmail}
                          </AdminDatum>
                          {rtl
                            ? "؟ لا تمنح هذه العملية أي دور، ويبقى الوصول إلى وحدة الإدارة مرفوضاً إلى أن يُسنَد دور صراحةً."
                            : " ? Cette opération n’accorde aucun rôle: l’accès à la console reste refusé tant qu’un rôle n’a pas été affecté explicitement."}
                        </>
                      }
                      onConfirm={(reason) => createPrincipal(reason)}
                    />
                    <p className={`mt-2 ${ui.text.meta} ${ui.tone.muted}`}>
                      {rtl
                        ? "يتطلب بريداً مؤكداً ومصادقة ثنائية مفعّلة، وثمانية أحرف على الأقل للسبب."
                        : "Exige une adresse vérifiée, une MFA active et un motif d’au moins 8 caractères."}
                    </p>
                  </div>
                )}

                {result.staffPrincipal && (
                  <div className={`mt-5 ${ui.rule.blockStart} pt-5`}>
                    <div className="grid gap-3 sm:grid-cols-2" data-testid="admin-role-assignment">
                      {/* Role slugs are LTR machine values, so `dir` is forced
                          on the control; the label keeps the ambient
                          direction. Still a native <select>, which is what the
                          kit's field is -- already localised, already
                          keyboard- and screen-reader-correct, and it opens the
                          platform picker on a phone. */}
                      <UiSelect
                        label={rtl ? "الدور القياسي" : "Rôle standard"}
                        value={role}
                        onChange={(event) =>
                          setRole(event.target.value as DirectlyAssignableAdminRole)
                        }
                      >
                        {ASSIGNABLE_ROLES.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </UiSelect>
                      <UiInput
                        label={rtl ? "انتهاء اختياري" : "Expiration optionnelle"}
                        type="datetime-local"
                        value={expiresAt}
                        onChange={(event) => setExpiresAt(event.target.value)}
                        dir="ltr"
                      />
                    </div>
                    <p className={`mt-2 ${ui.text.meta} ${ui.tone.muted}`}>
                      {rtl
                        ? "لكل عملية تأكيد صريح وسبب خاص بها من ثمانية أحرف على الأقل، ويُسجَّل كلاهما في التدقيق."
                        : "Chaque opération exige une confirmation explicite et un motif qui lui est propre, d’au moins 8 caractères; les deux sont consignés dans l’audit."}
                    </p>
                    <div className="mt-4 grid gap-3">
                      {/* Keyed by the resolved account *and* the selected role:
                          a motive written for `editor` cannot become the audit
                          motive of a `security_admin` grant. */}
                      <AdminDestructiveAction
                        actionKey={`assign-role:${result.authUserId}:${role}`}
                        state={action}
                        dispatch={dispatch}
                        minimumReasonLength={MINIMUM_REASON_LENGTH}
                        rtl={rtl}
                        tone="primary"
                        testId="admin-assign-role"
                        triggerTestId="admin-assign-role"
                        triggerLabel={rtl ? "منح الدور القياسي" : "Affecter le rôle standard"}
                        confirmLabel={rtl ? "تأكيد منح الدور" : "Confirmer l’affectation"}
                        confirmPrompt={
                          <>
                            {rtl ? "منح الدور " : "Affecter le rôle "}
                            <AdminDatum
                              mono={false}
                              className="[font-weight:var(--ui-weight-body)]"
                            >
                              {role}
                            </AdminDatum>
                            {rtl ? " إلى " : " à "}
                            <AdminDatum
                              mono={false}
                              className="[font-weight:var(--ui-weight-body)]"
                            >
                              {result.maskedEmail}
                            </AdminDatum>
                            {rtl
                              ? "؟ يسري الدور فوراً ويفتح كل الصلاحيات المرتبطة به."
                              : " ? Le rôle prend effet immédiatement et ouvre toutes les permissions qui lui sont attachées."}
                          </>
                        }
                        onConfirm={(reason) => assignRole(reason)}
                      />
                      <div className="grid gap-2" data-testid="admin-platform-request">
                        <AdminDestructiveAction
                          actionKey={`request-platform-admin:${result.authUserId}`}
                          state={action}
                          dispatch={dispatch}
                          minimumReasonLength={MINIMUM_REASON_LENGTH}
                          rtl={rtl}
                          tone="primary"
                          testId="admin-request-platform-admin"
                          triggerTestId="admin-request-platform-admin"
                          triggerLabel={
                            <>
                              {rtl ? "طلب " : "Demander "}
                              <AdminDatum mono={false}>platform_admin</AdminDatum>
                            </>
                          }
                          confirmLabel={rtl ? "تأكيد الطلب" : "Confirmer la demande"}
                          confirmPrompt={
                            <>
                              {rtl ? "طلب دور " : "Demander le rôle "}
                              <AdminDatum
                                mono={false}
                                className="[font-weight:var(--ui-weight-body)]"
                              >
                                platform_admin
                              </AdminDatum>
                              {rtl ? " لـ " : " pour "}
                              <AdminDatum
                                mono={false}
                                className="[font-weight:var(--ui-weight-body)]"
                              >
                                {result.maskedEmail}
                              </AdminDatum>
                              {rtl
                                ? "؟ هذا أعلى مستوى صلاحيات في المنصة: تحكم كامل في وحدة الإدارة وفي الأمن وفي الأدوار. لا يمنح الطلب الدور مباشرةً، بل ينشئ موافقة بتحكم مزدوج يجب أن يقرّها مسؤول ثانٍ خلال ثلاثين دقيقة."
                                : " ? C’est le niveau de privilège le plus élevé de la plateforme: contrôle total de la console, de la sécurité et des rôles. La demande n’affecte pas le rôle: elle ouvre une approbation à double contrôle qu’un second administrateur doit approuver dans les 30 minutes."}
                            </>
                          }
                          onConfirm={(reason) => requestPlatformAdmin(reason)}
                        />
                        <p className={`${ui.text.meta} ${ui.tone.muted}`}>
                          {rtl
                            ? "ينشئ طلب تحكم مزدوج ولا يمنح الدور مباشرة."
                            : "Crée une demande à double contrôle sans affecter directement le rôle."}
                        </p>
                      </div>
                      <UiLinkButton
                        to="/admin/staff/$principalId"
                        params={{ principalId: result.staffPrincipal.staffPrincipalId }}
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                      >
                        {rtl ? "فتح سجل الطاقم" : "Ouvrir le dossier staff"}
                      </UiLinkButton>
                    </div>
                  </div>
                )}
              </article>
            </section>
          )}
        </div>
      )}
    </AdminFunctionalRoute>
  );
}
