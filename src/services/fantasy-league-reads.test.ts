import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { dictionaries } from "@/i18n/dictionaries";
import { mapFantasyError } from "@/backend/fantasy/errors";
import type { League } from "@/types/fantasy";
import { joinFailureKind } from "./fantasy-join-errors";
import { joinPrivateLeague } from "./fantasy-join-flow";
import { listReadView } from "./fantasy-read-state";

/**
 * UX-003 and UX-004 — a league read that failed is a failure with a retry, never
 * "no leagues" or "no members"; a join that failed says why, and only the
 * server's refusal of the code says "Code invalide".
 */

const league = (id: string, name: string): League => ({
  id,
  name,
  type: "private",
  members: 3,
  rank: 1,
  previousRank: null,
  score: 0,
});

describe("listReadView (UX-003): five different things", () => {
  it("tells a failed first read from an empty result", () => {
    // The old screens read both as `(data ?? []).length === 0`.
    expect(listReadView({ isError: true, data: undefined })).toBe("failed");
    expect(listReadView({ isError: false, data: [] })).toBe("empty");
  });

  it("keeps the rows of the last good read when a refresh fails, and flags them", () => {
    expect(listReadView({ isError: true, data: [league("a", "A")] })).toBe("stale");
    expect(listReadView({ isError: false, data: [league("a", "A")] })).toBe("ready");
  });

  it("is loading until something answers", () => {
    expect(listReadView({ isError: false, data: undefined })).toBe("loading");
  });
});

describe("joinFailureKind (UX-004)", () => {
  it("calls a code the server refused invalid, and only that", () => {
    const refused = { code: "PT404", message: "invite_code_invalid", details: null, hint: null };
    expect(joinFailureKind(mapFantasyError(refused))).toBe("invalid_code");
    expect(joinFailureKind(refused)).toBe("invalid_code");
  });

  it("does not blame the code for a dropped connection", () => {
    const dropped = { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" };
    expect(joinFailureKind(mapFantasyError(dropped))).toBe("network");
    expect(joinFailureKind(new TypeError("Failed to fetch"))).toBe("network");
    expect(joinFailureKind(new DOMException("The operation was aborted", "AbortError"))).toBe(
      "network",
    );
  });

  it("does not blame the code for a service that did not answer properly", () => {
    const failed = { code: "XX000", message: "canceling statement due to statement timeout" };
    expect(joinFailureKind(mapFantasyError(failed))).toBe("unavailable");
    expect(joinFailureKind(new Error("fantasy_team_not_found"))).toBe("unavailable");
    expect(joinFailureKind(undefined)).toBe("unavailable");
  });
});

describe("joining a private league (UX-004)", () => {
  const joinedOk = async () => ({ leagueId: "L1", joined: true });

  it("reports a successful join as joined when the list read after it fails", async () => {
    // Old behaviour: the one try/catch around both turned this into "Code invalide".
    const result = await joinPrivateLeague("ABC", {
      join: joinedOk,
      invalidateLists: async () => undefined,
      readLeagues: async () => {
        throw new TypeError("Failed to fetch");
      },
    });

    expect(result).toEqual({ joined: true, leagueId: "L1", league: null, refreshFailed: true });
  });

  it("also survives a failed invalidation", async () => {
    const result = await joinPrivateLeague("ABC", {
      join: joinedOk,
      invalidateLists: async () => {
        throw new Error("boom");
      },
      readLeagues: async () => [league("L1", "Amis")],
    });
    expect(result.refreshFailed).toBe(true);
    expect(result.joined).toBe(true);
  });

  it("names the league the server joined, not the list's last entry", async () => {
    const result = await joinPrivateLeague("ABC", {
      join: joinedOk,
      invalidateLists: async () => undefined,
      readLeagues: async () => [league("L1", "Amis"), league("L2", "Plus récente")],
    });
    expect(result).toEqual({
      joined: true,
      leagueId: "L1",
      league: { id: "L1", name: "Amis" },
      refreshFailed: false,
    });
  });

  it("keeps the already-member answer", async () => {
    const result = await joinPrivateLeague("ABC", {
      join: async () => ({ leagueId: "L1", joined: false }),
      invalidateLists: async () => undefined,
      readLeagues: async () => [league("L1", "Amis")],
    });
    expect(result.joined).toBe(false);
  });

  it("falls back to the last league only when an older server names none", async () => {
    const result = await joinPrivateLeague("ABC", {
      join: async () => ({ leagueId: null, joined: true }),
      invalidateLists: async () => undefined,
      readLeagues: async () => [league("L1", "Amis"), league("L2", "Dernière")],
    });
    expect(result.league).toEqual({ id: "L2", name: "Dernière" });
  });

  it("lets a failed join propagate untouched, so the screen can classify it", async () => {
    const refused = { code: "PT404", message: "invite_code_invalid" };
    let read = false;
    await expect(
      joinPrivateLeague("NOPE", {
        join: async () => {
          throw refused;
        },
        invalidateLists: async () => undefined,
        readLeagues: async () => {
          read = true;
          return [];
        },
      }),
    ).rejects.toBe(refused);
    expect(read).toBe(false);
  });
});

const ROOT = join(import.meta.dir, "..", "..");
function code(path: string): string {
  return readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");
}

describe("the league screens are wired to say which (UX-003, UX-004)", () => {
  it("the leagues page shows a failed private read as a failure with a retry, not as 'no leagues'", () => {
    const source = code("src/routes/fantasy.leagues.tsx");
    expect(source).toContain("listReadView(privateQ)");
    expect(source).toContain('privateView === "failed"');
    expect(source).toContain('<UiErrorState body={t("fantasy.leagues.read_failed")}');
    expect(source).toContain("onRetry={() => void privateQ.refetch()}");
    // The empty state is only reached by a successful, empty read.
    expect(source).toMatch(/privateView === "empty" \? \( <UiEmptyState/);
    // No `(data ?? []).length === 0` decides emptiness any more.
    expect(source).not.toContain("(privateQ.data ?? []).length === 0");
  });

  it("the public list and the joined members flag a failed read and offer a retry", () => {
    const leagues = code("src/routes/fantasy.leagues.tsx");
    expect(leagues).toContain("listReadView(publicQ)");
    expect(leagues).toContain("fantasy.leagues.public_read_failed");
    const join = code("src/routes/fantasy.leagues.join.tsx");
    expect(join).toContain("fantasy.leagues.members_read_failed");
    expect(join).toContain("void membersQ.refetch()");
    expect(join).toContain("fantasy.leagues.public_read_failed");
    // An empty public list is only drawn for a successful empty read.
    expect(join).toContain('publicView === "empty"');
  });

  it("the league page keeps a standings failure apart from an empty league", () => {
    const source = code("src/routes/fantasy.leagues.$leagueId.tsx");
    expect(source).toContain("standingsQ.isError && !standingsQ.data");
    expect(source).toContain("standingsQ.isRefetchError");
    expect(source).toContain("standingsQ.isFetchNextPageError");
  });

  it("the join screen marks the code invalid only from the classified failure", () => {
    const source = code("src/routes/fantasy.leagues.join.tsx");
    expect(source).not.toContain("setInvalid");
    expect(source).toContain('failure === "invalid_code"');
    expect(source).toContain("joinPrivateLeague(");
  });
});

describe("the new wording exists in both languages (UX-003, UX-004, FANT-03, FANT-05)", () => {
  const keys = [
    "fantasy.leagues.read_failed",
    "fantasy.leagues.public_read_failed",
    "fantasy.leagues.members_read_failed",
    "fantasy.leagues.joined_refresh_failed",
    "fantasy.leagues.join_network",
    "fantasy.leagues.join_unavailable",
    "fantasy.leagues.stale",
    "fantasy.leagues.show_more",
    "fantasy.leagues.more_failed",
    "fantasy.rankings.search_limited",
  ] as const;

  it("has every key, filled, in French and Arabic", () => {
    for (const key of keys) {
      expect(dictionaries.fr[key]?.trim()).toBeTruthy();
      expect(dictionaries.ar[key]?.trim()).toBeTruthy();
    }
  });

  it("keeps the placeholders of the search notice in both", () => {
    for (const lang of ["fr", "ar"] as const) {
      const text = dictionaries[lang]["fantasy.rankings.search_limited"];
      expect(text).toContain("{scanned}");
      expect(text).toContain("{total}");
    }
  });

  it("does not say the invalid-code words for a connection failure", () => {
    for (const lang of ["fr", "ar"] as const) {
      expect(dictionaries[lang]["fantasy.leagues.join_network"]).not.toBe(
        dictionaries[lang]["fpl.invalid_code"],
      );
      expect(dictionaries[lang]["fantasy.leagues.join_unavailable"]).not.toBe(
        dictionaries[lang]["fpl.invalid_code"],
      );
    }
  });
});
