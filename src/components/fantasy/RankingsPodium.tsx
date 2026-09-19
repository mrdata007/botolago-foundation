import type { LeagueStanding } from "@/types/fantasy";
import type { Club } from "@/types/domain";
import { ClubCrest } from "@/components/common/ClubCrest";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { Crown } from "lucide-react";

/** Deterministic crest slot so every podium card carries a badge. */
function crestFor(standing: LeagueStanding, clubs?: Club[]): Club | undefined {
  if (!clubs || clubs.length === 0) return undefined;
  if (standing.clubId) return clubs.find((c) => c.id === standing.clubId);
  let h = 0;
  for (const ch of standing.managerId) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return clubs[h % clubs.length];
}

/**
 * Top-3 podium, ported onto the Fantasy `--fpl-*` tokens: ink/cyan for 1st,
 * grey for 2nd/3rd, same family as `FplStateBadge`/`FplPill`.
 */
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
  const surfaces = [
    "bg-[color:var(--fpl-grey)]",
    "text-[color:var(--fpl-ink)]",
    "bg-[color:var(--fpl-grey)]",
  ];

  return (
    <section aria-label={t("fantasy.rankings.podium")} className="grid grid-cols-3 gap-2">
      {order.map((s, i) => {
        const club = crestFor(s, clubs);
        const isMe = meId && s.managerId === meId;
        const first = i === 1;
        return (
          <div key={s.managerId} className={heights[i]}>
            <div
              className={cn(
                "flex h-full flex-col items-center gap-1.5 rounded-[10px] px-2 py-3 text-center",
                first ? "" : surfaces[i],
                isMe && "ring-2 ring-[color:var(--fpl-ink)]",
              )}
              style={first ? { backgroundImage: "var(--fpl-grad)" } : undefined}
            >
              <div className="relative">
                {club ? (
                  <ClubCrest club={club} size="md" />
                ) : (
                  <span
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-xl text-[11px] font-black",
                      first
                        ? "bg-white/70 text-[color:var(--fpl-ink)]"
                        : "bg-white text-[color:var(--fpl-ink)]",
                    )}
                  >
                    {s.teamName.slice(0, 2).toUpperCase()}
                  </span>
                )}
                {s.rank === 1 && (
                  <Crown
                    className="absolute -top-3 start-1/2 h-4 w-4 -translate-x-1/2 text-[color:var(--fpl-ink-deep)]"
                    aria-hidden
                  />
                )}
              </div>
              <span
                className={cn(
                  "inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-black tabular-nums",
                  first
                    ? "bg-white/70 text-[color:var(--fpl-ink-deep)]"
                    : "bg-white text-[color:var(--fpl-ink-deep)]",
                )}
              >
                {s.rank}
              </span>
              <div className="min-w-0">
                <div
                  className={cn(
                    "truncate text-[11px] font-black",
                    first ? "text-[color:var(--fpl-ink-deep)]" : "text-[color:var(--fpl-ink-deep)]",
                  )}
                >
                  {s.managerName}
                </div>
                <div className="truncate text-[10px] text-[color:var(--fpl-grey-text)]">
                  {s.teamName}
                </div>
              </div>
              <div className="text-sm font-black tabular-nums text-[color:var(--fpl-ink-deep)]">
                {nf.format(s.totalScore)}
                <span className="ms-1 text-[10px] font-bold text-[color:var(--fpl-grey-text)]">
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
