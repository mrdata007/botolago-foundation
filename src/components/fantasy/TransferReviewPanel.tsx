import type { FantasyPlayer } from "@/types/fantasy";
import type { Club } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { ClubCrest } from "@/components/common/ClubCrest";
import { ArrowRight } from "lucide-react";
import type { TranslationKey } from "@/i18n/dictionaries";

export function TransferReviewPanel({
  outPlayers,
  inPlayers,
  clubs,
  freeTransfers,
  paidTransfers,
  bankAfter,
  hitPoints,
  chipLabel,
  totalTransfers,
  onConfirm,
  onCancel,
}: {
  outPlayers: FantasyPlayer[];
  inPlayers: FantasyPlayer[];
  clubs: Club[];
  freeTransfers: number;
  paidTransfers: number;
  bankAfter: number;
  hitPoints: number;
  chipLabel?: string | null;
  totalTransfers?: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t, tr, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });
  const clubOf = (id: string) => clubs.find((c) => c.id === id);
  const rows = outPlayers.map((o, i) => ({ out: o, in: inPlayers[i] }));

  return (
    <div className="glass-surface glass-strong rounded-3xl border border-[var(--glass-border)] p-4 shadow-lg shadow-black/5">
      <h3 className="text-lg font-black text-foreground">{t("fantasy.transfers.review_title")}</h3>

      <ul className="mt-3 grid gap-2">
        {rows.map(({ out, in: inP }, i) => (
          <li
            key={i}
            className="flex items-center gap-2 rounded-xl bg-white/60 p-2 ring-1 ring-black/5"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {clubOf(out.clubId) && <ClubCrest club={clubOf(out.clubId)!} size="sm" />}
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-red-700">− {tr(out.name)}</div>
                <div className="text-[10px] text-muted-foreground">
                  {t(`player.pos.${out.position}` as TranslationKey)} · {nf.format(out.price)}
                </div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              <div className="min-w-0 text-end">
                <div className="truncate text-xs font-bold text-emerald-700">
                  + {inP ? tr(inP.name) : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {inP
                    ? `${t(`player.pos.${inP.position}` as TranslationKey)} · ${nf.format(inP.price)}`
                    : "—"}
                </div>
              </div>
              {inP && clubOf(inP.clubId) && <ClubCrest club={clubOf(inP.clubId)!} size="sm" />}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        {typeof totalTransfers === "number" && (
          <Stat label={t("fantasy.transfers.transfers_total")} value={String(totalTransfers)} />
        )}
        <Stat label={t("fantasy.transfers.free")} value={String(freeTransfers)} />
        <Stat label={t("fantasy.transfers.paid")} value={String(paidTransfers)} />
        <Stat label={t("fantasy.transfers.projected_bank")} value={nf.format(bankAfter)} />
      </div>

      {chipLabel && (
        <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-900">
          {t("fantasy.transfers.chip_active")}: {chipLabel} — {t("fantasy.transfers.no_hit_chip")}
        </div>
      )}

      {!chipLabel && hitPoints > 0 && (
        <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-900">
          {t("fantasy.transfers.hit")}: −{hitPoints} pts
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl border border-input bg-white/60 px-3 py-2 text-sm font-semibold text-foreground hover:bg-white"
        >
          {t("fantasy.cancel")}
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 rounded-xl cta-brand px-3 py-2 text-sm font-semibold hover:opacity-90"
        >
          {t("fantasy.transfers.confirm")}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/60 px-2 py-2 ring-1 ring-black/5">
      <div className="text-sm font-black tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
