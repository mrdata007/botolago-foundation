import { describe, expect, test } from "bun:test";

import { fillInvite, inviteMessage, leagueInviteLink, whatsappUrl } from "./league-invite";

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

  test("a league name is text, never a replacement pattern", () => {
    // `String.replace` reads `$$`, `$&` and `$'` in its replacement: "Mo$$ Squad"
    // went out as "Mo$ Squad", and "$&" as the placeholder itself.
    const template = "Rejoins « {name} » : {link}";
    expect(inviteMessage(template, "Mo$$ Squad", "L")).toBe("Rejoins « Mo$$ Squad » : L");
    expect(inviteMessage(template, "A$&B", "L")).toBe("Rejoins « A$&B » : L");
    expect(inviteMessage(template, "x$'y", "L")).toBe("Rejoins « x$'y » : L");
  });

  test("a league called {link} cannot take the link's place", () => {
    const message = inviteMessage("Rejoins « {name} » : {link}", "{link}", "https://x/y#code=A");
    expect(message).toBe("Rejoins « {link} » : https://x/y#code=A");
  });

  test("a placeholder with no value is left as it is, so a gap shows in review", () => {
    expect(fillInvite("{a} {b}", { a: "1" })).toBe("1 {b}");
  });

  test("the WhatsApp URL encodes the message", () => {
    expect(whatsappUrl("a b&c")).toBe("https://wa.me/?text=a%20b%26c");
  });
});
