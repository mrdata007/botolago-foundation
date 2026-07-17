import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { botolaService } from "@/services/mock";
import { fantasyService } from "@/services/fantasy-mock";
import { LoadingState } from "@/components/common/States";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ClubCrest } from "@/components/common/ClubCrest";
import { PlayerStatusBadge } from "@/components/fantasy/PlayerStatusBadge";
import { PlayerPickerDrawer } from "@/components/fantasy/PlayerPickerDrawer";
import { TransferReviewPanel } from "@/components/fantasy/TransferReviewPanel";
import { computeBudgetImpact, transferHit, splitTransfers, maxAffordableReplacement } from "@/lib/budget";
import type { FantasyPlayer } from "@/types/fantasy";
import { useI18n } from "@/i18n/provider";
import { ArrowRightLeft, Check } from "lucide-react";
import type { TranslationKey } from "@/i18n/dictionaries";
import { toast } from "sonner";

export const Route = createFileRoute("/fantasy/transfers")({
  component: TransfersPage,
});

function TransfersPage() {
  const { t, tr, lang } = useI18n();
  const qc = useQueryClient();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });

  const teamQ = useQuery({ queryKey: ["fantasy-team"], queryFn: () => fantasyService.getTeam() });
  const playersQ = useQuery({ queryKey: ["fantasy-players"], queryFn: () => fantasyService.getPlayers() });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });

  const [outIds, setOutIds] = useState<string[]>([]);
  const [inIds, setInIds] = useState<string[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!teamQ.data || !playersQ.data || !clubsQ.data) return <LoadingState />;
  const team = teamQ.data;
  const players = playersQ.data;
  const clubs = clubsQ.data;
  const playerOf = (id: string) => players.find((p) => p.id === id)!;
  const clubOf = (cid: string) => clubs.find((c) => c.id === cid);

  const currentSquad = team.squad.map((s) => playerOf(s.playerId));
  const currentSquadIdsAfter = currentSquad.map((p) => p.id);
  outIds.forEach((oid, i) => {
    const idx = currentSquadIdsAfter.indexOf(oid);
    if (idx >= 0 && inIds[i]) currentSquadIdsAfter[idx] = inIds[i];
  });

  const outPlayers = outIds.map(playerOf);
  const inPlayers = inIds.map(playerOf).filter(Boolean) as FantasyPlayer[];

  const impact = computeBudgetImpact({ outPlayers, inPlayers, bank: team.bank });
  const bankAfter = impact.bankAfter;

  const totalTransfers = Math.min(outIds.length, inIds.length);
  const { paid: paidTransfers } = splitTransfers(totalTransfers, team.freeTransfers);
  const hitPoints = transferHit(paidTransfers);

  const canReview = totalTransfers > 0 && outIds.length === inIds.length && !impact.overBudget;

  const startReplace = (playerId: string) => setPickerFor(playerId);
  const removeFromOut = (playerId: string) => {
    const idx = outIds.indexOf(playerId);
    if (idx < 0) return;
    setOutIds(outIds.filter((x) => x !== playerId));
    setInIds(inIds.filter((_, i) => i !== idx));
  };
  const onPick = (p: FantasyPlayer) => {
    if (!pickerFor) return;
    const outP = playerOf(pickerFor);
    if (p.position !== outP.position) {
      toast.error(lang === "ar" ? "لا بد من نفس المركز" : "Poste incompatible");
      return;
    }
    const nextIds = currentSquadIdsAfter.map((id) => (id === pickerFor ? p.id : id));
    const clubCount = nextIds.filter((id) => playerOf(id).clubId === p.clubId).length;
    if (clubCount > 3) {
      toast.error(t("fantasy.validation.club_limit"));
      return;
    }
    if (!outIds.includes(pickerFor)) {
      setOutIds([...outIds, pickerFor]);
      setInIds([...inIds, p.id]);
    } else {
      const idx = outIds.indexOf(pickerFor);
      const newIn = inIds.slice();
      newIn[idx] = p.id;
      setInIds(newIn);
    }
    setPickerFor(null);
  };

  const resetAll = () => { setOutIds([]); setInIds([]); };
  const confirm = () => {
    const nextSquad = team.squad.map((sp) => {
      const idx = outIds.indexOf(sp.playerId);
      if (idx < 0 || !inIds[idx]) return sp;
      return { ...sp, playerId: inIds[idx] };
    });
    const nextFree = Math.max(0, team.freeTransfers - totalTransfers);
    fantasyService.saveTeam({
      squad: nextSquad,
      bank: bankAfter,
      freeTransfers: nextFree,
      pendingTransfers: totalTransfers,
    });
    qc.invalidateQueries({ queryKey: ["fantasy-team"] });
    qc.invalidateQueries({ queryKey: ["fantasy-summary"] });
    setSuccess(true);
    setConfirming(false);
    toast.success(t("fantasy.transfers.success"));
    setTimeout(() => setSuccess(false), 2400);
    resetAll();
  };

  const pickerOut = pickerFor ? playerOf(pickerFor) : null;
  const pickerMaxPrice = pickerOut ? maxAffordableReplacement(pickerOut.price, team.bank) : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black text-foreground">{t("fantasy.transfers.title")}</h1>
        <div className="flex items-center gap-2 text-xs">
          <Stat label={t("fantasy.bank")} value={nf.format(bankAfter)} accent={bankAfter < 0} />
          <Stat label={t("fantasy.transfers.free")} value={String(Math.max(0, team.freeTransfers - totalTransfers))} />
          <Stat label={t("fantasy.transfers.hit")} value={`-${hitPoints}`} />
        </div>
      </div>

      {success && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-800">
          <Check className="h-4 w-4" /> {t("fantasy.transfers.success")}
        </div>
      )}

      <SectionHeader title={t("fantasy.team")} />
      <div className="grid gap-1.5">
        {(["GK", "DEF", "MID", "FWD"] as const).map((pos) => (
          <div key={pos}>
            <div className="mb-1 px-1 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
              {t(`player.pos.${pos}` as TranslationKey)}
            </div>
            <ul className="grid gap-1.5">
              {currentSquad
                .filter((p) => p.position === pos)
                .map((p) => {
                  const inOut = outIds.includes(p.id);
                  const replacementIdx = outIds.indexOf(p.id);
                  const replacement = replacementIdx >= 0 ? inPlayers.find((_, i) => i === replacementIdx) : null;
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 ring-1 ring-black/5"
                    >
                      {clubOf(p.clubId) && <ClubCrest club={clubOf(p.clubId)!} size="sm" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={inOut ? "line-through text-muted-foreground text-sm font-bold" : "text-sm font-bold text-foreground"}>
                            {tr(p.name)}
                          </span>
                          {p.status !== "available" && <PlayerStatusBadge status={p.status} />}
                        </div>
                        {replacement && (
                          <div className="mt-0.5 truncate text-[11px] font-semibold text-emerald-700">
                            → {tr(replacement.name)} ({nf.format(replacement.price)})
                          </div>
                        )}
                        {!replacement && (
                          <div className="text-[11px] text-muted-foreground">
                            {t("fantasy.price")} {nf.format(p.price)} · {t("fantasy.form")} {nf.format(p.form)}
                          </div>
                        )}
                      </div>
                      {inOut ? (
                        <button onClick={() => removeFromOut(p.id)} className="rounded-lg bg-white px-2 py-1 text-[11px] font-semibold ring-1 ring-black/10">
                          {t("fantasy.transfers.reset")}
                        </button>
                      ) : (
                        <button
                          onClick={() => startReplace(p.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[color:var(--brand-primary)] px-2 py-1 text-[11px] font-semibold text-white"
                        >
                          <ArrowRightLeft className="h-3 w-3" aria-hidden /> {t("fantasy.transfers.title")}
                        </button>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={resetAll}
          className="rounded-xl border border-input bg-white/60 px-3 py-2 text-xs font-semibold hover:bg-white"
          disabled={totalTransfers === 0}
        >
          {t("fantasy.transfers.reset")}
        </button>
        <button
          onClick={() => setConfirming(true)}
          disabled={!canReview}
          className="rounded-xl bg-[color:var(--brand-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {t("fantasy.review")}
        </button>
      </div>

      {confirming && (
        <div className="mt-4">
          <TransferReviewPanel
            outPlayers={outPlayers}
            inPlayers={inPlayers}
            clubs={clubs}
            freeTransfers={Math.min(team.freeTransfers, totalTransfers)}
            paidTransfers={paidTransfers}
            bankAfter={bankAfter}
            hitPoints={hitPoints}
            onCancel={() => setConfirming(false)}
            onConfirm={confirm}
          />
        </div>
      )}

      <PlayerPickerDrawer
        open={!!pickerFor}
        onClose={() => setPickerFor(null)}
        onPick={onPick}
        players={players.filter((p) => !currentSquadIdsAfter.includes(p.id) || p.id === pickerFor)}
        clubs={clubs}
        position={pickerOut?.position}
        maxPrice={pickerMaxPrice}
        title={t("fantasy.transfers.select_in")}
      />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl px-2 py-1 ring-1 ring-black/5 ${accent ? "bg-red-500/10" : "bg-white/60"}`}>
      <div className={`text-xs font-black tabular-nums ${accent ? "text-red-700" : "text-foreground"}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
