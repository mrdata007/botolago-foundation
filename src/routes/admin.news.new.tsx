import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { loadAdminNewsWriteRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import {
  adminButtonClass,
  adminFieldClass,
  adminRepositoryContext,
} from "@/backend/admin/functional-route-helpers";
import { SupabaseNewsRepository } from "@/backend/news/supabase-repository";
import {
  sanitizeEditorialHtml,
  NEWS_SANITIZER_VERSION,
  calculateReadingTime,
} from "@/backend/news/sanitizer";
import { markdownToEditorialHtml } from "@/backend/news/editorial-markdown";
import { mapNewsError } from "@/backend/news/errors";
import type { NewsLanguage } from "@/backend/news/contracts";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/news/new")({
  ssr: false,
  loader: () => loadAdminNewsWriteRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminNewsNewRoute,
});

function AdminNewsNewRoute() {
  const access = Route.useLoaderData();
  const navigate = useNavigate();
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const repository = useMemo(() => new SupabaseNewsRepository(), []);
  const [language, setLanguage] = useState<NewsLanguage>("fr");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (access.state !== "authorized") return;
    setBusy(true);
    setMessage(null);
    try {
      const bodyHtml = sanitizeEditorialHtml(markdownToEditorialHtml(body));
      const created = await repository.createDraft(
        {
          language,
          slug,
          title,
          summary,
          bodyFormat: "markdown",
          bodySource: body,
          bodyHtml,
          readingTimeMinutes: calculateReadingTime(bodyHtml),
          sanitizerVersion: NEWS_SANITIZER_VERSION,
        },
        adminRepositoryContext(access),
      );
      void navigate({
        to: "/admin/news/$articleEditionId",
        params: { articleEditionId: created.articleId },
      });
    } catch (error) {
      setMessage(
        `${rtl ? "تعذّر إنشاء المسودة" : "Création du brouillon impossible"}: ${mapNewsError(error as Error).code}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminFunctionalRoute
      access={access}
      title={rtl ? "مقال جديد" : "Nouvel article"}
      description={
        rtl
          ? "المحتوى يُطهَّر على الخادم قبل أي حفظ. سيُنشأ المقال كمسودة خاصة."
          : "Le contenu est assaini côté serveur avant tout enregistrement. L’article est créé en brouillon privé."
      }
      testId="admin-news-new"
    >
      {access.state === "authorized" && (
        <form className="grid gap-4" onSubmit={submit} data-testid="admin-news-new-form">
          <label className="grid gap-2 text-sm">
            <span>{rtl ? "اللغة" : "Langue"}</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as NewsLanguage)}
              className={adminFieldClass}
            >
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span>{rtl ? "المعرّف (slug)" : "Identifiant (slug)"}</span>
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              required
              className={adminFieldClass}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>{rtl ? "العنوان" : "Titre"}</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={5}
              maxLength={220}
              required
              className={adminFieldClass}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>{rtl ? "الملخص" : "Résumé"}</span>
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              minLength={10}
              maxLength={1000}
              required
              rows={3}
              className={adminFieldClass}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>{rtl ? "المحتوى (Markdown مبسّط)" : "Contenu (Markdown simplifié)"}</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              minLength={20}
              required
              rows={14}
              className={adminFieldClass}
            />
          </label>
          {message && (
            <p className="text-sm text-amber-200" role="status">
              {message}
            </p>
          )}
          <button className={adminButtonClass} type="submit" disabled={busy}>
            {rtl ? "إنشاء المسودة" : "Créer le brouillon"}
          </button>
        </form>
      )}
    </AdminFunctionalRoute>
  );
}
