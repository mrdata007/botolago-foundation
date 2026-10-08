import type { MyCardDto } from "@/backend/manager-card/contracts";
import type { HeroSpec, LineSpec } from "../types";
import { pickHero, stateLines } from "./moments";

/**
 * What the moment gate remembers for as long as the page lives (plan 5.3): the one hero a surface
 * decided to show and the one-line states it showed. It is a small external store, outside React,
 * so that every component that asks the gate for the same surface (Gradins' page, its hero, its
 * lines, the born panel) reads one answer.
 *
 * Why it remembers. A hero is decided once. Acknowledging it removes its moments from the card,
 * which would otherwise make the hero vanish the instant it was seen, and the session flag, which
 * says a hero was shown, would make a second look at the same card show nothing. So the decision,
 * once a hero is in it, is kept; acknowledging only marks it done, which stills its beat and lets
 * the component collapse it. A decision with no hero is looked at again whenever the card changes
 * (a new journée may bring one). The one-line states that carry a moment are kept the same way.
 * A different account (a different team) starts again.
 *
 * Nothing here touches the DOM, React or the network. The session flag is injected.
 */
export type GateSurface = "gradins" | "team";

export interface GateSession {
  heroShown(): boolean;
  markHeroShown(): void;
}

export interface GateInput {
  card: MyCardDto;
  minutesToDeadline: number | null;
  launchGateOpen: boolean;
  /** The import prompt or the step-up notice is on screen. */
  blocked: boolean;
}

/** What a surface reads. The object is replaced when something changes and not before. */
export interface GateSnapshot {
  /** The decided hero. After acknowledgement its `beat` is null: the card stands finished. */
  hero: HeroSpec | null;
  /** The hero's moments were acknowledged (by the ×, a button or two seconds in view). */
  acked: boolean;
  /** The manager closed it (the ×, a button): the label row, lines and buttons collapse. */
  collapsed: boolean;
  /** The lines that carry a moment, kept for the page's life. */
  momentLines: readonly LineSpec[];
}

const EMPTY: GateSnapshot = { hero: null, acked: false, collapsed: false, momentLines: [] };

interface Entry {
  teamId: string;
  hero: HeroSpec | null;
  acked: boolean;
  collapsed: boolean;
  momentLines: Map<LineSpec["kind"], LineSpec>;
  snapshot: GateSnapshot;
}

/** The order the lines are shown in. */
export const LINE_ORDER: readonly LineSpec["kind"][] = [
  "provisional_cleared",
  "season_started",
  "tier_down",
];

export function createMomentStore(session: GateSession) {
  const entries = new Map<GateSurface, Entry>();
  const listeners = new Set<() => void>();
  let blockers = 0;

  const emit = () => {
    for (const listener of [...listeners]) listener();
  };

  const snapshotOf = (entry: Entry): GateSnapshot => ({
    hero: entry.hero ? { ...entry.hero, beat: entry.acked ? null : entry.hero.beat } : null,
    acked: entry.acked,
    collapsed: entry.collapsed,
    momentLines: LINE_ORDER.flatMap((kind) => entry.momentLines.get(kind) ?? []),
  });

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** The current snapshot of a surface; a stable object until it changes. */
    get(surface: GateSurface): GateSnapshot {
      return entries.get(surface)?.snapshot ?? EMPTY;
    },

    /** Something that must be left alone for a moment (the import prompt) is open or closed. */
    block(active: boolean) {
      blockers = Math.max(0, blockers + (active ? 1 : -1));
      emit();
    },
    get blockers() {
      return blockers;
    },

    /**
     * Decide for a surface. Idempotent: a hero already decided is never replaced, and calling it
     * again with the same card changes nothing. Returns whether the snapshot changed.
     */
    evaluate(surface: GateSurface, input: GateInput): boolean {
      if (!input.launchGateOpen) return false;
      let entry = entries.get(surface);
      if (!entry || entry.teamId !== input.card.teamId) {
        entry = {
          teamId: input.card.teamId,
          hero: null,
          acked: false,
          collapsed: false,
          momentLines: new Map(),
          snapshot: EMPTY,
        };
        entries.set(surface, entry);
      }
      let changed = false;
      const picked = pickHero(input.card.moments, {
        surface,
        card: input.card,
        minutesToDeadline: input.minutesToDeadline,
        // A hero this surface already decided is not "another" hero.
        heroShownThisSession: entry.hero ? false : session.heroShown(),
        launchGateOpen: true,
        latestEvaluatedGameweekSeq: input.card.throughGameweekSeq,
        blocked: input.blocked,
      });
      if (!entry.hero && picked.hero) {
        entry.hero = picked.hero;
        session.markHeroShown();
        changed = true;
      }
      for (const line of picked.lines) {
        if (line.keys.length === 0 || entry.momentLines.has(line.kind)) continue;
        entry.momentLines.set(line.kind, line);
        changed = true;
      }
      if (changed) {
        entry.snapshot = snapshotOf(entry);
        emit();
      }
      return changed;
    },

    /**
     * Keys were acknowledged: every surface that holds them stills its beat. `collapse` says the
     * manager closed the hero (the ×, a button), so it folds away; an acknowledgement by being
     * looked at for two seconds leaves it open, for them to read and tap.
     */
    markAcked(keys: readonly string[], collapse = true) {
      const set = new Set(keys);
      let changed = false;
      for (const entry of entries.values()) {
        if (!entry.hero || !entry.hero.keys.some((key) => set.has(key))) continue;
        if (!entry.acked || (collapse && !entry.collapsed)) {
          entry.acked = true;
          entry.collapsed = entry.collapsed || collapse;
          entry.snapshot = snapshotOf(entry);
          changed = true;
        }
      }
      if (changed) emit();
    },

    /** For tests: forget everything. */
    reset() {
      entries.clear();
      blockers = 0;
      emit();
    },
  };
}

export type MomentStore = ReturnType<typeof createMomentStore>;

/**
 * Lines for a card: the ones that carry a moment (kept by the store), then the state lines the
 * card itself shows (a new season waiting for its number, a tier below the season's best).
 */
export function linesOf(card: MyCardDto | null, momentLines: readonly LineSpec[]): LineSpec[] {
  const byKind = new Map(momentLines.map((line) => [line.kind, line] as const));
  if (card) {
    for (const state of stateLines(card)) {
      if (!byKind.has(state.kind)) byKind.set(state.kind, state);
    }
  }
  return LINE_ORDER.flatMap((kind) => byKind.get(kind) ?? []);
}
