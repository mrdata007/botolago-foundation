import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
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
import { ADMIN_CARD_CLASS, ADMIN_LABEL_CLASS, AdminNotice } from "@/components/admin/AdminSurfaces";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/news/new")({
  ssr: false,
  loader: () => loadAdminNewsWriteRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminNewsNewRoute,
});

/** One grouped block of fields, so the form reads as steps rather than a wall
 *  of inputs. */
function EditorSection({
  heading,
  hint,
  children,
  testId,
}: {
  heading: string;
  hint?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className={`${ADMIN_CARD_CLASS} p-4 sm:p-5`} data-testid={testId}>
      <h3 className={ADMIN_LABEL_CLASS}>{heading}</h3>
      {hint && <p className="mt-1 text-xs leading-5 text-slate-400">{hint}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

/** Label text keeps the ambient direction; only the control below may carry
 *  its own `dir` when it holds LTR data or another language's prose. */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-slate-200">{label}</span>
      {children}
      {hint && <span className="text-xs leading-5 text-slate-400">{hint}</span>}
    </label>
  );
}

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

  // The prose fields follow the ARTICLE's language, not the console's: an
  // Arabic article must be typed RTL even while the UI is in French.
  const articleDir = language === "ar" ? "rtl" : "ltr";

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
        <>
          <Link
            to="/admin/news"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-300 outline-none hover:text-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-400"
            data-testid="admin-news-back-to-list"
          >
            {/* The arrow is flipped by the ambient direction, never by hand. */}
            <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
            {rtl ? "كل المقالات" : "Tous les articles"}
          </Link>

          <form className="mt-4 grid gap-4" onSubmit={submit} data-testid="admin-news-new-form">
            <EditorSection
              heading={rtl ? "الهوية" : "Identité"}
              hint={
                rtl
                  ? "اللغة والمعرّف لا يُعدّلان بسهولة لاحقاً، فاخترهما بعناية."
                  : "La langue et l’identifiant sont structurants : choisissez-les avec soin."
              }
              testId="admin-news-new-identity"
            >
              <Field label={rtl ? "اللغة" : "Langue"}>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as NewsLanguage)}
                  className={adminFieldClass}
                  data-testid="admin-news-new-language"
                >
                  <option value="fr">Français</option>
                  <option value="ar">العربية</option>
                </select>
              </Field>
              <Field
                label={rtl ? "المعرّف (slug)" : "Identifiant (slug)"}
                hint={
                  rtl
                    ? "حروف لاتينية صغيرة وأرقام وشرطات فقط، مثل: botola-journee-12"
                    : "Minuscules, chiffres et tirets uniquement, par exemple : botola-journee-12"
                }
              >
                {/* A slug is LTR data whatever the console's language. */}
                <input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                  required
                  dir="ltr"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="botola-journee-12"
                  className={`${adminFieldClass} text-start font-mono`}
                  data-testid="admin-news-new-slug"
                />
              </Field>
            </EditorSection>

            <EditorSection
              heading={rtl ? "المقال" : "Article"}
              testId="admin-news-new-content"
              hint={
                rtl
                  ? "العنوان والملخص والمحتوى تُكتب بلغة المقال المختارة أعلاه."
                  : "Titre, résumé et contenu s’écrivent dans la langue de l’article choisie ci-dessus."
              }
            >
              <Field label={rtl ? "العنوان" : "Titre"}>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  minLength={5}
                  maxLength={220}
                  required
                  dir={articleDir}
                  className={`${adminFieldClass} text-base font-semibold`}
                  data-testid="admin-news-new-title"
                />
              </Field>
              <Field
                label={rtl ? "الملخص" : "Résumé"}
                hint={
                  rtl ? `${summary.length} / 1000 حرفاً` : `${summary.length} / 1000 caractères`
                }
              >
                <textarea
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  minLength={10}
                  maxLength={1000}
                  required
                  rows={3}
                  dir={articleDir}
                  className={`${adminFieldClass} leading-6`}
                  data-testid="admin-news-new-summary"
                />
              </Field>
              <Field
                label={rtl ? "المحتوى (Markdown مبسّط)" : "Contenu (Markdown simplifié)"}
                hint={
                  rtl
                    ? "‎## للعناوين الفرعية، ‎**نص** للتشديد، وسطر فارغ بين الفقرات."
                    : "## pour un intertitre, **texte** pour l’emphase, une ligne vide entre les paragraphes."
                }
              >
                {/* A comfortable writing surface: monospace, generous line
                    height, resizable vertically, and typed in the article's
                    own direction. */}
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  minLength={20}
                  required
                  rows={14}
                  dir={articleDir}
                  className={`${adminFieldClass} min-h-64 resize-y py-3 font-mono text-sm leading-7`}
                  data-testid="admin-news-new-body"
                />
              </Field>
            </EditorSection>

            {message && <AdminNotice tone="alert">{message}</AdminNotice>}

            <div
              className={`${ADMIN_CARD_CLASS} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}
            >
              <p className="text-xs leading-5 text-slate-400">
                {rtl
                  ? "بعد الإنشاء ستُفتح صفحة التحرير الكاملة (صورة رئيسية، معاينة، نشر)."
                  : "Après création, l’éditeur complet s’ouvre (image à la une, aperçu, publication)."}
              </p>
              <button
                className={`${adminButtonClass} w-full gap-2 sm:w-auto`}
                type="submit"
                disabled={busy}
                data-testid="admin-news-new-submit"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {rtl ? "إنشاء المسودة" : "Créer le brouillon"}
              </button>
            </div>
          </form>
        </>
      )}
    </AdminFunctionalRoute>
  );
}
