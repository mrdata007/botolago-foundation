import { afterEach, describe, expect, it } from "bun:test";

import {
  clearPendingInvite,
  codeFromHash,
  INVITE_PATH,
  inviteLink,
  isInviteCode,
  normalizeInviteCode,
  pendingInviteCode,
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

describe("the invite code a tab holds", () => {
  const globals = globalThis as { window?: unknown };
  const previous = globals.window;
  const storage = new Map<string, string>();
  const fakeWindow = {
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
  };
  afterEach(() => {
    storage.clear();
    globals.window = previous;
  });

  it("is what the Fantasy join form fills in, until the join clears it", () => {
    globals.window = fakeWindow;
    expect(pendingInviteCode()).toBeNull();
    storage.set("botolago.predictions.invite", CODE.toLowerCase());
    expect(pendingInviteCode()).toBe(CODE);
    clearPendingInvite();
    expect(pendingInviteCode()).toBeNull();
  });

  it("ignores anything that is not a code, and a server render", () => {
    globals.window = fakeWindow;
    storage.set("botolago.predictions.invite", "not-a-code");
    expect(pendingInviteCode()).toBeNull();
    globals.window = undefined;
    expect(pendingInviteCode()).toBeNull();
  });
});
