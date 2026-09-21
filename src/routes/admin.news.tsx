import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { FileText, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadAdminNewsReadRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import {
  adminButtonClass,
  adminFieldClass,
  adminRepositoryContext,
} from "@/backend/admin/functional-route-helpers";
import { SupabaseNewsRepository } from "@/backend/news/supabase-repository";
import type {
  EditorialStatus,
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
  const [language, setLanguage] = useState<NewsLanguage | "">("");
  const [status, setStatus] = useState<EditorialStatus | "">("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<readonly EditorialStorySummaryDto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (access.state !== "authorized") return;
    setBusy(true);
    setMessage(null);
    try {
      const page = await repository.listStories(
        {
          language: language || null,
          status: status || null,
          query: query.trim() || null,
          limit: 30,
        },
        adminRepositoryContext(access),
      );
      setItems(page.items);
    } catch (error) {
      setMessage(
        `${rtl ? "تعذّر تحميل المقالات" : "Chargement des articles impossible"}: ${mapNewsError(error as Error).code}`,
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.state]);

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
              void load();
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
              disabled={busy}
              type="submit"
              data-testid="admin-news-filter-submit"
            >
              <Search className="h-4 w-4" aria-hidden />
              {rtl ? "تصفية" : "Filtrer"}
            </button>
          </form>

          {message && (
            <div className="mt-4">
              <AdminNotice tone="alert">{message}</AdminNotice>
            </div>
          )}

          <h3 className={`mt-6 ${ADMIN_LABEL_CLASS}`} data-testid="admin-news-result-count">
            {rtl ? "المقالات" : "Articles"}
            {" · "}
            <span className="tabular-nums">{items.length}</span>
          </h3>

          <ul className="mt-3 grid gap-3" data-testid="admin-news-items">
            {items.map((item) => (
              <li key={item.id} data-testid="admin-news-item">
                {/* The whole card is the link: a one-tap target at 390px. */}
                <Link
                  to="/admin/news/$articleEditionId"
                  params={{ articleEditionId: item.id }}
                  className={`block ${ADMIN_CARD_CLASS} p-4 outline-none transition-colors hover:border-slate-700 hover:bg-slate-900 focus-visible:ring-2 focus-visible:ring-emerald-400`}
                >
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${NEWS_STATUS_TONES[item.status]}`}
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
            {items.length === 0 && !busy && (
              <li>
                <AdminEmptyState testId="admin-news-empty">
                  {rtl ? "لا توجد مقالات مطابقة." : "Aucun article ne correspond à ces filtres."}
                </AdminEmptyState>
              </li>
            )}
          </ul>
        </>
      )}
    </AdminFunctionalRoute>
  );
}
