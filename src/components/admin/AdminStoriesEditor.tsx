import { useState } from "react";
import { storyErrorNotice, type StoryNotice } from "@/backend/home-stories/errors";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  homeStoriesRepository,
  uploadStoryImage,
  type HomeStoriesRepository,
} from "@/backend/home-stories/repository";
import {
  STORY_DESTINATIONS,
  STORY_IMAGE_TYPES,
  storyInputSchema,
  type HomeStory,
  type StoryInput,
} from "@/backend/home-stories/contracts";
import {
  ui,
  UiAlert,
  UiBadge,
  UiButton,
  UiCard,
  UiInput,
  UiLinkButton,
  UiSelect,
  UiSkeleton,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

const blank: StoryInput = {
  titleFr: "",
  titleAr: "",
  altFr: "",
  altAr: "",
  mediaAssetId: "",
  destination: null,
  credit: null,
  position: 0,
};
export function AdminStoriesEditor({
  permissions,
  repository = homeStoriesRepository,
  upload = uploadStoryImage,
}: {
  permissions: readonly string[];
  repository?: Pick<HomeStoriesRepository, "list" | "save" | "publish">;
  upload?: typeof uploadStoryImage;
}) {
  const { lang, t } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "home-stories"],
    queryFn: () => repository.list(false),
  });
  const [editing, setEditing] = useState<HomeStory | null>(null);
  const [form, setForm] = useState<StoryInput>(blank);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<StoryNotice | null>(null);
  useUnsavedChangesGuard(
    dirty,
    ar
      ? "هناك تغييرات غير محفوظة. مغادرة الصفحة؟"
      : "Des modifications ne sont pas enregistrées. Quitter la page ?",
  );
  const canWrite = permissions.includes("editorial.write");
  const canPublish = permissions.includes("editorial.publish");
  const editable =
    canWrite && !query.isPending && !query.isError && (!editing?.published || canPublish);
  const update = <K extends keyof StoryInput>(key: K, value: StoryInput[K]) => {
    setForm((old) => ({ ...old, [key]: value }));
    setDirty(true);
  };
  const choose = (story: HomeStory | null) => {
    if (
      dirty &&
      !window.confirm(
        ar ? "تجاهل التغييرات غير المحفوظة؟" : "Abandonner les modifications non enregistrées ?",
      )
    )
      return;
    setEditing(story);
    setForm(story ?? blank);
    setStoragePath(story?.storagePath ?? null);
    setDirty(false);
    setNotice(null);
  };
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin", "home-stories"] }),
      qc.invalidateQueries({ queryKey: ["home-stories"] }),
    ]);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editable || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await repository.save(storyInputSchema.parse(form), editing ?? undefined);
      setEditing(result);
      setForm(result);
      setDirty(false);
      await refresh();
      setNotice({ error: false, text: ar ? "تم حفظ القصة." : "Story enregistrée." });
    } catch (error) {
      setNotice(storyErrorNotice(error, lang));
    } finally {
      setBusy(false);
    }
  };
  const pick = async (file: File) => {
    if (!editable || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await upload(file, ar ? form.altAr : form.altFr, form.credit ?? "");
      update("mediaAssetId", result.mediaAssetId);
      setStoragePath(result.storagePath);
    } catch (error) {
      setNotice(storyErrorNotice(error, lang));
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (story: HomeStory) => {
    if (!canPublish || busy) return;
    if (dirty) {
      setNotice({
        error: true,
        text: ar ? "احفظ التغييرات أولاً." : "Enregistrez vos modifications d’abord.",
      });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await repository.publish(story, !story.published);
      if (editing?.id === result.id) {
        setEditing(result);
        setForm(result);
      }
      await refresh();
      setNotice({
        error: false,
        text: result.published
          ? ar
            ? "القصة منشورة على الرئيسية."
            : "Story publiée sur l’accueil."
          : ar
            ? "تم إخفاء القصة."
            : "Story retirée de l’accueil.",
      });
    } catch (error) {
      setNotice(storyErrorNotice(error, lang));
    } finally {
      setBusy(false);
    }
  };
  const destinationLabels = [
    t("nav.news"),
    t("nav.fantasy"),
    t("nav.matches"),
    t("matches.table_preview"),
    t("home.discover.predictions"),
    t("nav.pepites"),
    t("clubs.title"),
    ar ? "الجوائز" : "Lots à gagner",
  ];
  return (
    <div className="grid min-w-0 gap-5" data-testid="admin-stories-editor">
      {notice && (
        <UiAlert tone={notice.error ? "caution" : "positive"} title={notice.text}>
          {notice.reauthenticate && (
            <UiLinkButton
              to="/auth/login"
              search={{ next: "/admin/stories" }}
              size="sm"
              className="mt-3"
              data-testid="admin-reauthenticate"
            >
              {ar ? "إعادة المصادقة" : "Se réauthentifier"}
            </UiLinkButton>
          )}
        </UiAlert>
      )}
      <section aria-label={ar ? "قائمة القصص" : "Stories existantes"} className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className={ui.display.header}>{ar ? "قصصك" : "Vos stories"}</h3>
          <UiButton
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void query.refetch()}
          >
            {ar ? "تحديث" : "Actualiser"}
          </UiButton>
        </div>
        {query.isPending ? (
          <UiSkeleton className="h-24" />
        ) : query.isError ? (
          <UiAlert tone="caution" title={ar ? "القصص غير متاحة" : "Stories indisponibles"}>
            {ar
              ? "أعد المحاولة. قد لا تكون الميزة مفعلة بعد."
              : "Réessayez. La fonctionnalité n’est peut-être pas encore activée."}
          </UiAlert>
        ) : query.data.length === 0 ? (
          <p className={cn(ui.text.secondary, ui.tone.muted)}>
            {ar
              ? "لا توجد قصص بعد. أضف صورتك الأولى أدناه."
              : "Aucune story. Ajoutez votre première image ci-dessous."}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {query.data.map((story) => (
              <li key={story.id}>
                <UiCard padding="md" className="flex h-full min-w-0 flex-col gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      src={resolveMediaUrl({ storagePath: story.storagePath })}
                      alt=""
                      className="size-16 shrink-0 rounded-full object-cover"
                    />
                    <div className="min-w-0">
                      <p className={cn("break-words", ui.text.bodyStrong)}>
                        {ar ? story.titleAr : story.titleFr}
                      </p>
                      <UiBadge tone={story.published ? "positive" : "outline"}>
                        {story.published ? (ar ? "منشورة" : "Publiée") : ar ? "مسودة" : "Brouillon"}
                      </UiBadge>
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <UiButton
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => choose(story)}
                    >
                      {ar ? "فتح" : "Ouvrir"}
                    </UiButton>
                    {canPublish && (
                      <UiButton
                        size="sm"
                        variant="ink"
                        disabled={busy || dirty}
                        onClick={() => void toggle(story)}
                      >
                        {story.published ? (ar ? "إخفاء" : "Dépublier") : ar ? "نشر" : "Publier"}
                      </UiButton>
                    )}
                  </div>
                </UiCard>
              </li>
            ))}
          </ul>
        )}
      </section>
      {canWrite && (
        <UiButton size="sm" variant="outline" disabled={busy} onClick={() => choose(null)}>
          {ar ? "قصة جديدة" : "Nouvelle story"}
        </UiButton>
      )}
      <UiCard padding="md">
        <form className="grid min-w-0 gap-4" onSubmit={save} data-testid="story-form">
          <h3 className={ui.display.header}>
            {editing
              ? ar
                ? "تعديل القصة"
                : "Modifier la story"
              : ar
                ? "إنشاء قصة"
                : "Créer une story"}
          </h3>
          {editing?.published && (
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {ar
                ? "هذه القصة منشورة. حفظ التغييرات يحدّثها على الرئيسية."
                : "Cette story est publiée. Enregistrer mettra aussi à jour l’accueil."}
            </p>
          )}
          <fieldset disabled={!editable || busy} className="grid min-w-0 gap-4">
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <UiInput
                label={ar ? "العنوان بالفرنسية" : "Titre en français"}
                dir="ltr"
                required
                maxLength={60}
                value={form.titleFr}
                onChange={(e) => update("titleFr", e.target.value)}
              />
              <UiInput
                label={ar ? "العنوان بالعربية" : "Titre en arabe"}
                dir="rtl"
                required
                maxLength={60}
                value={form.titleAr}
                onChange={(e) => update("titleAr", e.target.value)}
              />
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <UiInput
                label={ar ? "وصف الصورة بالفرنسية" : "Description de l’image en français"}
                dir="ltr"
                required
                maxLength={300}
                value={form.altFr}
                onChange={(e) => update("altFr", e.target.value)}
              />
              <UiInput
                label={ar ? "وصف الصورة بالعربية" : "Description de l’image en arabe"}
                dir="rtl"
                required
                maxLength={300}
                value={form.altAr}
                onChange={(e) => update("altAr", e.target.value)}
              />
            </div>
            <UiInput
              label={ar ? "حقوق الصورة" : "Crédit photo"}
              maxLength={300}
              value={form.credit ?? ""}
              onChange={(e) => {
                update("credit", e.target.value);
                setDirty(true);
              }}
            />
            <UiInput
              type="file"
              label={ar ? "رفع صورة" : "Téléverser une image"}
              accept={STORY_IMAGE_TYPES.join(",")}
              disabled={!form.altFr.trim() || !form.altAr.trim()}
              hint={
                ar
                  ? "JPG، PNG، WebP أو AVIF، بحد أقصى 10 ميغابايت. صورة عمودية أفضل. أدخل الوصفين أولاً واستخدم صورة تملك حق نشرها."
                  : "JPG, PNG, WebP ou AVIF, 10 Mo maximum. Portrait conseillé. Renseignez les deux descriptions et utilisez une image dont vous détenez les droits."
              }
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void pick(file);
              }}
            />
            {storagePath && (
              <figure className="grid justify-items-center gap-2">
                <img
                  src={resolveMediaUrl({ storagePath })}
                  alt={ar ? form.altAr : form.altFr}
                  className="max-h-80 w-full object-contain"
                />
                <figcaption className={cn(ui.text.meta, ui.tone.muted)}>
                  {ar ? "معاينة الصورة" : "Aperçu de l’image"}
                </figcaption>
              </figure>
            )}
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <UiSelect
                label={ar ? "رابط اختياري" : "Destination facultative"}
                value={form.destination ?? ""}
                onChange={(e) =>
                  update(
                    "destination",
                    e.target.value ? (e.target.value as StoryInput["destination"]) : null,
                  )
                }
              >
                <option value="">{ar ? "بدون رابط" : "Sans lien"}</option>
                {STORY_DESTINATIONS.map((to, i) => (
                  <option key={to} value={to}>
                    {destinationLabels[i]}
                  </option>
                ))}
              </UiSelect>
              <UiInput
                label={ar ? "الترتيب (الأصغر أولاً)" : "Ordre (le plus petit d’abord)"}
                type="number"
                min={0}
                max={999}
                required
                value={Number.isFinite(form.position) ? form.position : ""}
                onChange={(e) => update("position", e.target.valueAsNumber)}
              />
            </div>
          </fieldset>
          <UiButton type="submit" disabled={!editable || busy || !form.mediaAssetId}>
            {busy
              ? ar
                ? "جارٍ الحفظ أو الرفع…"
                : "Enregistrement ou téléversement…"
              : ar
                ? "حفظ القصة"
                : "Enregistrer la story"}
          </UiButton>
          {!editing && (
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {ar
                ? "تُحفظ القصة كمسودة. انشرها من القائمة لإظهارها على الرئيسية."
                : "La story est enregistrée en brouillon. Publiez-la depuis la liste pour l’afficher sur l’accueil."}
            </p>
          )}
        </form>
      </UiCard>
    </div>
  );
}
