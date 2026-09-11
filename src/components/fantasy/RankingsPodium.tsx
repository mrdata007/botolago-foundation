import type { LeagueStanding } from "@/types/fantasy";
import type { Club } from "@/types/domain";
import { ClubCrest } from "@/components/common/ClubCrest";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { Crown } from "lucide-react";
import { findStandingClub } from "./standing-club";

export function RankingsPodium({
  podium,
  clubs,
  meId,
}: {
  podium: LeagueStanding[];
  clubs?: Club[];
  meId?: string;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  if (podium.length < 3) return null;

  // Visual order: 2nd, 1st, 3rd.
  const order = [podium[1], podium[0], podium[2]];
  const heights = ["pt-6", "pt-0", "pt-9"];
  const tones = [
    "from-slate-200/70 to-slate-100/30 ring-slate-400/30",
    "from-amber-200/80 to-amber-100/30 ring-amber-500/40",
    "from-orange-200/70 to-orange-100/30 ring-orange-500/30",
  ];

  return (
    <section aria-label={t("fantasy.rankings.podium")} className="grid grid-cols-3 gap-2">
      {order.map((s, i) => {
        const club = findStandingClub(s, clubs);
        const isMe = meId && s.managerId === meId;
        return (
          <div key={s.managerId} className={heights[i]}>
            <div
              className={cn(
                "glass-surface glass-regular flex h-full flex-col items-center gap-1.5 rounded-2xl bg-gradient-to-b px-2 py-3 text-center ring-1",
                tones[i],
                isMe && "outline outline-2 outline-[color:var(--brand-accent)]",
              )}
            >
              <div className="relative">
                {club ? (
                  <ClubCrest club={club} size="md" />
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--brand-accent)]/15 text-[11px] font-black text-[color:var(--brand-accent)]">
                    {s.teamName.slice(0, 2).toUpperCase()}
                  </span>
                )}
                {s.rank === 1 && (
                  <Crown
                    className="absolute -top-3 start-1/2 h-4 w-4 -translate-x-1/2 text-amber-500"
                    aria-hidden
                  />
                )}
              </div>
              <span className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-background/70 px-1.5 text-[11px] font-black tabular-nums text-foreground ring-1 ring-black/5">
                {s.rank}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-black text-foreground">
                  {s.managerName}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">{s.teamName}</div>
              </div>
              <div className="text-sm font-black tabular-nums text-foreground">
                {nf.format(s.totalScore)}
                <span className="ms-1 text-[10px] font-bold text-muted-foreground">
                  {t("fantasy.points.abbr")}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
