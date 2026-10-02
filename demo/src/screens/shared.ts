import { useEffect, useMemo } from "react";

import type { FantasySummary, Gameweek } from "@/types/domain";
import type { FantasyTeam, SquadPlayer } from "@/types/fantasy";

import {
  gameweekBoard,
  gameweekFigures,
  overallBoard,
  BOARD_SIZE,
  type MyEntry,
} from "../data/board";
import { DEMO_BUDGET, DEMO_GAMEWEEK, deadlineOf } from "../data/world";
import { useDemoCopy } from "../copy";
import { positionsFor, scoreTeam, summarize, useDemo, useEnsureTeam } from "../state";

export const FALLBACK_TEAM_NAME = "Atlas FC";

/** Journée 12 as the product's `Gameweek` type describes it. */
export function useDemoGameweek(): Gameweek {
  const { state } = useDemo();
  const me = useMyEntry();
  return useMemo(() => {
    const figures = state.played ? gameweekFigures(me ?? undefined) : null;
    return {
      number: DEMO_GAMEWEEK,
      deadline: deadlineOf(DEMO_GAMEWEEK),
      isCurrent: true,
      status: state.played ? "finalized" : "open",
      averagePoints: figures?.average ?? null,
      highestPoints: figures?.highest ?? null,
    };
  }, [state.played, me]);
}

/** The demo manager's line on the boards, once Journée 12 has been played. */
export function useMyEntry(): MyEntry | null {
  const { state } = useDemo();
  const copy = useDemoCopy();
  const managerName = copy("youName");
  return useMemo(() => {
    if (!state.played) return null;
    return {
      teamName: state.teamName.trim() || FALLBACK_TEAM_NAME,
      managerName,
      points: scoreTeam(state).total,
    };
  }, [state, managerName]);
}

/** The eleven as the product's `FantasyTeam`, for components that take one. */
export function useDemoTeam(): FantasyTeam | null {
  const { state } = useDemo();
  return useMemo(() => {
    if (!state.saved) return null;
    const squad: SquadPlayer[] = state.picks.flatMap((playerId, index) =>
      playerId
        ? [
            {
              playerId,
              slot: index + 1,
              isCaptain: playerId === state.captainId || undefined,
              isViceCaptain: playerId === state.viceId || undefined,
            },
          ]
        : [],
    );
    return {
      managerName: "",
      teamName: state.teamName.trim() || FALLBACK_TEAM_NAME,
      formation: state.formation,
      squad,
      bank: summarize(state).bank,
      freeTransfers: 1,
      pendingTransfers: 0,
    };
  }, [state]);
}

/** The hub card's figures. */
export function useDemoSummary(): FantasySummary | null {
  const { state } = useDemo();
  const me = useMyEntry();
  return useMemo(() => {
    if (!state.saved || !me) return null;
    const overall = overallBoard(true, me).find((row) => row.managerId === "me");
    const week = gameweekBoard(true, me).find((row) => row.managerId === "me");
    return {
      managerName: me.managerName,
      teamName: me.teamName,
      totalPoints: me.points,
      gameweekPoints: me.points,
      overallRank: overall?.rank ?? null,
      gameweekRank: week?.rank ?? null,
      transfersLeft: 1,
      bankValue: summarize(state).bank,
      teamValue: DEMO_BUDGET - summarize(state).bank,
    };
  }, [state, me]);
}

/**
 * Screens after the kickoff (points, leaderboard) need a played gameweek. A
 * presenter who jumps to them straight from the step list gets a full team,
 * named and played, instead of an empty screen.
 */
export function useEnsurePlayed() {
  const { state, actions } = useDemo();
  const ensureTeam = useEnsureTeam();
  const complete = state.picks.every(Boolean) && !!state.captainId && !!state.viceId;
  useEffect(() => {
    if (!complete || !state.saved) {
      ensureTeam();
      return;
    }
    if (!state.played) actions.play();
  }, [complete, state.saved, state.played, ensureTeam, actions]);
  return complete && state.saved && state.played;
}

export { BOARD_SIZE, positionsFor };
