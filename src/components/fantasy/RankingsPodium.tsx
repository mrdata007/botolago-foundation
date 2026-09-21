import { Crown } from "lucide-react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { ui, UiCard, UiStatBlock } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { LeagueStanding } from "@/types/fantasy";

/** Deterministic crest slot so every podium card carries a badge. */
function crestFor(standing: LeagueStanding, clubs?: Club[]): Club | undefined {
  if (!clubs || clubs.length === 0) return undefined;
  if (standing.clubId) return clubs.find((c) => c.id === standing.clubId);
  let h = 0;
  for (const ch of standing.managerId) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return clubs[h % clubs.length];
}

/**
 * Top-3 podium.
 *
 * Restraint over decoration: the step heights and the crown stay, because
 * they are what makes a podium readable at a glance, but the three cards are
 * ordinary kit cards and the score is a `UiStatBlock` — the same tabular
 * figure the standings table underneath uses, so the eye moves between them
 * without re-calibrating.
 *
 * Gone: `bg-white/70` over a gradient (an un-themed surface with un-themed
 * text on it), the `rounded-xl` outside the radius set, and the first-place
 * card's action-gradient fill, which forced a `--fpl-ink-deep` foreground that
 * is not a text colour. First place is now marked by the crown, the step and
 * an ink-toned figure.
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
  const steps = ["pt-6", "pt-0", "pt-9"];

  return (
    <section aria-label={t("fantasy.rankings.podium")} className="grid grid-cols-3 gap-2">
      {order.map((s, i) => {
        const club = crestFor(s, clubs);
        const isMe = !!meId && s.managerId === meId;
        const first = i === 1;
        return (
          <div key={s.managerId} className={steps[i]}>
            <UiCard
              padding="none"
              className={cn(
                "flex h-full flex-col items-center gap-1.5 px-2 py-3 text-center",
                first ? "ring-1 ring-[color:var(--ui-ink-fg)]" : ui.surface.sunken,
                isMe && "ring-2 ring-[color:var(--ui-ink-fg)]",
              )}
            >
              <div className="relative">
                {club ? (
                  <ClubCrest club={club} size="md" />
                ) : (
                  <span
                    className={cn(
                      "grid h-9 w-9 place-items-center",
                      ui.radius.control,
                      ui.surface.card,
                      "shadow-none",
                      ui.text.micro,
                      "[font-weight:var(--ui-weight-hero)]",
                    )}
                    aria-hidden
                  >
                    {s.teamName.slice(0, 2).toUpperCase()}
                  </span>
                )}
                {s.rank === 1 ? (
                  <Crown
                    className={cn(
                      "absolute -top-3 start-1/2 h-4 w-4 -translate-x-1/2",
                      ui.tone.ink,
                    )}
                    aria-hidden
                  />
                ) : null}
              </div>
              <span
                className={cn(
                  "inline-grid h-5 min-w-5 place-items-center px-1.5",
                  ui.radius.full,
                  ui.surface.inkPlain,
                  ui.stat.sm,
                )}
              >
                {nf.format(s.rank)}
              </span>
              <div className="min-w-0 self-stretch">
                <div
                  dir="auto"
                  className={cn(
                    "truncate",
                    ui.text.micro,
                    "[font-weight:var(--ui-weight-hero)]",
                    ui.tone.default,
                  )}
                >
                  {s.managerName}
                </div>
                <div dir="auto" className={cn("truncate", ui.text.micro, ui.tone.muted)}>
                  {s.teamName}
                </div>
              </div>
              <UiStatBlock
                align="center"
                size="sm"
                tone={first ? "ink" : "default"}
                value={nf.format(s.totalScore)}
                sub={t("fantasy.points.abbr")}
              />
            </UiCard>
          </div>
        );
      })}
    </section>
  );
}
