import { afterEach, describe, expect, it } from "bun:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  clearPendingInvite,
  codeFromHash,
  INVITE_PATH,
  INVITE_RECOVERY_MS,
  inviteFromHash,
  inviteLink,
  isInviteCode,
  normalizeInviteCode,
  pendingInvite,
  pendingInviteCode,
  takeInviteFromLocation,
  whatsappUrl,
} from "./invite-link";

const CODE = "A1B2C3D4E5F60718293A4B5C6D7E8F90";

describe("league invite links", () => {
  it("carry the code after '#', which browsers never send to a server", () => {
    const link = inviteLink(CODE, "https://botolago.com");
    expect(link).toBe(`https://botolago.com${INVITE_PATH}#code=${CODE}`);
    const url = new URL(link);
    expect(url.search).toBe("");
    expect(url.pathname).toBe(INVITE_PATH);
  });

  it("name the game they were shared from, after '#', and read it back", () => {
    const link = inviteLink(CODE, "https://botolago.com", "fantasy");
    expect(link).toBe(`https://botolago.com${INVITE_PATH}#code=${CODE}&game=fantasy`);
    expect(new URL(link).search).toBe("");
    expect(inviteFromHash(new URL(link).hash)).toEqual({ code: CODE, game: "fantasy" });
    expect(inviteFromHash(`#code=${CODE}&game=predictions`)?.game).toBe("predictions");
  });

  it("keep working without a game (links made before it existed), ignoring unknown ones", () => {
    expect(inviteFromHash(`#code=${CODE}`)).toEqual({ code: CODE, game: null });
    expect(inviteFromHash(`#code=${CODE}&game=poker`)).toEqual({ code: CODE, game: null });
  });

  it("read back only a well-formed code", () => {
    expect(codeFromHash(`#code=${CODE}`)).toBe(CODE);
    expect(codeFromHash(`#code=${CODE.toLowerCase()}`)).toBe(CODE);
    expect(codeFromHash("#code=nope")).toBeNull();
    expect(codeFromHash("")).toBeNull();
    expect(codeFromHash(`#other=${CODE}`)).toBeNull();
  });

  it("accept what a person types: spaces, dashes, lower case", () => {
    const typed = `${CODE.slice(0, 8).toLowerCase()} - ${CODE.slice(8, 16)}-${CODE.slice(16)}`;
    expect(normalizeInviteCode(typed)).toBe(CODE);
    expect(isInviteCode(typed)).toBe(true);
    expect(isInviteCode("CASA-24")).toBe(false);
  });

  it("share through WhatsApp with the whole message encoded", () => {
    const url = new URL(
      whatsappUrl(`Rejoins « Ligue » : ${inviteLink(CODE, "https://botolago.com")}`),
    );
    expect(url.origin).toBe("https://wa.me");
    expect(url.searchParams.get("text")).toContain(`#code=${CODE}`);
  });
});

describe("the invite a device holds", () => {
  const globals = globalThis as { window?: unknown };
  const previous = globals.window;
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  const store = (map: Map<string, string>) => ({
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  });
  let replaced: string | null = null;
  const fakeWindow = (hash = "") => ({
    localStorage: store(local),
    sessionStorage: store(session),
    location: { hash, pathname: INVITE_PATH, search: "" },
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, url: string) => {
        replaced = url;
      },
    },
  });
  const NOW = Date.parse("2026-10-05T10:00:00Z");
  afterEach(() => {
    local.clear();
    session.clear();
    replaced = null;
    globals.window = previous;
  });

  it("is taken from the address bar once, which is then cleaned, and kept with its game", () => {
    globals.window = fakeWindow(`#code=${CODE}&game=fantasy`);
    expect(takeInviteFromLocation(NOW)).toEqual({ code: CODE, game: "fantasy" });
    expect(replaced).toBe(INVITE_PATH);
    // Back from signing up — even in a new tab, the address bar now empty.
    globals.window = fakeWindow("");
    expect(takeInviteFromLocation(NOW + 60_000)).toEqual({ code: CODE, game: "fantasy" });
    expect(pendingInviteCode(NOW + 60_000)).toBe(CODE);
  });

  it("expires after the recovery lifetime and is then forgotten", () => {
    globals.window = fakeWindow(`#code=${CODE}`);
    takeInviteFromLocation(NOW);
    globals.window = fakeWindow("");
    expect(pendingInvite(NOW + INVITE_RECOVERY_MS - 1)).not.toBeNull();
    expect(pendingInvite(NOW + INVITE_RECOVERY_MS)).toBeNull();
    expect(local.size).toBe(0);
  });

  it("is what the Fantasy join form fills in, until the join clears it", () => {
    globals.window = fakeWindow(`#code=${CODE.toLowerCase()}`);
    takeInviteFromLocation(NOW);
    expect(pendingInviteCode(NOW)).toBe(CODE);
    clearPendingInvite();
    expect(pendingInviteCode(NOW)).toBeNull();
  });

  it("still reads the bare code an older version kept in the tab, and clears it", () => {
    globals.window = fakeWindow();
    session.set("botolago.predictions.invite", CODE.toLowerCase());
    expect(pendingInvite(NOW)).toEqual({ code: CODE, game: null });
    clearPendingInvite();
    expect(pendingInvite(NOW)).toBeNull();
  });

  it("ignores anything that is not a code, a malformed record, and a server render", () => {
    globals.window = fakeWindow();
    local.set("botolago.league-invite.v1", JSON.stringify({ v: 1, code: "nope", savedAt: NOW }));
    expect(pendingInviteCode(NOW)).toBeNull();
    local.set("botolago.league-invite.v1", "{not json");
    expect(pendingInviteCode(NOW)).toBeNull();
    session.set("botolago.predictions.invite", "not-a-code");
    expect(pendingInviteCode(NOW)).toBeNull();
    globals.window = undefined;
    expect(pendingInviteCode(NOW)).toBeNull();
  });
});

describe("the invite landing page", () => {
  const source = readFileSync(join(import.meta.dir, "InviteLandingPage.tsx"), "utf8");

  it("never joins on its own: only a tap calls the join", () => {
    // The one call site is the tap handler; no effect fires it on sign-in.
    expect(source.match(/join\.mutate\(/g)?.length).toBe(1);
    expect(source).not.toContain("autoJoined");
    expect(source).toMatch(
      /const joinPredictions = \(\) => \{\n\s+if \(!code \|\| join\.isPending\) return;/,
    );
  });

  it("never sends the invite code to analytics", () => {
    for (const call of source.match(/track\([^)]*\)/g) ?? []) {
      expect(call).not.toContain("code");
    }
  });
});
