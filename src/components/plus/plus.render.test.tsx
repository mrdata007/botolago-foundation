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

describe("the offer (screen 3)", () => {
  const price = LAUNCH_PRICES[0]!;
  const prices = [{ ...price, validUntil: "2027-05-31T20:00:00.000Z" }];
  const html = render(
    <PlusPaywallScreen
      prices={prices}
      profile={SAMPLE_CARD_PROFILE}
      onBuy={noop}
      titleRef={null}
    />,
  );
  const visible = text(html);

  it("leads with the logo and ONE card: Saison 2026/27, 200 MAD, valid until the server's date", () => {
    expect(html).toContain('class="plus-s3-logo"');
    expect(html).toContain(`aria-label="${PLUS_NAME}"`);
    expect(html.match(/data-testid="plus-season-card"/g)).toHaveLength(1);
    expect(visible).toContain("Saison 2026/27");
    expect(visible).toContain("200 MAD · un seul paiement");
    expect(visible).toContain("Valable jusqu'au 31 mai 2027");
  });
  it("says the end of the season in words while the server has not given a date", () => {
    const bare = text(
      render(
        <PlusPaywallScreen
          prices={LAUNCH_PRICES}
          profile={SAMPLE_CARD_PROFILE}
          onBuy={noop}
          titleRef={null}
        />,
      ),
    );
    expect(bare).toContain("Valable jusqu'à la fin de la saison");
  });
  it("has no monthly card, no toggle, no saving, no radio, no restore", () => {
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain("plus-all");
    for (const gone of ["Mensuel", "mensuel", "économie", "Restaurer", "Le plus avantageux"]) {
      expect(visible).not.toContain(gone);
    }
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
  });
  it("has ONE button, « Payer ma Saison », always enabled, and the terms link under it", () => {
    expect(html.match(/plus-btn plus-btn--primary/g)).toHaveLength(1);
    expect(html).not.toMatch(/class="plus-btn plus-btn--primary"[^>]*disabled/);
    expect(visible).toContain("Payer ma Saison");
    expect(visible).toContain("Conditions de la Saison");
  });
  it("states the terms: one payment, the end date, nothing renews, access once checked", () => {
    expect(visible).toContain("Paiement unique de 200 MAD");
    expect(visible).toContain("court jusqu'au 31 mai 2027");
    expect(visible).toContain("aucun prélèvement automatique");
    expect(visible).toContain("après vérification de votre paiement");
  });
  it("never types the product name as text on screen", () => {
    expect(visible).not.toContain("BotolaGO+");
    expect(visible.toLowerCase()).not.toContain("just for fun");
  });
});

describe("the offer, the short door every entry opens", () => {
  const paywall = (props: {
    context?: "season" | "duel" | "career" | "editions" | "rivals" | "briefing";
  }) =>
    render(
      <PlusPaywallScreen
        prices={LAUNCH_PRICES}
        profile={SAMPLE_CARD_PROFILE}
        context={props.context}
        onBuy={noop}
        titleRef={null}
      />,
    );

  it("shows one visible headline, general by default, and one that carries each context", () => {
    const general = paywall({});
    expect(text(general)).toContain(fr["plus.s3.title"]);
    expect(general).toMatch(/<h1 class="plus-h plus-s3-h"/);
    for (const context of ["season", "duel", "career", "editions", "rivals", "briefing"] as const) {
      const html = paywall({ context });
      expect(text(html)).toContain(fr[`plus.ctx.${context}`]);
      expect(text(html)).not.toContain(fr["plus.s3.title"]);
      expect(html.match(/<h1/g)).toHaveLength(1);
    }
  });
  it("has no refund line to confirm and no dead chevron on a benefit row", () => {
    const html = paywall({});
    expect(text(html)).not.toContain("à confirmer");
    expect(html).not.toContain("plus-chev");
    expect(html).not.toMatch(/<button[^>]*class="plus-feat"/);
    expect("plus.terms.refund" in fr).toBe(false);
    expect("plus.terms.refund" in ar).toBe(false);
  });
  it("uses one vocabulary: Saison, none of the words the owner ruled out", () => {
    const keys = Object.keys(fr).filter((k) =>
      /^plus\.(s[1-5]|ctx|page|terms|note|prices|meta|season|pay|profile|hub)/.test(k),
    );
    for (const key of keys) {
      const word = fr[key as keyof typeof fr];
      expect(word, key).not.toMatch(
        /abonn|\bpass\b|premium|\bmembres?\b|débloqu|provisoire|mensuel|renouvel/i,
      );
    }
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
    expect(visible).toContain("Votre carte, à votre image");
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
    // only the tab bar stops the offer's step swipe; the rest of the screen still swipes
    expect(html.match(/data-no-swipe/g)).toHaveLength(1);
    expect(html).toMatch(/class="ps-tabs"[^>]*data-no-swipe/);
    for (const label of ["Résumé", "Points", "Décisions", "Note"]) expect(visible).toContain(label);
    // the first tab: the gap to the league and the duel in one line, every figure computed
    expect(visible).toContain("+37 points au-dessus de la ligue");
    expect(visible).toContain("575");
    expect(visible).toContain("612");
    expect(visible).toContain("655");
    expect(visible).toContain("Vous menez Sami de 14 points");
    expect(visible).toContain("Voir le duel");
    expect(visible).toContain("Exemple");
    expect(visible).toContain("Découvrir la Saison");
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
    expect(visible).toContain("612 points contre 598");
    expect(visible).toContain("7 journées gagnées sur 11");
    // « Écart à chaque journée » is bars only; the cumulative lead is the third card's line
    expect(html.match(/class="draw l-lead"/g)).toHaveLength(1);
    expect(html.match(/class="draw l-you"/g)).toHaveLength(1);
  });
  it("screen 4: the card, one access line, « Voir Ma saison », « Ouvrir ma saison »", () => {
    const html = render(
      <PlusWelcomeScreen
        profile={SAMPLE_CARD_PROFILE}
        style="chrome"
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
    expect(visible).toContain("Saison 2026/27");
    expect(visible).toContain("jusqu'au 13 novembre 2026");
    expect(visible).toContain("Voir Ma saison");
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
    for (const key of ["plus.with", "plus.terms.until", "plus.terms.until_end"]) {
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
  it("carries none of the words the owner ruled out for the Saison (French)", () => {
    const ruledOut = /abonn|\bpass\b|premium|\bmembres?\b|débloqu|provisoire|mensuel|renouvel/i;
    const mine = keys.filter((k) =>
      /^plus\.(s[2-5]\.|ctx|page|terms|season|pay|profile|hub|meta|lock|in\.member|tr\.(rule|locked_tag|frames_note))/.test(
        k,
      ),
    );
    for (const key of mine) expect(fr[key as keyof typeof fr], key).not.toMatch(ruledOut);
    expect(fr["lock.curva.title.plus"]).not.toMatch(ruledOut);
  });
  it("carries no subscription vocabulary in Arabic either, and Western digits", () => {
    // Owner decision (native Arabic reader), 2026-10-16: the offer is called «اشتراك» in Arabic, so
    // that word is no longer ruled out here. The rest of the subscription vocabulary still is.
    const RULED_OUT = ["مشترك", "بريميوم", "تجديد", "شهري", "سنوي", "استعاد", "عضو"];
    const banFor = (words: string[]) => new RegExp(words.join("|"));
    const ruledOut = banFor(RULED_OUT);
    for (const key of keys) {
      const value = ar[key as keyof typeof ar] as string;
      // The one exception: the owner approved «لا تجديد تلقائي» (2026-10-16, row SE-34) for the
      // "nothing renews" line. It names renewal only to deny it, so تجديد stays banned everywhere
      // else, and this key is still held to the rest of the list.
      const ban =
        key === "plus.terms.norenew" ? banFor(RULED_OUT.filter((w) => w !== "تجديد")) : ruledOut;
      if (/^plus\.(s3|terms|season|pay|profile|hub|page|meta|lock|in\.member)/.test(key)) {
        expect(value, key).not.toMatch(ban);
      }
      expect(value, key).not.toMatch(/[\u0660-\u0669]/);
    }
  });
  it("names the electric edition in the feminine in Arabic (كهربائية)", () => {
    expect(ar["plus.style.electric"]).toBe("كهربائية");
    expect(ar["plus.s3.f1.d"]).toContain("كهربائية");
    expect(ar["plus.s3.f1.d"]).not.toMatch(/كهربائي(?!ة)/);
  });
  it("ties the ad-free benefit to the paid access period in both languages", () => {
    expect(fr["plus.s3.f0.d"]).toContain("pendant votre Saison");
    expect(ar["plus.s3.f0.d"]).toContain("طوال مدة اشتراكك");
    expect(fr["plus.s3.f0.d"]).not.toContain("jamais");
    expect(ar["plus.s3.f0.d"]).not.toContain("أبدًا");
  });
});
