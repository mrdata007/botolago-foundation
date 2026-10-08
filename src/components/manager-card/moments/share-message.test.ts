import { describe, expect, it } from "bun:test";

import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

import { momentCopy } from "../copy";
import {
  leagueShareLink,
  plainShareLink,
  shareMessage,
  visibleLink,
  type ShareMessageInput,
} from "./share-message";

const FSI = "⁨";
const PDI = "⁩";

const templatesIn = (lang: Language) =>
  momentCopy((key: TranslationKey) => dictionaries[lang][key]).m6;

function input(lang: Language, over: Partial<ShareMessageInput> = {}): ShareMessageInput {
  const m6 = templatesIn(lang);
  return {
    templates: {
      league: m6.msgLeague,
      leagueProvisional: m6.msgLeagueProvisional,
      plain: m6.msgPlain,
      plainProvisional: m6.msgPlainProvisional,
    },
    lang,
    ovr: 84,
    provisional: false,
    league: null,
    link: "https://botolago.com/jouer?utm_source=whatsapp&utm_campaign=manager_card",
    ...over,
  };
}

describe("the share message", () => {
  it("French, no league: the plain sentence, « tu » allowed, the link last", () => {
    expect(shareMessage(input("fr"))).toBe(
      "Ma carte BotolaGO : 84. Et toi ? https://botolago.com/jouer?utm_source=whatsapp&utm_campaign=manager_card",
    );
  });

  it("French, provisional, with a league: « provisoire » and the league's name", () => {
    const message = shareMessage(
      input("fr", {
        provisional: true,
        league: { name: "Les Lions du Derb" },
        link: "https://botolago.com/pronostics/ligues/rejoindre#code=ABCD",
      }),
    );
    expect(message).toBe(
      "Ma carte BotolaGO : 84 (provisoire). Et toi ? Rejoins ma ligue « Les Lions du Derb » : https://botolago.com/pronostics/ligues/rejoindre#code=ABCD",
    );
  });

  it("French is never touched by isolates (a copy-paste would carry them)", () => {
    for (const provisional of [false, true]) {
      for (const league of [null, { name: "Derb" }]) {
        expect(shareMessage(input("fr", { provisional, league }))).not.toMatch(/[⁦-⁩]/);
      }
    }
  });

  it("Arabic: the number is isolated, in all four variants", () => {
    for (const provisional of [false, true]) {
      for (const league of [null, { name: "الأصدقاء" }]) {
        const message = shareMessage(input("ar", { provisional, league }));
        expect(message).toContain(`${FSI}84${PDI}`);
        expect(message).toContain("BotolaGO");
      }
    }
  });

  it("Arabic: the provisional variants say مبدئي, the others do not", () => {
    expect(shareMessage(input("ar", { provisional: true }))).toContain("مبدئي");
    expect(shareMessage(input("ar", { provisional: false }))).not.toContain("مبدئي");
    expect(shareMessage(input("ar", { provisional: true, league: { name: "x" } }))).toContain(
      "مبدئي",
    );
  });

  it("Arabic: the league's name is isolated and the link stays bare, so it is still a link", () => {
    const message = shareMessage(
      input("ar", {
        league: { name: "Lions du Derb" },
        link: "https://botolago.com/pronostics/ligues/rejoindre#code=ABCD",
      }),
    );
    expect(message).toContain(`${FSI}Lions du Derb${PDI}`);
    expect(message).toContain(" https://botolago.com/pronostics/ligues/rejoindre#code=ABCD");
    expect(message.endsWith("#code=ABCD")).toBe(true);
    expect(message).not.toContain(`${FSI}https`);
  });

  it("no placeholder is left in any variant, in either language", () => {
    for (const lang of ["fr", "ar"] as const) {
      for (const provisional of [false, true]) {
        for (const league of [null, { name: "Derb" }]) {
          expect(shareMessage(input(lang, { provisional, league }))).not.toMatch(/\{[a-z]+\}/);
        }
      }
    }
  });
});

describe("the share links", () => {
  it("WhatsApp: the landing page with the source and the campaign", () => {
    expect(plainShareLink("whatsapp", "https://botolago.com")).toBe(
      "https://botolago.com/jouer?utm_source=whatsapp&utm_campaign=manager_card",
    );
  });

  it("the other channels are tagged by medium", () => {
    for (const channel of ["native", "copy", "download"] as const) {
      expect(plainShareLink(channel, "https://botolago.com")).toBe(
        `https://botolago.com/jouer?utm_source=share&utm_medium=${channel}&utm_campaign=manager_card`,
      );
    }
  });

  it("a league's invite keeps its code after the # and gains the tags before it", () => {
    const link = leagueShareLink(
      "https://botolago.com/pronostics/ligues/rejoindre#code=ABCD&game=fantasy",
      "whatsapp",
    );
    expect(link).toBe(
      "https://botolago.com/pronostics/ligues/rejoindre?utm_source=whatsapp&utm_campaign=manager_card#code=ABCD&game=fantasy",
    );
    expect(new URL(link).hash).toBe("#code=ABCD&game=fantasy");
  });

  it("the sheet shows a link as its address, never the code or the tags", () => {
    expect(visibleLink("https://botolago.com/jouer?utm_source=whatsapp")).toBe(
      "botolago.com/jouer",
    );
    expect(
      visibleLink("https://botolago.com/pronostics/ligues/rejoindre?utm_source=share#code=ABCD"),
    ).toBe("botolago.com/pronostics/ligues/rejoindre");
    expect(visibleLink("not a url")).toBe("not a url");
  });
});
