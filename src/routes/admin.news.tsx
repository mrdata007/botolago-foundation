import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ChevronDown, FileText, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { loadAdminNewsReadRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import {
  adminButtonClass,
  adminFieldClass,
  adminRepositoryContext,
} from "@/backend/admin/functional-route-helpers";
import { encodeEditorialCursor, SupabaseNewsRepository } from "@/backend/news/supabase-repository";
import type {
  EditorialStatus,
  EditorialStoryPageDto,
  EditorialStorySummaryDto,
  NewsLanguage,
} from "@/backend/news/contracts";
import { mapNewsError } from "@/backend/news/errors";
import {
  ADMIN_CARD_CLASS,
  ADMIN_LABEL_CLASS,
  AdminDatum,
  AdminEmptyState,
  AdminNotice,
  AdminSkeletonList,
} from "@/components/admin/AdminSurfaces";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/news")({
  ssr: false,
  loader: () => loadAdminNewsReadRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminNewsRoute,
});

const STATUSES: readonly EditorialStatus[] = [
  "draft",
  "in_review",
  "scheduled",
  "published",
  "unpublished",
  "archived",
  "rejected",
];

/** Editorial status, in the editor's own language. The raw enum value stays
 *  the wire/test contract; only what is rendered is translated. */
const NEWS_STATUS_LABELS: Record<EditorialStatus, { fr: string; ar: string }> = {
  draft: { fr: "Brouillon", ar: "مسودة" },
  in_review: { fr: "En relecture", ar: "قيد المراجعة" },
  scheduled: { fr: "Programmé", ar: "مجدول" },
  published: { fr: "Publié", ar: "منشور" },
  unpublished: { fr: "Retiré", ar: "غير منشور" },
  archived: { fr: "Archivé", ar: "مؤرشف" },
  rejected: { fr: "Refusé", ar: "مرفوض" },
};

/** Status tone, so an editor reads the state of a queue at a glance. */
const NEWS_STATUS_TONES: Record<EditorialStatus, string> = {
  draft: "border-slate-600 bg-slate-800/70 text-slate-200",
  in_review: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  scheduled: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  published: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  unpublished: "border-slate-600 bg-slate-800/70 text-slate-300",
  archived: "border-slate-700 bg-slate-900 text-slate-400",
  rejected: "border-rose-500/40 bg-rose-500/10 text-rose-200",
};

/* eslint-disable react-refresh/only-export-components --
   The paging state machine below is deliberately pure and exported so that
   `admin.news.pagination.test.ts` can exercise the real reset/append/stale
   rules instead of grepping this file for the shape of them. Nothing but the
   test imports it, so Fast Refresh has nothing to lose here. */

/**
 * CMS list paging, on the cursor contract the repository already defines.
 *
 * `SupabaseNewsRepository.listStories` takes `ListStoriesInput extends
 * CursorPageRequest` -- an *encoded* `cursor` string plus a `limit` -- and
 * returns `EditorialStoryPageDto = { items, nextCursor }`, where `nextCursor`
 * is the `{ updatedAt, id }` keyset of the last row on the page, or `null`
 * when the page is the last one. `encodeEditorialCursor` is the round-trip
 * partner of the repository's own `decodeEditorialCursor`, so the encoded
 * `nextCursor` of one page is exactly the `cursor` of the next. Underneath,
 * `api.editorial_list_stories` orders by `(updated_at, id) desc` and pages
 * with a strict `<` on that pair, so consecutive pages neither skip nor
 * repeat a row.
 *
 * Two invariants this reducer adds on top of that contract:
 *
 *  1. Filters never mix. `filters` is the snapshot that produced `items`;
 *     "load more" is always fetched under it, never under whatever the form
 *     inputs happen to hold. Re-filtering starts a new `generation`, which
 *     empties the list and drops the cursor.
 *  2. Late answers never land. Every request carries the `generation` it was
 *     issued under; a response from a superseded search (or from a "load
 *     more" that a re-filter overtook) is discarded instead of appended to a
 *     list it does not belong to.
 */
export type AdminNewsListPhase = "loading" | "loading-more" | "ready" | "error";

export interface AdminNewsFilters {
  readonly language: NewsLanguage | "";
  readonly status: EditorialStatus | "";
  readonly query: string;
}

export const ADMIN_NEWS_EMPTY_FILTERS: AdminNewsFilters = {
  language: "",
  status: "",
  query: "",
};

/** `api.editorial_list_stories` clamps `p_limit` to [1, 50]. */
export const ADMIN_NEWS_PAGE_SIZE = 30;

export interface AdminNewsListState {
  readonly generation: number;
  readonly filters: AdminNewsFilters;
  readonly items: readonly EditorialStorySummaryDto[];
  /** Encoded `nextCursor` of the page after `items`; `null` means no more. */
  readonly cursor: string | null;
  readonly phase: AdminNewsListPhase;
  readonly error: string | null;
}

/** The first render is already a load, so the empty state cannot flash. */
export const ADMIN_NEWS_INITIAL_STATE: AdminNewsListState = {
  generation: 0,
  filters: ADMIN_NEWS_EMPTY_FILTERS,
  items: [],
  cursor: null,
  phase: "loading",
  error: null,
};

export type AdminNewsListAction =
  | { readonly type: "search"; readonly generation: number; readonly filters: AdminNewsFilters }
  | { readonly type: "load-more" }
  | {
      readonly type: "page";
      readonly generation: number;
      readonly append: boolean;
      readonly page: EditorialStoryPageDto;
    }
  | { readonly type: "failure"; readonly generation: number; readonly message: string };

/** Append by id. The keyset already excludes repeats, but a row edited
 *  between two requests moves to the head of the ordering and would
 *  otherwise come back a second time. First occurrence wins. */
function mergeById(
  existing: readonly EditorialStorySummaryDto[],
  incoming: readonly EditorialStorySummaryDto[],
): readonly EditorialStorySummaryDto[] {
  const seen = new Set(existing.map((item) => item.id));
  const merged = [...existing];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

export function adminNewsListReducer(
  state: AdminNewsListState,
  action: AdminNewsListAction,
): AdminNewsListState {
  switch (action.type) {
    case "search":
      // A filter change resets paging: new generation, empty list, no cursor.
      return {
        generation: action.generation,
        filters: action.filters,
        items: [],
        cursor: null,
        phase: "loading",
        error: null,
      };
    case "load-more":
      if (state.cursor === null) return state;
      if (state.phase === "loading" || state.phase === "loading-more") return state;
      return { ...state, phase: "loading-more", error: null };
    case "page": {
      if (action.generation !== state.generation) return state;
      return {
        ...state,
        items: action.append ? mergeById(state.items, action.page.items) : action.page.items,
        cursor: encodeEditorialCursor(action.page.nextCursor),
        phase: "ready",
        error: null,
      };
    }
    case "failure":
      if (action.generation !== state.generation) return state;
      // The cursor survives, so a failed page can be retried from the button.
      return { ...state, phase: "error", error: action.message };
  }
}

/* eslint-enable react-refresh/only-export-components */

// This route has two child routes (new, $articleEditionId). Without this,
// TanStack Router still matches them but never renders them: a parent route
// in a nested (dot-separated) file hierarchy must render <Outlet /> itself
// for a deeper match to appear at all, exactly like /news does for
// /news/$articleId. Missing this made "Nouvel article" and every article
// edit link silently unreachable (URL changes, but this list stays put).
function AdminNewsRoute() {
  const isChildRoute = useRouterState({
    select: (state) =>
      state.matches.some(
        (match) =>
          match.routeId === "/admin/news/new" || match.routeId === "/admin/news/$articleEditionId",
      ),
  });
  return isChildRoute ? <Outlet /> : <AdminNewsListRoute />;
}

function AdminNewsListRoute() {
  const access = Route.useLoaderData();
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const repository = useMemo(() => new SupabaseNewsRepository(), []);
  const [state, dispatch] = useReducer(adminNewsListReducer, ADMIN_NEWS_INITIAL_STATE);
  // The three inputs are a *draft*: they are what the editor is composing.
  // `state.filters` is what the list on screen was actually fetched with, and
  // it is the only thing "load more" ever pages under -- so a half-changed
  // form can never bleed into the page that follows.
  const [language, setLanguage] = useState<NewsLanguage | "">("");
  const [status, setStatus] = useState<EditorialStatus | "">("");
  const [query, setQuery] = useState("");
  const generation = useRef(ADMIN_NEWS_INITIAL_STATE.generation);

  const authorized = access.state === "authorized" ? access : null;

  const fetchPage = useCallback(
    async (filters: AdminNewsFilters, cursor: string | null, issued: number, append: boolean) => {
      if (!authorized) return;
      try {
        const page = await repository.listStories(
          {
            language: filters.language || null,
            status: filters.status || null,
            query: filters.query.trim() || null,
            limit: ADMIN_NEWS_PAGE_SIZE,
            cursor,
          },
          adminRepositoryContext(authorized),
        );
        dispatch({ type: "page", generation: issued, append, page });
      } catch (error) {
        dispatch({
          type: "failure",
          generation: issued,
          message: `${rtl ? "تعذّر تحميل المقالات" : "Chargement des articles impossible"}: ${
            mapNewsError(error as Error).code
          }`,
        });
      }
    },
    [authorized, repository, rtl],
  );

  const search = useCallback(
    (filters: AdminNewsFilters) => {
      const issued = generation.current + 1;
      generation.current = issued;
      dispatch({ type: "search", generation: issued, filters });
      void fetchPage(filters, null, issued, false);
    },
    [fetchPage],
  );

  const loadMore = useCallback(() => {
    if (state.cursor === null) return;
    if (state.phase === "loading" || state.phase === "loading-more") return;
    dispatch({ type: "load-more" });
    void fetchPage(state.filters, state.cursor, generation.current, true);
  }, [fetchPage, state.cursor, state.filters, state.phase]);

  useEffect(() => {
    if (access.state !== "authorized") return;
    search(ADMIN_NEWS_EMPTY_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.state]);

  const loading = state.phase === "loading";
  const loadingMore = state.phase === "loading-more";

  return (
    <AdminFunctionalRoute
      access={access}
      title={rtl ? "إدارة الأخبار" : "Gestion des actualités"}
      description={
        rtl
          ? "قائمة كل المقالات بجميع الحالات، بما فيها المسودات والمقالات غير المنشورة."
          : "Liste de tous les articles, quel que soit leur statut, brouillons et retirés inclus."
      }
      testId="admin-news-list"
    >
      {access.state === "authorized" && (
        <>
          {/* The primary action sits above the filters: writing a new article
              is what this screen is opened for most of the time. */}
          <Link
            to="/admin/news/new"
            className={`${adminButtonClass} w-full gap-2 sm:w-auto`}
            data-testid="admin-news-create"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {rtl ? "مقال جديد" : "Nouvel article"}
          </Link>

          <form
            className={`mt-5 ${ADMIN_CARD_CLASS} p-4 sm:p-5`}
            onSubmit={(event) => {
              event.preventDefault();
              search({ language, status, query });
            }}
          >
            <h3 className={ADMIN_LABEL_CLASS}>{rtl ? "تصفية" : "Filtres"}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-slate-300">{rtl ? "اللغة" : "Langue"}</span>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as NewsLanguage | "")}
                  className={adminFieldClass}
                  data-testid="admin-news-filter-language"
                >
                  <option value="">{rtl ? "الكل" : "Toutes"}</option>
                  <option value="fr">Français</option>
                  <option value="ar">العربية</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-slate-300">{rtl ? "الحالة" : "Statut"}</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as EditorialStatus | "")}
                  className={adminFieldClass}
                  data-testid="admin-news-filter-status"
                >
                  <option value="">{rtl ? "الكل" : "Tous"}</option>
                  {STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {NEWS_STATUS_LABELS[value][lang]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm sm:col-span-2">
                <span className="font-medium text-slate-300">
                  {rtl ? "بحث في العنوان" : "Recherche dans le titre"}
                </span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className={adminFieldClass}
                  data-testid="admin-news-filter-query"
                />
              </label>
            </div>
            <button
              className={`${adminButtonClass} mt-4 w-full gap-2 sm:w-auto`}
              disabled={loading || loadingMore}
              type="submit"
              data-testid="admin-news-filter-submit"
            >
              <Search className="h-4 w-4" aria-hidden />
              {rtl ? "تصفية" : "Filtrer"}
            </button>
          </form>

          {state.error !== null && (
            <div className="mt-4">
              <AdminNotice tone="alert" role="alert">
                {state.error}
              </AdminNotice>
            </div>
          )}

          <h3 className={`mt-6 ${ADMIN_LABEL_CLASS}`} data-testid="admin-news-result-count">
            {rtl ? "المقالات" : "Articles"}
            {" · "}
            {/* A count with a "more to come" marker is an LTR run: only the
                value is forced, the label keeps its logical position. */}
            <AdminDatum mono={false} className="tabular-nums">
              {`${state.items.length}${state.cursor === null ? "" : "+"}`}
            </AdminDatum>
          </h3>

          <ul className="mt-3 grid gap-3" data-testid="admin-news-items">
            {state.items.map((item) => (
              <li key={item.id} data-testid="admin-news-item">
                {/* The whole card is the link: a one-tap target at 390px. */}
                <Link
                  to="/admin/news/$articleEditionId"
                  params={{ articleEditionId: item.id }}
                  className={`block ${ADMIN_CARD_CLASS} p-4 outline-none transition-colors hover:border-slate-700 hover:bg-slate-900 focus-visible:ring-2 focus-visible:ring-emerald-400`}
                >
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                    {/* Letter-spacing is LTR-only: Arabic letters join, and
                        widening them pulls an Arabic status label apart. */}
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ltr:tracking-wide ${NEWS_STATUS_TONES[item.status]}`}
                      data-status={item.status}
                    >
                      {NEWS_STATUS_LABELS[item.status][lang]}
                    </span>
                    <span className="inline-flex shrink-0 items-center rounded-full border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                      {item.language === "ar" ? "العربية" : "Français"}
                    </span>
                    {item.visibility !== "public" && (
                      <span className="inline-flex shrink-0 items-center rounded-full border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
                        {item.visibility === "private"
                          ? rtl
                            ? "خاص"
                            : "Privé"
                          : rtl
                            ? "غير مُدرَج"
                            : "Non répertorié"}
                      </span>
                    )}
                  </div>
                  <h4 className="mt-2 text-base font-semibold text-slate-100">
                    {/* The title follows its own article language, so an Arabic
                        headline reads RTL inside a French console. */}
                    <bdi dir={item.language === "ar" ? "rtl" : "ltr"}>{item.title}</bdi>
                  </h4>
                  {/* A slug is LTR data whatever the ambient direction. */}
                  <span className="mt-1 block" data-testid="admin-news-item-slug">
                    <AdminDatum className="text-xs text-slate-500">{item.slug}</AdminDatum>
                  </span>
                  <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-800 pt-3 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <dt className="sr-only">{rtl ? "الكاتب" : "Auteur"}</dt>
                      <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <dd>{item.authorName ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="sr-only">{rtl ? "آخر تحديث" : "Mise à jour"}</dt>
                      <dd>
                        {/* A formatted timestamp is LTR data; only the value is
                            wrapped so the label keeps its logical position. */}
                        <AdminDatum mono={false}>
                          {new Date(item.updatedAt).toLocaleString(lang)}
                        </AdminDatum>
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
            {/* Only ever shown once a page has actually come back empty --
                never while a request is still in flight, and never instead of
                the error above. */}
            {state.phase === "ready" && state.items.length === 0 && (
              <li>
                <AdminEmptyState testId="admin-news-empty">
                  {rtl ? "لا توجد مقالات مطابقة." : "Aucun article ne correspond à ces filtres."}
                </AdminEmptyState>
              </li>
            )}
          </ul>

          {(loading || loadingMore) && (
            <div className="mt-3">
              <AdminSkeletonList rows={loading ? 4 : 2} testId="admin-news-loading" />
              <p className="sr-only" role="status">
                {rtl ? "جارٍ تحميل المقالات…" : "Chargement des articles…"}
              </p>
            </div>
          )}

          {state.cursor !== null && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loading || loadingMore}
              aria-busy={loadingMore}
              className={`${adminButtonClass} mt-4 w-full gap-2 sm:w-auto`}
              data-testid="admin-news-load-more"
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
              {loadingMore
                ? rtl
                  ? "جارٍ التحميل…"
                  : "Chargement…"
                : rtl
                  ? "تحميل المزيد من المقالات"
                  : "Charger plus d’articles"}
            </button>
          )}

          {/* "No cursor" is only the end of the list once something is in it. */}
          {state.cursor === null && state.phase === "ready" && state.items.length > 0 && (
            <p className="mt-4 text-center text-xs text-slate-500" data-testid="admin-news-end">
              {rtl ? "نهاية القائمة." : "Fin de la liste."}
            </p>
          )}
        </>
      )}
    </AdminFunctionalRoute>
  );
}
