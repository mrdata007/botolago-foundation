import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Ban, CalendarPlus, ChevronDown, ChevronRight, LogIn, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { loadAdminUsersRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { adminRepositoryContext } from "@/backend/admin/functional-route-helpers";
import {
  ADMIN_USERS_PAGE_SIZE,
  type AdminUserCursor,
  type AdminUserStatus,
} from "@/backend/admin/users-contracts";
import { mapUserAdminError, SupabaseUsersAdminRepository } from "@/backend/admin/users-repository";
import {
  ADMIN_CARD_CLASS,
  AdminDate,
  AdminDatum,
  AdminEmptyState,
  AdminFilterChips,
  AdminNotice,
  AdminSkeletonList,
  type AdminFilterChip,
} from "@/components/admin/AdminSurfaces";
import {
  ADMIN_USERS_EMPTY_FILTERS,
  ADMIN_USERS_INITIAL_STATE,
  adminUsersListReducer,
  canLoadMore,
  type AdminUsersFilters,
} from "@/components/admin/users/user-list-state";
import { UserDisc } from "@/components/admin/users/UserDisc";
import {
  banStatusLabel,
  formatUserDate,
  formatUserDateTime,
  userAdminErrorMessage,
  userDisplayName,
} from "@/components/admin/users/user-presentation";
import { ui, UiBadge, UiButton, UiCard, UiInput } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/users")({
  ssr: false,
  loader: () => loadAdminUsersRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminUsersRoute,
});

/** The list count beside its heading, as on the News list. */
const COUNT_PILL = cn(
  "px-2.5 py-0.5",
  ui.font.body,
  ui.radius.full,
  ui.surface.sunken,
  ui.tone.muted,
  ui.text.meta,
  ui.text.tabular,
);

function AdminUsersRoute() {
  const isChildRoute = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === "/admin/users/$userId"),
  });
  return isChildRoute ? <Outlet /> : <AdminUsersListRoute />;
}

function AdminUsersListRoute() {
  const access = Route.useLoaderData();
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const repository = useMemo(() => new SupabaseUsersAdminRepository(), []);
  const [state, dispatch] = useReducer(adminUsersListReducer, ADMIN_USERS_INITIAL_STATE);
  // The search box is a draft, applied on Enter or the button; the chips
  // apply as they are tapped. What the chips show selected is what the list
  // on screen was fetched with.
  const [query, setQuery] = useState("");
  const generation = useRef(ADMIN_USERS_INITIAL_STATE.generation);

  const authorized = access.state === "authorized" ? access : null;

  const fetchPage = useCallback(
    async (
      filters: AdminUsersFilters,
      cursor: AdminUserCursor | null,
      issued: number,
      append: boolean,
    ) => {
      if (!authorized) return;
      try {
        const page = await repository.listUsers(
          { query: filters.query.trim() || null, status: filters.status || null },
          cursor,
          ADMIN_USERS_PAGE_SIZE,
          adminRepositoryContext(authorized),
        );
        dispatch({ type: "page", generation: issued, append, page });
      } catch (error) {
        dispatch({ type: "failure", generation: issued, code: mapUserAdminError(error).code });
      }
    },
    [authorized, repository],
  );

  const search = useCallback(
    (filters: AdminUsersFilters) => {
      const issued = generation.current + 1;
      generation.current = issued;
      dispatch({ type: "search", generation: issued, filters });
      void fetchPage(filters, null, issued, false);
    },
    [fetchPage],
  );

  const loadMore = useCallback(() => {
    if (!canLoadMore(state)) return;
    dispatch({ type: "load-more" });
    void fetchPage(state.filters, state.cursor, generation.current, true);
  }, [fetchPage, state]);

  const applyFilters = (change: Partial<AdminUsersFilters>) =>
    search({ ...state.filters, query, ...change });

  useEffect(() => {
    if (access.state !== "authorized") return;
    search(ADMIN_USERS_EMPTY_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.state]);

  const loading = state.phase === "loading";
  const loadingMore = state.phase === "loading-more";

  const statusChips: readonly AdminFilterChip<AdminUserStatus | "">[] = [
    { value: "", label: rtl ? "الكل" : "Tous" },
    { value: "active", label: rtl ? "النشطون" : "Actifs" },
    { value: "banned", label: rtl ? "المحظورون" : "Bannis" },
    { value: "deletion_requested", label: rtl ? "طلب الحذف" : "Suppression demandée" },
  ];

  return (
    <AdminFunctionalRoute
      access={access}
      layout="hub"
      title={rtl ? "المستخدمون" : "Utilisateurs"}
      description={
        rtl
          ? "كل الحسابات المسجلة، من الأحدث إلى الأقدم. افتح حساباً لعرضه أو حظره."
          : "Tous les comptes inscrits, du plus récent au plus ancien. Ouvrez un compte pour le consulter ou le bannir."
      }
      testId="admin-users-list"
    >
      {access.state === "authorized" && (
        <>
          <UiCard
            padding="md"
            className="grid gap-4"
            role="search"
            aria-label={rtl ? "البحث عن حساب" : "Rechercher un compte"}
          >
            <form
              className="flex items-start gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                applyFilters({ query });
              }}
            >
              <UiInput
                type="search"
                aria-label={
                  rtl
                    ? "الاسم أو اسم المستخدم أو البريد الكامل أو المعرّف"
                    : "Nom, pseudo, e-mail exact ou identifiant"
                }
                placeholder={rtl ? "الاسم أو البريد الكامل" : "Nom, pseudo ou e-mail exact"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                leading={<Search className={cn("h-4 w-4", ui.tone.muted)} aria-hidden />}
                className="min-w-0 flex-1"
                data-testid="admin-users-filter-query"
              />
              <UiButton
                type="submit"
                variant="ink"
                size="sm"
                data-testid="admin-users-filter-submit"
              >
                {rtl ? "بحث" : "Rechercher"}
              </UiButton>
            </form>
            <AdminFilterChips
              label={rtl ? "الحالة" : "Statut"}
              options={statusChips}
              value={state.filters.status}
              onSelect={(status) => applyFilters({ status })}
              data-testid="admin-users-filter-status"
            />
          </UiCard>

          {state.error !== null && (
            <div className="mt-4" data-testid="admin-users-error">
              <AdminNotice tone="alert" role="alert">
                {userAdminErrorMessage(state.error, lang)}
              </AdminNotice>
            </div>
          )}

          <h3
            className={cn("mt-8 flex items-center gap-2", ui.display.section)}
            data-testid="admin-users-result-count"
          >
            {rtl ? "الحسابات" : "Comptes"}
            <AdminDatum mono={false} className={COUNT_PILL}>
              {`${state.items.length}${state.cursor === null ? "" : "+"}`}
            </AdminDatum>
          </h3>

          <ul className="mt-3 grid grid-cols-1 gap-3" data-testid="admin-users-items">
            {state.items.map((user) => {
              const badges = [
                user.activeBan && (
                  <UiBadge key="banned" tone="negative" className="shrink-0">
                    {rtl ? "محظور" : "Banni"}
                  </UiBadge>
                ),
                user.isStaff && (
                  <UiBadge key="staff" tone="outline" className="shrink-0">
                    {rtl ? "طاقم" : "Personnel"}
                  </UiBadge>
                ),
                user.deletionRequested && (
                  <UiBadge key="deletion" tone="caution" className="shrink-0">
                    {rtl ? "طلب حذف" : "Suppression demandée"}
                  </UiBadge>
                ),
                !user.emailVerified && (
                  <UiBadge key="unverified" tone="neutral" className="shrink-0">
                    {rtl ? "بريد غير مؤكد" : "E-mail non confirmé"}
                  </UiBadge>
                ),
              ].filter(Boolean);
              return (
                <li
                  key={user.userId}
                  data-testid="admin-users-item"
                  data-banned={user.activeBan ? "true" : "false"}
                >
                  {/* The whole card is the link: one tap at 390px. */}
                  <Link
                    to="/admin/users/$userId"
                    params={{ userId: user.userId }}
                    className={cn(
                      "flex items-start gap-3 p-4",
                      ADMIN_CARD_CLASS,
                      "transition-[box-shadow,transform] duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
                      "hover:shadow-[var(--ui-shadow-raised)] active:translate-y-px",
                      ui.focus,
                    )}
                  >
                    <UserDisc user={user} />
                    <div className="min-w-0 flex-1">
                      <h4 className={cn("break-words", ui.text.subtitle, ui.tone.default)}>
                        {/* A name can be written in either script. */}
                        <bdi>{userDisplayName(user, lang)}</bdi>
                      </h4>
                      <p
                        className={cn("mt-0.5 flex flex-wrap gap-x-3", ui.text.meta, ui.tone.faint)}
                      >
                        {user.username && user.displayName && (
                          <AdminDatum mono={false}>{`@${user.username}`}</AdminDatum>
                        )}
                        {user.maskedEmail && <AdminDatum>{user.maskedEmail}</AdminDatum>}
                      </p>
                      {badges.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">{badges}</div>
                      )}
                      <dl
                        className={cn(
                          "mt-3 flex flex-wrap gap-x-4 gap-y-1",
                          ui.text.meta,
                          ui.tone.muted,
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <dt className="sr-only">{rtl ? "التسجيل" : "Inscription"}</dt>
                          <CalendarPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <dd>
                            <AdminDate>{formatUserDate(user.createdAt, lang)}</AdminDate>
                          </dd>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <dt className="sr-only">
                            {rtl ? "آخر تسجيل دخول" : "Dernière connexion"}
                          </dt>
                          <LogIn className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <dd>
                            {user.lastSignInAt ? (
                              <AdminDate>{formatUserDateTime(user.lastSignInAt, lang)}</AdminDate>
                            ) : rtl ? (
                              "لم يسجّل الدخول بعد"
                            ) : (
                              "Jamais connecté"
                            )}
                          </dd>
                        </div>
                        {user.activeBan && (
                          <div className="flex items-center gap-1.5 text-[color:var(--ui-negative)]">
                            <dt className="sr-only">{rtl ? "الحظر" : "Bannissement"}</dt>
                            <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            <dd>
                              <AdminDate>{banStatusLabel(user.activeBan.endsAt, lang)}</AdminDate>
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                    {/* Mirrored under Arabic by styles.css. */}
                    <ChevronRight
                      className={cn("mt-1 h-5 w-5 shrink-0 self-center", ui.tone.faint)}
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
            {state.phase === "ready" && state.items.length === 0 && (
              <li>
                <AdminEmptyState testId="admin-users-empty" className={ADMIN_CARD_CLASS}>
                  {rtl ? "لا يوجد حساب مطابق." : "Aucun compte ne correspond à cette recherche."}
                </AdminEmptyState>
              </li>
            )}
          </ul>

          {(loading || loadingMore) && (
            <div className="mt-3">
              <AdminSkeletonList
                rows={loading ? 4 : 2}
                testId="admin-users-loading"
                surface="card"
              />
              <p className="sr-only" role="status">
                {rtl ? "جارٍ تحميل الحسابات…" : "Chargement des comptes…"}
              </p>
            </div>
          )}

          {state.cursor !== null && (
            <div className="mt-4 flex justify-center">
              <UiButton
                variant="soft"
                size="sm"
                onClick={loadMore}
                disabled={loading || loadingMore}
                aria-busy={loadingMore}
                data-testid="admin-users-load-more"
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
                {loadingMore
                  ? rtl
                    ? "جارٍ التحميل…"
                    : "Chargement…"
                  : rtl
                    ? "تحميل المزيد من الحسابات"
                    : "Charger plus de comptes"}
              </UiButton>
            </div>
          )}

          {state.cursor === null && state.phase === "ready" && state.items.length > 0 && (
            <p
              className={cn("mt-4 text-center", ui.text.meta, ui.tone.faint)}
              data-testid="admin-users-end"
            >
              {rtl ? "نهاية القائمة." : "Fin de la liste."}
            </p>
          )}
        </>
      )}
    </AdminFunctionalRoute>
  );
}
