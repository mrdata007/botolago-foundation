import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useReducer, useState, type FormEvent } from "react";

import {
  CORRECTABLE_ATTRIBUTES,
  pepitesAdmin,
  type AdminPlayer,
  type CorrectableAttribute,
  type DataDeskIssue,
  type PhotoRelease,
} from "@/backend/pepites/admin-repository";
import {
  ADMIN_LABEL_CLASS,
  ADMIN_PANEL_CLASS,
  AdminDatum,
  AdminEmptyState,
  AdminFilterChips,
  AdminNotice,
  AdminSectionHeading,
  AdminSkeletonList,
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
  UiInput,
  UiSegmented,
  UiSelect,
  UiTextarea,
} from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { pepitesService } from "@/services/pepites";

import { pp } from "../pepites-design";

import { adminDateTime, describeAdminError, problemLabel } from "./admin-format";

export type DataTab = "desk" | "players" | "photos";

const KEYS = {
  desk: (status: string, kind: string) => ["pepites-admin", "desk", status, kind] as const,
  search: (query: string) => ["pepites-admin", "players", query] as const,
  photos: (status: string) => ["pepites-admin", "photos", status] as const,
};

function attributeLabel(attribute: string, rtl: boolean): string {
  const labels: Record<string, [string, string]> = {
    date_of_birth: ["Date de naissance", "تاريخ الميلاد"],
    nationality: ["Nationalité", "الجنسية"],
    preferred_foot: ["Pied fort", "القدم المفضلة"],
    height_cm: ["Taille", "الطول"],
    detailed_position: ["Poste précis", "المركز الدقيق"],
    club: ["Club", "النادي"],
    name: ["Nom", "الاسم"],
    photo: ["Photo", "الصورة"],
    stats: ["Statistiques", "الإحصائيات"],
  };
  const label = labels[attribute];
  return label ? label[rtl ? 1 : 0] : attribute;
}

/**
 * `/admin/pepites/donnees`: the data desk (architecture §3.7) and the photo
 * rights (§3.3). Fans' reports and the gaps the ranking found, the manual
 * correction of a player's attributes (always with a source), and the photo
 * releases from upload to approval, rejection or revocation.
 */
export function PepitesAdminData({
  rtl,
  canCorrect,
  tab,
  onTabChange,
}: {
  rtl: boolean;
  canCorrect: boolean;
  tab: DataTab;
  onTabChange: (tab: DataTab) => void;
}) {
  const [player, setPlayer] = useState<{ id: string; name: string; field?: string } | null>(null);
  return (
    <div className="grid gap-4">
      <p className={cn(pp.monoStrong, pp.muted, "text-[10px] ltr:tracking-[0.1em]")}>
        {rtl ? "جواهر / مكتب البيانات" : "Pépites / Data desk"}
      </p>
      <UiSegmented<DataTab>
        value={tab}
        onChange={onTabChange}
        label={rtl ? "أقسام البيانات" : "Sections des données"}
        options={[
          { value: "desk", label: rtl ? "البلاغات والنواقص" : "Signalements" },
          { value: "players", label: rtl ? "اللاعبون" : "Joueurs" },
          { value: "photos", label: rtl ? "الصور" : "Photos" },
        ]}
      />
      {tab === "desk" ? (
        <DeskList
          rtl={rtl}
          canCorrect={canCorrect}
          onCorrect={(issue) => {
            setPlayer({
              id: issue.entityId,
              name: issue.playerName ?? issue.entityId,
              field: issue.field,
            });
            onTabChange("players");
          }}
        />
      ) : null}
      {tab === "players" ? (
        <PlayerDesk rtl={rtl} canCorrect={canCorrect} selected={player} onSelect={setPlayer} />
      ) : null}
      {tab === "photos" ? <PhotoReleases rtl={rtl} canCorrect={canCorrect} /> : null}
    </div>
  );
}

/* --------------------------------------------------------------- the desk */

/** Figma A2's tiles: how complete the data is, from the current run's coverage. */
function DeskCoverage({ rtl }: { rtl: boolean }) {
  const query = useQuery({
    queryKey: ["pepites-admin", "coverage"],
    queryFn: ({ signal }) => pepitesService.methodology(signal),
  });
  const data = query.data;
  const coverage = data?.available ? data.coverage : null;
  if (!coverage) return null;
  const known = coverage.poolSize - coverage.noDateOfBirth;
  const tiles: Array<{ label: string; value: string; share: number | null }> = [
    {
      label: rtl ? "تواريخ الميلاد" : "Dates de naissance",
      value: `${known} / ${coverage.poolSize}`,
      share: coverage.poolSize > 0 ? known / coverage.poolSize : null,
    },
    {
      label: rtl ? "المصنَّفون" : "Classés",
      value: `${coverage.ranked} / ${coverage.eligible}`,
      share: coverage.eligible > 0 ? coverage.ranked / coverage.eligible : null,
    },
    {
      label: rtl ? "التنقيط" : "Notes de match",
      value: shareText(coverage.ratingCoverage),
      share: coverage.ratingCoverage,
    },
    {
      label: rtl ? "القدم المفضلة" : "Pied fort",
      value: shareText(coverage.footCoverage),
      share: coverage.footCoverage,
    },
    {
      label: rtl ? "الطول" : "Taille",
      value: shareText(coverage.heightCoverage),
      share: coverage.heightCoverage,
    },
  ];
  return (
    <ul
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      data-testid="admin-pepites-coverage"
    >
      {tiles.map((tile) => {
        const pct = tile.share === null ? null : Math.round(tile.share * 100);
        return (
          <li key={tile.label} className={cn("grid gap-2 rounded-[12px] p-3", pp.card)}>
            <span className={cn(pp.monoStrong, pp.muted, "text-[8px] ltr:tracking-[0.1em]")}>
              {tile.label}
            </span>
            <bdi className={cn(pp.display, pp.ink, "text-[22px]")}>{tile.value}</bdi>
            <span className="h-1 overflow-hidden rounded-full bg-[color:var(--pepites-seg-empty)]">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.max(2, pct ?? 0)}%`,
                  backgroundColor:
                    pct === null
                      ? "#dfe3ee"
                      : pct >= 80
                        ? "#27b36b"
                        : pct >= 40
                          ? "#f0a020"
                          : "#e5484d",
                }}
              />
            </span>
            <span className={cn(pp.mono, pp.muted, "text-end text-[8px]")}>
              {pct === null ? "—" : `${pct} %`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function shareText(share: number | null): string {
  return share === null ? "—" : `${Math.round(share * 100)} %`;
}

function kindLabel(kind: DataDeskIssue["kind"], rtl: boolean): string {
  const labels: Record<DataDeskIssue["kind"], [string, string]> = {
    missing: ["Manquant", "ناقص"],
    conflict: ["Conflit entre sources", "تعارض بين المصادر"],
    reported: ["Signalé par un fan", "بلاغ من قارئ"],
    unlinked: ["Non relié", "غير مربوط"],
  };
  return labels[kind][rtl ? 1 : 0];
}

function issueMessage(issue: DataDeskIssue): string | null {
  return issue.details &&
    typeof issue.details === "object" &&
    "message" in (issue.details as object)
    ? String((issue.details as { message?: unknown }).message ?? "") || null
    : null;
}

const DESK_COLUMNS =
  "grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,0.8fr)_auto] items-center gap-3";

function DeskList({
  rtl,
  canCorrect,
  onCorrect,
}: {
  rtl: boolean;
  canCorrect: boolean;
  onCorrect: (issue: DataDeskIssue) => void;
}) {
  const [status, setStatus] = useState<"open" | "resolved" | "dismissed" | "all">("open");
  const [kind, setKind] = useState<"" | "missing" | "conflict" | "reported" | "unlinked">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: KEYS.desk(status, kind),
    queryFn: () => pepitesAdmin.dataDesk({ status, kind: kind || null, offset: 0 }),
  });
  const issues = query.data?.issues ?? [];
  const selected = issues.find((issue) => issue.id === selectedId) ?? null;
  const head = cn(pp.monoStrong, pp.muted, "text-[8px] ltr:tracking-[0.1em]");
  return (
    <section className="grid gap-4" aria-labelledby="admin-pepites-desk">
      <DeskCoverage rtl={rtl} />
      <div className="flex flex-wrap gap-4">
        <AdminFilterChips
          label={rtl ? "الحالة" : "État"}
          value={status}
          onSelect={setStatus}
          data-testid="admin-pepites-desk-status"
          options={[
            { value: "open", label: rtl ? "مفتوحة" : "Ouverts" },
            { value: "resolved", label: rtl ? "محلولة" : "Résolus" },
            { value: "dismissed", label: rtl ? "مستبعدة" : "Écartés" },
            { value: "all", label: rtl ? "الكل" : "Tous" },
          ]}
        />
        <AdminFilterChips
          label={rtl ? "النوع" : "Type"}
          value={kind}
          onSelect={setKind}
          data-testid="admin-pepites-desk-kind"
          options={[
            { value: "", label: rtl ? "الكل" : "Tous" },
            { value: "reported", label: rtl ? "بلاغات القراء" : "Signalés par les fans" },
            { value: "missing", label: rtl ? "ناقص" : "Manquants" },
            { value: "conflict", label: rtl ? "تعارض" : "Conflits" },
            { value: "unlinked", label: rtl ? "غير مربوط" : "Non reliés" },
          ]}
        />
      </div>
      {query.isPending ? <AdminSkeletonList rows={3} /> : null}
      {query.isError ? (
        <AdminNotice tone="alert" role="alert">
          {describeAdminError(query.error, rtl)}
        </AdminNotice>
      ) : null}
      {query.data ? (
        <div className={cn("grid gap-4", selected && "lg:grid-cols-[minmax(0,1fr)_320px]")}>
          <div className={cn("grid content-start gap-2 rounded-[14px] p-4", pp.card)}>
            <h3
              id="admin-pepites-desk"
              className={cn(pp.monoStrong, pp.muted, "text-[9px] ltr:tracking-[0.1em]")}
            >
              {rtl ? "للتصحيح" : "À corriger"} ·{" "}
              {rtl ? `المجموع ${query.data.total}` : `${query.data.total} au total`}
            </h3>
            {issues.length === 0 ? (
              <AdminEmptyState testId="admin-pepites-desk-empty">
                {rtl ? "لا شيء هنا." : "Rien ici."}
              </AdminEmptyState>
            ) : (
              <>
                <div
                  className={cn(DESK_COLUMNS, "border-b pb-2 max-md:hidden", pp.divider)}
                  aria-hidden
                >
                  <span className={head}>{rtl ? "اللاعب" : "Joueur"}</span>
                  <span className={head}>{rtl ? "الحقل" : "Champ"}</span>
                  <span className={head}>{rtl ? "المشكلة" : "Problème"}</span>
                  <span className={head}>{rtl ? "المصدر" : "Source"}</span>
                  <span className="w-[84px]" />
                </div>
                <ul className="grid" data-testid="admin-pepites-desk-list">
                  {issues.map((issue) => (
                    <li
                      key={issue.id}
                      data-testid="admin-pepites-issue"
                      className={cn(
                        DESK_COLUMNS,
                        "border-b py-2.5 last:border-b-0 max-md:grid-cols-1 max-md:gap-1",
                        pp.divider,
                      )}
                    >
                      <span className={cn(pp.bold, pp.text, "truncate text-[13px]")}>
                        {issue.playerName ?? issue.entityId}
                      </span>
                      <span className={cn(pp.text, "text-[12px]")}>
                        {attributeLabel(issue.field, rtl)}
                      </span>
                      <span className="grid text-[12px] text-[#b86e00]">
                        <span>{kindLabel(issue.kind, rtl)}</span>
                        {issueMessage(issue) ? (
                          <span className={pp.text}>{issueMessage(issue)}</span>
                        ) : null}
                      </span>
                      <span className={cn(pp.mono, pp.muted, "text-[10px]")}>
                        {issue.source} · {adminDateTime(issue.createdAt, rtl)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedId(issue.id === selectedId ? null : issue.id)}
                        aria-pressed={issue.id === selectedId}
                        className={cn(
                          "inline-flex min-h-[34px] w-[84px] items-center justify-center rounded-full border text-[12px]",
                          pp.line,
                          pp.ink,
                          pp.heavy,
                          issue.id === selectedId && "bg-[color:var(--pepites-ink)] text-white",
                          ui.focus,
                        )}
                        data-testid="admin-pepites-issue-open"
                      >
                        {issue.status === "open"
                          ? rtl
                            ? "تصحيح"
                            : "Corriger"
                          : rtl
                            ? "عرض"
                            : "Voir"}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          {selected ? (
            <DeskIssuePanel
              key={selected.id}
              issue={selected}
              rtl={rtl}
              canCorrect={canCorrect}
              onCorrect={onCorrect}
              onClosed={() => setSelectedId(null)}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** The side panel of Figma A2: the issue, then correct the field or close it with a note. */
function DeskIssuePanel({
  issue,
  rtl,
  canCorrect,
  onCorrect,
  onClosed,
}: {
  issue: DataDeskIssue;
  rtl: boolean;
  canCorrect: boolean;
  onCorrect: (issue: DataDeskIssue) => void;
  onClosed: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const close = useMutation({
    mutationFn: (status: "resolved" | "dismissed") =>
      pepitesAdmin.closeIssue(issue.id, status, note.trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pepites-admin", "desk"] });
      onClosed();
    },
    onError: (failure) => setError(describeAdminError(failure, rtl)),
  });
  const message = issueMessage(issue);
  return (
    <aside
      className={cn("grid content-start gap-3 rounded-[14px] p-4", pp.card)}
      data-testid="admin-pepites-issue-panel"
    >
      <p className={cn(pp.monoStrong, pp.muted, "text-[9px] ltr:tracking-[0.1em]")}>
        {rtl ? "تصحيح" : "Corriger"}
      </p>
      <h4 className={cn(pp.heavy, pp.text, "text-[16px]")}>
        {issue.playerName ?? issue.entityId} · {attributeLabel(issue.field, rtl)}
      </h4>
      <p className="text-[12px] text-[#b86e00]">{kindLabel(issue.kind, rtl)}</p>
      {message ? <p className={cn(pp.text, "text-[13px]")}>{message}</p> : null}
      {issue.resolutionNote ? (
        <p className={cn(pp.muted, "text-[12px]")}>
          {rtl ? "ملاحظة: " : "Note : "}
          {issue.resolutionNote}
        </p>
      ) : null}
      {issue.status === "open" && canCorrect ? (
        <>
          {(CORRECTABLE_ATTRIBUTES as readonly string[]).includes(issue.field) ||
          issue.field === "photo" ? (
            <UiButton
              size="sm"
              variant="ink"
              className="justify-self-start"
              onClick={() => onCorrect(issue)}
            >
              {issue.field === "photo"
                ? rtl
                  ? "رفع صورة مرخّصة"
                  : "Déposer une photo licenciée"
                : rtl
                  ? "تصحيح هذا الحقل"
                  : "Corriger ce champ"}
            </UiButton>
          ) : null}
          <UiInput
            label={rtl ? "ملاحظة الإغلاق" : "Note de clôture"}
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <UiButton
              size="sm"
              variant="soft"
              disabled={!note.trim() || close.isPending}
              onClick={() => close.mutate("resolved")}
            >
              {rtl ? "تم الحل" : "Résolu"}
            </UiButton>
            <UiButton
              size="sm"
              variant="soft"
              disabled={!note.trim() || close.isPending}
              onClick={() => close.mutate("dismissed")}
            >
              {rtl ? "استبعاد" : "Écarter"}
            </UiButton>
          </div>
          {error ? <AdminNotice tone="alert">{error}</AdminNotice> : null}
        </>
      ) : null}
    </aside>
  );
}

/* ------------------------------------------------------------ the players */

function PlayerDesk({
  rtl,
  canCorrect,
  selected,
  onSelect,
}: {
  rtl: boolean;
  canCorrect: boolean;
  selected: { id: string; name: string; field?: string } | null;
  onSelect: (player: { id: string; name: string; field?: string } | null) => void;
}) {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const search = useQuery({
    queryKey: KEYS.search(submitted),
    queryFn: () => pepitesAdmin.searchPlayers(submitted),
    enabled: submitted.length >= 2,
  });
  return (
    <section className="grid gap-3" aria-labelledby="admin-pepites-players">
      <AdminSectionHeading id="admin-pepites-players">
        {rtl ? "اللاعبون" : "Joueurs"}
      </AdminSectionHeading>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(text.trim());
        }}
      >
        <UiInput
          label={rtl ? "البحث بالاسم" : "Chercher par nom"}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-w-0 flex-1"
          data-testid="admin-pepites-player-query"
        />
        <UiButton type="submit" size="sm" variant="ink" disabled={text.trim().length < 2}>
          {rtl ? "بحث" : "Chercher"}
        </UiButton>
      </form>
      {search.isError ? (
        <AdminNotice tone="alert">{describeAdminError(search.error, rtl)}</AdminNotice>
      ) : null}
      {search.data ? (
        search.data.length === 0 ? (
          <AdminEmptyState>{rtl ? "لا يوجد لاعب." : "Aucun joueur."}</AdminEmptyState>
        ) : (
          <ul className="grid gap-1" data-testid="admin-pepites-player-results">
            {search.data.map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  onClick={() => onSelect({ id: player.id, name: player.name })}
                  aria-pressed={selected?.id === player.id}
                  className={cn("grid w-full gap-1 p-2 text-start", ADMIN_PANEL_CLASS, ui.focus)}
                >
                  <span className={ui.text.bodyStrong}>
                    {player.name}{" "}
                    {player.team ? <span className={ui.tone.muted}>· {player.team}</span> : null}
                  </span>
                  <PlayerFacts player={player} rtl={rtl} />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
      {selected && canCorrect ? (
        <div className="grid gap-4" data-testid="admin-pepites-player-tools">
          <AttributeForm
            key={`${selected.id}-${selected.field ?? ""}`}
            player={selected}
            rtl={rtl}
          />
          <PhotoUploadForm key={`photo-${selected.id}`} player={selected} rtl={rtl} />
        </div>
      ) : null}
    </section>
  );
}

function PlayerFacts({ player, rtl }: { player: AdminPlayer; rtl: boolean }) {
  const none = "—";
  return (
    <span className={cn(ui.text.meta, ui.tone.muted)}>
      {attributeLabel("date_of_birth", rtl)}: <AdminDatum>{player.dateOfBirth ?? none}</AdminDatum>{" "}
      · {attributeLabel("nationality", rtl)}: <AdminDatum>{player.nationality ?? none}</AdminDatum>{" "}
      · {attributeLabel("preferred_foot", rtl)}:{" "}
      <AdminDatum>{player.preferredFoot ?? none}</AdminDatum> · {attributeLabel("height_cm", rtl)}:{" "}
      <AdminDatum>{player.heightCm ?? none}</AdminDatum> ·{" "}
      {attributeLabel("detailed_position", rtl)}:{" "}
      <AdminDatum>{player.detailedPosition ?? none}</AdminDatum> · {rtl ? "صورة" : "Photo"}:{" "}
      {player.hasPhoto ? (rtl ? "نعم" : "oui") : rtl ? "لا" : "non"}
    </span>
  );
}

const POSITIONS = ["gk", "cb", "lb", "rb", "dm", "cm", "am", "lw", "rw", "cf"] as const;

function AttributeForm({
  player,
  rtl,
}: {
  player: { id: string; name: string; field?: string };
  rtl: boolean;
}) {
  const queryClient = useQueryClient();
  const initial = (CORRECTABLE_ATTRIBUTES as readonly string[]).includes(player.field ?? "")
    ? (player.field as CorrectableAttribute)
    : "date_of_birth";
  const [attribute, setAttribute] = useState<CorrectableAttribute>(initial);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ text: string; alert: boolean } | null>(null);
  const save = useMutation({
    mutationFn: () =>
      pepitesAdmin.correctAttribute(player.id, attribute, value.trim(), note.trim()),
    onSuccess: async () => {
      setMessage({ text: rtl ? "تم التصحيح." : "Correction enregistrée.", alert: false });
      setValue("");
      await queryClient.invalidateQueries({ queryKey: ["pepites-admin", "players"] });
    },
    onError: (error) => setMessage({ text: describeAdminError(error, rtl), alert: true }),
  });
  const field =
    attribute === "date_of_birth" ? (
      <UiInput
        type="date"
        label={attributeLabel(attribute, rtl)}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    ) : attribute === "preferred_foot" ? (
      <UiSelect
        label={attributeLabel(attribute, rtl)}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="—"
        options={[
          { value: "left", label: rtl ? "اليسرى" : "Gauche" },
          { value: "right", label: rtl ? "اليمنى" : "Droit" },
          { value: "both", label: rtl ? "كلتاهما" : "Les deux" },
        ]}
      />
    ) : attribute === "detailed_position" ? (
      <UiSelect
        label={attributeLabel(attribute, rtl)}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="—"
        options={POSITIONS.map((position) => ({ value: position, label: position.toUpperCase() }))}
      />
    ) : attribute === "height_cm" ? (
      <UiInput
        type="number"
        min={140}
        max={215}
        label={`${attributeLabel(attribute, rtl)} (cm)`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    ) : (
      <UiInput
        label={rtl ? "رمز الدولة (حرفان، مثل MA)" : "Code pays (deux lettres, ex. MA)"}
        value={value}
        maxLength={2}
        onChange={(event) => setValue(event.target.value.toUpperCase())}
      />
    );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim() && note.trim().length >= 8 && !save.isPending) save.mutate();
  };
  return (
    <form
      className={cn("grid gap-3 p-3", ADMIN_PANEL_CLASS)}
      onSubmit={submit}
      data-testid="admin-pepites-attribute-form"
    >
      <p className={ui.text.bodyStrong}>
        {rtl ? `تصحيح بيانات ${player.name}` : `Corriger une donnée de ${player.name}`}
      </p>
      <UiSelect
        label={rtl ? "الحقل" : "Champ"}
        value={attribute}
        onChange={(event) => {
          setAttribute(event.target.value as CorrectableAttribute);
          setValue("");
        }}
        options={CORRECTABLE_ATTRIBUTES.map((item) => ({
          value: item,
          label: attributeLabel(item, rtl),
        }))}
      />
      {field}
      <UiTextarea
        label={rtl ? "المصدر (إلزامي)" : "Source (obligatoire)"}
        hint={
          rtl
            ? "8 أحرف على الأقل: من أين تأتي هذه القيمة؟"
            : "8 caractères au moins : d'où vient cette valeur ?"
        }
        value={note}
        maxLength={500}
        rows={2}
        onChange={(event) => setNote(event.target.value)}
      />
      <UiButton
        type="submit"
        size="sm"
        variant="ink"
        disabled={!value.trim() || note.trim().length < 8 || save.isPending}
      >
        {rtl ? "حفظ التصحيح" : "Enregistrer la correction"}
      </UiButton>
      {message ? (
        <AdminNotice
          tone={message.alert ? "alert" : "info"}
          role={message.alert ? "alert" : "status"}
        >
          {message.text}
        </AdminNotice>
      ) : null}
    </form>
  );
}

function PhotoUploadForm({ player, rtl }: { player: { id: string; name: string }; rtl: boolean }) {
  const queryClient = useQueryClient();
  const [photo, setPhoto] = useState<File | null>(null);
  const [document, setDocument] = useState<File | null>(null);
  const [fields, setFields] = useState({
    capturedOn: "",
    signedOn: "",
    signerRole: "player",
    scope: "in_app",
    licenceCode: "botolago_release",
    credit: "",
    copyrightOwner: "",
    expiresOn: "",
  });
  const [message, setMessage] = useState<{ text: string; alert: boolean } | null>(null);
  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.set("playerId", player.id);
      form.set("photo", photo!, photo!.name);
      form.set("document", document!, document!.name);
      for (const [key, value] of Object.entries(fields))
        if (value.trim()) form.set(key, value.trim());
      return pepitesAdmin.uploadPhoto(form);
    },
    onSuccess: async () => {
      setMessage({
        text: rtl
          ? "تم الإرسال. الصورة في انتظار الموافقة."
          : "Envoyé. La photo attend son approbation.",
        alert: false,
      });
      await queryClient.invalidateQueries({ queryKey: ["pepites-admin", "photos"] });
    },
    onError: (error) => setMessage({ text: describeAdminError(error, rtl), alert: true }),
  });
  const set = (key: keyof typeof fields) => (event: { target: { value: string } }) =>
    setFields((current) => ({ ...current, [key]: event.target.value }));
  const ready =
    photo &&
    document &&
    fields.capturedOn &&
    fields.signedOn &&
    fields.credit.trim() &&
    fields.copyrightOwner.trim();
  return (
    <form
      className={cn("grid gap-3 p-3", ADMIN_PANEL_CLASS)}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !upload.isPending) upload.mutate();
      }}
      data-testid="admin-pepites-photo-form"
    >
      <p className={ui.text.bodyStrong}>
        {rtl ? `صورة ${player.name}` : `Photo de ${player.name}`}
      </p>
      <p className={cn(ui.text.meta, ui.tone.muted)}>
        {rtl
          ? "تُحفظ الصورة والإذن الموقّع في مساحة خاصة. لا يظهر أي شيء قبل الموافقة، ويُستعمل الظل ما دامت الصورة غير معتمدة."
          : "La photo et l'autorisation signée vont dans un espace privé. Rien n'est visible avant l'approbation ; la silhouette reste affichée d'ici là."}
      </p>
      <label className="grid gap-1">
        <span className={ADMIN_LABEL_CLASS}>
          {rtl ? "الصورة (JPEG أو PNG أو WebP)" : "Photo (JPEG, PNG ou WebP)"}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
        />
      </label>
      <label className="grid gap-1">
        <span className={ADMIN_LABEL_CLASS}>
          {rtl ? "الإذن الموقّع (PDF أو صورة)" : "Autorisation signée (PDF ou image)"}
        </span>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(event) => setDocument(event.target.files?.[0] ?? null)}
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <UiInput
          type="date"
          label={rtl ? "تاريخ التصوير" : "Date de la prise de vue"}
          value={fields.capturedOn}
          onChange={set("capturedOn")}
        />
        <UiInput
          type="date"
          label={rtl ? "تاريخ التوقيع" : "Date de signature"}
          value={fields.signedOn}
          onChange={set("signedOn")}
        />
        <UiSelect
          label={rtl ? "الموقّع" : "Signataire"}
          value={fields.signerRole}
          onChange={set("signerRole")}
          options={[
            { value: "player", label: rtl ? "اللاعب" : "Le joueur" },
            { value: "guardian", label: rtl ? "الولي (لاعب قاصر)" : "Le tuteur (joueur mineur)" },
          ]}
        />
        <UiSelect
          label={rtl ? "الاستعمال" : "Usage"}
          value={fields.scope}
          onChange={set("scope")}
          options={[
            { value: "in_app", label: rtl ? "داخل التطبيق فقط" : "Dans l'app seulement" },
            {
              value: "in_app_and_social",
              label: rtl ? "التطبيق وصور المشاركة" : "App et images de partage",
            },
          ]}
        />
        <UiSelect
          label={rtl ? "الترخيص" : "Licence"}
          value={fields.licenceCode}
          onChange={set("licenceCode")}
          options={[
            { value: "botolago_release", label: rtl ? "إذن BotolaGO" : "Autorisation BotolaGO" },
            { value: "club_licence", label: rtl ? "ترخيص النادي" : "Licence du club" },
            { value: "agency_licence", label: rtl ? "ترخيص وكالة" : "Licence d'agence" },
          ]}
        />
        <UiInput
          type="date"
          label={rtl ? "ينتهي في (اختياري)" : "Expire le (facultatif)"}
          value={fields.expiresOn}
          onChange={set("expiresOn")}
        />
        <UiInput
          label={rtl ? "حقوق الصورة (الاسم الظاهر)" : "Crédit (affiché)"}
          value={fields.credit}
          maxLength={200}
          onChange={set("credit")}
        />
        <UiInput
          label={rtl ? "مالك الحقوق" : "Titulaire des droits"}
          value={fields.copyrightOwner}
          maxLength={200}
          onChange={set("copyrightOwner")}
        />
      </div>
      <UiButton type="submit" size="sm" variant="ink" disabled={!ready || upload.isPending}>
        {rtl ? "إرسال للمراجعة" : "Envoyer pour approbation"}
      </UiButton>
      {message ? (
        <AdminNotice
          tone={message.alert ? "alert" : "info"}
          role={message.alert ? "alert" : "status"}
        >
          {message.text}
        </AdminNotice>
      ) : null}
    </form>
  );
}

/* ------------------------------------------------------------- the photos */

function PhotoReleases({ rtl, canCorrect }: { rtl: boolean; canCorrect: boolean }) {
  const [status, setStatus] = useState("pending");
  const query = useQuery({
    queryKey: KEYS.photos(status),
    queryFn: () => pepitesAdmin.photoReleases(status),
  });
  const [actionState, dispatchAction] = useReducer(
    destructiveActionReducer,
    IDLE_DESTRUCTIVE_ACTION,
  );
  return (
    <section className="grid gap-3" aria-labelledby="admin-pepites-photos">
      <AdminSectionHeading id="admin-pepites-photos">
        {rtl ? "حقوق الصور" : "Droits des photos"}
      </AdminSectionHeading>
      <AdminFilterChips
        label={rtl ? "الحالة" : "État"}
        value={status}
        onSelect={setStatus}
        data-testid="admin-pepites-photo-status"
        options={[
          { value: "pending", label: rtl ? "في الانتظار" : "En attente" },
          { value: "approved", label: rtl ? "مقبولة" : "Approuvées" },
          { value: "published", label: rtl ? "منشورة" : "Publiées" },
          { value: "rejected", label: rtl ? "مرفوضة" : "Refusées" },
          { value: "revoked", label: rtl ? "مسحوبة" : "Révoquées" },
          { value: "all", label: rtl ? "الكل" : "Toutes" },
        ]}
      />
      {query.isPending ? <AdminSkeletonList rows={2} /> : null}
      {query.isError ? (
        <AdminNotice tone="alert">{describeAdminError(query.error, rtl)}</AdminNotice>
      ) : null}
      {query.data && query.data.length === 0 ? (
        <AdminEmptyState testId="admin-pepites-photos-empty">
          {rtl ? "لا شيء هنا." : "Rien ici."}
        </AdminEmptyState>
      ) : null}
      {query.data && query.data.length > 0 ? (
        <ul className="grid gap-2" data-testid="admin-pepites-photo-list">
          {query.data.map((release) => (
            <ReleaseRow
              key={release.id}
              release={release}
              rtl={rtl}
              canCorrect={canCorrect}
              actionState={actionState}
              dispatchAction={dispatchAction}
            />
          ))}
        </ul>
      ) : null}
      <p className={cn(ui.text.meta, ui.tone.muted)}>
        {rtl
          ? "بعد الموافقة، يُنشئ مسؤول التشغيل النسخة العامة (مهمة الصور) قبل أن تظهر."
          : "Après l'approbation, l'opérateur lance la tâche des photos, qui crée la version publique avant qu'elle n'apparaisse."}
      </p>
    </section>
  );
}

function ReleaseRow({
  release,
  rtl,
  canCorrect,
  actionState,
  dispatchAction,
}: {
  release: PhotoRelease;
  rtl: boolean;
  canCorrect: boolean;
  actionState: Parameters<typeof AdminDestructiveAction>[0]["state"];
  dispatchAction: Parameters<typeof AdminDestructiveAction>[0]["dispatch"];
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pepites-admin", "photos"] }),
    onError: (failure) => setError(describeAdminError(failure, rtl)),
  });
  const run = (action: () => Promise<unknown>) =>
    new Promise<void>((resolve) => act.mutate(action, { onSettled: () => resolve() }));
  return (
    <li
      className={cn("grid gap-2 p-3", ADMIN_PANEL_CLASS)}
      data-testid="admin-pepites-photo-release"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={ui.text.bodyStrong}>{release.playerName}</span>
        <UiBadge
          tone={
            release.status === "published"
              ? "positive"
              : release.status === "pending"
                ? "action"
                : "neutral"
          }
        >
          <AdminDatum mono={false}>{release.status}</AdminDatum>
        </UiBadge>
        <UiBadge tone="outline">
          {release.scope === "in_app_and_social"
            ? rtl
              ? "التطبيق + المشاركة"
              : "App + partage"
            : rtl
              ? "التطبيق فقط"
              : "App seulement"}
        </UiBadge>
        {release.signerRole === "guardian" ? (
          <UiBadge tone="caution">{rtl ? "قاصر" : "Mineur"}</UiBadge>
        ) : null}
        {release.submittedByMe ? (
          <span className={cn(ui.text.meta, ui.tone.muted)}>
            {rtl ? "أرسلتَها أنت" : "Envoyée par vous"}
          </span>
        ) : null}
      </div>
      <p className={cn(ui.text.meta, ui.tone.muted)}>
        {rtl ? "التصوير" : "Prise de vue"} <AdminDatum>{release.capturedOn}</AdminDatum> ·{" "}
        {rtl ? "التوقيع" : "Signature"} <AdminDatum>{release.signedOn}</AdminDatum>
        {release.expiresOn ? (
          <>
            {" "}
            · {rtl ? "ينتهي" : "Expire"} <AdminDatum>{release.expiresOn}</AdminDatum>
          </>
        ) : null}{" "}
        · {release.credit} / {release.copyrightOwner}
      </p>
      {release.problems.length > 0 ? (
        <ul
          className={cn("list-disc ps-5", ui.text.meta, ui.tone.negative)}
          data-testid="admin-pepites-photo-problems"
        >
          {release.problems.map((problem) => (
            <li key={problem}>{problemLabel(problem, rtl)}</li>
          ))}
        </ul>
      ) : null}
      {release.endReason ? (
        <p className={cn(ui.text.meta, ui.tone.muted)}>
          {rtl ? "السبب: " : "Motif : "}
          {release.endReason}
        </p>
      ) : null}
      {canCorrect && release.status === "pending" ? (
        <div className="flex flex-wrap gap-2">
          <UiButton
            size="sm"
            variant="gradient"
            disabled={release.problems.length > 0 || act.isPending}
            onClick={() => void run(() => pepitesAdmin.approvePhoto(release.id))}
            data-testid="admin-pepites-photo-approve"
          >
            {rtl ? "الموافقة" : "Approuver"}
          </UiButton>
          <AdminDestructiveAction
            actionKey={`reject:${release.id}`}
            state={actionState}
            dispatch={dispatchAction}
            minimumReasonLength={8}
            rtl={rtl}
            triggerLabel={rtl ? "رفض" : "Refuser"}
            confirmPrompt={
              rtl
                ? `رفض صورة ${release.playerName}؟`
                : `Refuser la photo de ${release.playerName} ?`
            }
            confirmLabel={rtl ? "تأكيد الرفض" : "Confirmer le refus"}
            onConfirm={(reason) => run(() => pepitesAdmin.rejectPhoto(release.id, reason))}
            triggerTestId="admin-pepites-photo-reject"
          />
        </div>
      ) : null}
      {canCorrect && (release.status === "approved" || release.status === "published") ? (
        <AdminDestructiveAction
          actionKey={`revoke:${release.id}`}
          state={actionState}
          dispatch={dispatchAction}
          minimumReasonLength={8}
          rtl={rtl}
          triggerLabel={rtl ? "سحب الصورة" : "Révoquer la photo"}
          confirmPrompt={
            rtl
              ? `سحب صورة ${release.playerName}؟ تختفي من الموقع ويعود الظل، وتُحذف النسخة العامة.`
              : `Révoquer la photo de ${release.playerName} ? Elle disparaît du site, la silhouette revient et la version publique est supprimée.`
          }
          confirmLabel={rtl ? "تأكيد السحب" : "Confirmer la révocation"}
          onConfirm={(reason) => run(() => pepitesAdmin.revokePhoto(release.id, reason))}
          triggerTestId="admin-pepites-photo-revoke"
        />
      ) : null}
      {error ? <AdminNotice tone="alert">{error}</AdminNotice> : null}
    </li>
  );
}
