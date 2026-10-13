import type { TranslationKey } from "@/i18n/dictionaries";
import type { PendingPointsItem, PlayerPointsBreakdown, PlayerPointsStatus } from "@/types/fantasy";

/**
 * C4/C5 — what the points screen knows about scoring that is still waiting.
 *
 * Two rules sit under everything here:
 * - a figure nobody has confirmed is `null`, never 0, so the screen can print
 *   a dash and say it is waiting;
 * - provisional is never shown as final, so a player with an item still
 *   waiting is provisional even in a gameweek the server calls final.
 *
 * The functions are pure (no React, no i18n state) so the mapping and the
 * wording rules can be tested without rendering.
 */

/** The shape of a player on `api.get_my_fantasy_points`, as far as C4 is concerned. */
export interface PlayerPointsFacts {
  provisionalPoints: number | null;
  finalPoints: number | null;
  /** C4; absent on an older API response. */
  pointsStatus?: PlayerPointsStatus;
  /** C4; absent on an older API response. */
  pendingItems?: readonly { fixtureId: string; category: string; reason?: string | null }[];
}

export interface ResolvedPlayerPoints {
  /** The confirmed figure, or `null` while there is none. */
  points: number | null;
  status: PlayerPointsStatus;
  pendingItems: PendingPointsItem[];
}

/**
 * One player's figure and how settled it is.
 *
 * With `pointsStatus` from the server, that is the answer. Without it (an
 * older response) it is worked out from the rows: points present means final
 * only when the gameweek is final; no points means pending, except in a
 * final gameweek, where the server has closed the books and a player with no
 * row did score nothing.
 */
export function resolvePlayerPoints(
  player: PlayerPointsFacts,
  gameweekIsFinal: boolean,
): ResolvedPlayerPoints {
  const pendingItems: PendingPointsItem[] = (player.pendingItems ?? []).map((item) => ({
    fixtureId: item.fixtureId,
    category: item.category,
    reason: item.reason ?? null,
  }));
  const confirmed = player.finalPoints ?? player.provisionalPoints;

  if (confirmed === null) {
    // The server may say it is final with no row: that is a real zero.
    // Otherwise there is no figure to show.
    if (player.pointsStatus === "final" || (player.pointsStatus === undefined && gameweekIsFinal)) {
      return { points: 0, status: pendingItems.length > 0 ? "provisional" : "final", pendingItems };
    }
    return { points: null, status: "pending", pendingItems };
  }

  const settled =
    pendingItems.length === 0 &&
    gameweekIsFinal &&
    (player.pointsStatus === undefined || player.pointsStatus === "final");
  return { points: confirmed, status: settled ? "final" : "provisional", pendingItems };
}

/** The team's pending-item count: the server's, else the sum over the players. */
export function teamPendingItemCount(
  serverCount: number | undefined,
  players: readonly { pendingItems?: readonly unknown[] }[],
): number {
  if (typeof serverCount === "number") return serverCount;
  return players.reduce((sum, player) => sum + (player.pendingItems?.length ?? 0), 0);
}

/** `appearance` waiting on a minutes conflict: confirmed at 1 pt, may become 2. */
export function mayRiseToTwo(item: PendingPointsItem): boolean {
  return item.category === "appearance" && item.reason === "minutes_conflict";
}

/** What the pitch card and the list's points column show for one player. */
export type PointsCell =
  | { kind: "none" }
  /** No confirmed figure: a dash, with the "waiting" label. */
  | { kind: "pending" }
  /** A confirmed figure; `waiting` when some item of it still waits. */
  | { kind: "points"; value: number; waiting: boolean };

export function pointsCell(
  breakdown: Pick<PlayerPointsBreakdown, "pointsStatus" | "pendingItems"> | undefined,
  value: number | null,
): PointsCell {
  if (!breakdown) return { kind: "none" };
  if (value === null) return { kind: "pending" };
  return { kind: "points", value, waiting: (breakdown.pendingItems?.length ?? 0) > 0 };
}

/** The fixtures a player's detail covers: scored lines and waiting items alike. */
export function pendingItemsOfFixture(
  items: readonly PendingPointsItem[] | undefined,
  fixtureId: string | undefined,
): PendingPointsItem[] {
  return (items ?? []).filter((item) => item.fixtureId === fixtureId);
}

type T = (key: TranslationKey) => string;

/**
 * "N élément(s) en attente" / "N عنصر قيد الانتظار", with the noun agreeing
 * with the number (Arabic has a dual and a few-form of its own). Each form is
 * a literal key so the i18n gate sees it.
 */
export function pendingCountLabel(count: number, lang: "fr" | "ar", t: T): string {
  const n = Math.max(0, Math.round(count));
  const rule = new Intl.PluralRules(lang === "ar" ? "ar" : "fr").select(n);
  const template =
    rule === "one"
      ? t("fantasy.points.pending_count_one")
      : rule === "two"
        ? t("fantasy.points.pending_count_two")
        : rule === "few"
          ? t("fantasy.points.pending_count_few")
          : t("fantasy.points.pending_count_other");
  return template.replace("{n}", String(n));
}
