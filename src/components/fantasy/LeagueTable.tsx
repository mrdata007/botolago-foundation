import { useState } from "react";

import { ClubCrest } from "@/components/common/ClubCrest";
import {
  ui,
  UiBadge,
  UiCard,
  UiEmptyState,
  UiInput,
  UiRankMovement,
  UiTable,
  UiTBody,
  UiTD,
  UiTH,
  UiTHead,
  UiTR,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { LeagueStanding } from "@/types/fantasy";

/**
 * League standings.
 *
 * This stays a `<table>`. Rank, manager, gameweek score, total and movement
 * are read by scanning one column at a time, and a card grid — the "modern"
 * shape this was heading towards — destroys exactly that. The kit's table
 * primitives give the columns tabular figures and inline-end alignment, so the
 * digits line up in French and in Arabic, and the whole table mirrors with the
 * document direction instead of being mirrored by hand.
 *
 * What went: the glass surface, the `rounded-2xl`, the Tailwind type ramp and
 * the amber/slate/orange medal palette (three hardcoded colour families that
 * have no dark counterpart). Rank 1-3 now carry the label-size rank in the
 * ordinary numeric column; the podium is the podium's job, not the table's.
 */
export function LeagueTable({
  standings,
  meId,
  clubs,
  showSearch = true,
  compact = false,
}: {
  standings: LeagueStanding[];
  meId?: string;
  clubs?: Club[];
  showSearch?: boolean;
  compact?: boolean;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const [q, setQ] = useState("");

  const crestFor = (s: LeagueStanding): Club | undefined => {
    if (!clubs || clubs.length === 0) return undefined;
    if (s.clubId) return clubs.find((c) => c.id === s.clubId);
    // Deterministic visual badge so every row carries a crest slot.
    let hash = 0;
    for (const ch of s.managerId) hash = (hash * 31 + ch.charCodeAt(0)) % 100000;
    return clubs[hash % clubs.length];
  };

  const filtered = q.trim()
    ? standings.filter(
        (s) =>
          s.managerName.toLowerCase().includes(q.toLowerCase()) ||
          s.teamName.toLowerCase().includes(q.toLowerCase()),
      )
    : standings;

  const movementLabels = {
    up: t("fantasy.rank.up"),
    down: t("fantasy.rank.down"),
    same: t("fantasy.rank.same"),
  };

  return (
    <div className="space-y-2">
      {/* No leading magnifier: `UiInput` has no adornment slot, and faking one
          with a negative margin breaks the moment the field grows. Recorded as
          a kit request; `type="search"` plus the label carries the meaning. */}
      {showSearch ? (
        <UiInput
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t("fantasy.leagues.search_manager")}
          aria-label={t("fantasy.leagues.search_manager")}
          type="search"
        />
      ) : null}

      <UiCard padding="none" className="overflow-hidden">
        {filtered.length === 0 ? (
          <UiEmptyState
            className="shadow-none"
            title={q.trim() ? t("fantasy.players.no_match") : t("fantasy.leagues.no_members_title")}
            body={q.trim() ? t("fantasy.rankings.empty") : t("fantasy.leagues.no_members")}
          />
        ) : (
          // `table-fixed`: the columns are sized by their headers, not by
          // the longest team name in the league, so the name column truncates
          // instead of pushing the total off a 390px screen.
          <UiTable caption={t("fantasy.leagues.standings")} tableClassName="table-fixed">
            <UiTHead>
              <UiTR>
                <UiTH numeric className="w-10">
                  #
                </UiTH>
                <UiTH>{t("fantasy.leagues.manager")}</UiTH>
                {compact ? null : (
                  <UiTH numeric className="w-11">
                    {t("fantasy.leagues.gw")}
                  </UiTH>
                )}
                <UiTH numeric className="w-14">
                  {t("fantasy.leagues.total")}
                </UiTH>
                <UiTH numeric className="w-9">
                  <span className="sr-only">{t("fantasy.leagues.movement")}</span>
                </UiTH>
              </UiTR>
            </UiTHead>
            <UiTBody>
              {filtered.map((s) => {
                const isMe = !!meId && s.managerId === meId;
                const club = crestFor(s);
                return (
                  <UiTR key={s.managerId} highlighted={isMe}>
                    <UiTD numeric strong>
                      {nf.format(s.rank)}
                    </UiTD>
                    <UiTD>
                      <span className="flex items-center gap-2">
                        {club ? (
                          <ClubCrest club={club} size="sm" />
                        ) : (
                          <span
                            className={cn(
                              "grid h-7 w-7 shrink-0 place-items-center",
                              ui.radius.control,
                              ui.surface.sunken,
                              ui.text.micro,
                              "[font-weight:var(--ui-weight-hero)]",
                            )}
                            aria-hidden
                          >
                            {s.teamName.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span
                              dir="auto"
                              className={cn(
                                "truncate",
                                ui.text.body,
                                "[font-weight:var(--ui-weight-heavy)]",
                              )}
                            >
                              {s.teamName}
                            </span>
                            {isMe ? (
                              <UiBadge tone="action">{t("fantasy.leagues.me")}</UiBadge>
                            ) : null}
                          </span>
                          {s.managerName && s.managerName !== s.teamName ? (
                            <span
                              dir="auto"
                              className={cn("block truncate", ui.text.micro, ui.tone.muted)}
                            >
                              {s.managerName}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </UiTD>
                    {compact ? null : (
                      <UiTD numeric className={ui.tone.muted}>
                        {nf.format(s.gameweekScore)}
                      </UiTD>
                    )}
                    <UiTD numeric strong>
                      {nf.format(s.totalScore)}
                    </UiTD>
                    <UiTD numeric>
                      <UiRankMovement
                        rank={s.rank}
                        previousRank={s.previousRank}
                        labels={movementLabels}
                      />
                    </UiTD>
                  </UiTR>
                );
              })}
            </UiTBody>
          </UiTable>
        )}
      </UiCard>
    </div>
  );
}
