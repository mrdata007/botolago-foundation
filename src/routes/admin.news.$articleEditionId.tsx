import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Eye, EyeOff, ImagePlus, Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { loadAdminNewsReadRouteAccess } from "@/backend/admin/route-access.functions";
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
import {
  editorialHtmlToMarkdown,
  editorialImageMarkdown,
  insertMarkdownBlockAtSelection,
  isAllowedEditorialImageUrl,
  markdownToEditorialHtml,
} from "@/backend/news/editorial-markdown";
import {
  ADMIN_CARD_CLASS,
  ADMIN_LABEL_CLASS,
  ADMIN_PANEL_CLASS,
  AdminDatum,
  AdminNotice,
} from "@/components/admin/AdminSurfaces";
import { resolveMediaUrl } from "@/lib/media";
import { supabaseV2 } from "@/integrations/supabase/v2-client";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/news/$articleEditionId")({
  ssr: false,
  // Page-level gate is deliberately just "can view editorial content"
  // (editorial.read), not "can write" (editorial.write): the publisher role
  // is seeded with editorial.publish but not editorial.write, and a
  // publisher must be able to open this exact page to review and publish
  // an in_review article -- the page's own description already says real
  // authorization is arbitrated server-side per action (save/transition
  // each re-check has_editorial_role at the correct tier); gating the page
  // itself on editorial.write silently locked every pure-publisher account
  // out of the review/publish step entirely.
  loader: () => loadAdminNewsReadRouteAccess(),
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

// Mirrors api.editorial_update_article's own guard exactly (news_article_not_editable):
// content edits are only accepted while the edition is draft/in_review/rejected/unpublished.
const EDITABLE_STATUSES: readonly EditorialStatus[] = [
  "draft",
  "in_review",
  "rejected",
  "unpublished",
];

const PLACEMENTS: readonly PlacementType[] = [
  "home_lead",
  "news_lead",
  "editors_pick",
  "featured",
  "breaking",
  "trending",
];

/** Editorial status in the editor's own language. The enum value itself stays
 *  the wire contract and the test id suffix; only the rendered word changes. */
const STATUS_LABELS: Record<EditorialStatus, { fr: string; ar: string }> = {
  draft: { fr: "Brouillon", ar: "مسودة" },
  in_review: { fr: "En relecture", ar: "قيد المراجعة" },
  scheduled: { fr: "Programmé", ar: "مجدول" },
  published: { fr: "Publié", ar: "منشور" },
  unpublished: { fr: "Retiré", ar: "غير منشور" },
  archived: { fr: "Archivé", ar: "مؤرشف" },
  rejected: { fr: "Refusé", ar: "مرفوض" },
};

const STATUS_TONES: Record<EditorialStatus, string> = {
  draft: "border-slate-600 bg-slate-800/70 text-slate-200",
  in_review: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  scheduled: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  published: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  unpublished: "border-slate-600 bg-slate-800/70 text-slate-300",
  archived: "border-slate-700 bg-slate-900 text-slate-400",
  rejected: "border-rose-500/40 bg-rose-500/10 text-rose-200",
};

const PLACEMENT_LABELS: Record<PlacementType, { fr: string; ar: string }> = {
  home_lead: { fr: "Une de l’accueil", ar: "صدارة الرئيسية" },
  news_lead: { fr: "Une des actualités", ar: "صدارة الأخبار" },
  editors_pick: { fr: "Choix de la rédaction", ar: "اختيار التحرير" },
  featured: { fr: "Mis en avant", ar: "مميّز" },
  breaking: { fr: "Urgent", ar: "عاجل" },
  trending: { fr: "Tendance", ar: "الأكثر تداولاً" },
};

// Response shape of the `news-media-upload` Edge Function.
interface NewsMediaUploadResult {
  readonly mediaAssetId: string;
  readonly storagePath?: string | null;
  readonly publicUrl?: string | null;
}

const ACCEPTED_IMAGE_TYPES = "image/avif,image/jpeg,image/png,image/webp";

/** One grouped block of the long form, so the editor reads as sections rather
 *  than a wall of inputs. */
function EditorSection({
  heading,
  hint,
  children,
  label,
  testId,
}: {
  heading: string;
  hint?: string;
  children: ReactNode;
  label?: string;
  testId?: string;
}) {
  return (
    <section className={`${ADMIN_CARD_CLASS} p-4 sm:p-5`} aria-label={label} data-testid={testId}>
      <h3 className={ADMIN_LABEL_CLASS}>{heading}</h3>
      {hint && <p className="mt-1 text-xs leading-5 text-slate-400">{hint}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

/** Label text keeps the ambient direction; only the control it wraps may carry
 *  its own `dir` when it holds LTR data or the article's own language. */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-slate-200">{label}</span>
      {children}
      {hint && <span className="text-xs leading-5 text-slate-400">{hint}</span>}
    </label>
  );
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
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bodyImageInputRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

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
      setBodyMarkdown(detail.bodySource ?? editorialHtmlToMarkdown(detail.bodyHtml));
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
      const bodyHtml = sanitizeEditorialHtml(markdownToEditorialHtml(bodyMarkdown));
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
    let scheduledAtIso: string | null = null;
    if (targetStatus === "scheduled") {
      if (!scheduledAtLocal) {
        setMessage(
          rtl
            ? "اختر تاريخ ووقت النشر المجدول أولاً."
            : "Choisissez d’abord une date et une heure de publication programmée.",
        );
        return;
      }
      const parsed = new Date(scheduledAtLocal);
      if (Number.isNaN(parsed.getTime())) {
        setMessage(rtl ? "تاريخ الجدولة غير صالح." : "Date de programmation invalide.");
        return;
      }
      if (parsed.getTime() <= Date.now()) {
        setMessage(
          rtl ? "يجب أن يكون موعد النشر في المستقبل." : "La date programmée doit être future.",
        );
        return;
      }
      scheduledAtIso = parsed.toISOString();
    }
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
        { articleEditionId: article.id, targetStatus, scheduledAt: scheduledAtIso },
        adminRepositoryContext(access),
      );
      setArticle({ ...article, status: result.status, visibility: result.visibility });
      setScheduledAtLocal("");
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

  // Shared by the hero upload and the in-body image insertion: same Edge
  // Function, same multipart contract (`news-media-upload` requires alt text
  // and real pixel dimensions and rejects anything that is not an allowed
  // image type).
  const uploadNewsMedia = async (file: File, altText: string): Promise<NewsMediaUploadResult> => {
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
    form.set("altText", altText);
    form.set("width", String(dimensions.width));
    form.set("height", String(dimensions.height));
    const { data, error } = await supabaseV2.functions.invoke("news-media-upload", {
      body: form,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    const uploadResult = data as NewsMediaUploadResult | null;
    if (!uploadResult?.mediaAssetId) throw new Error("upload_failed");
    return uploadResult;
  };

  const uploadHero = async (file: File) => {
    if (access.state !== "authorized") return;
    setBusy(true);
    setMessage(null);
    try {
      const uploadResult = await uploadNewsMedia(file, title || "Article hero image");
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

  const insertBodyImage = async (file: File) => {
    if (access.state !== "authorized" || !isEditable) return;
    // Asked before the upload starts: the Edge Function itself refuses an
    // upload without alt text, and the alt text becomes the figcaption.
    const answer = window.prompt(
      rtl
        ? "النص البديل للصورة (يُستخدم أيضاً كتعليق أسفل الصورة):"
        : "Texte alternatif de l’image (sert aussi de légende) :",
      title,
    );
    if (answer === null) return;
    const altText = answer.trim();
    setBusy(true);
    setMessage(null);
    try {
      const uploadResult = await uploadNewsMedia(file, altText || title || file.name);
      // The public URL is derived through the same resolver the public site
      // uses, from the storage path the Edge Function returns, rather than
      // hand-built here; the function's own `publicUrl` is the fallback.
      const url =
        resolveMediaUrl({ storagePath: uploadResult.storagePath ?? null }) ??
        resolveMediaUrl({ sourceUrl: uploadResult.publicUrl ?? null });
      if (!url || !isAllowedEditorialImageUrl(url)) throw new Error("unresolvable_media_url");

      const textarea = bodyRef.current;
      const selectionStart = textarea?.selectionStart ?? bodyMarkdown.length;
      const selectionEnd = textarea?.selectionEnd ?? bodyMarkdown.length;
      const insertion = insertMarkdownBlockAtSelection(
        bodyMarkdown,
        selectionStart,
        selectionEnd,
        editorialImageMarkdown(url, altText),
      );
      setBodyMarkdown(insertion.value);
      setDirty(true);
      setMessage(
        rtl
          ? "تم إدراج الصورة في موضع المؤشر. احفظ لتطبيقها."
          : "Image insérée à la position du curseur. Enregistrez pour l’appliquer.",
      );
      // Restore the caret after React has re-rendered the textarea value.
      window.requestAnimationFrame(() => {
        const node = bodyRef.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(insertion.caret, insertion.caret);
      });
    } catch {
      setMessage(
        rtl ? "تعذّر إدراج الصورة في المحتوى." : "Insertion de l’image dans le contenu impossible.",
      );
    } finally {
      setBusy(false);
    }
  };

  const isEditable = article ? EDITABLE_STATUSES.includes(article.status) : false;
  // The prose fields follow the ARTICLE's language, not the console's, so an
  // Arabic article is typed RTL even while the UI is in French.
  const articleDir = article?.language === "ar" ? "rtl" : "ltr";

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
        <div className="grid gap-4">
          <Link
            to="/admin/news"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-300 outline-none hover:text-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-400"
            data-testid="admin-news-back-to-list"
          >
            {/* The arrow is flipped by the ambient direction, never by hand. */}
            <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
            {rtl ? "كل المقالات" : "Tous les articles"}
          </Link>

          {/* Identity + the primary action, kept in view while the long form
              scrolls, so "Enregistrer" is never hunted for. */}
          <div
            className={`sticky top-0 z-20 ${ADMIN_CARD_CLASS} p-4 backdrop-blur`}
            data-testid="admin-news-toolbar"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_TONES[article.status]}`}
                data-status={article.status}
              >
                {STATUS_LABELS[article.status][lang]}
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                {article.language === "ar" ? "العربية" : "Français"}
              </span>
              {dirty && (
                <span
                  className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200"
                  data-testid="admin-news-unsaved"
                >
                  {rtl ? "تغييرات غير محفوظة" : "Modifications non enregistrées"}
                </span>
              )}
            </div>
            {/* A slug is LTR data whatever the console's direction. */}
            <span className="mt-2 block">
              <AdminDatum className="text-xs text-slate-500">{article.slug}</AdminDatum>
            </span>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                className={`${adminButtonClass} flex-1 gap-2 sm:flex-none`}
                disabled={busy || !dirty || !isEditable}
                onClick={() => void save()}
                data-testid="admin-news-save"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="h-4 w-4" aria-hidden />
                )}
                {rtl ? "حفظ" : "Enregistrer"}
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 outline-none transition-colors hover:border-slate-600 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-emerald-400 sm:flex-none"
                onClick={() => setShowPreview((value) => !value)}
                data-testid="admin-news-preview-toggle"
              >
                {showPreview ? (
                  <EyeOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
                {showPreview
                  ? rtl
                    ? "إخفاء المعاينة"
                    : "Masquer l’aperçu"
                  : rtl
                    ? "معاينة"
                    : "Aperçu"}
              </button>
            </div>
          </div>

          {message && <AdminNotice tone="alert">{message}</AdminNotice>}

          {!isEditable && (
            <p
              className={`${ADMIN_PANEL_CLASS} px-4 py-3 text-xs leading-5 text-slate-300`}
              data-testid="admin-news-not-editable"
            >
              {rtl
                ? "لا يمكن تعديل المحتوى في هذه الحالة. غيّر الحالة أولاً إن كان ذلك ممكناً."
                : "Le contenu n’est pas modifiable dans ce statut. Changez d’abord de statut si possible."}
            </p>
          )}

          <EditorSection
            heading={rtl ? "العنوان والملخص" : "Titre et résumé"}
            testId="admin-news-section-headline"
          >
            <Field label={rtl ? "العنوان" : "Titre"}>
              <input
                value={title}
                onChange={(event) => markDirty(setTitle)(event.target.value)}
                disabled={!isEditable}
                dir={articleDir}
                className={`${adminFieldClass} text-base font-semibold disabled:opacity-60`}
              />
            </Field>
            <Field label={rtl ? "العنوان الفرعي" : "Sous-titre"}>
              <input
                value={subtitle}
                onChange={(event) => markDirty(setSubtitle)(event.target.value)}
                disabled={!isEditable}
                dir={articleDir}
                className={`${adminFieldClass} disabled:opacity-60`}
              />
            </Field>
            <Field
              label={rtl ? "الملخص" : "Résumé"}
              hint={rtl ? `${summary.length} حرفاً` : `${summary.length} caractères`}
            >
              <textarea
                value={summary}
                disabled={!isEditable}
                onChange={(event) => markDirty(setSummary)(event.target.value)}
                rows={3}
                dir={articleDir}
                className={`${adminFieldClass} leading-6 disabled:opacity-60`}
              />
            </Field>
          </EditorSection>

          <EditorSection
            heading={rtl ? "المحتوى" : "Contenu"}
            hint={
              rtl
                ? "‎## للعناوين الفرعية، ‎**نص** للتشديد، وسطر فارغ بين الفقرات."
                : "## pour un intertitre, **texte** pour l’emphase, une ligne vide entre les paragraphes."
            }
            testId="admin-news-section-body"
          >
            <div className="grid gap-2 text-sm">
              <label className="grid gap-1.5">
                <span className="font-medium text-slate-200">
                  {rtl ? "نص المقال (Markdown مبسّط)" : "Corps de l’article (Markdown simplifié)"}
                </span>
                {/* A comfortable writing surface: generous line height, room to
                    grow, and typed in the article's own direction. */}
                <textarea
                  ref={bodyRef}
                  value={bodyMarkdown}
                  onChange={(event) => markDirty(setBodyMarkdown)(event.target.value)}
                  disabled={!isEditable}
                  rows={14}
                  dir={articleDir}
                  className={`${adminFieldClass} min-h-80 resize-y py-3 font-mono leading-7 disabled:opacity-60`}
                  data-testid="admin-news-body"
                />
              </label>
              <div className={`${ADMIN_PANEL_CLASS} flex flex-wrap items-center gap-3 p-3`}>
                <input
                  ref={bodyImageInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES}
                  className="hidden"
                  data-testid="admin-news-body-image-input"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    // Reset so re-picking the same file fires `change` again.
                    event.target.value = "";
                    if (file) void insertBodyImage(file);
                  }}
                />
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 outline-none transition-colors hover:border-slate-600 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy || !isEditable}
                  onClick={() => bodyImageInputRef.current?.click()}
                  data-testid="admin-news-insert-body-image"
                >
                  <ImagePlus className="h-4 w-4" aria-hidden />
                  {rtl ? "إدراج صورة في المحتوى" : "Insérer une image dans le contenu"}
                </button>
                <span className="min-w-0 flex-1 text-xs leading-5 text-slate-400">
                  {rtl
                    ? "تُدرَج الصورة عند موضع المؤشر بصيغة ‎![نص بديل](رابط)‎، ولا تُقبل إلا الروابط الآمنة (https)."
                    : "L’image est insérée à la position du curseur au format ![texte alternatif](lien) ; seuls les liens https sont acceptés."}
                </span>
              </div>
            </div>
          </EditorSection>

          <EditorSection
            heading={rtl ? "الصورة الرئيسية" : "Image à la une"}
            testId="admin-news-section-hero"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              disabled={!isEditable}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadHero(file);
              }}
              className="block w-full text-sm text-slate-300 file:me-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border file:border-slate-700 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-100 hover:file:bg-slate-800 disabled:opacity-60"
            />
            {heroAssetId && (
              <p className="text-xs text-slate-400">
                {rtl ? "معرّف الوسائط الحالي" : "Identifiant média actuel"}
                {" : "}
                {/* A UUID is LTR data; only the value is wrapped so the label
                    keeps its logical position. */}
                <AdminDatum className="rounded-md bg-slate-800/70 px-1.5 py-0.5 text-slate-300">
                  {heroAssetId}
                </AdminDatum>
              </p>
            )}
          </EditorSection>

          <EditorSection
            heading="SEO"
            hint={
              rtl
                ? "يُستعمل في نتائج البحث ومشاركات الشبكات الاجتماعية."
                : "Utilisé dans les résultats de recherche et les partages sur les réseaux."
            }
            testId="admin-news-section-seo"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={rtl ? "عنوان SEO" : "Titre SEO"} hint={`${seoTitle.length} / 70`}>
                <input
                  value={seoTitle}
                  onChange={(event) => markDirty(setSeoTitle)(event.target.value)}
                  disabled={!isEditable}
                  maxLength={70}
                  dir={articleDir}
                  className={`${adminFieldClass} disabled:opacity-60`}
                />
              </Field>
              <Field
                label={rtl ? "وصف SEO" : "Description SEO"}
                hint={`${seoDescription.length} / 170`}
              >
                <input
                  value={seoDescription}
                  onChange={(event) => markDirty(setSeoDescription)(event.target.value)}
                  disabled={!isEditable}
                  maxLength={170}
                  dir={articleDir}
                  className={`${adminFieldClass} disabled:opacity-60`}
                />
              </Field>
            </div>
          </EditorSection>

          <EditorSection
            heading={rtl ? "الحالة" : "Statut"}
            label={rtl ? "الانتقال بين الحالات" : "Transitions de statut"}
            hint={
              rtl
                ? "الانتقال يُتحقق منه على الخادم حسب دورك الفعلي."
                : "Chaque transition est re-vérifiée côté serveur selon votre rôle réel."
            }
            testId="admin-news-section-status"
          >
            {NEXT_STATUSES[article.status].includes("scheduled") && (
              <label className="grid max-w-xs gap-1.5 text-sm">
                <span className="font-medium text-slate-200">
                  {rtl ? "تاريخ ووقت النشر المجدول" : "Date et heure de publication programmée"}
                </span>
                <input
                  type="datetime-local"
                  value={scheduledAtLocal}
                  onChange={(event) => setScheduledAtLocal(event.target.value)}
                  className={adminFieldClass}
                  data-testid="admin-news-scheduled-at"
                />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              {NEXT_STATUSES[article.status].map((next) => (
                <button
                  key={next}
                  type="button"
                  className={
                    next === "rejected" || next === "archived"
                      ? adminDangerButtonClass
                      : adminButtonClass
                  }
                  disabled={busy || (next === "scheduled" && !scheduledAtLocal)}
                  onClick={() => void transition(next)}
                  data-testid={`admin-news-transition-${next}`}
                >
                  {STATUS_LABELS[next][lang]}
                </button>
              ))}
            </div>
          </EditorSection>

          <EditorSection
            heading={rtl ? "الموضع" : "Placement"}
            label={rtl ? "الموضع التحريري" : "Placement éditorial"}
            hint={
              article.status === "published"
                ? rtl
                  ? "المقال منشور؛ يمكن تحديد الموضع."
                  : "L’article est publié ; le placement peut être défini."
                : rtl
                  ? "متاح فقط بعد النشر."
                  : "Disponible uniquement une fois l’article publié."
            }
            testId="admin-news-section-placement"
          >
            <div className="flex flex-wrap gap-2">
              {PLACEMENTS.map((placementType) => (
                <button
                  key={placementType}
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 outline-none transition-colors hover:border-slate-600 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy || article.status !== "published"}
                  onClick={() => void setPlacement(placementType)}
                  data-testid={`admin-news-placement-${placementType}`}
                >
                  {PLACEMENT_LABELS[placementType][lang]}
                </button>
              ))}
            </div>
          </EditorSection>

          <EditorSection
            heading={rtl ? "المراجعات" : "Révisions"}
            label={rtl ? "سجل المراجعات" : "Historique des révisions"}
            testId="admin-news-section-revisions"
          >
            <ul className="grid gap-2 text-xs text-slate-400">
              {revisions.map((revision) => (
                <li
                  key={revision.id}
                  className={`${ADMIN_PANEL_CLASS} flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2`}
                >
                  <AdminDatum className="text-slate-300">#{revision.revisionNumber}</AdminDatum>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_TONES[revision.status]}`}
                  >
                    {STATUS_LABELS[revision.status][lang]}
                  </span>
                  {/* A formatted timestamp is LTR data. */}
                  <AdminDatum mono={false}>
                    {new Date(revision.createdAt).toLocaleString(lang)}
                  </AdminDatum>
                </li>
              ))}
              {revisions.length === 0 && (
                <li className={`${ADMIN_PANEL_CLASS} px-3 py-2`}>
                  {rtl ? "لا توجد مراجعات بعد." : "Aucune révision pour l’instant."}
                </li>
              )}
            </ul>
          </EditorSection>

          {showPreview && (
            <section
              aria-label={rtl ? "معاينة" : "Aperçu"}
              className={`${ADMIN_CARD_CLASS} p-4 sm:p-6`}
              data-testid="admin-news-preview"
            >
              <h3 className={ADMIN_LABEL_CLASS}>{rtl ? "معاينة" : "Aperçu"}</h3>
              {/* The preview renders in the ARTICLE's direction, so an Arabic
                  article is proofread exactly as a reader will see it. */}
              <div dir={articleDir} className="mt-4 border-t border-slate-800 pt-4">
                <h1 className="text-xl font-bold text-slate-50 sm:text-2xl">{title}</h1>
                {subtitle && <p className="mt-1 text-slate-300">{subtitle}</p>}
                <div
                  className="prose prose-invert mt-4 max-w-none prose-img:rounded-xl"
                  // Preview-only render of already server-sanitized content, gated
                  // behind editorial access (this whole route requires
                  // editorial.write); never reachable from a public URL.
                  dangerouslySetInnerHTML={{
                    __html: sanitizeEditorialHtml(markdownToEditorialHtml(bodyMarkdown)),
                  }}
                />
              </div>
            </section>
          )}
        </div>
      )}
    </AdminFunctionalRoute>
  );
}
