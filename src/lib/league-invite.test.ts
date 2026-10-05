import { describe, expect, test } from "bun:test";

import { inviteMessage, leagueInviteLink, whatsappUrl } from "./league-invite";

describe("league invite", () => {
  test("the link carries the code after the hash, normalised", () => {
    expect(leagueInviteLink("ab12 cd34", "https://botolago.com")).toBe(
      "https://botolago.com/pronostics/ligues/rejoindre#code=AB12CD34",
    );
  });

  test("a link shared from Fantasy says so, so the recipient lands on the Fantasy join", () => {
    expect(leagueInviteLink("AB12CD34", "https://botolago.com", "fantasy")).toBe(
      "https://botolago.com/pronostics/ligues/rejoindre#code=AB12CD34&game=fantasy",
    );
  });

  test("the message holds the name and the link", () => {
    expect(inviteMessage("Rejoins « {name} » : {link}", "Les Amis", "https://x/y#code=A")).toBe(
      "Rejoins « Les Amis » : https://x/y#code=A",
    );
  });

  test("the WhatsApp URL encodes the message", () => {
    expect(whatsappUrl("a b&c")).toBe("https://wa.me/?text=a%20b%26c");
  });
});
