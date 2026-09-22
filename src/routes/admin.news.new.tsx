import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { loadAdminNewsWriteRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { adminRepositoryContext } from "@/backend/admin/functional-route-helpers";
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
import { ui, UiButton, UiInput, UiLinkButton, UiSelect, UiTextarea } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

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
    <section className={cn(ADMIN_CARD_CLASS, "p-4 sm:p-5")} data-testid={testId}>
      <h3 className={ADMIN_LABEL_CLASS}>{heading}</h3>
      {/* `leading-5` is gone rather than converted: every step of the type
          ramp carries its own leading token now (BG-0124), and a literal one
          under-sets the Arabic face, which runs at 1.95 against the Latin
          1.4 at the same pixel size. */}
      {hint && <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>{hint}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

/*
 * The `Field` wrapper that stood here is gone, not converted. It was the
 * hand-built version of the kit's field frame -- a `<label>` around a caption
 * span, the control and a hint span -- and `UiInput`/`UiSelect`/`UiTextarea`
 * render exactly that shape with the border, radius, 44px floor and focus
 * ring stated once in the kit rather than pasted per field.
 *
 * One thing genuinely changes, and it is a fix. Wrapping the hint inside the
 * `<label>` made it part of the control's accessible NAME: the slug field
 * announced as "Identifiant (slug) Minuscules, chiffres et tirets uniquement,
 * par exemple : botola-journee-12". The frame wires the hint through
 * `aria-describedby` instead, so the name is the label and the guidance is
 * the description. No word on screen changed.
 */

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
          {/* `-ms-3` pulls the ghost button's own inline padding back so the
              link still starts on the section's edge, logically, in both
              directions. */}
          <UiLinkButton
            to="/admin/news"
            variant="ghost"
            size="sm"
            className="-ms-3"
            data-testid="admin-news-back-to-list"
          >
            {/* The arrow is flipped by the ambient direction, never by hand. */}
            <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
            {rtl ? "كل المقالات" : "Tous les articles"}
          </UiLinkButton>

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
              <UiSelect
                label={rtl ? "اللغة" : "Langue"}
                value={language}
                onChange={(event) => setLanguage(event.target.value as NewsLanguage)}
                data-testid="admin-news-new-language"
              >
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
              </UiSelect>
              {/* A slug is LTR data whatever the console's language. */}
              <UiInput
                label={rtl ? "المعرّف (slug)" : "Identifiant (slug)"}
                hint={
                  rtl
                    ? "حروف لاتينية صغيرة وأرقام وشرطات فقط، مثل: botola-journee-12"
                    : "Minuscules, chiffres et tirets uniquement, par exemple : botola-journee-12"
                }
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                required
                dir="ltr"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="botola-journee-12"
                fieldClassName="text-start font-mono"
                data-testid="admin-news-new-slug"
              />
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
              {/* The headline is set a step up from the rest of the form, on
                  the ramp: `--ui-text-subtitle` (16px/800) is the step the
                  literal `text-base font-semibold` was approximating. */}
              <UiInput
                label={rtl ? "العنوان" : "Titre"}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                minLength={5}
                maxLength={220}
                required
                dir={articleDir}
                fieldClassName={ui.text.subtitle}
                data-testid="admin-news-new-title"
              />
              {/* `leading-6` and `leading-7` are gone from both writing
                  surfaces: the ramp step carries the leading, and it is
                  redeclared for Arabic, which these literals were not. */}
              <UiTextarea
                label={rtl ? "الملخص" : "Résumé"}
                hint={
                  rtl ? `${summary.length} / 1000 حرفاً` : `${summary.length} / 1000 caractères`
                }
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                minLength={10}
                maxLength={1000}
                required
                rows={3}
                dir={articleDir}
                data-testid="admin-news-new-summary"
              />
              {/* A comfortable writing surface: monospace, room to grow,
                  resizable vertically (the frame supplies `resize-y`), and
                  typed in the article's own direction. `min-h-64` stays a
                  literal -- it is the floor of a fourteen-row writing box, not
                  a control height, and the spacing scale tops out at 2rem. */}
              <UiTextarea
                label={rtl ? "المحتوى (Markdown مبسّط)" : "Contenu (Markdown simplifié)"}
                hint={
                  rtl
                    ? "‎## للعناوين الفرعية، ‎**نص** للتشديد، ‎- لقائمة، ‎> لاقتباس، وسطر فارغ بين الفقرات."
                    : "## pour un intertitre, **texte** pour l’emphase, - pour une liste, > pour une citation, une ligne vide entre les paragraphes."
                }
                value={body}
                onChange={(event) => setBody(event.target.value)}
                minLength={20}
                required
                rows={14}
                dir={articleDir}
                fieldClassName="min-h-64 font-mono"
                data-testid="admin-news-new-body"
              />
            </EditorSection>

            {message && <AdminNotice tone="alert">{message}</AdminNotice>}

            <div
              className={cn(
                ADMIN_CARD_CLASS,
                "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between",
              )}
            >
              <p className={cn(ui.text.meta, ui.tone.muted)}>
                {rtl
                  ? "بعد الإنشاء ستُفتح صفحة التحرير الكاملة (صورة رئيسية، معاينة، نشر)."
                  : "Après création, l’éditeur complet s’ouvre (image à la une, aperçu, publication)."}
              </p>
              <UiButton
                type="submit"
                className="sm:w-auto"
                disabled={busy}
                data-testid="admin-news-new-submit"
              >
                {/* `motion-reduce:animate-none` is how the kit spells a
                    spinner; this one was spinning through a reduced-motion
                    preference. */}
                {busy && (
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                )}
                {rtl ? "إنشاء المسودة" : "Créer le brouillon"}
              </UiButton>
            </div>
          </form>
        </>
      )}
    </AdminFunctionalRoute>
  );
}
