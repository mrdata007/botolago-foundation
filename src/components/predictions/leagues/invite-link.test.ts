import { describe, expect, it } from "bun:test";

import {
  codeFromHash,
  INVITE_PATH,
  inviteLink,
  isInviteCode,
  normalizeInviteCode,
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
