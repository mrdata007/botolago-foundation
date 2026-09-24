import { createFileRoute } from "@tanstack/react-router";
import { Ban, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { loadAdminUsersRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { adminRepositoryContext } from "@/backend/admin/functional-route-helpers";
import type { AdminRouteState } from "@/backend/admin/route-access";
import {
  BAN_DURATIONS,
  banDurationHours,
  USER_MODERATION_REASON_MIN,
  type AdminUserDetailDto,
  type BanDurationKey,
} from "@/backend/admin/users-contracts";
import { mapUserAdminError, SupabaseUsersAdminRepository } from "@/backend/admin/users-repository";
import {
  ADMIN_CARD_CLASS,
  ADMIN_LABEL_CLASS,
  AdminBackLink,
  AdminDate,
  AdminDatum,
  AdminEmptyState,
  AdminField,
  AdminFilterChips,
  AdminNotice,
  AdminSkeletonList,
} from "@/components/admin/AdminSurfaces";
import { AdminDestructiveAction } from "@/components/admin/AdminDestructiveAction";
import {
  destructiveActionReducer,
  IDLE_DESTRUCTIVE_ACTION,
} from "@/components/admin/destructive-action";
import { UserDisc } from "@/components/admin/users/UserDisc";
import {
  BAN_DURATION_LABELS,
  banStatusLabel,
  formatUserDateTime,
  userAdminErrorMessage,
  userDisplayName,
} from "@/components/admin/users/user-presentation";
import { ui, UiBadge } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/users/$userId")({
  ssr: false,
  loader: () => loadAdminUsersRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminUserDetailRoute,
});

type Authorized = Extract<AdminRouteState, { state: "authorized" }>;
type Notice = { tone: "info" | "alert"; text: string } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A titled block on the raised surface, like the News editor's sections. */
function DetailSection({
  heading,
  children,
  testId,
}: {
  heading: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className={cn(ADMIN_CARD_CLASS, "p-4 sm:p-5")} data-testid={testId}>
      <h3 className={cn(ui.display.header, ui.tone.default)}>{heading}</h3>
      <div className="mt-4 grid grid-cols-1 gap-4">{children}</div>
    </section>
  );
}

/**
 * One account: who it is, whether it is banned, and the ban history.
 *
 * Banning and lifting each name the account and the consequence in a confirm
 * step (`AdminDestructiveAction`) that asks for its own motive; the motive is
 * the audit reason the database stores. The database re-checks
 * `users.moderate`, MFA and recent authentication, refuses staff and self, and
 * audits both decisions -- this page only decides what to offer.
 */
function AdminUserDetailRoute() {
  const access = Route.useLoaderData();
  const { userId } = Route.useParams();
  const { lang } = useI18n();
  const rtl = lang === "ar";

  return (
    <AdminFunctionalRoute
      access={access}
      layout="detail"
      back={
        <AdminBackLink
          to="/admin/users"
          label={rtl ? "كل المستخدمين" : "Tous les utilisateurs"}
          testId="admin-users-back-to-list"
        />
      }
      title={rtl ? "الحساب" : "Compte"}
      description={
        rtl
          ? "اعرض الحساب، أو احظره، أو ارفع الحظر عنه. يُسجَّل كل قرار في التدقيق."
          : "Consultez le compte, bannissez-le ou levez son bannissement. Chaque décision est consignée dans l’audit."
      }
      testId="admin-user-detail"
    >
      {access.state === "authorized" && <UserDetail access={access} userId={userId} />}
    </AdminFunctionalRoute>
  );
}

function UserDetail({ access, userId }: { access: Authorized; userId: string }) {
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const repository = useMemo(() => new SupabaseUsersAdminRepository(), []);
  const [user, setUser] = useState<AdminUserDetailDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [duration, setDuration] = useState<BanDurationKey>("week");
  const [actionState, dispatchAction] = useReducer(
    destructiveActionReducer,
    IDLE_DESTRUCTIVE_ACTION,
  );

  const load = useCallback(async () => {
    if (!UUID.test(userId)) {
      setLoadError("user_not_found");
      return;
    }
    try {
      setUser(await repository.getUser(userId, adminRepositoryContext(access)));
      setLoadError(null);
    } catch (error) {
      setLoadError(mapUserAdminError(error).code);
    }
  }, [access, repository, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) {
    return (
      <div data-testid="admin-user-load-error">
        <AdminNotice tone="alert" role="alert">
          {userAdminErrorMessage(loadError, lang)}
        </AdminNotice>
      </div>
    );
  }
  if (!user) {
    return (
      <>
        <AdminSkeletonList rows={3} surface="card" testId="admin-user-loading" />
        <p className="sr-only" role="status">
          {rtl ? "جارٍ تحميل الحساب…" : "Chargement du compte…"}
        </p>
      </>
    );
  }

  const name = userDisplayName(user, lang);
  const canModerate = access.context.permissions.includes("users.moderate");
  const isSelf = access.identity.userId === user.userId;
  const durationLabel = BAN_DURATION_LABELS[duration][lang];

  const ban = async (reason: string) => {
    setNotice(null);
    try {
      await repository.banUser(
        user.userId,
        reason,
        banDurationHours(duration),
        crypto.randomUUID(),
        adminRepositoryContext(access),
      );
      setNotice({
        tone: "info",
        text: rtl
          ? "حُظر الحساب. سيُسجَّل خروجه عند فتحه التطبيق التالي."
          : "Compte banni. Il sera déconnecté dès sa prochaine ouverture de l’application.",
      });
      await load();
    } catch (error) {
      setNotice({
        tone: "alert",
        text: userAdminErrorMessage(mapUserAdminError(error).code, lang),
      });
    }
  };

  const unban = async (reason: string) => {
    setNotice(null);
    try {
      await repository.unbanUser(
        user.userId,
        reason,
        crypto.randomUUID(),
        adminRepositoryContext(access),
      );
      setNotice({
        tone: "info",
        text: rtl
          ? "رُفع الحظر. يمكن للحساب العودة الآن."
          : "Bannissement levé. Le compte peut revenir.",
      });
      await load();
    } catch (error) {
      setNotice({
        tone: "alert",
        text: userAdminErrorMessage(mapUserAdminError(error).code, lang),
      });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Who this is, as the app's profile header draws a person. */}
      <section
        className={cn(ADMIN_CARD_CLASS, "flex items-center gap-4 p-4 sm:p-5")}
        data-testid="admin-user-identity"
      >
        <UserDisc user={user} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className={cn("break-words", ui.display.header, ui.tone.default)}>
            <bdi>{name}</bdi>
          </h3>
          <p className={cn("mt-0.5 flex flex-wrap gap-x-3", ui.text.meta, ui.tone.faint)}>
            {user.username && user.displayName && (
              <AdminDatum mono={false}>{`@${user.username}`}</AdminDatum>
            )}
            {user.maskedEmail && <AdminDatum>{user.maskedEmail}</AdminDatum>}
          </p>
          {(user.isStaff || user.deletionRequested || !user.emailVerified) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {user.isStaff && <UiBadge tone="outline">{rtl ? "طاقم" : "Personnel"}</UiBadge>}
              {user.deletionRequested && (
                <UiBadge tone="caution">{rtl ? "طلب حذف" : "Suppression demandée"}</UiBadge>
              )}
              {!user.emailVerified && (
                <UiBadge tone="neutral">{rtl ? "بريد غير مؤكد" : "E-mail non confirmé"}</UiBadge>
              )}
            </div>
          )}
        </div>
      </section>

      {notice && (
        <AdminNotice
          tone={notice.tone}
          role={notice.tone === "alert" ? "alert" : "status"}
          testId="admin-user-message"
        >
          {notice.text}
        </AdminNotice>
      )}

      <DetailSection heading={rtl ? "الحالة" : "Statut"} testId="admin-user-standing">
        {user.activeBan ? (
          <div
            className={cn(
              "flex items-start gap-3 p-4",
              ui.radius.control,
              "bg-[color:color-mix(in_oklab,var(--ui-negative)_12%,var(--ui-surface))]",
            )}
            data-testid="admin-user-banned"
          >
            <Ban className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--ui-negative)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className={cn(ui.text.bodyStrong, "text-[color:var(--ui-negative)]")}>
                <AdminDate>{banStatusLabel(user.activeBan.endsAt, lang)}</AdminDate>
              </p>
              <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>
                {rtl ? "منذ " : "Depuis le "}
                <AdminDate>{formatUserDateTime(user.activeBan.startsAt, lang)}</AdminDate>
              </p>
              <p className={cn("mt-2 break-words", ui.text.secondary, ui.tone.default)}>
                <span className={ADMIN_LABEL_CLASS}>{rtl ? "السبب" : "Motif"}</span>{" "}
                <bdi>{user.activeBan.reason}</bdi>
              </p>
            </div>
          </div>
        ) : (
          <p
            className={cn("flex items-center gap-2", ui.text.secondary, ui.tone.default)}
            data-testid="admin-user-active"
          >
            <ShieldCheck className={cn("h-5 w-5 shrink-0", ui.tone.positive)} aria-hidden />
            {rtl ? "هذا الحساب نشط وغير محظور." : "Ce compte est actif et n’est pas banni."}
          </p>
        )}

        {!canModerate ? (
          <p className={cn(ui.text.meta, ui.tone.muted)} data-testid="admin-user-read-only">
            {rtl
              ? "يسمح دورك بعرض الحسابات، لا بحظرها."
              : "Votre rôle permet de consulter les comptes, pas de les bannir."}
          </p>
        ) : user.activeBan ? (
          <AdminDestructiveAction
            actionKey={`unban:${user.userId}`}
            state={actionState}
            dispatch={dispatchAction}
            minimumReasonLength={USER_MODERATION_REASON_MIN}
            rtl={rtl}
            tone="primary"
            triggerLabel={rtl ? "رفع الحظر" : "Lever le bannissement"}
            confirmPrompt={
              rtl ? (
                <>
                  رفع الحظر عن <bdi>{name}</bdi>؟ سيتمكن الحساب من تسجيل الدخول واللعب من جديد.
                </>
              ) : (
                <>
                  Lever le bannissement de <bdi>{name}</bdi> ? Le compte pourra de nouveau se
                  connecter et jouer.
                </>
              )
            }
            confirmLabel={rtl ? "تأكيد رفع الحظر" : "Confirmer la levée"}
            onConfirm={unban}
            triggerTestId="admin-user-unban"
            testId="admin-user-unban"
          />
        ) : user.isStaff ? (
          <p className={cn(ui.text.meta, ui.tone.muted)} data-testid="admin-user-staff-protected">
            {rtl
              ? "حساب عضو في طاقم الإدارة: يُدار وصوله من صفحة « طاقم الإدارة »، لا من هنا."
              : "Compte du personnel : son accès se gère depuis « Personnel », pas d’ici."}
          </p>
        ) : isSelf ? (
          <p className={cn(ui.text.meta, ui.tone.muted)}>
            {rtl ? "هذا حسابك." : "C’est votre propre compte."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <AdminFilterChips
              label={rtl ? "مدة الحظر" : "Durée du bannissement"}
              options={BAN_DURATIONS.map((option) => ({
                value: option.key,
                label: BAN_DURATION_LABELS[option.key][lang],
              }))}
              value={duration}
              onSelect={setDuration}
              data-testid="admin-user-ban-duration"
            />
            <AdminDestructiveAction
              actionKey={`ban:${user.userId}`}
              state={actionState}
              dispatch={dispatchAction}
              minimumReasonLength={USER_MODERATION_REASON_MIN}
              rtl={rtl}
              triggerLabel={rtl ? "حظر هذا الحساب" : "Bannir ce compte"}
              confirmPrompt={
                rtl ? (
                  <>
                    حظر <bdi>{name}</bdi> ({durationLabel})؟ سيُسجَّل خروجه فوراً، ولن يستطيع تعديل
                    ملفه أو فريقه في الفانتازي أو دورياته حتى نهاية الحظر.
                  </>
                ) : (
                  <>
                    Bannir <bdi>{name}</bdi> ({durationLabel.toLowerCase()}) ? Il sera déconnecté
                    aussitôt et ne pourra plus rien modifier (profil, équipe Fantasy, ligues)
                    jusqu’à la fin du bannissement.
                  </>
                )
              }
              confirmLabel={rtl ? "تأكيد الحظر" : "Confirmer le bannissement"}
              onConfirm={ban}
              triggerTestId="admin-user-ban"
              testId="admin-user-ban"
            />
          </div>
        )}
      </DetailSection>

      <DetailSection
        heading={rtl ? "تفاصيل الحساب" : "Détails du compte"}
        testId="admin-user-account"
      >
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AdminField label={rtl ? "التسجيل" : "Inscription"}>
            <AdminDate>{formatUserDateTime(user.createdAt, lang)}</AdminDate>
          </AdminField>
          <AdminField label={rtl ? "آخر تسجيل دخول" : "Dernière connexion"}>
            {user.lastSignInAt ? (
              <AdminDate>{formatUserDateTime(user.lastSignInAt, lang)}</AdminDate>
            ) : rtl ? (
              "لم يسجّل الدخول بعد"
            ) : (
              "Jamais connecté"
            )}
          </AdminField>
          <AdminField label={rtl ? "البريد الإلكتروني" : "E-mail"}>
            {user.maskedEmail ? <AdminDatum>{user.maskedEmail}</AdminDatum> : "—"}
            <span className={cn("ms-2", ui.tone.muted)}>
              {user.emailVerified
                ? rtl
                  ? "(مؤكد)"
                  : "(confirmé)"
                : rtl
                  ? "(غير مؤكد)"
                  : "(non confirmé)"}
            </span>
          </AdminField>
          <AdminField label={rtl ? "الملف الشخصي" : "Profil"}>
            {user.onboardingCompleted
              ? rtl
                ? "مكتمل"
                : "Complété"
              : rtl
                ? "غير مكتمل"
                : "Pas encore complété"}
          </AdminField>
          <AdminField label={rtl ? "المعرّف" : "Identifiant"} className="sm:col-span-2">
            <AdminDatum>{user.userId}</AdminDatum>
          </AdminField>
        </dl>
      </DetailSection>

      <DetailSection heading={rtl ? "الفانتازي" : "Fantasy"} testId="admin-user-fantasy">
        {user.fantasy ? (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AdminField label={rtl ? "الفريق" : "Équipe"}>
              <bdi>{user.fantasy.teamName}</bdi>
            </AdminField>
            <AdminField label={rtl ? "أُنشئ في" : "Créée le"}>
              <AdminDate>{formatUserDateTime(user.fantasy.createdAt, lang)}</AdminDate>
            </AdminField>
            <AdminField label={rtl ? "الدوريات النشطة" : "Ligues actives"}>
              <span className={ui.text.tabular}>{user.fantasy.activeLeagues}</span>
            </AdminField>
          </dl>
        ) : (
          <p className={cn(ui.text.secondary, ui.tone.muted)}>
            {rtl ? "لا يملك فريق فانتازي بعد." : "Pas encore d’équipe Fantasy."}
          </p>
        )}
      </DetailSection>

      <DetailSection
        heading={rtl ? "سجل الحظر" : "Historique des bannissements"}
        testId="admin-user-ban-history"
      >
        {user.bans.length === 0 ? (
          <AdminEmptyState>
            {rtl ? "لم يُحظر هذا الحساب قط." : "Ce compte n’a jamais été banni."}
          </AdminEmptyState>
        ) : (
          <ol className="grid grid-cols-1 gap-3">
            {user.bans.map((entry) => (
              <li
                key={entry.banId}
                className={cn("p-4", ui.radius.control, ui.surface.sunken)}
                data-testid="admin-user-ban-entry"
              >
                <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
                  <AdminDate>
                    {formatUserDateTime(entry.startsAt, lang)}
                    {rtl ? " ← " : " → "}
                    {entry.endsAt
                      ? formatUserDateTime(entry.endsAt, lang)
                      : rtl
                        ? "بلا مدة محددة"
                        : "sans limite"}
                  </AdminDate>
                </p>
                <p className={cn("mt-1 break-words", ui.text.secondary, ui.tone.default)}>
                  <bdi>{entry.reason}</bdi>
                </p>
                {entry.bannedByMaskedEmail && (
                  <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>
                    {rtl ? "بواسطة " : "Par "}
                    <AdminDatum>{entry.bannedByMaskedEmail}</AdminDatum>
                  </p>
                )}
                {entry.liftedAt && (
                  // The lift's own reason gets its own line: run on after an
                  // email inside a sentence of the other script, it wrapped
                  // out of order in Arabic.
                  <div className={cn("mt-2", ui.text.meta, ui.tone.muted)}>
                    <p className="break-words">
                      {rtl ? "رُفع في " : "Levé le "}
                      <AdminDate>{formatUserDateTime(entry.liftedAt, lang)}</AdminDate>
                      {entry.liftedByMaskedEmail && (
                        <>
                          {rtl ? " بواسطة " : " par "}
                          <AdminDatum>{entry.liftedByMaskedEmail}</AdminDatum>
                        </>
                      )}
                    </p>
                    {entry.liftReason && (
                      <p className="mt-0.5 break-words">
                        <bdi>{entry.liftReason}</bdi>
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </DetailSection>
    </div>
  );
}
