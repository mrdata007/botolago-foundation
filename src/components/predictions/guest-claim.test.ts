import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import type { MatchVoteInput, MatchVotesDto } from "@/backend/predictions/contracts";
import type { GuestVotesState } from "@/backend/predictions/guest-votes";
import { sendGuestVotesOnSignIn, type GuestVoteImportServices } from "./guest-claim";

const FIRST = "00000020-0000-4000-8000-000000000001";
const SECOND = "00000020-0000-4000-8000-000000000002";

function phone(initialAccount: string | null = "A") {
  let account = initialAccount;
  let release: () => void = () => undefined;
  const firstAnswer = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sent: { account: string | null; item: MatchVoteInput }[] = [];
  const remaining: GuestVotesState = {
    [FIRST]: { winner: "home" },
    [SECOND]: { winner: "away" },
  };
  const services: GuestVoteImportServices = {
    accountId: () => account,
    read: () => remaining,
    forget: (items) => {
      for (const item of items) delete remaining[item.fixtureId];
    },
    send: async (item) => {
      sent.push({ account, item });
      if (sent.length === 1) await firstAnswer;
      return {} as MatchVotesDto;
    },
  };
  return {
    services,
    sent,
    remaining,
    release,
    becomes: (next: string | null) => {
      account = next;
    },
  };
}

describe("guest vote import belongs to the account that began it", () => {
  for (const nextAccount of ["B", null]) {
    test(`stops after the pending answer when A becomes ${nextAccount ?? "signed out"}`, async () => {
      const device = phone();
      const client = new QueryClient();
      const importing = sendGuestVotesOnSignIn(client, device.services);
      expect(device.sent).toHaveLength(1);
      device.becomes(nextAccount);
      device.release();
      await importing;
      expect(device.sent.map(({ account }) => account)).toEqual(["A"]);
      expect(Object.keys(device.remaining)).toEqual([SECOND]);
      // The unsent vote is still available when the original account returns.
      device.becomes("A");
      await sendGuestVotesOnSignIn(client, device.services);
      expect(device.sent.map(({ account }) => account)).toEqual(["A", "A"]);
      expect(device.remaining).toEqual({});
      client.clear();
    });
  }

  test("sends every vote once when the account stays the same", async () => {
    const device = phone();
    const client = new QueryClient();
    const importing = sendGuestVotesOnSignIn(client, device.services);
    const duplicate = sendGuestVotesOnSignIn(client, device.services);
    expect(duplicate).toBe(importing);
    device.release();
    await importing;
    expect(device.sent.map(({ account }) => account)).toEqual(["A", "A"]);
    expect(device.remaining).toEqual({});
    client.clear();
  });

  test("does not consume a guest's votes before authentication", async () => {
    const device = phone(null);
    const client = new QueryClient();
    await sendGuestVotesOnSignIn(client, device.services);
    expect(device.sent).toEqual([]);
    expect(Object.keys(device.remaining)).toEqual([FIRST, SECOND]);
    client.clear();
  });
});
