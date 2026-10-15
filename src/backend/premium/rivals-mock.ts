import type { RepositoryContext } from "@/backend/contracts/repository";

import {
  RIVAL_MAX,
  rivalSchema,
  type CandidatesResponse,
  type PinOutcome,
  type PremiumRivalsRepository,
  type Rival,
  type RivalCandidate,
  type RivalsResponse,
} from "./rivals";

/**
 * A development board for the Rivaux section, until the database serves one to a preview. Reached
 * only through the dynamic import in `src/services/premium-rivals.ts` behind `import.meta.env.DEV`,
 * so a production build carries none of it.
 *
 * Karim B. (KACM, 612 points after journée 11) in « Les Lions du Derb », with two pinned rivals:
 *   - Sami Berrada, 598: Karim leads, 7 journées won and 4 lost, the biggest win J9 (71 to 64); Sami
 *     keeps his history private;
 *   - Yassine Ouazzani, 627: he took the lead in journée 11 (79 to 62); his history is shared, so his
 *     captain and last transfer are there, the transfer still « en attente ».
 * The journée by journée scores are the example season's (`plus-season-data.ts`); Yassine's are
 * example values. The names are made up. State lives in memory: pinning and unpinning work.
 */

const SEASON = { id: "00000000-0000-4000-8000-000000000001", label: "2026/27" };
const LEAGUE = { id: "00000000-0000-4000-8000-000000000701", name: "Les Lions du Derb" };
/** Journée 11 published on 12 October (the stamp reads « Publié le 12 oct. »). */
const PUBLISHED_AT = "2026-10-12T18:00:00+00:00";

const YOU = [52, 58, 44, 56, 63, 44, 60, 55, 71, 47, 62];
const SAMI = [49, 61, 40, 50, 66, 41, 57, 59, 64, 53, 58];
const YASSINE = [50, 60, 48, 52, 64, 43, 59, 56, 66, 50, 79];
const HAMZA = [47, 55, 52, 49, 58, 60, 51, 54, 63, 44, 57];
const ALI = [53, 49, 45, 60, 55, 48, 62, 50, 59, 58, 51];

const teamId = (n: number) => `00000000-0000-4000-8000-0000000008${String(n).padStart(2, "0")}`;

const MATES: Record<
  string,
  { name: string; scores: number[]; historyVisible: boolean; extras?: boolean }
> = {
  [teamId(1)]: { name: "Sami Berrada", scores: SAMI, historyVisible: false },
  [teamId(2)]: { name: "Yassine Ouazzani", scores: YASSINE, historyVisible: true, extras: true },
  [teamId(3)]: { name: "Hamza Tazi", scores: HAMZA, historyVisible: false },
  [teamId(4)]: { name: "Ali Fassi", scores: ALI, historyVisible: false },
};

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

const leaderOf = (me: number, rival: number) => (me > rival ? "me" : me < rival ? "rival" : "tie");

function build(id: string, position: number): Rival {
  const mate = MATES[id]!;
  const weeks = YOU.map((me, i) => ({ seq: i + 1, me, rival: mate.scores[i]! }));
  const meTotal = sum(YOU);
  const rivalTotal = sum(mate.scores);
  const beforeMe = sum(YOU.slice(0, -1));
  const beforeRival = sum(mate.scores.slice(0, -1));
  const wins = weeks.filter((w) => w.me > w.rival);
  const best = wins.reduce<(typeof weeks)[number] | null>(
    (top, w) => (top === null || w.me - w.rival > top.me - top.rival ? w : top),
    null,
  );
  return rivalSchema.parse({
    teamId: id,
    name: mate.name,
    position,
    league: LEAGUE,
    historyVisible: mate.historyVisible,
    last: {
      seq: 11,
      name: "Journée 11",
      publishedAt: PUBLISHED_AT,
      correctedAt: null,
      me: YOU[10],
      rival: mate.scores[10],
      meTotal,
      rivalTotal,
      leader: leaderOf(meTotal, rivalTotal),
      leaderBefore: leaderOf(beforeMe, beforeRival),
    },
    tally: {
      played: weeks.length,
      won: wins.length,
      lost: weeks.filter((w) => w.me < w.rival).length,
      tied: weeks.filter((w) => w.me === w.rival).length,
    },
    biggestWin: best
      ? { seq: best.seq, me: best.me, rival: best.rival, margin: best.me - best.rival }
      : null,
    weeks,
    captain: mate.historyVisible
      ? {
          me: { name: "M. Tahiri", points: 12 },
          rival: { name: "A. Chakir", points: 20 },
        }
      : null,
    transfer: mate.extras ? { playerIn: "S. Idrissi", pending: true, gain: null } : null,
  });
}

export class MockPremiumRivalsRepository implements PremiumRivalsRepository {
  private pinned: string[] = [teamId(1), teamId(2)];
  private notify = false;

  async myRivals(_context: RepositoryContext): Promise<RivalsResponse> {
    return {
      available: true,
      locked: false,
      season: SEASON,
      max: RIVAL_MAX,
      notify: this.notify,
      me: { name: "Karim B.", total: sum(YOU) },
      rivals: this.pinned.map((id, i) => build(id, i + 1)),
    };
  }

  async candidates(_context: RepositoryContext): Promise<CandidatesResponse> {
    const list: RivalCandidate[] = Object.entries(MATES)
      .filter(([id]) => !this.pinned.includes(id))
      .map(([id, mate]) => ({ teamId: id, name: mate.name, league: LEAGUE }));
    return { available: true, locked: false, candidates: list };
  }

  async pin(id: string, _context: RepositoryContext): Promise<PinOutcome> {
    if (!(id in MATES)) return { kind: "not_found" };
    if (this.pinned.includes(id)) return { kind: "pinned", count: this.pinned.length };
    if (this.pinned.length >= RIVAL_MAX) return { kind: "full" };
    this.pinned = [...this.pinned, id];
    return { kind: "pinned", count: this.pinned.length };
  }

  async unpin(id: string, _context: RepositoryContext): Promise<void> {
    this.pinned = this.pinned.filter((p) => p !== id);
  }

  async setNotify(enabled: boolean, _context: RepositoryContext): Promise<boolean | null> {
    this.notify = enabled;
    return enabled;
  }
}
