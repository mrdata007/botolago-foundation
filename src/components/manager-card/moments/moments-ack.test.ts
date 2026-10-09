import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { FIXTURES, type FixtureId } from "@/backend/manager-card/fixtures";
import { acknowledgeMoments, managerCardKeys } from "@/services/use-manager-card";

import { readAckedMoments } from "../storage";
import { pickHero } from "./moments";

/**
 * What the gate hands to `acknowledgeMoments` for each fixture's hero: every key the hero folds in,
 * in ONE call, with the phone's own cache written before the network is touched, and the cached
 * card emptied of them (plan 5.3 and 7.6).
 */
const globals = globalThis as { window?: unknown };
const previous = globals.window;
const stored = new Map<string, string>();
beforeEach(() => {
  globals.window = {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    },
  };
});
afterEach(() => {
  stored.clear();
  if (previous === undefined) delete globals.window;
  else globals.window = previous;
});

const heroOf = (id: FixtureId) => {
  const card = FIXTURES[id].card as MyCardDto;
  const { hero } = pickHero(card.moments, {
    surface: "gradins",
    card,
    minutesToDeadline: 1000,
    heroShownThisSession: false,
    launchGateOpen: true,
    latestEvaluatedGameweekSeq: card.throughGameweekSeq,
  });
  return { card, hero };
};

describe("acknowledging a hero", () => {
  for (const id of [
    "born0Serial",
    "rated",
    "launchArrival",
    "returning",
    "tierUp",
    "legend",
    "founder",
    "seasonClosed",
  ] as const) {
    it(`${id}: every key, one call, the phone first`, async () => {
      const { card, hero } = heroOf(id);
      expect(hero).not.toBeNull();
      const queryClient = new QueryClient();
      queryClient.setQueryData(managerCardKeys.me("u"), card);
      const calls: string[][] = [];
      let phoneHadThemWhenSent: string[] = [];
      await acknowledgeMoments(queryClient, "u", hero!.keys, {
        ackMoments: async (keys) => {
          phoneHadThemWhenSent = readAckedMoments("u");
          calls.push([...keys]);
          return { acknowledged: [...keys], ignored: [] };
        },
      });
      expect(calls).toEqual([hero!.keys]);
      expect(phoneHadThemWhenSent).toEqual(hero!.keys);
      const left = queryClient
        .getQueryData<MyCardDto>(managerCardKeys.me("u"))!
        .moments.map((moment) => moment.key);
      for (const key of hero!.keys) expect(left).not.toContain(key);
    });
  }

  it("a returning manager's two keys go out together", () => {
    expect(heroOf("returning").hero!.keys).toHaveLength(2);
    expect(heroOf("launchArrival").hero!.keys).toHaveLength(2);
  });
});
