import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleHelp,
  Flag,
  List,
  Loader2,
  Map,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { ClubCrest } from "@/components/common/ClubCrest";
import { DeadlineCountdown } from "@/components/common/DeadlineCountdown";
import { AtlasCreateShell, AtlasStickyAction } from "@/components/fantasy/AtlasCreateShell";
import { useAtlasCreate } from "@/components/fantasy/AtlasCreateProvider";
import { AtlasDraftSquad, type AtlasSquadView } from "@/components/fantasy/AtlasDraftSquad";
import { PlayerStatusBadge } from "@/components/fantasy/PlayerStatusBadge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import {
  draftPurchasePrices,
  draftToSquad,
  isFormationSupported,
  setCaptain,
  setFormation,
  swapSlots,
} from "@/services/fantasy-create-service";
import { fantasyStateStore } from "@/services/fantasy-state";
import { importDecisionService } from "@/services/fantasy-import-decision";
import { classifyRepoError, runOwnedMutation } from "@/services/fantasy-mutation-controller";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { FORMATIONS, type FantasyPlayer, type FormationKey } from "@/types/fantasy";

export const Route = createFileRoute("/fantasy/create/review")({
  component: AtlasReviewPage,
});

function AtlasReviewPage() {
  const { t, tr, lang, dir } = useI18n();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const owned = useFantasyOwned();
  const {
    draft,
    players,
    clubs,
    rules,
    gameweek,
    fixtures,
    fixturesUnavailable,
    summary,
    validation,
    identityValid,
    commit,
    draftKey,
  } = useAtlasCreate();
  const [view, setView] = useState<AtlasSquadView>("pitch");
  const [detailSlot, setDetailSlot] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<TranslationKey | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    maximumFractionDigits: 1,
  });

  if (!identityValid) return <Navigate to="/fantasy/create" replace />;
  if (!rules || !summary || !validation || !gameweek) return null;
  if (!validation.ok) return <Navigate to="/fantasy/create/squad" replace />;

  const supportedFormations = (Object.keys(FORMATIONS) as FormationKey[]).filter((formation) =>
    isFormationSupported(formation, rules),
  );
  const xi = draft.slots.filter((slot) => slot.slot <= 11 && slot.playerId);
  const bench = draft.slots.filter((slot) => slot.slot > 11 && slot.playerId);
  const detailPlayer = players.find(
    (player) => player.id === draft.slots.find((slot) => slot.slot === detailSlot)?.playerId,
  );

  const onSubmit = async () => {
    if (!validation.ok || saving || !draftKey || !user) return;
    setSaving(true);
    setSaveError(null);
    const squad = draftToSquad(draft);
    const purchasePrices = draftPurchasePrices(draft, players);
    try {
      const result = await runOwnedMutation(
        {
          qc,
          scope: owned.scope,
          setMutationStatus: owned.setMutationStatus,
          nextMutationSeq: owned.nextMutationSeq,
          setMutationStatusIfCurrent: owned.setMutationStatusIfCurrent,
          replaceSnapshot: owned.replaceSnapshot,
          invalidateOwned: owned.invalidateOwned,
        },
        {
          action: () =>
            owned.repo.saveTeam({
              teamName: draft.teamName.trim(),
              managerName: user.displayName.trim() || null,
              formation: draft.formation,
              bank: round1(summary.bankRemaining),
              freeTransfers: rules.initialFreeTransfers,
              pendingTransfers: 0,
              squad,
              purchasePrices,
              expectedVersion: owned.snapshot?.version ?? 0,
              currentGameweekId: owned.snapshot?.currentGameweekId ?? null,
              lifecycle: owned.snapshot?.lifecycle ?? fantasyStateStore.read(),
            }),
          args: undefined,
          matchingDraftKey: draftKey,
          savedIdleAfterMs: 2400,
        },
      );
      if (result.ok) {
        importDecisionService.markImported(user.id);
        setAnnouncement(t("fantasy.atlas.create.review.success"));
        toast.success(t("fantasy.atlas.create.review.success"));
        await owned.reload();
        void nav({ to: "/fantasy" });
        return;
      }
      const classified = classifyRepoError(result.error);
      const key: TranslationKey = classified.isConflict
        ? "fantasy.error.version_conflict"
        : classified.isNetwork
          ? "fantasy.error.network"
          : classified.isPermission
            ? "fantasy.error.permission"
            : classified.isValidation
              ? "fantasy.atlas.create.review.invalid"
              : "fantasy.error.import_generic";
      setSaveError(key);
      toast.error(t(key));
    } finally {
      setSaving(false);
    }
  };

  const checks = [
    { label: t("fantasy.atlas.create.review.check.identity"), ok: identityValid },
    { label: t("fantasy.atlas.create.review.check.squad"), ok: summary.filled === summary.total },
    { label: t("fantasy.atlas.create.review.check.budget"), ok: !summary.overBudget },
    { label: t("fantasy.atlas.create.review.check.club"), ok: summary.overClubLimit.length === 0 },
    { label: t("fantasy.atlas.create.review.check.formation"), ok: summary.formationValid },
    {
      label: t("fantasy.atlas.create.review.check.captains"),
      ok: summary.hasCaptain && summary.hasVice && summary.captainViceDistinct,
    },
  ];

  return (
    <AtlasCreateShell
      step={3}
      backTo="/fantasy/create/squad"
      title={t("fantasy.atlas.create.review.title")}
      description={t("fantasy.atlas.create.review.description")}
    >
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)] lg:gap-6">
        <section>
          <div className="rounded-3xl border border-black/5 bg-white/85 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-700">
                  {t("fantasy.atlas.create.review.team_label")}
                </div>
                <h2 className="mt-1 text-xl font-black text-foreground" dir="auto">
                  {draft.teamName}
                </h2>
              </div>
              <DeadlineCountdown iso={gameweek.deadline} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-muted-foreground">
                {t("fantasy.formation")}
              </span>
              {supportedFormations.map((formation) => (
                <button
                  key={formation}
                  type="button"
                  aria-pressed={draft.formation === formation}
                  onClick={() =>
                    commit((current) => setFormation(current, formation, players, rules))
                  }
                  className={cn(
                    "min-h-10 rounded-xl px-3 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                    draft.formation === formation
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700",
                  )}
                >
                  {formation}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView("pitch")}
                aria-pressed={view === "pitch"}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-black",
                  view === "pitch" ? "bg-slate-900 text-white" : "bg-slate-100",
                )}
              >
                <Map className="h-4 w-4" aria-hidden /> {t("fantasy.view.squad")}
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-black",
                  view === "list" ? "bg-slate-900 text-white" : "bg-slate-100",
                )}
              >
                <List className="h-4 w-4" aria-hidden /> {t("fantasy.view.list")}
              </button>
            </div>
          </div>

          <div className="mt-3">
            <AtlasDraftSquad
              draft={draft}
              players={players}
              clubs={clubs}
              view={view}
              onSlot={setDetailSlot}
              readOnly
            />
          </div>

          <section
            className="mt-3 rounded-3xl border border-black/5 bg-white/85 p-4 shadow-sm"
            aria-labelledby="atlas-captain-title"
          >
            <h2 id="atlas-captain-title" className="text-sm font-black text-foreground">
              {t("fantasy.atlas.create.review.captain_title")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("fantasy.atlas.create.review.captain_help")}
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {xi.map((slot) => {
                const player = players.find((candidate) => candidate.id === slot.playerId)!;
                const club = clubs.find((candidate) => candidate.id === player.clubId);
                return (
                  <li
                    key={slot.slot}
                    className="flex items-center gap-2 rounded-2xl border border-black/5 bg-white p-2"
                  >
                    {club && <ClubCrest club={club} size="sm" />}
                    <span className="min-w-0 flex-1 truncate text-xs font-black">
                      {tr(player.name)}
                    </span>
                    <button
                      type="button"
                      onClick={() => commit((current) => setCaptain(current, player.id, false))}
                      aria-pressed={!!slot.isCaptain}
                      className={cn(
                        "grid h-10 min-w-10 place-items-center rounded-xl px-2 text-[10px] font-black",
                        slot.isCaptain ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700",
                      )}
                    >
                      {t("fantasy.captain")}
                    </button>
                    <button
                      type="button"
                      onClick={() => commit((current) => setCaptain(current, player.id, true))}
                      aria-pressed={!!slot.isViceCaptain}
                      className={cn(
                        "grid h-10 min-w-10 place-items-center rounded-xl px-2 text-[10px] font-black",
                        slot.isViceCaptain
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-700",
                      )}
                    >
                      {t("fantasy.vice")}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section
            className="mt-3 rounded-3xl border border-black/5 bg-white/85 p-4 shadow-sm"
            aria-labelledby="atlas-bench-order-title"
          >
            <h2 id="atlas-bench-order-title" className="text-sm font-black text-foreground">
              {t("fantasy.atlas.create.review.bench_order")}
            </h2>
            <ol className="mt-3 grid gap-2 sm:grid-cols-2">
              {bench.map((slot, index) => {
                const player = players.find((candidate) => candidate.id === slot.playerId)!;
                return (
                  <li
                    key={slot.slot}
                    className="flex min-h-12 items-center gap-2 rounded-2xl bg-slate-50 px-3"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-900 text-xs font-black text-white">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-black">
                      {tr(player.name)}
                    </span>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() =>
                        commit((current) => swapSlots(current, slot.slot, bench[index - 1].slot))
                      }
                      aria-label={t("fantasy.atlas.create.review.move_up")}
                      className="grid h-10 w-10 place-items-center rounded-xl bg-white disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={index === bench.length - 1}
                      onClick={() =>
                        commit((current) => swapSlots(current, slot.slot, bench[index + 1].slot))
                      }
                      aria-label={t("fantasy.atlas.create.review.move_down")}
                      className="grid h-10 w-10 place-items-center rounded-xl bg-white disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </section>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <section
            className="rounded-3xl border border-black/5 bg-white/85 p-4 shadow-sm"
            aria-labelledby="atlas-review-checklist"
          >
            <h2
              id="atlas-review-checklist"
              className="flex items-center gap-2 text-sm font-black text-foreground"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden />
              {t("fantasy.atlas.create.review.checklist")}
            </h2>
            <ul className="mt-3 grid gap-2">
              {checks.map((check) => (
                <li
                  key={check.label}
                  className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-950"
                >
                  <Check className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
                  {check.label}
                </li>
              ))}
            </ul>
          </section>

          <section
            className="rounded-3xl border border-black/5 bg-white/85 p-4 shadow-sm"
            aria-labelledby="atlas-fixtures-title"
          >
            <h2
              id="atlas-fixtures-title"
              className="flex items-center gap-2 text-sm font-black text-foreground"
            >
              <Flag className="h-4 w-4 text-blue-700" aria-hidden />
              {t("fantasy.atlas.create.review.fixtures")}
            </h2>
            {fixturesUnavailable ? (
              <p role="status" className="mt-2 text-xs text-muted-foreground">
                {t("fantasy.atlas.create.review.fixtures_unavailable")}
              </p>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {t("fantasy.atlas.create.review.fixtures_count").replace(
                  "{count}",
                  String(fixtures.filter((fixture) => fixture.gameweek === gameweek.number).length),
                )}
              </p>
            )}
          </section>

          <details className="rounded-3xl border border-black/5 bg-white/85 p-4 shadow-sm">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-black">
              <CircleHelp className="h-4 w-4 text-blue-700" aria-hidden />
              {t("fantasy.atlas.create.review.help")}
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("fantasy.atlas.create.review.help_text")}
            </p>
          </details>

          {saveError && (
            <p role="alert" className="rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-800">
              {t(saveError)}
            </p>
          )}
        </aside>
      </div>

      <ReviewPlayerSheet
        player={detailPlayer ?? null}
        open={!!detailPlayer}
        onClose={() => setDetailSlot(null)}
      />

      <AtlasStickyAction
        summary={
          <div className="text-xs text-muted-foreground">
            <strong className="text-foreground">{nf.format(summary.totalCost)}</strong> ·{" "}
            {draft.formation} · {t("fantasy.atlas.create.review.ready")}
          </div>
        }
        action={
          <button
            type="button"
            onClick={onSubmit}
            disabled={!validation.ok || saving}
            className="cta-brand inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden />
            )}
            {saving ? t("fantasy.status.saving") : t("fantasy.atlas.create.review.submit")}
          </button>
        }
      />
    </AtlasCreateShell>
  );
}

function ReviewPlayerSheet({
  player,
  open,
  onClose,
}: {
  player: FantasyPlayer | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t, tr, lang, dir } = useI18n();
  const { clubs, fixtures, gameweek } = useAtlasCreate();
  if (!player) return null;
  const club = clubs.find((candidate) => candidate.id === player.clubId);
  const fixture = fixtures.find(
    (candidate) => candidate.clubId === player.clubId && candidate.gameweek === gameweek?.number,
  );
  const opponent = clubs.find((candidate) => candidate.id === fixture?.opponentClubId);
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        className={cn(
          "max-h-[88dvh] overflow-y-auto sm:inset-y-0 sm:h-full sm:max-h-none sm:w-[420px] sm:max-w-[420px] sm:rounded-none",
          dir === "rtl" ? "sm:left-0 sm:right-auto" : "sm:right-0 sm:left-auto",
        )}
      >
        <SheetHeader className="text-start">
          <SheetTitle>{tr(player.name)}</SheetTitle>
          <SheetDescription>{t("fantasy.atlas.create.review.player_details")}</SheetDescription>
        </SheetHeader>
        <div className="mt-5 flex items-center gap-3 rounded-3xl bg-[#071d40] p-4 text-white">
          {club && <ClubCrest club={club} size="lg" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-black">{tr(player.name)}</div>
            <div className="mt-1 text-xs text-white/65">{club ? tr(club.name) : ""}</div>
            {player.status !== "available" && (
              <div className="mt-2">
                <PlayerStatusBadge status={player.status} />
              </div>
            )}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2">
          <ReviewMetric label={t("fantasy.picker.sort.price")} value={nf.format(player.price)} />
          <ReviewMetric label={t("fantasy.form")} value={nf.format(player.form)} />
          <ReviewMetric
            label={t("fantasy.picker.sort.points")}
            value={nf.format(player.totalPoints)}
          />
          <ReviewMetric
            label={t("fantasy.picker.sort.ownership")}
            value={`${nf.format(player.ownership)}%`}
          />
        </dl>
        {fixture && opponent && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
            <ClubCrest club={opponent} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {t("fantasy.atlas.create.review.next_fixture")}
              </div>
              <div className="mt-0.5 truncate text-sm font-black">
                {tr(opponent.name)} · {fixture.isHome ? t("common.home") : t("common.away")}
              </div>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-100 text-xs font-black text-blue-800">
              {fixture.difficulty}
            </span>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ReviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-black tabular-nums">{value}</dd>
    </div>
  );
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
