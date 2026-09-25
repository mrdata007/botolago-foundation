import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import {
  __forgetVisitVotesForTests,
  forgetGuestVotes,
  GUEST_VOTES_KEY,
  guestVoteItems,
  MAX_GUEST_VOTE_MATCHES,
  readGuestVotes,
  writeGuestVote,
} from "./guest-votes";

const fixture = (n: number) => `00000020-0000-4000-8000-${String(n).padStart(12, "0")}`;

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const host = globalThis as { window?: unknown };
const hadWindow = "window" in host;
const originalWindow = host.window;

/** A full phone: reads work, writes are refused. */
class FullStorage extends MemoryStorage {
  full = true;
  override setItem(key: string, value: string) {
    if (this.full) throw new Error("QuotaExceededError");
    super.setItem(key, value);
  }
}

beforeEach(() => {
  __forgetVisitVotesForTests();
  host.window = { localStorage: new MemoryStorage() };
});

afterAll(() => {
  if (hadWindow) host.window = originalWindow;
  else delete host.window;
});

describe("a visitor's match votes on the phone", () => {
  test("keeps each question's latest answer, per match", () => {
    writeGuestVote(fixture(1), "winner", "home");
    writeGuestVote(fixture(1), "both_score", "yes");
    writeGuestVote(fixture(1), "winner", "draw");
    expect(readGuestVotes()).toEqual({ [fixture(1)]: { winner: "draw", both_score: "yes" } });
  });

  test("lists one item per match and question, the order the database takes them", () => {
    writeGuestVote(fixture(2), "first_goal", "none");
    writeGuestVote(fixture(1), "winner", "away");
    expect(guestVoteItems(readGuestVotes())).toEqual([
      { fixtureId: fixture(2), question: "first_goal", choice: "none" },
      { fixtureId: fixture(1), question: "winner", choice: "away" },
    ]);
  });

  test("forgets what was sent, and keeps a vote changed since", () => {
    writeGuestVote(fixture(1), "winner", "home");
    writeGuestVote(fixture(1), "both_score", "no");
    const sent = guestVoteItems(readGuestVotes());
    writeGuestVote(fixture(1), "winner", "away");
    forgetGuestVotes(sent);
    expect(readGuestVotes()).toEqual({ [fixture(1)]: { winner: "away" } });
  });

  test("drops the oldest match past the limit", () => {
    for (let n = 1; n <= MAX_GUEST_VOTE_MATCHES + 2; n += 1)
      writeGuestVote(fixture(n), "winner", "home");
    const ids = Object.keys(readGuestVotes());
    expect(ids).toHaveLength(MAX_GUEST_VOTE_MATCHES);
    expect(ids[0]).toBe(fixture(3));
  });

  test("ignores what it did not write: a bad match id, question or answer", () => {
    window.localStorage.setItem(
      GUEST_VOTES_KEY,
      JSON.stringify({
        "not-a-uuid": { winner: "home" },
        [fixture(1)]: { winner: "yes", both_score: "no", score: "2-1" },
      }),
    );
    expect(readGuestVotes()).toEqual({ [fixture(1)]: { both_score: "no" } });
    window.localStorage.setItem(GUEST_VOTES_KEY, "{not json");
    expect(readGuestVotes()).toEqual({});
  });

  test("a phone that blocks storage keeps every vote for the visit", () => {
    host.window = {
      get localStorage(): Storage {
        throw new Error("SecurityError");
      },
    };
    writeGuestVote(fixture(1), "winner", "home");
    expect(writeGuestVote(fixture(1), "both_score", "yes")).toEqual({
      [fixture(1)]: { winner: "home", both_score: "yes" },
    });
    expect(readGuestVotes()).toEqual({ [fixture(1)]: { winner: "home", both_score: "yes" } });
    // A sign-in during the visit sends them, then forgets what was sent.
    forgetGuestVotes([{ fixtureId: fixture(1), question: "winner", choice: "home" }]);
    expect(readGuestVotes()).toEqual({ [fixture(1)]: { both_score: "yes" } });
  });

  test("a full phone keeps the visit's votes, and stores them all once it has room", () => {
    const phone = new FullStorage();
    host.window = { localStorage: phone };
    writeGuestVote(fixture(1), "winner", "away");
    writeGuestVote(fixture(2), "first_goal", "none");
    expect(Object.keys(readGuestVotes())).toEqual([fixture(1), fixture(2)]);
    expect(phone.getItem(GUEST_VOTES_KEY)).toBeNull();

    phone.full = false;
    writeGuestVote(fixture(1), "both_score", "no");
    const stored = {
      [fixture(2)]: { first_goal: "none" },
      [fixture(1)]: { winner: "away", both_score: "no" },
    };
    expect(JSON.parse(phone.getItem(GUEST_VOTES_KEY) ?? "null")).toEqual(stored);
    expect(readGuestVotes()).toEqual(stored);
  });

  test("the server keeps nothing and throws nothing", () => {
    host.window = undefined;
    expect(writeGuestVote(fixture(1), "winner", "home")).toEqual({
      [fixture(1)]: { winner: "home" },
    });
    expect(readGuestVotes()).toEqual({});
  });
});
