import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, ExternalLink, X } from "lucide-react";
import { useEffect, useReducer, useState, type ReactNode } from "react";

import {
  pepitesAdmin,
  type AdminEdition,
  type AdminEditionSummary,
  type AdminOverview,
} from "@/backend/pepites/admin-repository";
import {
  ADMIN_CARD_CLASS,
  ADMIN_LABEL_CLASS,
  ADMIN_PANEL_CLASS,
  AdminDatum,
  AdminEmptyState,
  AdminField,
  AdminNotice,
  AdminSectionHeading,
  AdminSkeletonList,
  AdminSummaryCard,
} from "@/components/admin/AdminSurfaces";
import { AdminDestructiveAction } from "@/components/admin/AdminDestructiveAction";
import {
  destructiveActionReducer,
  IDLE_DESTRUCTIVE_ACTION,
} from "@/components/admin/destructive-action";
import {
  ui,
  UiBadge,
  UiButton,
  UiCheckbox,
  UiIconButton,
  UiInput,
  UiLinkButton,
  UiTextarea,
} from "@/components/ui-kit";
import { useNotificationEmailLive } from "@/lib/notification-email-live";
import { cn } from "@/lib/utils";

import {
  addEntry,
  adminDateTime,
  casablancaLocalToIso,
  defaultScheduleLocal,
  describeAdminError,
  entriesPayload,
  moveEntry,
  problemLabel,
  TOP_SIZE,
  type DraftEntry,
} from "./admin-format";
import { PepitesName } from "../PepitesVisuals";

const KEYS = {
  overview: ["pepites-admin", "overview"] as const,
  edition: (id: string) => ["pepites-admin", "edition", id] as const,
  email: (id: string) => ["pepites-admin", "email", id] as const,
};

type EditionStatus = AdminEditionSummary["status"];

function statusLabel(status: EditionStatus, rtl: boolean): string {
  const labels: Record<EditionStatus, [string, string]> = {
    draft: ["Brouillon", "مسودة"],
    scheduled: ["Programmée", "مبرمجة"],
    published: ["Publiée", "منشورة"],
    superseded: ["Corrigée", "مصحَّحة"],
    withdrawn: ["Retirée", "مسحوبة"],
  };
  return labels[status][rtl ? 1 : 0];
}

/** A draft's time is only the default; a scheduled one is the real one. */
function isDraftLabel(status: EditionStatus, rtl: boolean): string {
  if (status === "draft") return rtl ? "النشر المتوقع: " : "Publication prévue : ";
  return rtl ? "مبرمجة: " : "Programmée : ";
}

function statusTone(status: EditionStatus) {
  if (status === "published") return "positive" as const;
  if (status === "scheduled") return "action" as const;
  if (status === "withdrawn") return "negative" as const;
  if (status === "superseded") return "caution" as const;
  return "neutral" as const;
}

/**
 * `/admin/pepites`: the weekly Top 10 desk (architecture §5). The state of
 * the switches and the tick, the latest runs and editions, and the editor of
 * the chosen edition: order and reasons while it is a draft, then schedule,
 * publish, correct or withdraw. Every step is the database's; this screen
 * only asks.
 */
export function PepitesAdminEditions({
  rtl,
  canPublish,
  selectedId,
  onSelect,
}: {
  rtl: boolean;
  canPublish: boolean;
  selectedId: string | null;
  onSelect: (editionId: string | null) => void;
}) {
  const overview = useQuery({ queryKey: KEYS.overview, queryFn: pepitesAdmin.overview });
  const data = overview.data;
  // Opens the week in progress: a draft, else a scheduled edition, else the
  // latest one.
  const selected =
    selectedId ??
    data?.editions.find((edition) => edition.status === "draft")?.id ??
    data?.editions.find((edition) => edition.status === "scheduled")?.id ??
    data?.editions[0]?.id ??
    null;

  if (overview.isPending) return <AdminSkeletonList rows={4} testId="admin-pepites-loading" />;
  if (overview.isError || !data) {
    return (
      <AdminNotice tone="alert" role="alert" testId="admin-pepites-error">
        {describeAdminError(overview.error, rtl)}
      </AdminNotice>
    );
  }

  return (
    <div className="grid gap-6">
      <p className={ADMIN_LABEL_CLASS}>
        {rtl ? "جواهر / الاختيار الأسبوعي" : "Pépites / Sélection hebdo"}
      </p>
      {selected ? (
        <EditionEditor
          key={selected}
          editionId={selected}
          rtl={rtl}
          canPublish={canPublish}
          publishLocalTime={data.settings?.publishLocalTime ?? "20:00"}
          onOpen={onSelect}
        />
      ) : null}
      <OverviewCards data={data} rtl={rtl} />
      {data.notices.length > 0 ? (
        <section className="grid gap-2" aria-labelledby="admin-pepites-notices">
          <AdminSectionHeading id="admin-pepites-notices">
            {rtl ? "تنبيهات التشغيل" : "Alertes d'exploitation"}
          </AdminSectionHeading>
          {data.notices.slice(0, 3).map((notice) => (
            <AdminNotice key={`${notice.sentAt}-${notice.subject}`} tone="alert">
              <strong>{notice.subject}</strong> — {notice.body}{" "}
              <span className={ui.tone.muted}>({adminDateTime(notice.sentAt, rtl)})</span>
            </AdminNotice>
          ))}
        </section>
      ) : null}

      <section className="grid gap-2" aria-labelledby="admin-pepites-editions">
        <AdminSectionHeading id="admin-pepites-editions">
          {rtl ? "النسخ الأسبوعية" : "Éditions de la saison"}
        </AdminSectionHeading>
        {data.editions.length === 0 ? (
          <AdminEmptyState testId="admin-pepites-no-edition">
            {rtl
              ? "لا توجد نسخة بعد. تُنشأ المسودة تلقائيًا بعد حساب الترتيب."
              : "Aucune édition. Le brouillon se crée tout seul après le calcul du classement."}
          </AdminEmptyState>
        ) : (
          <ul className="grid gap-2" data-testid="admin-pepites-editions">
            {data.editions.map((edition) => (
              <li key={edition.id}>
                <button
                  type="button"
                  onClick={() => onSelect(edition.id)}
                  aria-pressed={edition.id === selected}
                  data-testid="admin-pepites-edition-row"
                  className={cn(
                    "flex w-full flex-wrap items-center gap-2 p-3 text-start",
                    ADMIN_PANEL_CLASS,
                    ui.focus,
                    edition.id === selected && "ring-2 ring-[color:var(--ui-ink-fg)]",
                  )}
                >
                  <span className={ui.text.bodyStrong}>
                    {rtl ? `الأسبوع ${edition.week}` : `Semaine ${edition.week}`} ·{" "}
                    {rtl ? `الجولة ${edition.round}` : `J${edition.round}`}
                  </span>
                  <UiBadge tone={statusTone(edition.status)}>
                    {statusLabel(edition.status, rtl)}
                  </UiBadge>
                  {edition.correctsEditionId ? (
                    <UiBadge tone="outline">{rtl ? "تصحيح" : "Correction"}</UiBadge>
                  ) : null}
                  {edition.problems.length > 0 && edition.status === "draft" ? (
                    <UiBadge tone="caution">
                      {rtl
                        ? `${edition.problems.length} نقاط`
                        : `${edition.problems.length} point(s)`}
                    </UiBadge>
                  ) : null}
                  <span className={cn("ms-auto", ui.text.meta, ui.tone.muted)}>
                    {edition.status === "scheduled"
                      ? adminDateTime(edition.scheduledFor, rtl)
                      : adminDateTime(edition.publishedAt, rtl)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2" aria-labelledby="admin-pepites-runs">
        <AdminSectionHeading id="admin-pepites-runs">
          {rtl ? "آخر الحسابات" : "Derniers calculs"}
        </AdminSectionHeading>
        {data.runs.length === 0 ? (
          <AdminEmptyState testId="admin-pepites-no-run">
            {rtl ? "لا يوجد حساب بعد." : "Aucun calcul pour l'instant."}
          </AdminEmptyState>
        ) : (
          <ul className="grid gap-1" data-testid="admin-pepites-runs">
            {data.runs.map((run) => (
              <li
                key={run.id}
                className={cn("flex flex-wrap gap-2 p-2", ADMIN_PANEL_CLASS, ui.text.meta)}
              >
                <AdminDatum>{run.kind}</AdminDatum>
                <span>{rtl ? `الجولة ${run.round}` : `J${run.round}`}</span>
                <UiBadge
                  tone={
                    run.status === "succeeded"
                      ? "positive"
                      : run.status === "failed"
                        ? "negative"
                        : "neutral"
                  }
                >
                  <AdminDatum mono={false}>{run.status}</AdminDatum>
                </UiBadge>
                <span className={ui.tone.muted}>
                  {rtl
                    ? `مؤهلون ${run.eligible ?? "—"} · مصنّفون ${run.ranked ?? "—"}`
                    : `éligibles ${run.eligible ?? "—"} · classés ${run.ranked ?? "—"}`}
                </span>
                {run.error ? (
                  <AdminDatum className={ui.tone.negative}>{run.error}</AdminDatum>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OverviewCards({ data, rtl }: { data: AdminOverview; rtl: boolean }) {
  const mode = data.settings?.mode ?? "off";
  const modeText: Record<typeof mode, [string, string]> = {
    off: ["Fermé (personne ne voit Pépites)", "مغلق (لا أحد يرى Pépites)"],
    staff: ["Aperçu équipe (staff seulement)", "معاينة الفريق (للطاقم فقط)"],
    public: ["Public", "عام"],
  };
  const state = typeof data.pointer?.state === "string" ? data.pointer.state : null;
  const pointerState =
    state === "current"
      ? rtl
        ? "آخر نسخة منشورة"
        : "La dernière édition publiée"
      : state === "countdown"
        ? rtl
          ? "عدّ تنازلي حتى النشر المبرمج"
          : "Un compte à rebours jusqu'à la publication programmée"
        : state === "delayed"
          ? rtl
            ? "إعلان أن النسخة الجديدة متأخرة"
            : "Un bandeau « le nouveau Top 10 arrive » (publication en retard)"
          : "—";
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="admin-pepites-overview">
      <AdminSummaryCard title={rtl ? "الوضع" : "Mode"} testId="admin-pepites-mode">
        <p>{modeText[mode][rtl ? 1 : 0]}</p>
        <p className={cn(ui.text.meta, ui.tone.muted)}>
          {rtl
            ? "يُغيَّر الوضع عبر مسار الترحيل المُراجَع فقط."
            : "Le mode se change seulement par le chemin de migration relu."}
        </p>
      </AdminSummaryCard>
      <AdminSummaryCard title={rtl ? "النشر" : "Publication"}>
        <p>
          {data.settings?.autoPublish
            ? rtl
              ? `تلقائي على الساعة ${data.settings.publishLocalTime.slice(0, 5)}`
              : `Automatique à ${data.settings.publishLocalTime.slice(0, 5)}`
            : rtl
              ? "يدوي (لا شيء يُنشر دون موافقة)"
              : "Manuelle (rien ne part sans validation)"}
        </p>
        <p className={cn(ui.text.meta, ui.tone.muted)}>
          {data.jobActive
            ? rtl
              ? "المهمة المجدولة تعمل كل 15 دقيقة."
              : "La tâche planifiée tourne toutes les 15 minutes."
            : rtl
              ? "المهمة المجدولة متوقفة."
              : "La tâche planifiée est en pause."}
        </p>
      </AdminSummaryCard>
      <AdminSummaryCard title={rtl ? "الموسم" : "Saison"}>
        <p>{data.season?.label ?? "—"}</p>
      </AdminSummaryCard>
      <AdminSummaryCard title={rtl ? "ما يراه القراء" : "Ce que voient les lecteurs"}>
        <p data-testid="admin-pepites-reader-state">{pointerState}</p>
        {typeof data.pointer?.nextRevealAt === "string" ? (
          <p className={cn(ui.text.meta, ui.tone.muted)}>
            {rtl ? "الكشف: " : "Révélation : "}
            {adminDateTime(data.pointer.nextRevealAt, rtl)}
          </p>
        ) : null}
      </AdminSummaryCard>
    </div>
  );
}

function toDraft(entry: AdminEdition["entries"][number], rtl: boolean): DraftEntry {
  return {
    playerId: entry.player.id,
    name: entry.player.name,
    team: entry.player.team ? entry.player.team.shortName[rtl ? "ar" : "fr"] : null,
    computedRank: entry.computedRank,
    reasonFr: entry.reasonFr ?? "",
    reasonAr: entry.reasonAr ?? "",
  };
}

function EditionEditor({
  editionId,
  rtl,
  canPublish,
  publishLocalTime,
  onOpen,
}: {
  editionId: string;
  rtl: boolean;
  canPublish: boolean;
  publishLocalTime: string;
  onOpen: (editionId: string) => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KEYS.edition(editionId),
    queryFn: () => pepitesAdmin.edition(editionId),
  });
  const [draft, setDraft] = useState<DraftEntry[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ text: string; alert: boolean } | null>(null);
  const [scheduleAt, setScheduleAt] = useState(() =>
    defaultScheduleLocal(Date.now(), publishLocalTime),
  );
  const [confirming, setConfirming] = useState<"publish" | "correct" | null>(null);
  const [actionState, dispatchAction] = useReducer(
    destructiveActionReducer,
    IDLE_DESTRUCTIVE_ACTION,
  );
  const [showEmail, setShowEmail] = useState(false);
  // Publishing sends the weekly e-mail only while notification e-mail is
  // really sent (`NOTIFICATION_EMAIL_LIVE`); the prompt says which.
  const emailLive = useNotificationEmailLive();

  const data = query.data;
  useEffect(() => {
    if (data && !dirty) setDraft(data.entries.map((entry) => toDraft(entry, rtl)));
  }, [data, dirty, rtl]);

  const refresh = async () => {
    setDirty(false);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: KEYS.edition(editionId) }),
      queryClient.invalidateQueries({ queryKey: KEYS.overview }),
    ]);
  };
  const run = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      setMessage({ text: rtl ? "تم." : "C'est fait.", alert: false });
      setConfirming(null);
      await refresh();
    },
    onError: (error) => setMessage({ text: describeAdminError(error, rtl), alert: true }),
  });

  // A failed read first: without data there is no draft, and waiting for
  // one would leave a stale `?edition=` link on a skeleton for good.
  if (query.isError && !data) {
    return (
      <AdminNotice tone="alert" role="alert" testId="admin-pepites-editor-error">
        {describeAdminError(query.error, rtl)}
      </AdminNotice>
    );
  }
  if (query.isPending || !draft || !data)
    return <AdminSkeletonList rows={3} testId="admin-pepites-editor-loading" />;

  const { edition, problems, shortlist, moves } = data;
  const isDraft = edition.status === "draft";
  const busy = run.isPending;
  const update = (next: DraftEntry[]) => {
    setDraft(next);
    setDirty(true);
  };
  const setReason = (index: number, field: "reasonFr" | "reasonAr", value: string) =>
    update(draft.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)));
  const missingLines = draft.reduce(
    (count, entry) => count + (entry.reasonFr.trim() ? 0 : 1) + (entry.reasonAr.trim() ? 0 : 1),
    0,
  );
  const scheduleTime = edition.scheduledFor ? adminDateTime(edition.scheduledFor, rtl) : null;
  const inTop = new Set(draft.map((entry) => entry.playerId));
  const toggle = (player: (typeof shortlist)[number]) => {
    if (inTop.has(player.id)) {
      update(draft.filter((entry) => entry.playerId !== player.id));
      return;
    }
    update(
      addEntry(draft, {
        playerId: player.id,
        name: player.name,
        team: player.team ? player.team.shortName[rtl ? "ar" : "fr"] : null,
        computedRank: player.rank,
        reasonFr: "",
        reasonAr: "",
      }),
    );
  };

  return (
    <section
      className="grid gap-4"
      aria-labelledby="admin-pepites-editor-title"
      data-testid="admin-pepites-editor"
    >
      {/* Figma A1: title, state and the week's facts; the actions at the end. */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <h3 id="admin-pepites-editor-title" className={cn(ui.display.section, ui.tone.default)}>
            {rtl ? `اختيار الأسبوع ${edition.week}` : `Sélection de la semaine ${edition.week}`}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <UiBadge tone={statusTone(edition.status)}>{statusLabel(edition.status, rtl)}</UiBadge>
            <span className={cn(ui.text.meta, ui.tone.muted)}>
              {[
                rtl
                  ? `الأسبوع ${edition.week} · الجولة ${edition.round}`
                  : `Semaine ${edition.week} · journée ${edition.round}`,
                scheduleTime ? `${isDraftLabel(edition.status, rtl)}${scheduleTime}` : null,
                edition.publishedAt
                  ? `${rtl ? "نُشرت: " : "publiée : "}${adminDateTime(edition.publishedAt, rtl)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Opens the public page in a new tab, so the desk stays open. */}
          <UiLinkButton
            to="/pepites"
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            size="sm"
          >
            {rtl ? "معاينة" : "Aperçu"}
            <ExternalLink aria-hidden className="h-4 w-4" />
          </UiLinkButton>
        </div>
      </header>

      {message ? (
        <AdminNotice
          tone={message.alert ? "alert" : "info"}
          role={message.alert ? "alert" : "status"}
        >
          {message.text}
        </AdminNotice>
      ) : null}

      {problems.length > 0 && (isDraft || edition.status === "scheduled") ? (
        <div data-testid="admin-pepites-problems">
          <p className={ADMIN_LABEL_CLASS}>{rtl ? "قبل البرمجة" : "Avant de programmer"}</p>
          <ul className={cn("mt-1 list-disc ps-5", ui.text.meta)}>
            {problems.map((problem) => (
              <li key={problem}>{problemLabel(problem, rtl)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {edition.withdrawnReason ? (
        <AdminField label={rtl ? "سبب السحب" : "Motif du retrait"}>
          {edition.withdrawnReason}
        </AdminField>
      ) : null}

      <div className={cn("grid gap-4", isDraft && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]")}>
        {isDraft ? (
          <section
            className={cn("grid content-start gap-3 p-4", ADMIN_CARD_CLASS)}
            aria-labelledby="admin-pepites-shortlist-title"
          >
            <div>
              <h4 id="admin-pepites-shortlist-title" className={ADMIN_LABEL_CLASS}>
                {rtl ? "مقترحات الحساب" : "Proposés par le calcul"}
              </h4>
              <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>
                {rtl ? "حدّد للإضافة إلى أفضل 10" : "Cochez pour ajouter au Top 10"}
              </p>
            </div>
            <ul className="grid gap-1" data-testid="admin-pepites-shortlist">
              {shortlist.map((player) => {
                const checked = inTop.has(player.id);
                const dropped = !checked && player.rank !== null && player.rank <= TOP_SIZE;
                return (
                  <li key={player.id}>
                    {/* The kit checkbox: a 44px target behind the box, the
                        whole row its label. */}
                    <UiCheckbox
                      checked={checked}
                      disabled={busy || (!checked && draft.length >= TOP_SIZE)}
                      onChange={() => toggle(player)}
                      className={cn(
                        // The label's box fills the row, so the score sits
                        // at the inline end.
                        "items-center px-2 [&>span]:flex-1",
                        ui.space.row,
                        ui.radius.control,
                        "hover:bg-[color:var(--ui-surface-sunken)]",
                      )}
                      label={
                        <span className="flex items-center gap-3">
                          <span
                            className={cn(
                              "w-6 shrink-0 text-center",
                              ui.text.micro,
                              ui.text.tabular,
                              ui.tone.muted,
                            )}
                          >
                            {player.rank ?? "—"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <PepitesName
                              name={player.name}
                              className={cn("block truncate", ui.text.bodyStrong)}
                            />
                            <span
                              className={cn(
                                "flex flex-wrap items-center gap-x-2 gap-y-1",
                                ui.text.micro,
                                ui.tone.muted,
                              )}
                            >
                              <span>
                                {[
                                  player.team ? player.team.shortName[rtl ? "ar" : "fr"] : null,
                                  `${player.minutes}′`,
                                  `${player.goals}+${player.assists}`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                              {dropped ? (
                                <UiBadge tone="caution" className="gap-1">
                                  <ArrowDown aria-hidden className="h-3 w-3" />
                                  {rtl ? "سحبه المحرر" : "retiré par l'éditeur"}
                                </UiBadge>
                              ) : null}
                            </span>
                          </span>
                          <span className={cn("shrink-0", ui.stat.sm, ui.tone.ink)}>
                            {player.score === null ? "—" : Math.round(player.score)}
                          </span>
                        </span>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section
          className={cn("grid content-start gap-3 p-4", ADMIN_CARD_CLASS)}
          aria-labelledby="admin-pepites-top-title"
        >
          <div>
            <h4 id="admin-pepites-top-title" className={ADMIN_LABEL_CLASS}>
              {rtl ? "أفضل 10" : "Top 10"}
              {scheduleTime ? ` · ${scheduleTime}` : ""}
            </h4>
            {isDraft ? (
              <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>
                {rtl
                  ? "رتّب بالسهمين · جملة بالفرنسية وأخرى بالعربية لكل لاعب"
                  : "Réordonnez avec les flèches · une phrase en français et en arabe par joueur"}
              </p>
            ) : null}
          </div>
          <ol className="grid gap-2" data-testid="admin-pepites-entries">
            {draft.map((entry, index) => (
              <li
                key={entry.playerId}
                className={cn("grid gap-2 p-3", ADMIN_PANEL_CLASS)}
                data-testid="admin-pepites-entry"
              >
                <div className="flex items-center gap-3">
                  <span className={cn("w-6 shrink-0 text-center", ui.score.row, ui.tone.ink)}>
                    {index + 1}
                  </span>
                  {/* The name stays the entry's first paragraph: the browser
                      suite reads it as such to check the order. */}
                  <div className="min-w-0 flex-1">
                    <PepitesName
                      as="p"
                      name={entry.name}
                      className={cn("truncate", ui.text.bodyStrong, ui.tone.default)}
                    />
                    <p className={cn(ui.text.micro, ui.tone.muted)}>
                      {[
                        entry.team,
                        entry.computedRank
                          ? rtl
                            ? `المحسوب #${entry.computedRank}`
                            : `calculé #${entry.computedRank}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {isDraft ? (
                    <span className="flex gap-1">
                      <UiIconButton
                        variant="ghost"
                        aria-label={rtl ? "إلى الأعلى" : "Monter"}
                        disabled={index === 0 || busy}
                        onClick={() => update(moveEntry(draft, index, -1))}
                      >
                        <ArrowUp aria-hidden />
                      </UiIconButton>
                      <UiIconButton
                        variant="ghost"
                        aria-label={rtl ? "إلى الأسفل" : "Descendre"}
                        disabled={index === draft.length - 1 || busy}
                        onClick={() => update(moveEntry(draft, index, 1))}
                      >
                        <ArrowDown aria-hidden />
                      </UiIconButton>
                      <UiIconButton
                        variant="ghost"
                        aria-label={rtl ? "إزالة" : "Retirer de la liste"}
                        disabled={busy}
                        onClick={() => update(draft.filter((_, i) => i !== index))}
                      >
                        <X aria-hidden />
                      </UiIconButton>
                    </span>
                  ) : null}
                </div>
                {isDraft ? (
                  <div className="grid gap-2">
                    <ReasonField
                      label={rtl ? "السطر بالفرنسية" : "Ligne en français"}
                      placeholder={
                        rtl ? "جملة بالفرنسية (إلزامية)" : "Phrase en français (obligatoire)"
                      }
                      value={entry.reasonFr}
                      dir="ltr"
                      onChange={(value) => setReason(index, "reasonFr", value)}
                    />
                    <ReasonField
                      label={rtl ? "السطر بالعربية" : "Ligne en arabe"}
                      placeholder="الجملة بالعربية (إلزامية)"
                      value={entry.reasonAr}
                      dir="rtl"
                      onChange={(value) => setReason(index, "reasonAr", value)}
                    />
                  </div>
                ) : entry.reasonFr || entry.reasonAr ? (
                  <p className={cn(ui.text.secondary, ui.tone.muted)}>
                    {rtl ? entry.reasonAr : entry.reasonFr}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
          {isDraft ? (
            <div className="flex flex-wrap gap-2">
              <UiButton
                variant="ink"
                size="sm"
                disabled={!dirty || busy}
                onClick={() =>
                  run.mutate(() => pepitesAdmin.saveEntries(editionId, entriesPayload(draft)))
                }
                data-testid="admin-pepites-save"
              >
                {rtl ? "حفظ الترتيب والأسطر" : "Enregistrer l'ordre et les lignes"}
              </UiButton>
              {dirty ? (
                <UiButton variant="soft" size="sm" disabled={busy} onClick={() => void refresh()}>
                  {rtl ? "إلغاء التغييرات" : "Annuler les changements"}
                </UiButton>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      {isDraft && canPublish ? (
        <div
          className={cn("flex flex-wrap items-end gap-3 p-4", ADMIN_CARD_CLASS)}
          data-testid="admin-pepites-schedule-panel"
        >
          <UiInput
            type="datetime-local"
            label={rtl ? "النشر (بتوقيت المغرب)" : "Publication (heure du Maroc)"}
            value={scheduleAt}
            onChange={(event) => setScheduleAt(event.target.value)}
            data-testid="admin-pepites-schedule-at"
            className="min-w-[14rem]"
          />
          <UiButton
            variant="gradient"
            size="sm"
            disabled={
              busy ||
              dirty ||
              problems.length > 0 ||
              missingLines > 0 ||
              !casablancaLocalToIso(scheduleAt)
            }
            onClick={() => {
              const at = casablancaLocalToIso(scheduleAt);
              if (at) run.mutate(() => pepitesAdmin.schedule(editionId, at));
            }}
            data-testid="admin-pepites-schedule"
          >
            {rtl ? "برمجة النشر" : "Programmer la publication"}
          </UiButton>
          <p
            className={cn("basis-full", ui.text.meta, ui.tone.muted)}
            data-testid="admin-pepites-schedule-hint"
          >
            {dirty
              ? rtl
                ? "احفظ التغييرات أولًا."
                : "Enregistrez d'abord vos changements."
              : missingLines > 0
                ? rtl
                  ? `ينقص ${missingLines} سطرًا: جملة بالفرنسية وأخرى بالعربية لكل لاعب.`
                  : `Il manque ${missingLines} phrase(s) : une en français et une en arabe par joueur.`
                : null}
          </p>
        </div>
      ) : null}

      {edition.status === "scheduled" && canPublish ? (
        <div className="flex flex-wrap gap-2">
          <UiButton
            variant="soft"
            size="sm"
            disabled={busy}
            onClick={() => run.mutate(() => pepitesAdmin.unschedule(editionId))}
            data-testid="admin-pepites-unschedule"
          >
            {rtl ? "إرجاع إلى مسودة" : "Repasser en brouillon"}
          </UiButton>
          <TwoStep
            armed={confirming === "publish"}
            onArm={() => setConfirming("publish")}
            onCancel={() => setConfirming(null)}
            onConfirm={() => run.mutate(() => pepitesAdmin.publishNow(editionId))}
            busy={busy}
            rtl={rtl}
            label={rtl ? "النشر الآن" : "Publier maintenant"}
            prompt={
              emailLive
                ? rtl
                  ? "سيراه كل القراء فورًا، وتنطلق الرسالة الأسبوعية للمشتركين."
                  : "Tous les lecteurs le verront tout de suite, et l'e-mail part aux abonnés."
                : rtl
                  ? "سيراه كل القراء فورًا. لن تُرسَل أي رسالة بريدية: إرسال الرسائل غير مفعّل."
                  : "Tous les lecteurs le verront tout de suite. Aucun e-mail ne part : l'envoi des e-mails n'est pas activé."
            }
            testId="admin-pepites-publish"
          />
        </div>
      ) : null}

      {edition.status === "published" && canPublish ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <TwoStep
              armed={confirming === "correct"}
              onArm={() => setConfirming("correct")}
              onCancel={() => setConfirming(null)}
              onConfirm={() =>
                run.mutate(async () => {
                  const created = await pepitesAdmin.correct(editionId);
                  onOpen(created.editionId);
                })
              }
              busy={busy}
              rtl={rtl}
              label={rtl ? "إنشاء تصحيح" : "Créer une correction"}
              prompt={
                rtl
                  ? "تُنشأ مسودة جديدة لهذا الأسبوع. تبقى النسخة الحالية منشورة إلى أن يُنشر التصحيح."
                  : "Un nouveau brouillon est créé pour cette semaine. L'édition actuelle reste publiée jusqu'à la publication de la correction."
              }
              testId="admin-pepites-correct"
            />
            <UiButton variant="soft" size="sm" onClick={() => setShowEmail((open) => !open)}>
              {rtl ? "تقرير البريد" : "Rapport e-mail"}
            </UiButton>
          </div>
          <AdminDestructiveAction
            actionKey={`withdraw:${editionId}`}
            state={actionState}
            dispatch={dispatchAction}
            minimumReasonLength={8}
            rtl={rtl}
            triggerLabel={rtl ? "سحب هذه النسخة" : "Retirer cette édition"}
            confirmPrompt={
              rtl
                ? `سحب الأسبوع ${edition.week}؟ تختفي القائمة من الموقع وتُلغى الرسائل غير المرسلة.`
                : `Retirer la semaine ${edition.week} ? La liste disparaît du site et les e-mails non envoyés sont annulés.`
            }
            confirmLabel={rtl ? "تأكيد السحب" : "Confirmer le retrait"}
            onConfirm={(reason) =>
              new Promise<void>((resolve) =>
                run.mutate(() => pepitesAdmin.withdraw(editionId, reason), {
                  onSettled: () => resolve(),
                }),
              )
            }
            triggerTestId="admin-pepites-withdraw"
            testId="admin-pepites-withdraw"
          />
          {showEmail ? <EmailReport editionId={editionId} rtl={rtl} /> : null}
        </div>
      ) : null}

      {moves.length > 0 ? (
        <details className="group">
          <summary
            className={cn(
              ADMIN_LABEL_CLASS,
              "flex min-h-[var(--ui-tap-min)] cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden",
              ui.radius.control,
              ui.focus,
            )}
          >
            {rtl ? "السجل" : "Historique"}
            <ChevronDown
              aria-hidden
              className="h-4 w-4 transition-transform duration-[var(--duration-quick)] group-open:rotate-180"
            />
          </summary>
          <ul className={cn("mt-2 grid gap-1", ui.text.meta)}>
            {moves.map((move, index) => (
              <li key={index} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {/* Each state is LTR data; the arrow between them follows the
                    page (styles.css mirrors it in Arabic), so the change
                    reads in the page's direction. */}
                <AdminDatum>{move.from ?? "∅"}</AdminDatum>
                <ArrowRight aria-hidden className={cn("h-3.5 w-3.5", ui.tone.muted)} />
                <AdminDatum>{move.to}</AdminDatum>
                <span>
                  · {move.actorKind} · {adminDateTime(move.at, rtl)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/**
 * One of an entry's two lines (Figma A1): the kit's text area under its
 * label, outlined in the caution colour while it is empty, since both lines
 * are required.
 */
function ReasonField({
  label,
  placeholder,
  value,
  dir,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  dir: "ltr" | "rtl";
  onChange: (value: string) => void;
}) {
  const empty = !value.trim();
  return (
    <UiTextarea
      label={label}
      placeholder={placeholder}
      value={value}
      maxLength={280}
      rows={1}
      dir={dir}
      aria-required
      onChange={(event) => onChange(event.target.value)}
      fieldClassName={empty ? "border-[color:var(--ui-caution)]" : undefined}
    />
  );
}

/** A consequential action that needs a second press, without a motive. */
function TwoStep({
  armed,
  onArm,
  onCancel,
  onConfirm,
  busy,
  rtl,
  label,
  prompt,
  testId,
}: {
  armed: boolean;
  onArm: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
  rtl: boolean;
  label: ReactNode;
  prompt: ReactNode;
  testId: string;
}) {
  if (!armed) {
    return (
      <UiButton variant="gradient" size="sm" disabled={busy} onClick={onArm} data-testid={testId}>
        {label}
      </UiButton>
    );
  }
  return (
    <div
      className={cn("grid w-full gap-2 p-3", ADMIN_PANEL_CLASS)}
      role="group"
      data-testid={`${testId}-confirm`}
    >
      <p className={ui.text.secondary}>{prompt}</p>
      <div className="flex flex-wrap gap-2">
        <UiButton
          variant="gradient"
          size="sm"
          disabled={busy}
          onClick={onConfirm}
          data-testid={`${testId}-commit`}
        >
          {rtl ? "تأكيد" : "Confirmer"}
        </UiButton>
        <UiButton variant="soft" size="sm" disabled={busy} onClick={onCancel}>
          {rtl ? "إلغاء" : "Annuler"}
        </UiButton>
      </div>
    </div>
  );
}

function EmailReport({ editionId, rtl }: { editionId: string; rtl: boolean }) {
  const query = useQuery({
    queryKey: KEYS.email(editionId),
    queryFn: () => pepitesAdmin.emailReport(editionId),
  });
  if (query.isPending) return <AdminSkeletonList rows={1} />;
  if (query.isError || !query.data) {
    return <AdminNotice tone="alert">{describeAdminError(query.error, rtl)}</AdminNotice>;
  }
  const report = query.data;
  const rows: Array<[string, number]> = [
    [rtl ? "المجموع" : "Total", report.total],
    [rtl ? "في الانتظار" : "En file", report.queued],
    [rtl ? "أُرسلت" : "Envoyés", report.sent],
    [rtl ? "مؤجلة (الحصة اليومية)" : "Reportés (quota du jour)", report.deferred],
    [rtl ? "انتهت صلاحيتها" : "Expirés", report.expired],
    [rtl ? "ربما أُرسلت" : "Peut-être envoyés", report.possiblySent],
    [rtl ? "فشلت" : "Échecs", report.failed],
  ];
  return (
    <dl
      className={cn("grid grid-cols-2 gap-2 p-3 sm:grid-cols-4", ADMIN_PANEL_CLASS)}
      data-testid="admin-pepites-email-report"
    >
      {rows.map(([label, value]) => (
        <AdminField key={label} label={label}>
          <span className="tabular-nums">{value}</span>
        </AdminField>
      ))}
    </dl>
  );
}
