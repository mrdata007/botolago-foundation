import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadAdminNewsWriteRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import {
  adminButtonClass,
  adminDangerButtonClass,
  adminFieldClass,
  adminRepositoryContext,
} from "@/backend/admin/functional-route-helpers";
import { SupabaseNewsRepository } from "@/backend/news/supabase-repository";
import {
  sanitizeEditorialHtml,
  NEWS_SANITIZER_VERSION,
  calculateReadingTime,
} from "@/backend/news/sanitizer";
import { mapNewsError } from "@/backend/news/errors";
import type {
  ArticleEditorialDetailDto,
  EditorialRevisionDto,
  EditorialStatus,
  PlacementType,
} from "@/backend/news/contracts";
import { supabaseV2 } from "@/integrations/supabase/v2-client";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/news/$articleEditionId")({
  ssr: false,
  loader: () => loadAdminNewsWriteRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminNewsEditRoute,
});

// Client-side hint only, for which buttons to render. The RPC's own state
// machine (api.editorial_transition_article) is the only real authority: a
// stale or role-mismatched attempt is rejected server-side and surfaced
// below rather than trusted here.
const NEXT_STATUSES: Record<EditorialStatus, readonly EditorialStatus[]> = {
  draft: ["in_review", "rejected"],
  in_review: ["draft", "scheduled", "published", "rejected"],
  scheduled: ["draft", "published", "unpublished"],
  published: ["unpublished", "archived"],
  unpublished: ["draft", "published", "archived"],
  rejected: ["draft"],
  archived: ["draft"],
};

const PLACEMENTS: readonly PlacementType[] = [
  "home_lead",
  "news_lead",
  "editors_pick",
  "featured",
  "breaking",
  "trending",
];

function naiveMarkdownToHtml(source: string): string {
  return source
    .split(/\n{2,}/u)
    .map((paragraph) => `<p>${paragraph.trim()}</p>`)
    .join("");
}

function naiveHtmlToMarkdown(html: string): string {
  return html.replace(/<\/p>\s*<p>/giu, "\n\n").replace(/<\/?p>/giu, "");
}

function AdminNewsEditRoute() {
  const access = Route.useLoaderData();
  const { articleEditionId } = Route.useParams();
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const repository = useMemo(() => new SupabaseNewsRepository(), []);

  const [article, setArticle] = useState<ArticleEditorialDetailDto | null>(null);
  const [revisions, setRevisions] = useState<readonly EditorialRevisionDto[]>([]);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [summary, setSummary] = useState("");
  const [bodyMarkdown, setBodyMarkdown] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [heroAssetId, setHeroAssetId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    if (access.state !== "authorized") return;
    setBusy(true);
    setMessage(null);
    try {
      const [detail, revisionList] = await Promise.all([
        repository.getEditorialArticle(articleEditionId, adminRepositoryContext(access)),
        repository.listRevisions(articleEditionId, 20, adminRepositoryContext(access)),
      ]);
      setArticle(detail);
      setRevisions(revisionList);
      setTitle(detail.title);
      setSubtitle(detail.subtitle ?? "");
      setSummary(detail.summary);
      setBodyMarkdown(detail.bodySource ?? naiveHtmlToMarkdown(detail.bodyHtml));
      setSeoTitle(detail.seoTitle ?? "");
      setSeoDescription(detail.seoDescription ?? "");
      setHeroAssetId(detail.heroAssetId);
      setDirty(false);
    } catch (error) {
      setMessage(
        `${rtl ? "تعذّر تحميل المقال" : "Chargement de l’article impossible"}: ${mapNewsError(error as Error).code}`,
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.state, articleEditionId]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const markDirty =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setDirty(true);
    };

  const save = async () => {
    if (access.state !== "authorized" || !article) return;
    setBusy(true);
    setMessage(null);
    try {
      const bodyHtml = sanitizeEditorialHtml(naiveMarkdownToHtml(bodyMarkdown));
      const result = await repository.updateArticle(
        {
          articleEditionId: article.id,
          expectedUpdatedAt: article.updatedAt,
          slug: article.slug,
          title,
          subtitle: subtitle.trim() || null,
          summary,
          bodyFormat: "markdown",
          bodySource: bodyMarkdown,
          bodyHtml,
          readingTimeMinutes: calculateReadingTime(bodyHtml),
          sanitizerVersion: NEWS_SANITIZER_VERSION,
          heroAssetId,
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
        },
        adminRepositoryContext(access),
      );
      setArticle({ ...article, updatedAt: result.updatedAt, title, subtitle: subtitle || null });
      setDirty(false);
      setMessage(rtl ? "تم الحفظ." : "Enregistré.");
    } catch (error) {
      const mapped = mapNewsError(error as Error);
      setMessage(
        mapped.code === "editorial_conflict"
          ? rtl
            ? "تم تعديل المقال في مكان آخر. أعد التحميل قبل الحفظ."
            : "L’article a été modifié ailleurs. Rechargez avant d’enregistrer."
          : `${rtl ? "تعذّر الحفظ" : "Enregistrement impossible"}: ${mapped.code}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const transition = async (targetStatus: EditorialStatus) => {
    if (access.state !== "authorized" || !article) return;
    if (
      dirty &&
      !window.confirm(
        rtl ? "توجد تغييرات غير محفوظة. المتابعة؟" : "Modifications non enregistrées. Continuer ?",
      )
    )
      return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await repository.transitionArticle(
        { articleEditionId: article.id, targetStatus },
        adminRepositoryContext(access),
      );
      setArticle({ ...article, status: result.status, visibility: result.visibility });
      setMessage(rtl ? `الحالة الجديدة: ${result.status}` : `Nouveau statut : ${result.status}`);
    } catch (error) {
      setMessage(
        `${rtl ? "تعذّر تغيير الحالة" : "Changement de statut impossible"}: ${mapNewsError(error as Error).code}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const setPlacement = async (placementType: PlacementType) => {
    if (access.state !== "authorized" || !article) return;
    setBusy(true);
    setMessage(null);
    try {
      await repository.setPlacement(
        { articleEditionId: article.id, placementType },
        adminRepositoryContext(access),
      );
      setMessage(rtl ? "تم تحديد الموضع." : "Placement défini.");
    } catch (error) {
      setMessage(
        `${rtl ? "تعذّر تحديد الموضع" : "Placement impossible"}: ${mapNewsError(error as Error).code}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const uploadHero = async (file: File) => {
    if (access.state !== "authorized") return;
    setBusy(true);
    setMessage(null);
    try {
      const { data: session } = await supabaseV2.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("no_session");
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error("invalid_image"));
        img.src = URL.createObjectURL(file);
      });
      const form = new FormData();
      form.set("file", file, file.name);
      form.set("altText", title || "Article hero image");
      form.set("width", String(dimensions.width));
      form.set("height", String(dimensions.height));
      const { data, error } = await supabaseV2.functions.invoke("news-media-upload", {
        body: form,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      const uploadResult = data as { mediaAssetId: string } | null;
      if (!uploadResult?.mediaAssetId) throw new Error("upload_failed");
      setHeroAssetId(uploadResult.mediaAssetId);
      setDirty(true);
      setMessage(
        rtl ? "تم رفع الصورة. احفظ لتطبيقها." : "Image téléversée. Enregistrez pour l’appliquer.",
      );
    } catch {
      setMessage(rtl ? "تعذّر رفع الصورة." : "Téléversement de l’image impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminFunctionalRoute
      access={access}
      title={rtl ? "تحرير المقال" : "Modifier l’article"}
      description={
        rtl
          ? "الحفظ صريح دائماً. الانتقالات بين الحالات محكومة بصلاحيتك الفعلية على الخادم."
          : "L’enregistrement est toujours explicite. Les transitions de statut sont arbitrées côté serveur selon votre rôle réel."
      }
      testId="admin-news-edit"
    >
      {access.state === "authorized" && article && (
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="rounded-full border border-slate-600 px-2 py-0.5 uppercase tracking-wide">
              {article.status}
            </span>
            {dirty && (
              <span className="text-amber-300" data-testid="admin-news-unsaved">
                {rtl ? "تغييرات غير محفوظة" : "Modifications non enregistrées"}
              </span>
            )}
          </div>

          <label className="grid gap-2 text-sm">
            <span>{rtl ? "العنوان" : "Titre"}</span>
            <input
              value={title}
              onChange={(event) => markDirty(setTitle)(event.target.value)}
              className={adminFieldClass}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>{rtl ? "العنوان الفرعي" : "Sous-titre"}</span>
            <input
              value={subtitle}
              onChange={(event) => markDirty(setSubtitle)(event.target.value)}
              className={adminFieldClass}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>{rtl ? "الملخص" : "Résumé"}</span>
            <textarea
              value={summary}
              onChange={(event) => markDirty(setSummary)(event.target.value)}
              rows={3}
              className={adminFieldClass}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>{rtl ? "المحتوى" : "Contenu"}</span>
            <textarea
              value={bodyMarkdown}
              onChange={(event) => markDirty(setBodyMarkdown)(event.target.value)}
              rows={14}
              className={adminFieldClass}
            />
          </label>

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <label className="grid gap-2">
              <span>{rtl ? "عنوان SEO" : "Titre SEO"}</span>
              <input
                value={seoTitle}
                onChange={(event) => markDirty(setSeoTitle)(event.target.value)}
                maxLength={70}
                className={adminFieldClass}
              />
            </label>
            <label className="grid gap-2">
              <span>{rtl ? "وصف SEO" : "Description SEO"}</span>
              <input
                value={seoDescription}
                onChange={(event) => markDirty(setSeoDescription)(event.target.value)}
                maxLength={170}
                className={adminFieldClass}
              />
            </label>
          </div>

          <div className="grid gap-2 text-sm">
            <span>{rtl ? "الصورة الرئيسية" : "Image à la une"}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/avif,image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadHero(file);
              }}
            />
            {heroAssetId && (
              <p className="text-xs text-slate-400">
                {rtl ? "معرّف الوسائط الحالي" : "Identifiant média actuel"}: {heroAssetId}
              </p>
            )}
          </div>

          {message && (
            <p className="text-sm text-amber-200" role="status">
              {message}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={adminButtonClass}
              disabled={busy || !dirty}
              onClick={() => void save()}
              data-testid="admin-news-save"
            >
              {rtl ? "حفظ" : "Enregistrer"}
            </button>
            <button
              type="button"
              className={adminButtonClass}
              onClick={() => setShowPreview((value) => !value)}
              data-testid="admin-news-preview-toggle"
            >
              {showPreview
                ? rtl
                  ? "إخفاء المعاينة"
                  : "Masquer l’aperçu"
                : rtl
                  ? "معاينة"
                  : "Aperçu"}
            </button>
          </div>

          <section aria-label={rtl ? "الانتقال بين الحالات" : "Transitions de statut"}>
            <h3 className="text-sm font-semibold">{rtl ? "الحالة" : "Statut"}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {NEXT_STATUSES[article.status].map((next) => (
                <button
                  key={next}
                  type="button"
                  className={
                    next === "rejected" || next === "archived"
                      ? adminDangerButtonClass
                      : adminButtonClass
                  }
                  disabled={busy}
                  onClick={() => void transition(next)}
                  data-testid={`admin-news-transition-${next}`}
                >
                  {next}
                </button>
              ))}
            </div>
          </section>

          <section aria-label={rtl ? "الموضع التحريري" : "Placement éditorial"}>
            <h3 className="text-sm font-semibold">{rtl ? "الموضع" : "Placement"}</h3>
            <p className="text-xs text-slate-400">
              {article.status === "published"
                ? rtl
                  ? "المقال منشور؛ يمكن تحديد الموضع."
                  : "L’article est publié ; le placement peut être défini."
                : rtl
                  ? "متاح فقط بعد النشر."
                  : "Disponible uniquement une fois l’article publié."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PLACEMENTS.map((placementType) => (
                <button
                  key={placementType}
                  type="button"
                  className={adminButtonClass}
                  disabled={busy || article.status !== "published"}
                  onClick={() => void setPlacement(placementType)}
                  data-testid={`admin-news-placement-${placementType}`}
                >
                  {placementType}
                </button>
              ))}
            </div>
          </section>

          <section aria-label={rtl ? "سجل المراجعات" : "Historique des révisions"}>
            <h3 className="text-sm font-semibold">{rtl ? "المراجعات" : "Révisions"}</h3>
            <ul className="mt-2 grid gap-2 text-xs text-slate-400">
              {revisions.map((revision) => (
                <li key={revision.id} className="rounded border border-slate-700 p-2">
                  #{revision.revisionNumber} · {revision.status} ·{" "}
                  {new Date(revision.createdAt).toLocaleString(lang)}
                </li>
              ))}
              {revisions.length === 0 && (
                <li>{rtl ? "لا توجد مراجعات بعد." : "Aucune révision pour l’instant."}</li>
              )}
            </ul>
          </section>

          {showPreview && (
            <section
              aria-label={rtl ? "معاينة" : "Aperçu"}
              className="rounded-lg border border-slate-700 p-4"
              data-testid="admin-news-preview"
            >
              <h1 className="text-xl font-bold">{title}</h1>
              {subtitle && <p className="mt-1 text-slate-300">{subtitle}</p>}
              <div
                className="prose prose-invert mt-4 max-w-none"
                // Preview-only render of already server-sanitized content, gated
                // behind editorial access (this whole route requires
                // editorial.write); never reachable from a public URL.
                dangerouslySetInnerHTML={{
                  __html: sanitizeEditorialHtml(naiveMarkdownToHtml(bodyMarkdown)),
                }}
              />
            </section>
          )}
        </div>
      )}
    </AdminFunctionalRoute>
  );
}
