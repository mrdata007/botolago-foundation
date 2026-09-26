/**
 * `/fantasy/points`, as src/routes/fantasy.points.tsx composes it: the team
 * as the header title with the gameweek stepper, the navy strip (points,
 * average, best), "Terrain | Liste", the pitch with each player's points on
 * his plate, and the points overview. Every line of every player comes from
 * the product's scoring function (see data/world.ts).
 */
import { useState } from "react";

import { SectionHeader } from "@/components/common/SectionHeader";
import { GameweekSelector } from "@/components/fantasy/GameweekSelector";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FplPitch } from "@/components/fpl/FplPitch";
import { FplPlayerCard } from "@/components/fpl/FplPlayerCard";
import { FplStatBar } from "@/components/fpl/FplStatBar";
import { SquadListTable } from "@/components/fpl/SquadListTable";
import {
  ui,
  UiCard,
  UiHeader,
  UiKeyValueRow,
  UiSegmented,
  UiStatePanel,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Position, SquadPlayer } from "@/types/fantasy";

import { DEMO_GAMEWEEK, clubById, clubs, players, playerById } from "../data/world";
import { positionsFor, scoreTeam, useDemo } from "../state";
import { FALLBACK_TEAM_NAME, useDemoGameweek, useEnsurePlayed } from "./shared";

const ROWS: Position[] = ["GK", "DEF", "MID", "FWD"];

export function PointsScreen() {
  return (
    <FantasyFrame bottomNav>
      <PointsBody />
    </FantasyFrame>
  );
}

function PointsBody() {
  const { t, tr, lang } = useI18n();
  const ready = useEnsurePlayed();
  const { state } = useDemo();
  const gameweek = useDemoGameweek();
  const [view, setView] = useState<"squad" | "list">("squad");
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const teamName = state.teamName.trim() || FALLBACK_TEAM_NAME;

  if (!ready) {
    return (
      <>
        <UiHeader kicker={t("fantasy.title")} title={teamName} backTo="/fantasy" />
        <UiStatePanel kind="loading" />
      </>
    );
  }

  const score = scoreTeam(state);
  const breakdown = new Map(score.lines.map((line) => [line.id, line.breakdown]));
  const positions = positionsFor(state.formation);
  const captainId = score.effectiveCaptain;
  const pointsFor = (id: string) => {
    const b = breakdown.get(id);
    if (!b) return null;
    return b.totalPoints * (id === captainId ? 2 : 1);
  };

  const card = (id: string) => {
    const player = playerById(id)!;
    return (
      <FplPlayerCard
        key={id}
        player={player}
        club={clubById(player.clubId)}
        sub={String(pointsFor(id) ?? t("fantasy.stat.none"))}
        captain={id === captainId}
        vice={id === state.viceId && id !== captainId}
      />
    );
  };
  const rows = ROWS.map((position) =>
    state.picks.filter((id, index) => id && positions[index] === position).map((id) => card(id!)),
  );
  const squadForList: SquadPlayer[] = state.picks.flatMap((id, index) =>
    id
      ? [
          {
            playerId: id,
            slot: index + 1,
            isCaptain: id === captainId,
            isViceCaptain: id === state.viceId,
          },
        ]
      : [],
  );

  const captain = playerById(captainId);

  return (
    <>
      <UiHeader kicker={t("fantasy.title")} title={teamName} backTo="/fantasy">
        <GameweekSelector
          className="mt-2 flex w-full"
          showLabel
          value={DEMO_GAMEWEEK}
          min={DEMO_GAMEWEEK}
          max={DEMO_GAMEWEEK}
          onChange={() => undefined}
        />
      </UiHeader>

      <FplStatBar
        hero
        items={[
          {
            label: t("fpl.points"),
            value: score.total,
            unit: t("fantasy.points.abbr"),
            sub: (
              <span className={cn("inline-flex items-center gap-1.5", ui.text.label)}>
                {t("fantasy.points.status.final")}
              </span>
            ),
          },
          { label: t("fpl.average"), value: gameweek.averagePoints ?? t("fantasy.stat.none") },
          { label: t("fpl.highest"), value: gameweek.highestPoints ?? t("fantasy.stat.none") },
        ]}
      />

      <div className={cn("pt-3", ui.space.gutter)}>
        <UiSegmented
          variant="pill"
          value={view}
          onChange={setView}
          label={t("fantasy.view.toggle_label")}
          options={[
            { value: "squad", label: t("fantasy.view.pitch") },
            { value: "list", label: t("fpl.list") },
          ]}
        />
      </div>

      {view === "squad" ? (
        <FplPitch className="mx-[var(--ui-gutter)] mt-3" rows={rows} />
      ) : (
        <SquadListTable
          className="mx-[var(--ui-gutter)] mt-3"
          squad={squadForList}
          players={players}
          clubs={clubs}
          renderDetail={(player) => {
            const events = breakdown.get(player.id)?.events ?? [];
            if (events.length === 0) return null;
            return (
              <ul className={cn("pb-2", ui.text.meta, ui.tone.muted)}>
                {events.map((event, index) => (
                  <li
                    key={`${event.category}-${event.fixtureId ?? index}`}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="min-w-0 truncate">
                      {t(`fantasy.points.event.${event.category}` as never)}
                    </span>
                    <span dir="ltr" className={cn("shrink-0", ui.stat.sm, ui.tone.default)}>
                      {event.points > 0 ? `+${event.points}` : event.points}
                    </span>
                  </li>
                ))}
              </ul>
            );
          }}
          columns={[
            {
              key: "form",
              label: t("fpl.form"),
              render: (p) => (p.form === null ? t("fantasy.stat.none") : nf.format(p.form)),
            },
            { key: "price", label: t("fpl.current_price"), render: (p) => nf.format(p.price) },
            { key: "sel", label: t("fpl.selected"), render: (p) => `${nf.format(p.ownership)}%` },
            {
              key: "pts",
              label: `GW${DEMO_GAMEWEEK}`,
              render: (p) => {
                const pts = pointsFor(p.id);
                return pts === null ? t("fantasy.stat.none") : `${pts}${t("fantasy.points.abbr")}`;
              },
              className: "[font-weight:var(--ui-weight-heavy)]",
            },
          ]}
        />
      )}

      <section className={cn("mt-6", ui.space.gutter)}>
        <SectionHeader title={t("fpl.points_overview")} />
        <UiCard padding="none" className="px-3">
          <UiKeyValueRow
            label={t("fantasy.points.effective_captain")}
            value={
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 truncate">
                  {captain ? tr(captain.name) : t("fantasy.stat.none")}
                </span>
                {score.captainTookOver ? (
                  <span className={cn("shrink-0", ui.text.meta, ui.tone.muted)}>
                    {t("fantasy.points.vice_takeover")}
                  </span>
                ) : null}
              </span>
            }
          />
          <UiKeyValueRow
            label={t("fantasy.points.multiplier")}
            value={
              <span dir="ltr" className={ui.stat.sm}>
                ×2
              </span>
            }
          />
          <UiKeyValueRow
            label={t("fantasy.points.active_chip")}
            value={t("fantasy.points.no_active_chip")}
            className="border-b-0"
          />
        </UiCard>
      </section>
    </>
  );
}
