import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";

import { LAUNCH_PRICES } from "@/backend/premium/contracts";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";

import { PlusLogo } from "./PlusLogo";
import { PlusPaywallScreen } from "./PlusPaywallScreen";
import { PlusSeasonScreen } from "./PlusSeasonScreen";
import { PlusStyleScreen } from "./PlusStyleScreen";
import { PlusWelcomeScreen } from "./PlusWelcomeScreen";
import { pluralKey, PLUS_NAME } from "./plus-copy";
import { SAMPLE_CARD_PROFILE } from "./plus-sample";

const { fr, ar } = dictionaries;

function render(node: ReactElement): string {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>{node}</I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}
/** Visible text: tags dropped, entities decoded, spaces (and no-break spaces) collapsed. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+/g, " ");
const noop = () => undefined;
const NOW = new Date(2026, 9, 13, 10, 30);

describe("the paywall (screen 3)", () => {
  const html = render(
    <PlusPaywallScreen
      now={NOW}
      prices={LAUNCH_PRICES}
      plan="plus_yearly"
      onPlan={noop}
      profile={SAMPLE_CARD_PROFILE}
      onViewEditions={noop}
      onBuy={noop}
      onRestore={noop}
      titleRef={null}
    />,
  );
  const visible = text(html);

  it("leads with the logo and the selected plan card, « Le plus avantageux », the check", () => {
    expect(html).toContain('class="plus-s3-logo"');
    expect(html).toContain(`aria-label="${PLUS_NAME}"`);
    expect(visible).toContain(fr["plus.s3.best"]);
    expect(visible).toContain("Annuel");
    expect(visible).toContain("200 MAD pour 12 mois");
    expect(visible).toContain("Soit 16,67 MAD par mois · 40 MAD d'économie");
    expect(html).toContain('class="plus-tick"');
  });
  it("keeps the other plan in the radio group, behind « Voir toutes les offres »", () => {
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain('data-open="false"');
    expect(visible).toContain(fr["plus.s3.all_plans"]);
    expect(visible).toContain("Mensuel");
    expect(visible).toContain("20 MAD par mois");
    expect(visible).toContain("Renouvelé le 13 nov. 2026");
  });
  it("lists the four benefits, in order, under the title", () => {
    const at = (s: string) => visible.indexOf(s);
    const order = [
      fr["plus.s3.feat_title"],
      fr["plus.s3.f0.t"],
      fr["plus.s3.f1.t"],
      fr["plus.s3.f2.t"],
      fr["plus.s3.f3.t"],
    ].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(visible).toContain("Sans publicité");
    expect(visible).toContain("Les membres ne verront jamais de publicité dans l'application.");
  });
  it("has ONE subscribe button, and the terms and restore links under it", () => {
    expect(html.match(/plus-btn plus-btn--primary/g)).toHaveLength(1);
    expect(visible).toContain("S'abonner");
    expect(visible).toContain("Conditions de l'abonnement");
    expect(visible).toContain("Restaurer un achat");
  });
  it("states the terms with dates and the saving basis computed from today", () => {
    expect(visible).toContain("13 octobre 2027");
    expect(visible).toContain("Pas de renouvellement automatique");
    expect(visible).toContain(
      "12 paiements mensuels sur les mêmes 12 mois, soit 20 MAD × 12 = 240 MAD",
    );
  });
  it("never types the product name as text on screen", () => {
    expect(visible).not.toContain("BotolaGO+");
    expect(visible.toLowerCase()).not.toContain("just for fun");
  });
});

describe("the other screens", () => {
  it("screen 1: the card, four styles, the one reassurance above the button", () => {
    const html = render(
      <PlusStyleScreen
        profile={SAMPLE_CARD_PROFILE}
        style="holo"
        onStyle={noop}
        onNext={noop}
        titleRef={null}
      />,
    );
    const visible = text(html);
    expect(visible).toContain("Votre carte, à votre style");
    for (const style of ["Holo", "Électrique", "Pixels", "Chrome"])
      expect(visible).toContain(style);
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/role="radio"/g)).toHaveLength(4);
    expect(html).toContain('data-edition="holo"');
    expect(visible).toContain(fr["plus.rule"]);
    expect(visible).toContain("Voir les avantages");
  });
  it("screen 2: « Votre saison », four tabs, numbers from the example season, the way into the duel", () => {
    const html = render(
      <PlusSeasonScreen onNext={noop} titleRef={null} duelOpen={false} onDuel={noop} />,
    );
    const visible = text(html);
    expect(visible).toContain("Votre saison");
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html.match(/role="tablist"/g)).toHaveLength(1);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    for (const label of ["Résumé", "Points", "Décisions", "Note"]) expect(visible).toContain(label);
    // the first tab: the gap to the league and the duel in one line, every figure computed
    expect(visible).toContain("+41 points au-dessus de la ligue");
    expect(visible).toContain("575");
    expect(visible).toContain("616");
    expect(visible).toContain("655");
    expect(visible).toContain("Vous menez Sami de 14 points");
    expect(visible).toContain("Voir le duel");
    expect(visible).toContain("Exemple");
    expect(visible).toContain("Choisir mon pass");
    // no sub-text paragraphs: the removed explanations are gone
    expect(visible).not.toContain("Ce que ça dit");
  });
  it("screen 2: the duel, its common header, four tabs, the lead drawn once on the race tab", () => {
    const html = render(
      <PlusSeasonScreen onNext={noop} titleRef={null} duelOpen={true} onDuel={noop} />,
    );
    const visible = text(html);
    expect(visible).toContain("Détail du duel");
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    for (const label of ["Course", "Comparaison", "Décisions", "Notes"])
      expect(visible).toContain(label);
    expect(visible).toContain("Vous menez Sami de 14 points");
    expect(visible).toContain("616 points contre 602");
    expect(visible).toContain("7 journées gagnées sur 11");
    // « Écart à chaque journée » is bars only; the cumulative lead is the third card's line
    expect(html.match(/class="draw l-lead"/g)).toHaveLength(1);
    expect(html.match(/class="draw l-you"/g)).toHaveLength(1);
  });
  it("screen 4: the card, one access line, « Gérer dans Profil », « Ouvrir ma saison »", () => {
    const html = render(
      <PlusWelcomeScreen
        profile={SAMPLE_CARD_PROFILE}
        style="chrome"
        productCode="plus_monthly"
        periodEnd={new Date(2026, 10, 13)}
        onOpen={noop}
        onManage={noop}
        onShare={noop}
        titleRef={null}
      />,
    );
    const visible = text(html);
    expect(visible).toContain("Votre saison est ouverte");
    expect(visible).toContain("Votre carte passe au style Chrome.");
    expect(visible).toContain("Mensuel");
    expect(visible).toContain("renouvelé le 13 novembre 2026");
    expect(visible).toContain("Gérer dans Profil");
    expect(visible).toContain("Ouvrir ma saison");
  });
});

describe("the logo", () => {
  it("is the wordmark and the 3D plus, named for readers, with ids of its own per instance", () => {
    const html = renderToString(
      <>
        <PlusLogo label={PLUS_NAME} />
        <PlusLogo label={PLUS_NAME} />
      </>,
    );
    expect(html.match(/role="img"/g)).toHaveLength(2);
    expect(html.match(/aria-label="BotolaGO\+"/g)).toHaveLength(2);
    // ten wordmark paths and the plus's gradients, per logo
    expect(html.match(/fill="currentColor"/g)).toHaveLength(20);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).toContain("#4be895");
  });
  it("can be decorative inside something that already says it", () => {
    const html = renderToString(<PlusLogo label={PLUS_NAME} decorative />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("aria-label");
  });
});

describe("counted nouns", () => {
  it("agree with the number in Arabic: 1 singular, 2 dual, 3 to 10 plural, 11 and over singular", () => {
    const word = (n: number) => ar[pluralKey("payments", n, "ar") as keyof typeof ar];
    expect(word(1)).toBe("دفعة شهرية واحدة");
    expect(word(2)).toBe("دفعتين شهريتين");
    expect(word(3)).toBe("{n} دفعات شهرية");
    expect(word(10)).toBe("{n} دفعات شهرية");
    expect(word(11)).toBe("{n} دفعة شهرية");
    expect(word(12)).toBe("{n} دفعة شهرية");
  });
  it("are one / other in French", () => {
    expect(fr[pluralKey("points", 1, "fr") as keyof typeof fr]).toBe("1 point");
    expect(fr[pluralKey("points", 71, "fr") as keyof typeof fr]).toBe("{n} points");
  });
});

describe("the plus.* dictionary", () => {
  const keys = Object.keys(fr).filter((k) => k.startsWith("plus."));
  const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it("is in both languages, with the same placeholders", () => {
    expect(keys.length).toBeGreaterThan(100);
    for (const key of keys) {
      const a = ar[key as keyof typeof ar] as string | undefined;
      expect(a, key).toBeTruthy();
      expect(holes(a!), key).toEqual(holes(fr[key as keyof typeof fr]));
    }
    expect(
      Object.keys(ar)
        .filter((k) => k.startsWith("plus."))
        .sort(),
    ).toEqual([...keys].sort());
  });
  it("never types the product name: it is a logo, so the text carries a {logo} hole instead", () => {
    for (const key of keys) {
      for (const dict of [fr, ar] as const) {
        const value = dict[key as keyof typeof dict] as string;
        // The browser tab title is the one place a plain name is allowed.
        if (key === "plus.meta.offer") continue;
        expect(value, key).not.toContain("BotolaGO+");
      }
    }
    for (const key of ["plus.with", "plus.terms.yearly1"]) {
      expect(fr[key as keyof typeof fr]).toContain("{logo}");
      expect(ar[key as keyof typeof ar]).toContain("{logo}");
    }
  });
  it("carries none of the words the owner ruled out", () => {
    const banned =
      /just for fun|pour le plaisir|pour rigoler|\bprize|lot à gagner|cadeau|intelligence artificielle|généré par|AI-|للمتعة|جائزة|جوائز|الذكاء الاصطناعي/i;
    for (const key of keys) {
      for (const dict of [fr, ar] as const) {
        expect(dict[key as keyof typeof dict], key).not.toMatch(banned);
      }
    }
  });
  it("speaks « vous » in French, with no « tu » forms left", () => {
    const tu = /(?<![\p{L}])(tu|toi|ton|ta|tes|choisis|peux|mènes)(?![\p{L}])/iu;
    for (const key of keys) {
      if (key === "plus.s2.rival_name" || key === "plus.s2.me_name") continue;
      expect(fr[key as keyof typeof fr], key).not.toMatch(tu);
    }
  });
  it("never hedges the monthly renewal in either language", () => {
    const hedge =
      /ne se renouvelle pas|sans renouvellement automatique|ne renouvelle pas de lui|لا يتجدد/;
    for (const key of [
      "plus.monthly.l2",
      "plus.terms.monthly1",
      "plus.terms.monthly2",
      "plus.s4.access_monthly",
      "plus.reminder.title",
    ]) {
      expect(fr[key as keyof typeof fr], key).not.toMatch(hedge);
      expect(ar[key as keyof typeof ar], key).not.toMatch(hedge);
    }
    expect(fr["plus.monthly.l2"]).toContain("Renouvelé");
  });
  it("names the electric edition in the feminine in Arabic (كهربائية)", () => {
    expect(ar["plus.style.electric"]).toBe("كهربائية");
    expect(ar["plus.s3.f1.d"]).toContain("كهربائية");
    expect(ar["plus.s3.f1.d"]).not.toMatch(/كهربائي(?!ة)/);
  });
  it("says « Sans publicité » as a promise about the future, not as a claim about today", () => {
    expect(fr["plus.s3.f0.d"]).toContain("ne verront jamais");
    expect(ar["plus.s3.f0.d"]).toContain("أبدًا");
  });
});
