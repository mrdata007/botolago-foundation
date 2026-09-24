import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { loadAdminPrizesRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { adminRepositoryContext } from "@/backend/admin/functional-route-helpers";
import type { AdminRouteState } from "@/backend/admin/route-access";
import {
  mapPrizeAdminError,
  SupabasePrizesAdminRepository,
} from "@/backend/prizes/admin-repository";
import {
  PRIZE_ADMIN_REASON_MIN,
  PRIZE_TIERS,
  type AdminPrizeDto,
  type AdminPrizeFlagDto,
  type AdminPrizeSettingsDto,
  type AdminPrizeWinnerDto,
  type AdminPrizeWinnerTransition,
  type PrizeTier,
  type PrizeWinnerCursor,
  type PrizeWinnerStatus,
} from "@/backend/prizes/contracts";
import {
  ADMIN_PANEL_CLASS,
  AdminBadge,
  AdminDatum,
  AdminEmptyState,
  AdminField,
  AdminNotice,
  AdminSectionHeading,
  AdminSkeletonList,
} from "@/components/admin/AdminSurfaces";
import { AdminDestructiveAction } from "@/components/admin/AdminDestructiveAction";
import {
  destructiveActionReducer,
  IDLE_DESTRUCTIVE_ACTION,
  isArmed,
} from "@/components/admin/destructive-action";
import {
  EMPTY_PRIZE_FORM,
  formsAfterSave,
  toPrizeDraft,
  toPrizeForm,
  withSavedPrize,
  withUpdatedWinner,
  type PrizeForm,
} from "@/components/prizes/prize-admin-form";
import {
  fill,
  formatMad,
  periodLabel,
  prizeAdminErrorMessage,
  skipReasonLabel,
  statusLabel,
  tieBreakLabel,
  tierLabel,
} from "@/components/prizes/prize-presentation";
import {
  ui,
  UiButton,
  UiCheckbox,
  UiInput,
  UiSelect,
  UiTabs,
  UiTextarea,
} from "@/components/ui-kit";
import { FailureAwareImage } from "@/components/common/FailureAwareImage";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/prizes")({
  ssr: false,
  loader: () => loadAdminPrizesRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminPrizesRoute,
});

type Authorized = Extract<AdminRouteState, { state: "authorized" }>;
type Tab = "winners" | "catalog" | "flags";
type Notice = { tone: "info" | "alert"; text: string } | null;
type Translate = ReturnType<typeof useI18n>["t"];

/**
 * The prize console: who won and what happens to them, the catalog the public
 * page shows, and the accounts excluded from prizes.
 *
 * Every write names its object and asks for its own motive in a confirm step
 * (`AdminDestructiveAction`, keyed per row); the motive is the audit reason the
 * database stores. The database re-checks `prizes.manage`, MFA and recent
 * authentication on every call, and enforces the status order (paid only after
 * verified) -- this page only decides what to offer.
 */
function AdminPrizesRoute() {
  const access = Route.useLoaderData();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("winners");
  const [notice, setNotice] = useState<Notice>(null);
  const repository = useMemo(() => new SupabasePrizesAdminRepository(), []);

  return (
    <AdminFunctionalRoute
      access={access}
      title={t("prizes.admin.title")}
      description={t("prizes.admin.description")}
      testId="admin-prizes"
    >
      {access.state === "authorized" && (
        <div className="grid gap-5">
          <UiTabs<Tab>
            value={tab}
            onChange={(next) => {
              setTab(next);
              setNotice(null);
            }}
            label={t("prizes.admin.tabs_label")}
            idBase="admin-prizes"
            options={[
              {
                value: "winners",
                label: t("prizes.admin.tab.winners"),
                panelId: "admin-prizes-panel-winners",
              },
              {
                value: "catalog",
                label: t("prizes.admin.tab.catalog"),
                panelId: "admin-prizes-panel-catalog",
              },
              {
                value: "flags",
                label: t("prizes.admin.tab.flags"),
                panelId: "admin-prizes-panel-flags",
              },
            ]}
          />
          {notice && (
            <AdminNotice
              tone={notice.tone}
              role={notice.tone === "alert" ? "alert" : "status"}
              testId="admin-prizes-message"
            >
              {notice.text}
            </AdminNotice>
          )}
          <section
            role="tabpanel"
            id={`admin-prizes-panel-${tab}`}
            aria-labelledby={`admin-prizes-tab-${tab}`}
          >
            {tab === "winners" && (
              <WinnersPanel access={access} repository={repository} onNotice={setNotice} />
            )}
            {tab === "catalog" && (
              <CatalogPanel access={access} repository={repository} onNotice={setNotice} />
            )}
            {tab === "flags" && (
              <FlagsPanel access={access} repository={repository} onNotice={setNotice} />
            )}
          </section>
        </div>
      )}
    </AdminFunctionalRoute>
  );
}

interface PanelProps {
  access: Authorized;
  repository: SupabasePrizesAdminRepository;
  onNotice: (notice: Notice) => void;
}

/** A refusal as a sentence: a named prize refusal, else the console's own code. */
function refusal(t: Translate, error: unknown): string {
  return prizeAdminErrorMessage(t, mapPrizeAdminError(error).code);
}

function formatDate(iso: string | null, lang: "fr" | "ar"): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(lang === "ar" ? "ar-MA" : "fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusTone(status: PrizeWinnerStatus) {
  if (status === "paid") return "positive" as const;
  if (status === "pending" || status === "verified") return "warning" as const;
  if (status === "forfeited") return "danger" as const;
  return "neutral" as const;
}

// ---------------------------------------------------------------------------
// Winners
// ---------------------------------------------------------------------------

const STATUS_FILTERS = ["all", "pending", "verified", "paid", "forfeited", "overridden"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function WinnersPanel({ access, repository, onNotice }: PanelProps) {
  const { t, lang } = useI18n();
  const rtl = lang === "ar";
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [items, setItems] = useState<AdminPrizeWinnerDto[] | null>(null);
  const [cursor, setCursor] = useState<PrizeWinnerCursor | null>(null);
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  /** One armed action at a time, each with the motive typed for that row. */
  const [action, dispatch] = useReducer(destructiveActionReducer, IDLE_DESTRUCTIVE_ACTION);

  const load = useCallback(
    async (after: PrizeWinnerCursor | null) => {
      try {
        const page = await repository.listWinners(
          filter === "all" ? null : filter,
          after,
          25,
          adminRepositoryContext(access),
        );
        setItems((current) => (after && current ? [...current, ...page.items] : page.items));
        setCursor(page.nextCursor);
      } catch (error) {
        setItems((current) => current ?? []);
        onNotice({
          tone: "alert",
          text: fill(t("prizes.admin.loading_failed"), { code: mapPrizeAdminError(error).code }),
        });
      }
    },
    [access, filter, onNotice, repository, t],
  );

  useEffect(() => {
    setItems(null);
    void load(null);
  }, [load]);

  const replaceRow = (updated: AdminPrizeWinnerDto) =>
    setItems((current) => (current ? withUpdatedWinner(current, updated, filter) : current));

  const changeStatus = async (
    winner: AdminPrizeWinnerDto,
    status: AdminPrizeWinnerTransition,
    note: string,
  ) => {
    onNotice(null);
    try {
      replaceRow(
        await repository.setWinnerStatus(
          winner.id,
          status,
          note,
          crypto.randomUUID(),
          adminRepositoryContext(access),
        ),
      );
      onNotice({ tone: "info", text: t("prizes.admin.saved") });
    } catch (error) {
      onNotice({ tone: "alert", text: refusal(t, error) });
    }
  };

  const replaceWinner = async (winner: AdminPrizeWinnerDto, reason: string) => {
    onNotice(null);
    const username = (replacements[winner.id] ?? "").trim();
    if (!username) {
      onNotice({ tone: "alert", text: t("prizes.admin.override_username_missing") });
      return;
    }
    try {
      await repository.overrideWinner(
        winner.id,
        username,
        reason,
        crypto.randomUUID(),
        adminRepositoryContext(access),
      );
      onNotice({ tone: "info", text: t("prizes.admin.saved") });
      await load(null);
    } catch (error) {
      onNotice({ tone: "alert", text: refusal(t, error) });
    }
  };

  const excludeAccount = async (winner: AdminPrizeWinnerDto, reason: string) => {
    onNotice(null);
    try {
      await repository.setFlag(
        { userId: winner.userId },
        true,
        reason,
        crypto.randomUUID(),
        adminRepositoryContext(access),
      );
      onNotice({ tone: "info", text: t("prizes.admin.saved") });
      await load(null);
    } catch (error) {
      onNotice({ tone: "alert", text: refusal(t, error) });
    }
  };

  const saveNote = async (winner: AdminPrizeWinnerDto) => {
    const note = (notes[winner.id] ?? "").trim();
    if (note.length < PRIZE_ADMIN_REASON_MIN) return;
    onNotice(null);
    setSavingNote(winner.id);
    try {
      replaceRow(
        await repository.addWinnerNote(
          winner.id,
          note,
          crypto.randomUUID(),
          adminRepositoryContext(access),
        ),
      );
      setNotes((current) => ({ ...current, [winner.id]: "" }));
      onNotice({ tone: "info", text: t("prizes.admin.saved") });
    } catch (error) {
      onNotice({ tone: "alert", text: refusal(t, error) });
    } finally {
      setSavingNote(null);
    }
  };

  return (
    <div className="grid gap-4">
      <UiSelect
        label={t("prizes.admin.filter_label")}
        value={filter}
        onChange={(event) => setFilter(event.target.value as StatusFilter)}
        className="sm:max-w-xs"
        data-testid="admin-prizes-filter"
      >
        <option value="all">{t("prizes.admin.filter.all")}</option>
        <option value="pending">{t("prizes.status.pending")}</option>
        <option value="verified">{t("prizes.status.verified")}</option>
        <option value="paid">{t("prizes.status.paid")}</option>
        <option value="forfeited">{t("prizes.status.forfeited")}</option>
        <option value="overridden">{t("prizes.status.overridden")}</option>
      </UiSelect>

      {items === null && <AdminSkeletonList rows={3} testId="admin-prizes-winners-loading" />}
      {items?.length === 0 && (
        <AdminEmptyState testId="admin-prizes-winners-empty">
          {t("prizes.admin.winners.empty")}
        </AdminEmptyState>
      )}

      {items && items.length > 0 && (
        <ol className="grid gap-3">
          {items.map((winner) => {
            const team = winner.teamName;
            const account = winner.username ?? winner.displayName ?? winner.teamName;
            const open = winner.status === "pending" || winner.status === "verified";
            return (
              <li
                key={winner.id}
                className={cn(ADMIN_PANEL_CLASS, "grid gap-3 p-4")}
                data-testid="admin-prize-winner"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn(ui.text.bodyStrong, ui.tone.default)}>
                    {tierLabel(t, winner.tier)} · {periodLabel(t, winner)}
                  </span>
                  <AdminBadge tone={statusTone(winner.status)}>
                    {statusLabel(t, winner.status)}
                  </AdminBadge>
                  {winner.flagged && (
                    <AdminBadge tone="danger">{t("prizes.admin.flagged_badge")}</AdminBadge>
                  )}
                </div>

                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <AdminField label={t("prizes.admin.label.team")}>{team}</AdminField>
                  <AdminField label={t("prizes.admin.label.account")}>
                    <AdminDatum>{winner.username ?? "—"}</AdminDatum>
                    {winner.displayName ? ` · ${winner.displayName}` : null}
                  </AdminField>
                  <AdminField label={t("prizes.admin.label.email")}>
                    <AdminDatum>{winner.email ?? "—"}</AdminDatum>
                  </AdminField>
                  <AdminField label={t("prizes.admin.label.points")}>
                    <AdminDatum>{winner.points}</AdminDatum>
                  </AdminField>
                  <AdminField label={t("prizes.admin.label.transfers")}>
                    <AdminDatum>{winner.transfersInPeriod}</AdminDatum>
                  </AdminField>
                  <AdminField label={t("prizes.admin.label.tie_break")}>
                    {tieBreakLabel(t, winner.tieBreak)}
                  </AdminField>
                  <AdminField label={t("prizes.admin.label.prize")}>
                    {winner.prizeNameFr}
                    {winner.prizeValueMad !== null
                      ? ` · ${formatMad(t, winner.prizeValueMad, lang)}`
                      : null}
                  </AdminField>
                  {winner.runnerUpTeamName && (
                    <AdminField label={t("prizes.admin.label.runner_up")}>
                      {winner.runnerUpTeamName}
                      {winner.runnerUpUsername ? (
                        <>
                          {" · "}
                          <AdminDatum>{winner.runnerUpUsername}</AdminDatum>
                        </>
                      ) : null}
                    </AdminField>
                  )}
                  {winner.leagueName && (
                    <AdminField label={t("prizes.admin.label.league")}>
                      {winner.leagueName}
                    </AdminField>
                  )}
                  {winner.overrideReason && (
                    <AdminField label={t("prizes.admin.label.override_reason")}>
                      {winner.overrideReason}
                    </AdminField>
                  )}
                </dl>

                {winner.skipped.length > 0 && (
                  <div>
                    <p className={cn(ui.text.label, ui.tone.muted)}>
                      {t("prizes.admin.label.skipped")}
                    </p>
                    <ul className={cn("mt-1 grid gap-1", ui.text.meta, ui.tone.default)}>
                      {winner.skipped.map((skip) => (
                        <li key={`${skip.teamName}-${skip.points}-${skip.reason}`}>
                          {skip.teamName}
                          {skip.username ? (
                            <>
                              {" · "}
                              <AdminDatum>{skip.username}</AdminDatum>
                            </>
                          ) : null}
                          {" · "}
                          {fill(t("prizes.points"), { points: skip.points })}
                          {" · "}
                          {skipReasonLabel(t, skip.reason)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {winner.verificationNotes && (
                  <div>
                    <p className={cn(ui.text.label, ui.tone.muted)}>
                      {t("prizes.admin.label.notes")}
                    </p>
                    <p
                      className={cn(
                        "mt-1 whitespace-pre-wrap break-words",
                        ui.text.meta,
                        ui.tone.default,
                      )}
                    >
                      {winner.verificationNotes}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {winner.status === "pending" && (
                    <AdminDestructiveAction
                      actionKey={`verify:${winner.id}`}
                      state={action}
                      dispatch={dispatch}
                      minimumReasonLength={PRIZE_ADMIN_REASON_MIN}
                      rtl={rtl}
                      tone="primary"
                      triggerLabel={t("prizes.admin.verify")}
                      confirmPrompt={fill(t("prizes.admin.verify_prompt"), { team })}
                      confirmLabel={t("prizes.admin.verify_confirm")}
                      onConfirm={(note) => changeStatus(winner, "verified", note)}
                      testId="admin-prize-verify"
                    />
                  )}
                  {winner.status === "verified" && (
                    <AdminDestructiveAction
                      actionKey={`pay:${winner.id}`}
                      state={action}
                      dispatch={dispatch}
                      minimumReasonLength={PRIZE_ADMIN_REASON_MIN}
                      rtl={rtl}
                      tone="primary"
                      triggerLabel={t("prizes.admin.pay")}
                      confirmPrompt={fill(t("prizes.admin.pay_prompt"), { team })}
                      confirmLabel={t("prizes.admin.pay_confirm")}
                      onConfirm={(note) => changeStatus(winner, "paid", note)}
                      testId="admin-prize-pay"
                    />
                  )}
                  {open && (
                    <AdminDestructiveAction
                      actionKey={`forfeit:${winner.id}`}
                      state={action}
                      dispatch={dispatch}
                      minimumReasonLength={PRIZE_ADMIN_REASON_MIN}
                      rtl={rtl}
                      triggerLabel={t("prizes.admin.forfeit")}
                      confirmPrompt={fill(t("prizes.admin.forfeit_prompt"), { team })}
                      confirmLabel={t("prizes.admin.forfeit_confirm")}
                      onConfirm={(note) => changeStatus(winner, "forfeited", note)}
                      testId="admin-prize-forfeit"
                    />
                  )}
                  {(open || winner.status === "forfeited") &&
                    isArmed(action, `override:${winner.id}`) && (
                      <UiInput
                        label={t("prizes.admin.override_username")}
                        hint={
                          winner.runnerUpUsername
                            ? fill(t("prizes.admin.override_runner_up"), {
                                username: winner.runnerUpUsername,
                              })
                            : undefined
                        }
                        value={replacements[winner.id] ?? ""}
                        onChange={(event) =>
                          setReplacements((current) => ({
                            ...current,
                            [winner.id]: event.target.value,
                          }))
                        }
                        dir="ltr"
                        autoComplete="off"
                        className="w-full"
                        data-testid="admin-prize-override-username"
                      />
                    )}
                  {(open || winner.status === "forfeited") && (
                    <AdminDestructiveAction
                      actionKey={`override:${winner.id}`}
                      state={action}
                      dispatch={dispatch}
                      minimumReasonLength={PRIZE_ADMIN_REASON_MIN}
                      rtl={rtl}
                      triggerLabel={t("prizes.admin.override")}
                      confirmPrompt={fill(t("prizes.admin.override_prompt"), { team })}
                      confirmLabel={t("prizes.admin.override_confirm")}
                      onConfirm={(reason) => replaceWinner(winner, reason)}
                      testId="admin-prize-override"
                    />
                  )}
                  {!winner.flagged && winner.status !== "overridden" && (
                    <AdminDestructiveAction
                      actionKey={`flag-winner:${winner.id}`}
                      state={action}
                      dispatch={dispatch}
                      minimumReasonLength={PRIZE_ADMIN_REASON_MIN}
                      rtl={rtl}
                      triggerLabel={t("prizes.admin.flag")}
                      confirmPrompt={fill(t("prizes.admin.flag_prompt"), { account })}
                      confirmLabel={t("prizes.admin.flag_confirm")}
                      onConfirm={(reason) => excludeAccount(winner, reason)}
                      testId="admin-prize-flag"
                    />
                  )}
                </div>

                <div className="grid gap-2">
                  <UiTextarea
                    label={t("prizes.admin.note_label")}
                    hint={t("prizes.admin.note_hint")}
                    value={notes[winner.id] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [winner.id]: event.target.value }))
                    }
                    maxLength={500}
                    rows={2}
                    data-testid="admin-prize-note"
                  />
                  <div>
                    <UiButton
                      size="sm"
                      variant="outline"
                      className="w-full sm:w-auto"
                      disabled={
                        savingNote !== null ||
                        (notes[winner.id] ?? "").trim().length < PRIZE_ADMIN_REASON_MIN
                      }
                      onClick={() => void saveNote(winner)}
                      data-testid="admin-prize-note-save"
                    >
                      {t("prizes.admin.note_save")}
                    </UiButton>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {cursor && (
        <div>
          <UiButton
            size="sm"
            variant="outline"
            onClick={() => void load(cursor)}
            data-testid="admin-prizes-winners-more"
          >
            {t("prizes.admin.more")}
          </UiButton>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Catalog and season settings
// ---------------------------------------------------------------------------

function CatalogPanel({ access, repository, onNotice }: PanelProps) {
  const { t, lang } = useI18n();
  const rtl = lang === "ar";
  const [prizes, setPrizes] = useState<AdminPrizeDto[] | null>(null);
  const [forms, setForms] = useState<Record<string, PrizeForm>>({});
  const [settings, setSettings] = useState<AdminPrizeSettingsDto | null>(null);
  const [settingsForm, setSettingsForm] = useState({ gameweekCount: "", miniLeagueMinMembers: "" });
  const [action, dispatch] = useReducer(destructiveActionReducer, IDLE_DESTRUCTIVE_ACTION);

  const load = useCallback(async () => {
    const context = adminRepositoryContext(access);
    try {
      const catalog = await repository.listPrizes(context);
      setPrizes(catalog);
      setForms(
        Object.fromEntries([
          ...catalog.map((prize) => [prize.id, toPrizeForm(prize)] as const),
          ["new", EMPTY_PRIZE_FORM] as const,
        ]),
      );
    } catch (error) {
      setPrizes((current) => current ?? []);
      onNotice({
        tone: "alert",
        text: fill(t("prizes.admin.loading_failed"), { code: mapPrizeAdminError(error).code }),
      });
    }
    try {
      const season = await repository.getSettings(null, context);
      setSettings(season);
      setSettingsForm({
        gameweekCount: String(season.gameweekCount),
        miniLeagueMinMembers: String(season.miniLeagueMinMembers),
      });
    } catch (error) {
      onNotice({
        tone: "alert",
        text: fill(t("prizes.admin.loading_failed"), { code: mapPrizeAdminError(error).code }),
      });
    }
  }, [access, onNotice, repository, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (key: string, patch: Partial<PrizeForm>) =>
    setForms((current) => ({
      ...current,
      [key]: { ...(current[key] ?? EMPTY_PRIZE_FORM), ...patch },
    }));

  const savePrize = async (key: string, reason: string) => {
    const form = forms[key];
    if (!form) return;
    onNotice(null);
    try {
      const saved = await repository.savePrize(
        toPrizeDraft(form),
        reason,
        crypto.randomUUID(),
        adminRepositoryContext(access),
      );
      setPrizes((current) => withSavedPrize(current ?? [], saved));
      setForms((current) => formsAfterSave(current, key, saved));
      onNotice({ tone: "info", text: t("prizes.admin.saved") });
    } catch (error) {
      onNotice({ tone: "alert", text: refusal(t, error) });
    }
  };

  const saveSettings = async (reason: string) => {
    if (!settings) return;
    onNotice(null);
    try {
      const saved = await repository.saveSettings(
        {
          seasonId: settings.seasonId,
          gameweekCount: Number(settingsForm.gameweekCount),
          miniLeagueMinMembers: Number(settingsForm.miniLeagueMinMembers),
        },
        reason,
        crypto.randomUUID(),
        adminRepositoryContext(access),
      );
      setSettings(saved);
      onNotice({ tone: "info", text: t("prizes.admin.saved") });
    } catch (error) {
      onNotice({ tone: "alert", text: refusal(t, error) });
    }
  };

  const settingsValid =
    /^\d{1,4}$/.test(settingsForm.gameweekCount) &&
    /^\d{1,6}$/.test(settingsForm.miniLeagueMinMembers);

  return (
    <div className="grid gap-6">
      <section aria-labelledby="admin-prizes-settings-heading" className="grid gap-3">
        <AdminSectionHeading id="admin-prizes-settings-heading">
          {t("prizes.admin.settings.title")}
        </AdminSectionHeading>
        {!settings && <AdminSkeletonList rows={1} testId="admin-prizes-settings-loading" />}
        {settings && (
          <div
            className={cn(ADMIN_PANEL_CLASS, "grid gap-4 p-4")}
            data-testid="admin-prizes-settings"
          >
            <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
              {fill(t("prizes.admin.settings.season"), { season: settings.seasonName })}
            </p>
            {settings.isDefault && (
              <p className={cn(ui.text.meta, ui.tone.muted)}>
                {t("prizes.admin.settings.default_note")}
              </p>
            )}
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {fill(t("prizes.admin.settings.progress"), {
                finalized: settings.lastFinalizedGameweek ?? "—",
                evaluated: settings.lastEvaluatedGameweek ?? "—",
              })}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <UiInput
                label={t("prizes.admin.settings.gameweeks")}
                inputMode="numeric"
                value={settingsForm.gameweekCount}
                onChange={(event) =>
                  setSettingsForm((current) => ({ ...current, gameweekCount: event.target.value }))
                }
                data-testid="admin-prizes-settings-gameweeks"
              />
              <UiInput
                label={t("prizes.admin.settings.min_members")}
                inputMode="numeric"
                value={settingsForm.miniLeagueMinMembers}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    miniLeagueMinMembers: event.target.value,
                  }))
                }
                data-testid="admin-prizes-settings-min-members"
              />
            </div>
            <div>
              <p className={cn(ui.text.label, ui.tone.muted)}>
                {t("prizes.admin.settings.blocks")}
              </p>
              <p className={cn("mt-1", ui.text.meta, ui.tone.default)}>
                {settings.blocks
                  .map((block) =>
                    periodLabel(t, {
                      tier: "monthly",
                      firstGameweekNumber: block.firstGameweekNumber,
                      lastGameweekNumber: block.lastGameweekNumber,
                      seasonName: settings.seasonName,
                    }),
                  )
                  .join(" · ")}
              </p>
            </div>
            <AdminDestructiveAction
              actionKey="settings:save"
              state={action}
              dispatch={dispatch}
              minimumReasonLength={PRIZE_ADMIN_REASON_MIN}
              rtl={rtl}
              tone="primary"
              disabled={!settingsValid}
              triggerLabel={t("prizes.admin.settings.save")}
              confirmPrompt={fill(t("prizes.admin.settings.save_prompt"), {
                count: settingsForm.gameweekCount,
                members: settingsForm.miniLeagueMinMembers,
              })}
              confirmLabel={t("prizes.admin.settings.save_confirm")}
              onConfirm={(reason) => saveSettings(reason)}
              testId="admin-prizes-settings-save"
            />
          </div>
        )}
      </section>

      <section aria-labelledby="admin-prizes-catalog-heading" className="grid gap-3">
        <AdminSectionHeading id="admin-prizes-catalog-heading">
          {t("prizes.admin.catalog.title")}
        </AdminSectionHeading>
        {prizes === null && <AdminSkeletonList rows={3} testId="admin-prizes-catalog-loading" />}
        {prizes && (
          <ol className="grid gap-3">
            {[...prizes.map((prize) => prize.id), "new"].map((key) => {
              const form = forms[key];
              if (!form) return null;
              const saved = prizes.find((prize) => prize.id === key) ?? null;
              return (
                <li key={key} className={cn(ADMIN_PANEL_CLASS, "grid gap-3 p-4")}>
                  <PrizeEditor form={form} saved={saved} onChange={(patch) => update(key, patch)} />
                  <AdminDestructiveAction
                    actionKey={`save-prize:${key}`}
                    state={action}
                    dispatch={dispatch}
                    minimumReasonLength={PRIZE_ADMIN_REASON_MIN}
                    rtl={rtl}
                    tone="primary"
                    disabled={form.nameFr.trim().length < 2}
                    triggerLabel={
                      saved ? t("prizes.admin.catalog.save") : t("prizes.admin.catalog.new")
                    }
                    confirmPrompt={fill(t("prizes.admin.catalog.save_prompt"), {
                      name: form.nameFr.trim(),
                    })}
                    confirmLabel={t("prizes.admin.catalog.save_confirm")}
                    onConfirm={(reason) => savePrize(key, reason)}
                    testId="admin-prize-save"
                  />
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function PrizeEditor({
  form,
  saved,
  onChange,
}: {
  form: PrizeForm;
  saved: AdminPrizeDto | null;
  onChange: (patch: Partial<PrizeForm>) => void;
}) {
  const { t, lang } = useI18n();
  const merch = form.tier === "mini_league";
  return (
    <div className="grid gap-3" data-testid="admin-prize-editor">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn(ui.text.bodyStrong, ui.tone.default)}>
          {saved ? tierLabel(t, saved.tier) : t("prizes.admin.catalog.new")}
        </span>
        {saved && (
          <AdminBadge tone={saved.active ? "positive" : "neutral"}>
            {saved.active ? t("prizes.admin.catalog.active") : t("prizes.admin.catalog.inactive")}
          </AdminBadge>
        )}
        {saved && saved.estimatedValueMad !== null && (
          <span className={cn(ui.text.meta, ui.tone.muted)}>
            {formatMad(t, saved.estimatedValueMad, lang)}
          </span>
        )}
        {saved && saved.estimatedValueMad === null && (
          <span className={cn(ui.text.meta, ui.tone.muted)}>
            {t("prizes.admin.catalog.no_value")}
          </span>
        )}
      </div>
      {!saved && (
        <UiSelect
          label={t("prizes.admin.field.tier")}
          value={form.tier}
          onChange={(event) => onChange({ tier: event.target.value as PrizeTier })}
          options={PRIZE_TIERS.map((tier) => ({ value: tier, label: tierLabel(t, tier) }))}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <UiInput
          label={t("prizes.admin.field.name_fr")}
          value={form.nameFr}
          maxLength={120}
          onChange={(event) => onChange({ nameFr: event.target.value })}
        />
        <UiInput
          label={t("prizes.admin.field.name_ar")}
          value={form.nameAr}
          maxLength={120}
          dir="rtl"
          onChange={(event) => onChange({ nameAr: event.target.value })}
        />
        <UiTextarea
          label={t("prizes.admin.field.description_fr")}
          value={form.descriptionFr}
          maxLength={1000}
          rows={3}
          onChange={(event) => onChange({ descriptionFr: event.target.value })}
        />
        <UiTextarea
          label={t("prizes.admin.field.description_ar")}
          value={form.descriptionAr}
          maxLength={1000}
          rows={3}
          dir="rtl"
          onChange={(event) => onChange({ descriptionAr: event.target.value })}
        />
        {!merch && (
          <UiInput
            label={t("prizes.admin.field.value")}
            inputMode="numeric"
            value={form.value}
            onChange={(event) => onChange({ value: event.target.value })}
          />
        )}
        <UiInput
          label={t("prizes.admin.field.sponsor")}
          value={form.sponsorName}
          maxLength={120}
          onChange={(event) => onChange({ sponsorName: event.target.value })}
        />
        <UiInput
          label={t("prizes.admin.field.sponsor_logo")}
          value={form.sponsorLogoUrl}
          inputMode="url"
          dir="ltr"
          onChange={(event) => onChange({ sponsorLogoUrl: event.target.value })}
        />
        <UiInput
          label={t("prizes.admin.field.image")}
          value={form.imageUrl}
          inputMode="url"
          dir="ltr"
          onChange={(event) => onChange({ imageUrl: event.target.value })}
        />
      </div>
      <UiCheckbox
        label={t("prizes.admin.field.active")}
        checked={form.active}
        onChange={(event) => onChange({ active: event.target.checked })}
      />
      <PreviewStrip urls={[form.sponsorLogoUrl, form.imageUrl]} />
    </div>
  );
}

/**
 * Thumbnails of the https images an editor has entered. A link that does not
 * load draws nothing -- the same failure behaviour as the public page, where a
 * broken image leaves the card without one rather than showing a broken box.
 */
function PreviewStrip({ urls }: { urls: string[] }) {
  const shown = urls.filter((url) => /^https:\/\/\S+$/.test(url.trim()));
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {shown.map((url) => (
        <FailureAwareImage
          key={url}
          src={url.trim()}
          alt=""
          referrerPolicy="no-referrer"
          className={cn("h-16 w-auto max-w-40 object-contain", ui.radius.control, ui.rule.all)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flagged accounts
// ---------------------------------------------------------------------------

function FlagsPanel({ access, repository, onNotice }: PanelProps) {
  const { t, lang } = useI18n();
  const rtl = lang === "ar";
  const [flags, setFlags] = useState<AdminPrizeFlagDto[] | null>(null);
  const [username, setUsername] = useState("");
  const [action, dispatch] = useReducer(destructiveActionReducer, IDLE_DESTRUCTIVE_ACTION);

  const load = useCallback(async () => {
    try {
      setFlags(await repository.listFlags(adminRepositoryContext(access)));
    } catch (error) {
      setFlags((current) => current ?? []);
      onNotice({
        tone: "alert",
        text: fill(t("prizes.admin.loading_failed"), { code: mapPrizeAdminError(error).code }),
      });
    }
  }, [access, onNotice, repository, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const setFlag = async (
    target: { userId: string } | { username: string },
    flagged: boolean,
    reason: string,
  ) => {
    onNotice(null);
    try {
      await repository.setFlag(
        target,
        flagged,
        reason,
        crypto.randomUUID(),
        adminRepositoryContext(access),
      );
      if ("username" in target) setUsername("");
      onNotice({ tone: "info", text: t("prizes.admin.saved") });
      await load();
    } catch (error) {
      onNotice({ tone: "alert", text: refusal(t, error) });
    }
  };

  const name = (flag: AdminPrizeFlagDto): ReactNode =>
    flag.username ? <AdminDatum>{flag.username}</AdminDatum> : (flag.displayName ?? "—");

  return (
    <div className="grid gap-6">
      <section aria-labelledby="admin-prizes-flag-add-heading" className="grid gap-3">
        <AdminSectionHeading id="admin-prizes-flag-add-heading">
          {t("prizes.admin.flags.add")}
        </AdminSectionHeading>
        <div className={cn(ADMIN_PANEL_CLASS, "grid gap-3 p-4")}>
          <UiInput
            label={t("prizes.admin.flags.username")}
            value={username}
            dir="ltr"
            autoComplete="off"
            onChange={(event) => setUsername(event.target.value)}
            data-testid="admin-prizes-flag-username"
          />
          <AdminDestructiveAction
            actionKey="flag:new"
            state={action}
            dispatch={dispatch}
            minimumReasonLength={PRIZE_ADMIN_REASON_MIN}
            rtl={rtl}
            disabled={username.trim().length < 3}
            triggerLabel={t("prizes.admin.flags.add")}
            confirmPrompt={fill(t("prizes.admin.flag_prompt"), { account: username.trim() })}
            confirmLabel={t("prizes.admin.flag_confirm")}
            onConfirm={(reason) => setFlag({ username: username.trim() }, true, reason)}
            testId="admin-prizes-flag-add"
          />
        </div>
      </section>

      <section aria-labelledby="admin-prizes-flags-heading" className="grid gap-3">
        <AdminSectionHeading id="admin-prizes-flags-heading">
          {t("prizes.admin.flags.title")}
        </AdminSectionHeading>
        {flags === null && <AdminSkeletonList rows={2} testId="admin-prizes-flags-loading" />}
        {flags?.length === 0 && (
          <AdminEmptyState testId="admin-prizes-flags-empty">
            {t("prizes.admin.flags.empty")}
          </AdminEmptyState>
        )}
        {flags && flags.length > 0 && (
          <ol className="grid gap-3">
            {flags.map((flag) => (
              <li
                key={flag.userId}
                className={cn(ADMIN_PANEL_CLASS, "grid gap-2 p-4")}
                data-testid="admin-prizes-flag"
              >
                <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
                  {name(flag)}
                  {flag.username && flag.displayName ? ` · ${flag.displayName}` : null}
                </p>
                <p className={cn(ui.text.meta, ui.tone.muted)}>
                  {fill(t("prizes.admin.flags.since"), { date: formatDate(flag.flaggedAt, lang) })}
                </p>
                <p className={cn(ui.text.secondary, ui.tone.default)}>{flag.reason}</p>
                <AdminDestructiveAction
                  actionKey={`unflag:${flag.userId}`}
                  state={action}
                  dispatch={dispatch}
                  minimumReasonLength={PRIZE_ADMIN_REASON_MIN}
                  rtl={rtl}
                  tone="primary"
                  triggerLabel={t("prizes.admin.flags.remove")}
                  confirmPrompt={fill(t("prizes.admin.flags.remove_prompt"), {
                    account: flag.username ?? flag.displayName ?? "—",
                  })}
                  confirmLabel={t("prizes.admin.flags.remove_confirm")}
                  onConfirm={(reason) => setFlag({ userId: flag.userId }, false, reason)}
                  testId="admin-prizes-unflag"
                />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
