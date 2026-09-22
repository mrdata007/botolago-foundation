import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ChevronDown, FileText, Plus, Search } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { loadAdminNewsReadRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { adminRepositoryContext } from "@/backend/admin/functional-route-helpers";
import { encodeEditorialCursor, SupabaseNewsRepository } from "@/backend/news/supabase-repository";
import type {
  EditorialStatus,
  EditorialStoryPageDto,
  EditorialStorySummaryDto,
  NewsLanguage,
} from "@/backend/news/contracts";
import { mapNewsError } from "@/backend/news/errors";
import {
  describeScheduledAt,
  scheduleHealthProblem,
  type ScheduleHealthProblem,
} from "@/backend/news/editorial-session";
import {
  ADMIN_CARD_CLASS,
  ADMIN_LABEL_CLASS,
  AdminDatum,
  AdminEmptyState,
  AdminNotice,
  AdminSkeletonList,
} from "@/components/admin/AdminSurfaces";
import { ui, UiBadge, UiButton, UiInput, UiLinkButton, UiSelect } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

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

/**
 * Status tone, so an editor reads the state of a queue at a glance.
 *
 * Seven statuses drew seven hand-mixed colours; the kit has six badge tones,
 * and two of those are spoken for (`action` is the primary-action gradient --
 * a status wearing it would out-shout the "Nouvel article" button beside it).
 * So the seven map onto four tones plus one faint step, and nothing is lost
 * by it: the status WORD is rendered in the reader's language inside the
 * badge, so colour was never the only carrier here.
 *
 *   published / rejected -> positive / negative, unchanged in meaning.
 *   in_review -> caution, which paints `--ui-caution` as a FILL under
 *     `--ui-on-caution`. What it replaces -- `text-amber-200` on
 *     `bg-amber-500/10` -- is amber as a FOREGROUND, measured 1.78:1; that is
 *     the pairing `--ui-on-caution` exists to stop.
 *   scheduled -> outline, the tone for a state that must not read as spent.
 *     A scheduled article is work still queued to happen; `neutral` sits on
 *     the sunken surface, which is how this product draws "used up".
 *   draft / unpublished / archived -> neutral, with archived a step fainter.
 *     That is the same slate-200 / slate-300 / slate-400 ladder the literal
 *     palette was drawing by hand, now on the theme's own foreground steps.
 *
 * Duplicated in `admin.news.$articleEditionId.tsx`, exactly as the label
 * table beside it already is: these two routes are the only holders, and the
 * shared Admin surface module is owned by another lane.
 */
type NewsBadgeTone = ComponentProps<typeof UiBadge>["tone"];

const NEWS_STATUS_TONES: Record<EditorialStatus, { tone: NewsBadgeTone; className?: string }> = {
  draft: { tone: "neutral" },
  in_review: { tone: "caution" },
  scheduled: { tone: "outline" },
  published: { tone: "positive" },
  unpublished: { tone: "neutral" },
  archived: { tone: "neutral", className: ui.tone.faint },
  rejected: { tone: "negative" },
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
const SCHEDULE_PROBLEM_MESSAGES: Record<ScheduleHealthProblem, { fr: string; ar: string }> = {
  job_inactive: {
    fr: "La publication programmée est désactivée : les articles « Programmé » ne partiront pas.",
    ar: "النشر المجدول معطّل: المقالات المجدولة لن تُنشر.",
  },
  job_stalled: {
    fr: "La publication programmée ne tourne plus depuis plus de 5 minutes.",
    ar: "لم يعمل النشر المجدول منذ أكثر من 5 دقائق.",
  },
  overdue: {
    fr: "Au moins un article programmé a dépassé son heure de plus de 5 minutes sans être publié.",
    ar: "مقال مجدول واحد على الأقل تجاوز موعده بأكثر من 5 دقائق دون نشر.",
  },
  run_failed: {
    fr: "Une publication programmée a échoué au cours des dernières 24 heures. Vérifiez l’article concerné.",
    ar: "فشل نشر مجدول خلال الـ24 ساعة الأخيرة. تحقّق من المقال المعني.",
  },
};

export type AdminNewsListPhase = "loading" | "loading-more" | "ready" | "error";

export interface AdminNewsFilters {
  readonly language: NewsLanguage | "";
  readonly status: EditorialStatus | "";
  readonly query: string;
  /** "editorial" (default) or "imported": legacy third-party stubs are
   *  listed apart from BotolaGO's own work. */
  readonly scope: "editorial" | "imported";
}

export const ADMIN_NEWS_EMPTY_FILTERS: AdminNewsFilters = {
  language: "",
  status: "",
  query: "",
  scope: "editorial",
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
  const [scope, setScope] = useState<AdminNewsFilters["scope"]>("editorial");
  const [scheduleProblem, setScheduleProblem] = useState<ScheduleHealthProblem | null>(null);
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
            scope: filters.scope,
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
    // The scheduler runs in the database every minute; if it is not, every
    // "Programmé" article silently stays private, so say so here.
    repository
      .getScheduleHealth(adminRepositoryContext(access))
      .then((health) => setScheduleProblem(scheduleHealthProblem(health)))
      .catch(() => setScheduleProblem(null));
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
          <UiLinkButton to="/admin/news/new" className="sm:w-auto" data-testid="admin-news-create">
            <Plus className="h-4 w-4" aria-hidden />
            {rtl ? "مقال جديد" : "Nouvel article"}
          </UiLinkButton>

          <form
            className={cn("mt-5", ADMIN_CARD_CLASS, "p-4 sm:p-5")}
            onSubmit={(event) => {
              event.preventDefault();
              search({ language, status, query, scope });
            }}
          >
            <h3 className={ADMIN_LABEL_CLASS}>{rtl ? "تصفية" : "Filtres"}</h3>
            {/* The three filters were a hand-built `<label>` + `<select>` /
                `<input>` recipe each. `UiSelect`/`UiInput` render and wire the
                same label, so the visible words are unchanged -- but the hint
                and error lines they own are now `aria-describedby` rather than
                part of the control's accessible NAME, which is what a label
                wrapping its own helper text made them. */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <UiSelect
                label={rtl ? "اللغة" : "Langue"}
                value={language}
                onChange={(event) => setLanguage(event.target.value as NewsLanguage | "")}
                data-testid="admin-news-filter-language"
              >
                <option value="">{rtl ? "الكل" : "Toutes"}</option>
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
              </UiSelect>
              <UiSelect
                label={rtl ? "الحالة" : "Statut"}
                value={status}
                onChange={(event) => setStatus(event.target.value as EditorialStatus | "")}
                data-testid="admin-news-filter-status"
              >
                <option value="">{rtl ? "الكل" : "Tous"}</option>
                {STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {NEWS_STATUS_LABELS[value][lang]}
                  </option>
                ))}
              </UiSelect>
              <UiSelect
                label={rtl ? "النوع" : "Type"}
                value={scope}
                onChange={(event) => setScope(event.target.value as AdminNewsFilters["scope"])}
                data-testid="admin-news-filter-scope"
              >
                <option value="editorial">{rtl ? "مقالات BotolaGO" : "Articles BotolaGO"}</option>
                <option value="imported">
                  {rtl
                    ? "محتوى مستورد (أرشيف، غير قابل للنشر)"
                    : "Contenu importé (archive, non publiable)"}
                </option>
              </UiSelect>
              <UiInput
                label={rtl ? "بحث في العنوان" : "Recherche dans le titre"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                data-testid="admin-news-filter-query"
              />
            </div>
            <UiButton
              type="submit"
              className="mt-4 sm:w-auto"
              disabled={loading || loadingMore}
              data-testid="admin-news-filter-submit"
            >
              <Search className="h-4 w-4" aria-hidden />
              {rtl ? "تصفية" : "Filtrer"}
            </UiButton>
          </form>

          {scheduleProblem && (
            <div className="mt-4" data-testid="admin-news-schedule-warning">
              <AdminNotice tone="alert" role="alert">
                {SCHEDULE_PROBLEM_MESSAGES[scheduleProblem][lang]}
              </AdminNotice>
            </div>
          )}

          {state.error !== null && (
            <div className="mt-4">
              <AdminNotice tone="alert" role="alert">
                {state.error}
              </AdminNotice>
            </div>
          )}

          <h3 className={cn("mt-6", ADMIN_LABEL_CLASS)} data-testid="admin-news-result-count">
            {rtl ? "المقالات" : "Articles"}
            {" · "}
            {/* A count with a "more to come" marker is an LTR run: only the
                value is forced, the label keeps its logical position.
                `ui.text.tabular` rather than a hand-rolled `tabular-nums`
                (rule 4); not a `ui.stat.*` step, because this figure is set
                inline inside a 12px label and the smallest stat step is 13px
                — it would sit a pixel proud of the word it follows. */}
            <AdminDatum mono={false} className={ui.text.tabular}>
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
                  // The hover used to move the border as well as the fill. The
                  // rule token is one hairline colour with no hover step, so
                  // the surface carries the whole hover on its own -- sunken,
                  // which is the recessed step the rest of the kit uses for
                  // "under the pointer".
                  className={cn(
                    "block p-4 transition-colors",
                    ADMIN_CARD_CLASS,
                    "hover:bg-[color:var(--ui-surface-sunken)]",
                    ui.focus,
                  )}
                >
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                    {/* Letter-spacing is LTR-only: Arabic letters join, and
                        widening them pulls an Arabic status label apart. The
                        badge's own `ui.text.label` step now carries that
                        `ltr:`-prefixed tracking, so the rule is stated once in
                        the kit instead of at every call site.

                        The wrapper span is the `data-status` hook: `UiBadge`
                        forwards neither `data-*` nor a `testId`, unlike the
                        state primitives, and a browser hook is not something a
                        restyle may drop. Raised as a kit gap rather than
                        patched here. */}
                    <span className="shrink-0" data-status={item.status}>
                      <UiBadge {...NEWS_STATUS_TONES[item.status]}>
                        {NEWS_STATUS_LABELS[item.status][lang]}
                      </UiBadge>
                    </span>
                    {/* Language and visibility are facts about the article
                        rather than states of it, so they stay on the quiet
                        neutral chip and let the status badge be the one
                        coloured thing in the row. */}
                    <UiBadge tone="neutral" className="shrink-0">
                      {item.language === "ar" ? "العربية" : "Français"}
                    </UiBadge>
                    {item.imported && (
                      <UiBadge tone="negative" className="shrink-0">
                        {rtl ? "مستورد · غير قابل للنشر" : "Importé · non publiable"}
                      </UiBadge>
                    )}
                    {item.visibility !== "public" && (
                      <UiBadge tone="neutral" className={cn("shrink-0", ui.tone.faint)}>
                        {item.visibility === "private"
                          ? rtl
                            ? "خاص"
                            : "Privé"
                          : rtl
                            ? "غير مُدرَج"
                            : "Non répertorié"}
                      </UiBadge>
                    )}
                  </div>
                  <h4 className={cn("mt-2", ui.text.subtitle, ui.tone.default)}>
                    {/* The title follows its own article language, so an Arabic
                        headline reads RTL inside a French console. */}
                    <bdi dir={item.language === "ar" ? "rtl" : "ltr"}>{item.title}</bdi>
                  </h4>
                  {/* A slug is LTR data whatever the ambient direction. */}
                  <span className="mt-1 block" data-testid="admin-news-item-slug">
                    <AdminDatum className={cn(ui.text.meta, ui.tone.faint)}>{item.slug}</AdminDatum>
                  </span>
                  <dl
                    className={cn(
                      "mt-3 flex flex-wrap gap-x-4 gap-y-1 pt-3",
                      ui.rule.blockStart,
                      ui.text.meta,
                      ui.tone.muted,
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <dt className="sr-only">{rtl ? "الكاتب" : "Auteur"}</dt>
                      <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <dd>{item.authorName ?? "—"}</dd>
                    </div>
                    {item.status === "scheduled" && item.scheduledAt && (
                      <div data-testid="admin-news-item-scheduled-at">
                        <dt className="inline">{rtl ? "موعد النشر: " : "Publication : "}</dt>
                        <dd className="inline">
                          <AdminDatum mono={false}>
                            {describeScheduledAt(item.scheduledAt, lang).local}
                          </AdminDatum>
                        </dd>
                      </div>
                    )}
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
            <UiButton
              onClick={loadMore}
              disabled={loading || loadingMore}
              aria-busy={loadingMore}
              className="mt-4 sm:w-auto"
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
            </UiButton>
          )}

          {/* "No cursor" is only the end of the list once something is in it. */}
          {state.cursor === null && state.phase === "ready" && state.items.length > 0 && (
            <p
              className={cn("mt-4 text-center", ui.text.meta, ui.tone.faint)}
              data-testid="admin-news-end"
            >
              {rtl ? "نهاية القائمة." : "Fin de la liste."}
            </p>
          )}
        </>
      )}
    </AdminFunctionalRoute>
  );
}
