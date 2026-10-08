import { describe, expect, it } from "bun:test";

import type { FixtureId } from "@/backend/manager-card/fixtures";
import { FIXTURES } from "@/backend/manager-card/fixtures";
import type { Gameweek } from "@/types/domain";

import {
  cardView,
  homeState,
  isOverForming,
  nextRound,
  nextSeasonLabel,
  registrationIsClosed,
  roundBlock,
  sinceRound,
  tierFell,
  type CardRead,
  type HomeStateInput,
} from "./gradins-state";

const card = (id: FixtureId) => FIXTURES[id].card!;
const NOW = Date.parse("2026-10-14T12:00:00Z");
const HOUR = 3_600_000;

function gameweek(over: Partial<Gameweek> = {}): Gameweek {
  return {
    number: 14,
    deadline: new Date(NOW + 30 * HOUR).toISOString(),
    isCurrent: true,
    averagePoints: null,
    highestPoints: null,
    status: "open",
    ...over,
  };
}

const success = (c: ReturnType<typeof card> | null): CardRead => ({ status: "success", card: c });
const input = (over: Partial<HomeStateInput>): HomeStateInput => ({
  audience: "owner",
  phase: "ready",
  registrationClosed: false,
  read: { status: "pending" },
  ...over,
});

describe("homeState: which Gradins home this is (plan 4.1)", () => {
  it("waits while the session or the screen is unresolved", () => {
    expect(homeState(input({ audience: "pending" })).kind).toBe("loading");
    expect(homeState(input({ audience: "owner", read: { status: "pending" } })).kind).toBe(
      "loading",
    );
    expect(
      homeState(input({ audience: "signed_in", phase: "loading", read: { status: "idle" } })).kind,
    ).toBe("loading");
  });

  it("shows a visitor the proposition, closed or open, whatever the card read says", () => {
    expect(homeState(input({ audience: "signed_out" }))).toEqual({ kind: "guest", closed: false });
    expect(homeState(input({ audience: "signed_out", registrationClosed: true }))).toEqual({
      kind: "guest",
      closed: true,
    });
  });

  it("shows an account with no team its proposition, and never asks the card read", () => {
    expect(homeState(input({ audience: "no_team", read: { status: "idle" } }))).toEqual({
      kind: "no_team",
      closed: false,
    });
    expect(homeState(input({ audience: "no_team", registrationClosed: true })).kind).toBe(
      "no_team",
    );
  });

  it("shows a signed-in account whose Fantasy season is closed the closed proposition", () => {
    const state = homeState(
      input({ audience: "signed_in", phase: "season_closed", read: { status: "idle" } }),
    );
    expect(state).toEqual({ kind: "no_team", closed: true });
  });

  it("shows the card of an owner whose read answered", () => {
    const state = homeState(input({ read: success(card("rated")) }));
    expect(state.kind).toBe("card");
  });

  it("says a deleted-pending owner has no card, and an account with no team has no card either", () => {
    expect(homeState(input({ read: success(null) }))).toEqual({ kind: "unavailable" });
    expect(homeState(input({ audience: "no_team", read: success(null) })).kind).toBe("no_team");
  });

  it("shows the error panel for a failed read, and says when the second factor is owed", () => {
    expect(homeState(input({ read: { status: "error", code: "network" } }))).toEqual({
      kind: "error",
      stepUp: false,
      retry: "card",
    });
    expect(homeState(input({ read: { status: "error", code: "mfa_required" } }))).toEqual({
      kind: "error",
      stepUp: true,
      retry: "card",
    });
    expect(
      homeState(input({ audience: "signed_in", phase: "error", read: { status: "idle" } })),
    ).toEqual({ kind: "error", stepUp: false, retry: "screen" });
  });
});

describe("registrationIsClosed", () => {
  it("is closed for a closed season, a gameweek not yet published and an enrolment of null", () => {
    expect(registrationIsClosed("season_closed", null)).toBe(true);
    expect(registrationIsClosed("awaiting_gameweek", null)).toBe(true);
    expect(registrationIsClosed("ready", { enrolment: null })).toBe(true);
  });
  it("is open for a ready screen with an enrolment, or while it loads", () => {
    expect(registrationIsClosed("ready", { enrolment: { id: "x", number: 3, deadline: "" } })).toBe(
      false,
    );
    expect(registrationIsClosed("ready", {} as Gameweek)).toBe(false);
    expect(registrationIsClosed("loading", null)).toBe(false);
  });
});

describe("cardView", () => {
  it("reads the number and tier of the card in hand", () => {
    const view = cardView(card("rated"));
    expect(view).toMatchObject({ phase: "provisional", ovr: 84, tier: "pro", founder: false });
  });
  it("never invents a number for a forming card", () => {
    expect(cardView(card("forming1"))).toMatchObject({ phase: "forming", ovr: null, tier: null });
  });
  it("shows last season's number and its label in a new season (D7)", () => {
    expect(cardView(card("seasonStarted"))).toMatchObject({
      newSeason: true,
      ovr: 86,
      tier: "pro",
      numberSeason: "2026/27",
    });
  });
  it("flags a founder and a closed season", () => {
    expect(cardView(card("founder")).founder).toBe(true);
    expect(cardView(card("seasonClosed")).seasonClosed).toBe(true);
  });
  it("knows when the tier fell below the season's best", () => {
    expect(tierFell(card("tierDown"))).toBe(true);
    expect(tierFell(card("rated"))).toBe(false);
  });
  it("names the first counted journée for « Depuis la J5 »", () => {
    expect(sinceRound(card("rated"))).toBe(5);
    expect(sinceRound(card("born0"))).toBeNull();
  });
});

describe("« Cette journée » (M3b sub-states and the rated line)", () => {
  const ctx = (gw: Gameweek | null = gameweek()) => ({ gameweek: gw, now: NOW });

  it("says the first counted journée before anything is final", () => {
    const block = roundBlock(card("born0"), ctx());
    expect(block).toMatchObject({ kind: "forming", counted: 0, min: 3 });
    expect(block.kind === "forming" && block.line).toEqual({ kind: "first_counted", gw: 5 });
  });

  it("names the next round and its deadline while forming", () => {
    const block = roundBlock(card("forming1"), ctx());
    expect(block.kind === "forming" && block.line).toEqual({
      kind: "next",
      gw: 14,
      deadline: gameweek().deadline,
    });
  });

  it("says it is the last journée before the note when that journée is locked or live", () => {
    const locked = gameweek({
      number: 7,
      status: "locked",
      deadline: new Date(NOW - HOUR).toISOString(),
    });
    const block = roundBlock(card("eve2"), ctx(locked));
    expect(block.kind === "forming" && block.line).toEqual({ kind: "eve", gw: 7 });
    const live = gameweek({
      number: 7,
      status: "live",
      deadline: new Date(NOW - HOUR).toISOString(),
    });
    expect(roundBlock(card("eve2"), ctx(live)).kind === "forming").toBe(true);
  });

  it("says the journée is over and not final, with no promised time", () => {
    const over = gameweek({
      number: 7,
      status: "provisional",
      deadline: new Date(NOW - 5 * HOUR).toISOString(),
    });
    const block = roundBlock(card("notFinal2"), ctx(over));
    expect(block.kind === "forming" && block.line).toEqual({ kind: "over", gw: 7 });
  });

  it("says the note waits for a statistic at 3 of 3", () => {
    const block = roundBlock(card("insufficient3"), ctx());
    expect(block.kind === "forming" && block.line.kind).toBe("insufficient");
  });

  it("names the journées the server listed when no round is known", () => {
    const block = roundBlock(card("forming1"), ctx(null));
    expect(block.kind === "forming" && block.line).toEqual({
      kind: "listed",
      gws: [5, 6, 7],
      from: 5,
    });
  });

  it("falls back to the staged next round once this one's deadline has passed", () => {
    const past = gameweek({
      deadline: new Date(NOW - HOUR).toISOString(),
      enrolment: { id: "n", number: 15, deadline: new Date(NOW + 100 * HOUR).toISOString() },
    });
    expect(nextRound({ gameweek: past, now: NOW })?.number).toBe(15);
    expect(nextRound({ gameweek: { ...past, enrolment: null }, now: NOW })).toBeNull();
  });

  it("shows the next round of a rated card, with no counter", () => {
    const block = roundBlock(card("rated"), ctx());
    expect(block).toEqual({ kind: "rated", round: { number: 14, deadline: gameweek().deadline } });
  });

  it("replaces the block when the season is closed, and when a new one starts", () => {
    expect(roundBlock(card("seasonClosed"), ctx())).toEqual({
      kind: "closed",
      season: "2026/27",
      ovr: 86,
      tier: "pro",
    });
    expect(roundBlock(card("seasonStarted"), ctx())).toMatchObject({
      kind: "started",
      season: "2027/28",
      previous: "2026/27",
      counted: 0,
      min: 3,
    });
  });

  it("drops the forming display of a season that is over (the late signer)", () => {
    const late = { ...card("forming1"), seasonClosed: true };
    const block = roundBlock(late, ctx());
    expect(block.kind === "forming" && block.line).toEqual({ kind: "late", nextSeason: "2027/28" });
    expect(isOverForming(block)).toBe(true);
    expect(isOverForming(roundBlock(card("forming1"), ctx()))).toBe(false);
  });

  it("derives the next season's label only from a label of that shape", () => {
    expect(nextSeasonLabel("2026/27")).toBe("2027/28");
    expect(nextSeasonLabel("2099/00")).toBe("2100/01");
    expect(nextSeasonLabel("Saison")).toBeNull();
  });
});
