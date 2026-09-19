import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
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
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void load();
            }}
          >
            <label className="grid gap-2 text-sm">
              <span>{rtl ? "اللغة" : "Langue"}</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as NewsLanguage | "")}
                className={adminFieldClass}
              >
                <option value="">{rtl ? "الكل" : "Toutes"}</option>
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span>{rtl ? "الحالة" : "Statut"}</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as EditorialStatus | "")}
                className={adminFieldClass}
              >
                <option value="">{rtl ? "الكل" : "Tous"}</option>
                {STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span>{rtl ? "بحث في العنوان" : "Recherche dans le titre"}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={adminFieldClass}
              />
            </label>
            <button className={`${adminButtonClass} self-end`} disabled={busy} type="submit">
              {rtl ? "تصفية" : "Filtrer"}
            </button>
          </form>

          <div className="mt-4 flex justify-end">
            <Link to="/admin/news/new" className={adminButtonClass} data-testid="admin-news-create">
              {rtl ? "مقال جديد" : "Nouvel article"}
            </Link>
          </div>

          {message && (
            <p className="mt-4 text-sm text-amber-200" role="status">
              {message}
            </p>
          )}

          <ul className="mt-5 grid gap-3" data-testid="admin-news-items">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-slate-700 p-4 text-sm"
                data-testid="admin-news-item"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to="/admin/news/$articleEditionId"
                    params={{ articleEditionId: item.id }}
                    className="font-semibold text-emerald-300 underline-offset-2 hover:underline"
                  >
                    {item.title}
                  </Link>
                  <span className="rounded-full border border-slate-600 px-2 py-0.5 text-xs uppercase tracking-wide">
                    {item.status}
                  </span>
                </div>
                <dl className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-4">
                  <div>
                    <dt className="sr-only">{rtl ? "اللغة" : "Langue"}</dt>
                    <dd>{item.language}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">{rtl ? "الظهور" : "Visibilité"}</dt>
                    <dd>{item.visibility}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">{rtl ? "الكاتب" : "Auteur"}</dt>
                    <dd>{item.authorName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">{rtl ? "آخر تحديث" : "Mise à jour"}</dt>
                    <dd>{new Date(item.updatedAt).toLocaleString(lang)}</dd>
                  </div>
                </dl>
              </li>
            ))}
            {items.length === 0 && !busy && (
              <li className="text-sm text-slate-400">
                {rtl ? "لا توجد مقالات مطابقة." : "Aucun article ne correspond à ces filtres."}
              </li>
            )}
          </ul>
        </>
      )}
    </AdminFunctionalRoute>
  );
}
