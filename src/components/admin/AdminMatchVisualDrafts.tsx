import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  matchVisualDraftsRepository,
  defaultBrandUrl,
  type MatchVisualDraft,
  type MatchVisualDraftsRepository,
  type Rectangle,
} from "@/backend/match-visual-drafts/repository";
import { UiAlert, UiBadge, UiButton, UiCard, UiInput, UiSkeleton, ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";
export function AdminMatchVisualDrafts({
  permissions,
  repository = matchVisualDraftsRepository,
}: {
  permissions: readonly string[];
  repository?: Pick<
    MatchVisualDraftsRepository,
    "list" | "import" | "preview" | "edit" | "discard"
  >;
}) {
  const { lang } = useI18n(),
    ar = lang === "ar",
    canWrite = permissions.includes("editorial.write"),
    qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [source, setSource] = useState<File | null>(null),
    [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!logo) {
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logo);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);
  const [label, setLabel] = useState(""),
    [sourceUrl, setSourceUrl] = useState(""),
    [fixtureId, setFixtureId] = useState(""),
    [storyId, setStoryId] = useState("");
  const [rect, setRect] = useState<Rectangle>({ x: 0, y: 0, width: 60, height: 60 }),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  useUnsavedChangesGuard(
    Boolean(source || logo || label || sourceUrl || fixtureId || storyId),
    ar
      ? "هناك عمل غير محفوظ. مغادرة الصفحة؟"
      : "Des images ne sont pas enregistrées. Quitter la page ?",
  );
  const query = useQuery({
    queryKey: ["admin", "match-visual-drafts"],
    queryFn: () => repository.list(),
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === "processing") ? 5000 : false),
  });
  const selected = query.data?.find((d) => d.id === selectedId);
  const preview = useQuery({
    queryKey: ["admin", "match-visual-preview", selected?.id, selected?.version],
    enabled: Boolean(selected),
    queryFn: async () => {
      const [source, result] = await Promise.all([
        repository.preview(selected!.id, "source"),
        selected!.hasResult ? repository.preview(selected!.id, "result") : Promise.resolve(null),
      ]);
      return { source, result };
    },
    refetchInterval: 45000,
    staleTime: 0,
    gcTime: 0,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "match-visual-drafts"] });
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await work();
      await refresh();
    } catch {
      setNotice({
        error: true,
        text: ar
          ? "تعذر إتمام العملية. تحقق من الصورة والصلاحيات، ثم حدّث القائمة."
          : "Opération impossible. Vérifiez l’image et vos autorisations, puis actualisez la liste.",
      });
    } finally {
      setBusy(false);
    }
  }
  function choose(d: MatchVisualDraft) {
    setSelectedId(d.id);
    setLogo(null);
    setRect({ x: 0, y: 0, width: Math.min(60, d.width), height: Math.min(60, d.height) });
    setNotice(null);
  }
  const invalidRect =
    !selected ||
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isInteger) ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.width < 1 ||
    rect.height < 1 ||
    rect.x + rect.width > selected.width ||
    rect.y + rect.height > selected.height ||
    rect.width * rect.height > (selected.width * selected.height) / 4;
  const processing =
    selected?.status === "processing" &&
    Boolean(selected.leaseUntil) &&
    Date.parse(selected.leaseUntil!) > Date.now();
  return (
    <section
      className="grid min-w-0 gap-4"
      data-testid="admin-match-visual-drafts"
      aria-label={ar ? "صور المباريات المعلقة" : "Visuels de match en attente"}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className={ui.display.header}>
          {ar ? "صور المباريات · قيد الانتظار" : "Visuels de match · En attente"}
        </h3>
        <UiBadge tone="outline">{ar ? "خاص بالإدارة" : "Privé · Admin"}</UiBadge>
      </div>
      <p className={cn(ui.text.secondary, ui.tone.muted)}>
        {ar
          ? "الصور الأصلية والتعديلات محفوظة هنا فقط. لا تُنشر في القصص أو المقالات أو إنستغرام."
          : "Les originaux et les retouches restent ici. Aucune publication dans les stories, les articles ou sur Instagram."}
      </p>
      {notice && <UiAlert tone={notice.error ? "caution" : "positive"} title={notice.text} />}
      <UiButton variant="outline" size="sm" disabled={busy} onClick={() => void query.refetch()}>
        {ar ? "تحديث القائمة" : "Actualiser la file"}
      </UiButton>
      {query.isPending ? (
        <UiSkeleton className="h-24" />
      ) : query.isError ? (
        <UiAlert tone="caution" title={ar ? "قائمة الانتظار غير متاحة" : "File indisponible"}>
          {ar
            ? "أعد المحاولة. يجب تفعيل سير العمل الخاص أولاً."
            : "Réessayez. Le workflow privé doit être installé au préalable."}
        </UiAlert>
      ) : query.data.length === 0 ? (
        <p className={cn(ui.text.secondary, ui.tone.muted)}>
          {ar
            ? "لا توجد صور معلقة بعد. استورد الصورة الأصلية ورابط المنشور أدناه."
            : "Aucun visuel en attente. Importez une photo originale et son lien ci-dessous."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {query.data.map((d) => (
            <li key={d.id}>
              <UiCard padding="md" className="grid min-w-0 gap-3">
                <p className={cn(ui.text.bodyStrong, "break-words")}>{d.label}</p>
                <UiBadge tone={d.status === "failed" ? "caution" : "outline"}>
                  {d.status === "processing"
                    ? ar
                      ? "جارٍ التعديل"
                      : "Retouche en cours"
                    : d.status === "failed"
                      ? ar
                        ? "فشل التعديل · معلقة"
                        : "Échec · En attente"
                      : d.hasResult
                        ? ar
                          ? "التعديل جاهز · معلق"
                          : "Retouche prête · En attente"
                        : ar
                          ? "الصورة الأصلية · معلقة"
                          : "Original · En attente"}
                </UiBadge>
                <UiButton size="sm" variant="outline" disabled={busy} onClick={() => choose(d)}>
                  {ar ? "مراجعة" : "Examiner"}
                </UiButton>
              </UiCard>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <UiCard padding="md" className="grid min-w-0 gap-4">
          <h4 className={ui.text.bodyStrong}>{selected.label}</h4>
          <a
            href={selected.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="break-all underline"
          >
            {ar ? "فتح المنشور الأصلي" : "Ouvrir le post original"}
          </a>
          <p className={cn(ui.text.meta, ui.tone.muted)}>
            {ar ? "حالة حقوق الصورة: غير متحقق منها." : "Droits de la photo : non vérifiés."}
          </p>
          {(selected.fixtureId || selected.storyId) && (
            <p className={cn(ui.text.meta, "break-all")} dir="ltr">
              {selected.fixtureId && `Match: ${selected.fixtureId} `}
              {selected.storyId && `Article: ${selected.storyId}`}
            </p>
          )}
          {preview.isPending ? (
            <UiSkeleton className="h-64" />
          ) : preview.isError ? (
            <UiAlert tone="caution" title={ar ? "المعاينة غير متاحة" : "Aperçu indisponible"} />
          ) : (
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <figure className="grid gap-2">
                <figcaption className={ui.text.meta}>
                  {ar ? "الأصل · منطقة التعديل" : "Original · Zone de retouche"}
                </figcaption>
                <div className="relative" dir="ltr">
                  <img
                    src={preview.data?.source}
                    alt={selected.label}
                    className="block h-auto w-full"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10"
                    style={{
                      left: `${(rect.x / selected.width) * 100}%`,
                      top: `${(rect.y / selected.height) * 100}%`,
                      width: `${(rect.width / selected.width) * 100}%`,
                      height: `${(rect.height / selected.height) * 100}%`,
                    }}
                  >
                    <img
                      src={logoPreview ?? defaultBrandUrl(rect)}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  </div>
                </div>
              </figure>
              {preview.data?.result && (
                <figure className="grid gap-2">
                  <figcaption className={ui.text.meta}>
                    {ar ? "التعديل المحفوظ · معلق" : "Retouche enregistrée · En attente"}
                  </figcaption>
                  <img src={preview.data.result} alt={selected.label} className="h-auto w-full" />
                </figure>
              )}
            </div>
          )}
          {canWrite && (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (invalidRect || processing) return;
                void action(async () => {
                  await repository.edit(selected, rect, logo ?? undefined);
                  setLogo(null);
                  setNotice({
                    error: false,
                    text: ar
                      ? "بدأ التعديل. ستبقى النتيجة معلقة هنا."
                      : "Retouche démarrée. Le résultat restera en attente ici.",
                  });
                });
              }}
            >
              <p className={cn(ui.text.secondary, ui.tone.muted)}>
                {ar
                  ? "حدد منطقة العلامة المائية فقط (إحداثيات من أعلى اليسار). البكسلات خارجها لا تتغير. لا تشمل الوجوه أو الأطقم أو الشعارات أو النتائج أو النصوص."
                  : "Délimitez uniquement le filigrane, depuis le coin supérieur gauche. Les pixels extérieurs restent identiques. Gardez visages, maillots, écussons, scores et textes hors de cette zone."}
              </p>
              <fieldset
                disabled={busy || processing || selected.attempts >= 3}
                className="grid gap-3"
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(["x", "y", "width", "height"] as const).map((key) => (
                    <UiInput
                      key={key}
                      label={
                        {
                          x: ar ? "X · من اليسار" : "X · depuis la gauche",
                          y: ar ? "Y · من الأعلى" : "Y · depuis le haut",
                          width: ar ? "العرض" : "Largeur",
                          height: ar ? "الارتفاع" : "Hauteur",
                        }[key]
                      }
                      type="number"
                      dir="ltr"
                      min={key === "x" || key === "y" ? 0 : 1}
                      max={key === "x" || key === "width" ? selected.width : selected.height}
                      required
                      value={Number.isFinite(rect[key]) ? rect[key] : ""}
                      onChange={(e) =>
                        setRect((old) => ({ ...old, [key]: e.target.valueAsNumber }))
                      }
                    />
                  ))}
                </div>
                <UiInput
                  type="file"
                  accept="image/png"
                  label={
                    ar
                      ? "شعار بديل · PNG شفاف · اختياري"
                      : "Autre logo · PNG transparent · facultatif"
                  }
                  hint={
                    ar
                      ? "يُستخدم شعار BotolaGO الرسمي تلقائياً داخل المنطقة المحددة."
                      : "Le logo officiel BotolaGO est utilisé par défaut dans cette zone."
                  }
                  onChange={(e) => {
                    setLogo(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                {logo && <p className={cn(ui.text.meta, "break-words")}>{logo.name}</p>}
                <UiButton
                  type="submit"
                  disabled={invalidRect || busy || processing || selected.attempts >= 3}
                >
                  {ar ? "تعديل وحفظ قيد الانتظار" : "Retoucher et garder en attente"}
                </UiButton>
              </fieldset>
              {selected.status === "failed" && (
                <UiAlert
                  tone="caution"
                  title={
                    ar
                      ? "لم يكتمل التعديل. الصورة الأصلية محفوظة."
                      : "La retouche a échoué. L’original est conservé."
                  }
                />
              )}
              {selected.attempts >= 3 && (
                <p className={ui.text.meta}>
                  {ar ? "تم بلوغ حد محاولات التعديل." : "Limite de tentatives atteinte."}
                </p>
              )}
            </form>
          )}
          {canWrite && (
            <UiButton
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    ar ? "استبعاد هذا البند من قائمة الانتظار؟" : "Retirer ce visuel de la file ?",
                  )
                )
                  void action(async () => {
                    await repository.discard(selected);
                    setSelectedId(null);
                    setLogo(null);
                  });
              }}
            >
              {ar ? "استبعاد" : "Retirer de la file"}
            </UiButton>
          )}
        </UiCard>
      )}
      {canWrite && (
        <UiCard padding="md">
          <form
            className="grid min-w-0 gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!source) return;
              const importForm = e.currentTarget;
              void action(async () => {
                const d = await repository.import({
                  file: source,
                  label,
                  sourceUrl,
                  fixtureId,
                  storyId,
                });
                importForm.reset();
                setSource(null);
                setLabel("");
                setSourceUrl("");
                setFixtureId("");
                setStoryId("");
                choose(d);
                setNotice({
                  error: false,
                  text: ar
                    ? "تم الاستيراد. الصورة معلقة في الإدارة."
                    : "Photo importée et gardée en attente dans Admin.",
                });
              });
            }}
          >
            <h4 className={ui.display.header}>
              {ar ? "استيراد الصورة الأصلية" : "Importer la photo originale"}
            </h4>
            <fieldset
              disabled={busy || query.isError || query.isPending}
              className="grid min-w-0 gap-4"
            >
              <UiInput
                label={ar ? "عنوان للمراجعة" : "Titre pour la revue"}
                required
                maxLength={200}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <UiInput
                label={ar ? "رابط المنشور الأصلي" : "Lien du post original"}
                type="url"
                dir="ltr"
                required
                maxLength={2048}
                placeholder="https://www.instagram.com/p/…/"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
              <UiInput
                label={ar ? "الصورة الأصلية" : "Photo originale"}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                hint={
                  ar
                    ? "PNG أو JPG أو WebP، حتى 10 ميغابايت و1536 بكسل لكل ضلع. لا يُعاد تحجيم الصورة."
                    : "PNG, JPG ou WebP, 10 Mo et 1536 px par côté maximum. Aucun redimensionnement."
                }
                onChange={(e) => setSource(e.target.files?.[0] ?? null)}
              />
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <UiInput
                  label={ar ? "معرّف المباراة · اختياري" : "Identifiant du match · facultatif"}
                  dir="ltr"
                  pattern="[a-fA-F0-9-]{36}"
                  value={fixtureId}
                  onChange={(e) => setFixtureId(e.target.value)}
                />
                <UiInput
                  label={ar ? "معرّف المقال · اختياري" : "Identifiant de l’article · facultatif"}
                  dir="ltr"
                  pattern="[a-fA-F0-9-]{36}"
                  value={storyId}
                  onChange={(e) => setStoryId(e.target.value)}
                />
              </div>
              <UiButton type="submit" disabled={!source || busy}>
                {busy
                  ? ar
                    ? "جارٍ الحفظ…"
                    : "Enregistrement…"
                  : ar
                    ? "استيراد وحفظ قيد الانتظار"
                    : "Importer et garder en attente"}
              </UiButton>
            </fieldset>
          </form>
        </UiCard>
      )}
    </section>
  );
}
