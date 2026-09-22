import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Eye, EyeOff, ImagePlus, Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { loadAdminNewsReadRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { adminRepositoryContext } from "@/backend/admin/functional-route-helpers";
import { SupabaseNewsRepository } from "@/backend/news/supabase-repository";
import {
  sanitizeEditorialHtml,
  NEWS_SANITIZER_VERSION,
  calculateReadingTime,
} from "@/backend/news/sanitizer";
import { mapNewsError } from "@/backend/news/errors";
import { EDITOR_REVISION_LIMIT, transitionAndReload } from "@/backend/news/editorial-session";
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
import { ui, UiBadge, UiButton, UiInput, UiLinkButton, UiTextarea } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
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

/**
 * Status tone, on the kit's badge tones.
 *
 * Seven statuses, six badge tones, and one of those six (`action`, the
 * primary-action gradient) belongs to buttons rather than to a state. So the
 * seven map onto four tones plus one faint step. Nothing a reader needs is
 * lost with the colours: the status WORD is rendered in their language inside
 * the badge, here and on the list.
 *
 *   published / rejected -> positive / negative, unchanged in meaning.
 *   in_review -> caution, the amber as a FILL under `--ui-on-caution`. What
 *     it replaces is amber as a FOREGROUND (`text-amber-200` on
 *     `bg-amber-500/10`), measured 1.78:1 — exactly the pairing the kit's
 *     `--ui-on-caution` exists to stop.
 *   scheduled -> outline, the tone for a state that must not read as spent.
 *     A scheduled edition is work still queued to happen, and `neutral` sits
 *     on the sunken surface, which is how this product draws "used up".
 *   draft / unpublished / archived -> neutral, archived a step fainter: the
 *     slate-200 / slate-300 / slate-400 ladder the literals drew by hand,
 *     now on the theme's own foreground steps.
 *
 * Duplicated in `admin.news.tsx`, exactly as `STATUS_LABELS` above already
 * is: these two routes are the only holders of the editorial vocabulary, and
 * the shared Admin surface module is owned by another lane.
 */
type StatusBadgeTone = ComponentProps<typeof UiBadge>["tone"];

const STATUS_TONES: Record<EditorialStatus, { tone: StatusBadgeTone; className?: string }> = {
  draft: { tone: "neutral" },
  in_review: { tone: "caution" },
  scheduled: { tone: "outline" },
  published: { tone: "positive" },
  unpublished: { tone: "neutral" },
  archived: { tone: "neutral", className: ui.tone.faint },
  rejected: { tone: "negative" },
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
    <section className={cn(ADMIN_CARD_CLASS, "p-4 sm:p-5")} aria-label={label} data-testid={testId}>
      <h3 className={ADMIN_LABEL_CLASS}>{heading}</h3>
      {/* `leading-5` is dropped rather than converted: every ramp step carries
          its own leading token now (BG-0124), and that token is redeclared for
          Arabic — 1.95 against the Latin 1.4 at the same pixel size — which a
          literal never was. */}
      {hint && <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>{hint}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

/*
 * The `Field` wrapper that stood here is gone, not converted. It was this
 * file's hand-built copy of the kit's field frame — a `<label>` around a
 * caption span, the control and a hint span — and `UiInput`/`UiTextarea`
 * render that shape with the border, radius, 44px floor, disabled step and
 * focus ring stated once in the kit rather than pasted onto six fields.
 *
 * One thing genuinely changes, and it is a fix. Wrapping the hint inside the
 * `<label>` made it part of the control's accessible NAME: the SEO title
 * announced as "Titre SEO 0 / 70", with the counter re-read on every
 * keystroke. The frame wires a hint through `aria-describedby` instead, so
 * the name is the label and the counter is the description. No word on screen
 * changed.
 */

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
        repository.listRevisions(
          articleEditionId,
          EDITOR_REVISION_LIMIT,
          adminRepositoryContext(access),
        ),
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
      // Re-reads the edition afterwards: the transition bumped `updatedAt`,
      // which is the token the next save is checked against.
      const outcome = await transitionAndReload(
        repository,
        { articleEditionId: article.id, targetStatus, scheduledAt: scheduledAtIso },
        adminRepositoryContext(access),
      );
      const { result } = outcome;
      setArticle(
        outcome.article ?? { ...article, status: result.status, visibility: result.visibility },
      );
      if (outcome.revisions) setRevisions(outcome.revisions);
      setScheduledAtLocal("");
      const statusLabel = STATUS_LABELS[result.status]?.[lang] ?? result.status;
      setMessage(
        outcome.article
          ? rtl
            ? `الحالة الجديدة: ${statusLabel}`
            : `Nouveau statut : ${statusLabel}`
          : rtl
            ? `الحالة الجديدة: ${statusLabel}. أعد تحميل الصفحة قبل الحفظ.`
            : `Nouveau statut : ${statusLabel}. Rechargez la page avant d’enregistrer.`,
      );
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
          {/* `-ms-3` pulls the ghost button's own inline padding back so the
              link still starts on the panel's edge, logically, in both
              directions. */}
          <UiLinkButton
            to="/admin/news"
            variant="ghost"
            size="sm"
            className="-ms-3 self-start"
            data-testid="admin-news-back-to-list"
          >
            {/* The arrow is flipped by the ambient direction, never by hand. */}
            <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
            {rtl ? "كل المقالات" : "Tous les articles"}
          </UiLinkButton>

          {/* Identity + the primary action, kept in view while the long form
              scrolls, so "Enregistrer" is never hunted for.

              `backdrop-blur` is gone. The card surface is `--ui-surface`, an
              opaque colour in both themes, so there was never anything behind
              it to blur — the filter was paying for a compositor layer to
              produce no pixels. The kit's card is opaque by design: "one
              shadow, no glass". */}
          <div
            className={cn("sticky top-0 z-20 p-4", ADMIN_CARD_CLASS)}
            data-testid="admin-news-toolbar"
          >
            <div className="flex flex-wrap items-center gap-2">
              {/* The wrapper span carries `data-status`: `UiBadge` forwards
                  neither `data-*` nor a `testId`, unlike the state
                  primitives, and a browser hook is not something a restyle
                  may drop. Raised as a kit gap rather than patched here.
                  The `ltr:`-only tracking the literal spelled out is now part
                  of the badge's own `ui.text.label` step — Arabic letterforms
                  join and must never be spaced apart (BG-0069). */}
              <span data-status={article.status}>
                <UiBadge {...STATUS_TONES[article.status]}>
                  {STATUS_LABELS[article.status][lang]}
                </UiBadge>
              </span>
              <UiBadge tone="neutral">{article.language === "ar" ? "العربية" : "Français"}</UiBadge>
              {dirty && (
                // `caution`, which paints the amber as a fill under
                // `--ui-on-caution`. It replaces amber text on an amber tint
                // — the 1.78:1 pairing — and it is the right meaning too:
                // unsaved work is pending, not failed (`negative`) and not
                // already dealt with (`neutral`).
                <span data-testid="admin-news-unsaved">
                  <UiBadge tone="caution">
                    {rtl ? "تغييرات غير محفوظة" : "Modifications non enregistrées"}
                  </UiBadge>
                </span>
              )}
            </div>
            {/* A slug is LTR data whatever the console's direction. */}
            <span className="mt-2 block">
              <AdminDatum className={cn(ui.text.meta, ui.tone.faint)}>{article.slug}</AdminDatum>
            </span>
            <div className={cn("mt-3 flex flex-wrap gap-2 pt-3", ui.rule.blockStart)}>
              <UiButton
                className="flex-1 sm:flex-none"
                disabled={busy || !dirty || !isEditable}
                onClick={() => void save()}
                data-testid="admin-news-save"
              >
                {busy ? (
                  // `motion-reduce:animate-none` is how the kit spells a
                  // spinner; these two were spinning through a reduced-motion
                  // preference.
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                ) : (
                  <Save className="h-4 w-4" aria-hidden />
                )}
                {rtl ? "حفظ" : "Enregistrer"}
              </UiButton>
              <UiButton
                variant="outline"
                className="flex-1 sm:flex-none"
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
              </UiButton>
            </div>
          </div>

          {message && <AdminNotice tone="alert">{message}</AdminNotice>}

          {!isEditable && (
            <p
              className={cn(ADMIN_PANEL_CLASS, "px-4 py-3", ui.text.meta, ui.tone.muted)}
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
            {/* The headline is set a step up from the rest of the form, on the
                ramp: `--ui-text-subtitle` (16px/800) is the step the literal
                `text-base font-semibold` was approximating.

                `disabled:opacity-60` is gone from all six fields: the field
                frame already dims a disabled control, at the kit's one value
                (50%), and two `disabled:opacity-*` utilities on the same box
                resolve by the order Tailwind emitted them, not by call
                site. */}
            <UiInput
              label={rtl ? "العنوان" : "Titre"}
              value={title}
              onChange={(event) => markDirty(setTitle)(event.target.value)}
              disabled={!isEditable}
              dir={articleDir}
              fieldClassName={ui.text.subtitle}
            />
            <UiInput
              label={rtl ? "العنوان الفرعي" : "Sous-titre"}
              value={subtitle}
              onChange={(event) => markDirty(setSubtitle)(event.target.value)}
              disabled={!isEditable}
              dir={articleDir}
            />
            {/* `leading-6` is dropped rather than converted, for the reason in
                `EditorSection` above: the ramp step carries the leading and
                redeclares it for Arabic. */}
            <UiTextarea
              label={rtl ? "الملخص" : "Résumé"}
              hint={rtl ? `${summary.length} حرفاً` : `${summary.length} caractères`}
              value={summary}
              disabled={!isEditable}
              onChange={(event) => markDirty(setSummary)(event.target.value)}
              rows={3}
              dir={articleDir}
            />
          </EditorSection>

          <EditorSection
            heading={rtl ? "المحتوى" : "Contenu"}
            hint={
              rtl
                ? "‎## للعناوين الفرعية، ‎**نص** للتشديد، ‎- لقائمة، ‎> لاقتباس، وسطر فارغ بين الفقرات."
                : "## pour un intertitre, **texte** pour l’emphase, - pour une liste, > pour une citation, une ligne vide entre les paragraphes."
            }
            testId="admin-news-section-body"
          >
            <div className="grid gap-2">
              {/* A comfortable writing surface: room to grow, resizable
                  vertically (the frame supplies `resize-y`), and typed in the
                  article's own direction. `min-h-80` stays a literal — it is
                  the floor of a fourteen-row writing box, not a control
                  height, and the spacing scale tops out at 2rem.

                  `ref` goes straight through the frame onto the `<textarea>`,
                  which the caret restoration in `insertBodyImage` depends on.
                  Verified rather than assumed: rendered with a ref attached,
                  `ref.current.tagName` is TEXTAREA and `setSelectionRange`,
                  `selectionStart/End` and `focus()` all act on the real
                  node. */}
              <UiTextarea
                label={
                  rtl ? "نص المقال (Markdown مبسّط)" : "Corps de l’article (Markdown simplifié)"
                }
                ref={bodyRef}
                value={bodyMarkdown}
                onChange={(event) => markDirty(setBodyMarkdown)(event.target.value)}
                disabled={!isEditable}
                rows={14}
                dir={articleDir}
                fieldClassName="min-h-80 font-mono"
                data-testid="admin-news-body"
              />
              <div className={cn(ADMIN_PANEL_CLASS, "flex flex-wrap items-center gap-3 p-3")}>
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
                <UiButton
                  variant="outline"
                  size="sm"
                  disabled={busy || !isEditable}
                  onClick={() => bodyImageInputRef.current?.click()}
                  data-testid="admin-news-insert-body-image"
                >
                  <ImagePlus className="h-4 w-4" aria-hidden />
                  {rtl ? "إدراج صورة في المحتوى" : "Insérer une image dans le contenu"}
                </UiButton>
                <span className={cn("min-w-0 flex-1", ui.text.meta, ui.tone.muted)}>
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
            {/* The `file:` pseudo-element is the button the browser draws
                inside the control, so it is styled here rather than through a
                primitive — the kit has no file field. Its colours are tokens
                now, its 44px comes from `--ui-tap-min` rather than a literal
                `min-h-11`, and its radius is the control step (`rounded-lg`
                is 8px, which is `--ui-radius-segment`, the selected-tab
                step — not a button radius).

                It also gains `ui.focus`. It had no focus ring at all: the one
                control on this screen that opens a file picker was invisible
                to a keyboard, while every button beside it drew one. */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              disabled={!isEditable}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadHero(file);
              }}
              className={cn(
                "block w-full",
                ui.text.body,
                ui.tone.muted,
                ui.focus,
                "file:me-3 file:min-h-[var(--ui-tap-min)] file:cursor-pointer file:px-4 file:py-2",
                "file:rounded-[var(--ui-radius-control)] file:border file:border-[color:var(--ui-rule)]",
                "file:bg-[color:var(--ui-surface-sunken)] file:text-[color:var(--ui-on-surface)]",
                "file:text-[length:var(--ui-text-meta)] file:[font-weight:var(--ui-weight-heavy)]",
                "hover:file:bg-[color:var(--ui-surface)]",
                "disabled:opacity-50",
              )}
            />
            {heroAssetId && (
              <p className={cn(ui.text.meta, ui.tone.muted)}>
                {rtl ? "معرّف الوسائط الحالي" : "Identifiant média actuel"}
                {" : "}
                {/* A UUID is LTR data; only the value is wrapped so the label
                    keeps its logical position. `rounded-md` was off the radius
                    set; the chip sits on the control step. */}
                <AdminDatum
                  className={cn(
                    "bg-[color:var(--ui-surface-sunken)] px-1.5 py-0.5",
                    ui.radius.control,
                    ui.tone.default,
                  )}
                >
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
              <UiInput
                label={rtl ? "عنوان SEO" : "Titre SEO"}
                hint={`${seoTitle.length} / 70`}
                value={seoTitle}
                onChange={(event) => markDirty(setSeoTitle)(event.target.value)}
                disabled={!isEditable}
                maxLength={70}
                dir={articleDir}
              />
              <UiInput
                label={rtl ? "وصف SEO" : "Description SEO"}
                hint={`${seoDescription.length} / 170`}
                value={seoDescription}
                onChange={(event) => markDirty(setSeoDescription)(event.target.value)}
                disabled={!isEditable}
                maxLength={170}
                dir={articleDir}
              />
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
              <UiInput
                label={rtl ? "تاريخ ووقت النشر المجدول" : "Date et heure de publication programmée"}
                className="max-w-xs"
                type="datetime-local"
                value={scheduledAtLocal}
                onChange={(event) => setScheduledAtLocal(event.target.value)}
                data-testid="admin-news-scheduled-at"
              />
            )}
            <div className="flex flex-wrap gap-2">
              {NEXT_STATUSES[article.status].map((next) => (
                // `destructive` is the kit's filled negative, and it replaces
                // `adminDangerButtonClass` — a rose fill under a literal
                // `text-white`. That pairing measured 2.31:1 in the dark
                // theme, which is the whole reason `--ui-on-negative` exists;
                // the variant picks the foreground the fill can carry in each
                // theme rather than assuming white.
                <UiButton
                  key={next}
                  variant={next === "rejected" || next === "archived" ? "destructive" : "gradient"}
                  size="sm"
                  disabled={busy || (next === "scheduled" && !scheduledAtLocal)}
                  onClick={() => void transition(next)}
                  data-testid={`admin-news-transition-${next}`}
                >
                  {STATUS_LABELS[next][lang]}
                </UiButton>
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
                <UiButton
                  key={placementType}
                  variant="outline"
                  size="sm"
                  disabled={busy || article.status !== "published"}
                  onClick={() => void setPlacement(placementType)}
                  data-testid={`admin-news-placement-${placementType}`}
                >
                  {PLACEMENT_LABELS[placementType][lang]}
                </UiButton>
              ))}
            </div>
          </EditorSection>

          <EditorSection
            heading={rtl ? "المراجعات" : "Révisions"}
            label={rtl ? "سجل المراجعات" : "Historique des révisions"}
            testId="admin-news-section-revisions"
          >
            <ul className={cn("grid gap-2", ui.text.meta, ui.tone.muted)}>
              {revisions.map((revision) => (
                <li
                  key={revision.id}
                  className={cn(
                    ADMIN_PANEL_CLASS,
                    "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2",
                  )}
                >
                  {/* The revision number is a figure a reader scans down a
                      column, so it goes on the tabular rail (rule 4) rather
                      than staying proportional beside its neighbours. */}
                  <AdminDatum className={cn(ui.text.tabular, ui.tone.default)}>
                    #{revision.revisionNumber}
                  </AdminDatum>
                  <UiBadge {...STATUS_TONES[revision.status]}>
                    {STATUS_LABELS[revision.status][lang]}
                  </UiBadge>
                  {/* A formatted timestamp is LTR data. */}
                  <AdminDatum mono={false}>
                    {new Date(revision.createdAt).toLocaleString(lang)}
                  </AdminDatum>
                </li>
              ))}
              {revisions.length === 0 && (
                <li className={cn(ADMIN_PANEL_CLASS, "px-3 py-2")}>
                  {rtl ? "لا توجد مراجعات بعد." : "Aucune révision pour l’instant."}
                </li>
              )}
            </ul>
          </EditorSection>

          {showPreview && (
            <section
              aria-label={rtl ? "معاينة" : "Aperçu"}
              className={cn(ADMIN_CARD_CLASS, "p-4 sm:p-6")}
              data-testid="admin-news-preview"
            >
              <h3 className={ADMIN_LABEL_CLASS}>{rtl ? "معاينة" : "Aperçu"}</h3>
              {/* The preview renders in the ARTICLE's direction, so an Arabic
                  article is proofread exactly as a reader will see it. */}
              <div dir={articleDir} className={cn("mt-4 pt-4", ui.rule.blockStart)}>
                {/* `text-xl sm:text-2xl` collapses to one ramp step. The ramp
                    has no 24px, and the responsive bump was never a decision
                    anyone made — the two literals are one step apart in
                    Tailwind's scale, not in this product's. `ui.text.title`
                    (19px/800) is the step the resting size was; the reader's
                    own headline is `ui.text.hero`, which is deliberately NOT
                    borrowed here: this headline sits inside a console card
                    whose section labels are 12px, and a 34px headline in it
                    would read as chrome rather than as content. */}
                <h1 className={cn(ui.text.title, ui.tone.default)}>{title}</h1>
                {subtitle && <p className={cn("mt-1", ui.text.body, ui.tone.muted)}>{subtitle}</p>}
                <div
                  className={cn("editorial-body mt-4 max-w-none", ui.tone.default)}
                  // Preview-only render of already server-sanitized content,
                  // gated behind editorial access (this route loads on
                  // editorial.read so a publisher can review without holding
                  // editorial.write); never reachable from a public URL.
                  //
                  // `editorial-body` is the same class the public article page
                  // uses, so this preview shows what a reader will actually
                  // get. The previous `prose` classes generated nothing --
                  // @tailwindcss/typography is not a dependency.
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
