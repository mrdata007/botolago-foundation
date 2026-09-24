import { afterEach, describe, expect, test } from "bun:test";

import { ANALYTICS_ACTIVE, pageviewUrl, track, trackPageview } from "./analytics";

const ORIGIN = "https://botolago.com";

describe("pageviewUrl: what a page view may say about the address", () => {
  test("keeps the page and the share links' campaign tags", () => {
    expect(
      pageviewUrl(
        `${ORIGIN}/pronostics?journee=14&utm_source=share&utm_medium=whatsapp&utm_campaign=pronostics`,
      ),
    ).toBe(`${ORIGIN}/pronostics?utm_source=share&utm_medium=whatsapp&utm_campaign=pronostics`);
    expect(pageviewUrl(`${ORIGIN}/matches`)).toBe(`${ORIGIN}/matches`);
  });

  test("never sends what follows '#': an invite code, a sign-in's tokens", () => {
    const url = pageviewUrl(
      `${ORIGIN}/pronostics/ligues/rejoindre#code=A1B2C3D4E5F60718293A4B5C6D7E8F90`,
    );
    expect(url).toBe(`${ORIGIN}/pronostics/ligues/rejoindre`);
    expect(pageviewUrl(`${ORIGIN}/auth/callback#access_token=secret&type=signup`)).not.toContain(
      "secret",
    );
  });

  test("drops every other query value: codes and unsubscribe tokens", () => {
    expect(pageviewUrl(`${ORIGIN}/auth/callback?code=abc123&next=%2F`)).toBe(
      `${ORIGIN}/auth/callback`,
    );
    expect(pageviewUrl(`${ORIGIN}/unsubscribe?token=abc.def.ghi`)).toBe(`${ORIGIN}/unsubscribe`);
  });

  test("counts a private league's page without its id", () => {
    const id = "00000080-0000-4000-8000-000000000001";
    expect(pageviewUrl(`${ORIGIN}/pronostics/ligues/${id}`)).toBe(
      `${ORIGIN}/pronostics/ligues/:id`,
    );
    expect(pageviewUrl(`${ORIGIN}/fantasy/leagues/${id.toUpperCase()}`)).toBe(
      `${ORIGIN}/fantasy/leagues/:id`,
    );
    // Named pages are not ids.
    expect(pageviewUrl(`${ORIGIN}/fantasy/leagues/join`)).toBe(`${ORIGIN}/fantasy/leagues/join`);
  });

  test("does not count the staff pages at all", () => {
    expect(pageviewUrl(`${ORIGIN}/admin`)).toBeNull();
    expect(pageviewUrl(`${ORIGIN}/admin/users/00000001-0000-4000-8000-000000000001`)).toBeNull();
    expect(pageviewUrl(`${ORIGIN}/administration`)).toBe(`${ORIGIN}/administration`);
  });

  test("gives up on what is not an address", () => {
    expect(pageviewUrl("not a url")).toBeNull();
  });
});

describe("track: silent unless measuring", () => {
  const globals = globalThis as { window?: unknown };
  const previous = globals.window;
  afterEach(() => {
    globals.window = previous;
  });

  test("sends nothing outside a production build with the switch on", () => {
    const calls: unknown[][] = [];
    globals.window = {
      plausible: (...args: unknown[]) => calls.push(args),
      location: { href: `${ORIGIN}/pronostics` },
    };
    track("pronostics_share");
    trackPageview();
    // The unit tests are not a production build, whatever the switch says.
    expect(ANALYTICS_ACTIVE).toBe(false);
    expect(calls).toEqual([]);
  });

  test("never throws, even with no window", () => {
    globals.window = undefined;
    expect(() => track("pronostics_signup_click")).not.toThrow();
    expect(() => trackPageview()).not.toThrow();
  });
});
