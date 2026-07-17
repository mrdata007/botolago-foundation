import type { Club, Player } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { ClubCrest } from "./ClubCrest";
import type { TranslationKey } from "@/i18n/dictionaries";

export function PlayerRow({ player, club }: { player: Player; club?: Club }) {
  const { tr, t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/50 px-3 py-2 ring-1 ring-black/5">
      {club && <ClubCrest club={club} size="sm" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-foreground">{tr(player.name)}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {t(`player.pos.${player.position}` as TranslationKey)} • {t("fantasy.form")} {nf.format(player.form)}
        </div>
      </div>
      <div className="text-end">
        <div className="text-sm font-black tabular-nums text-foreground">{nf.format(player.price)}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("fantasy.price")}</div>
      </div>
    </div>
  );
}
