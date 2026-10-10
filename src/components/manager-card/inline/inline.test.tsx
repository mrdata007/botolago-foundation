import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import type { MemberCardDto, MyCardDto } from "@/backend/manager-card/contracts";
import { FIXTURES } from "@/backend/manager-card/fixtures";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { Club, Gameweek, Language } from "@/types/domain";

/**
 * The Fantasy package's inline surfaces, live: what each draws for each card and in each language.
 * The server render is French and has no card read, so this file stands in for the three hooks
 * that carry them: `useI18n` answers in the language under test, `useManagerCardStatus` is the
 * status the server sent, and the card hooks answer with a fixture card. All three modules are
 * put back once the file is done (`src/test-isolation.test.ts`).
 */

const ROOT = join(import.meta.dir, "..", "..", "..", "..");

const realI18n = { ...(await import("@/i18n/provider")) };
const realStatus = { ...(await import("@/services/manager-card-status")) };
const realHooks = { ...(await import("@/services/use-manager-card")) };

let language: Language = "fr";
let minRated: number | null = 3;
let myCard: MyCardDto | null | undefined = FIXTURES.forming1.card;
let cards: MemberCardDto[] | undefined;
let cardsLoading = false;

mock.module("@/i18n/provider", () => ({
  ...realI18n,
  useI18n: () => {
    const real = realI18n.useI18n();
    const dictionary = dictionaries[language];
    return {
      ...real,
      lang: language,
      dir: language === "ar" ? "rtl" : "ltr",
      t: (key: TranslationKey) => dictionary[key],
    };
  },
}));
mock.module("@/services/manager-card-status", () => ({
  ...realStatus,
  useManagerCardLive: () => true,
  useManagerCardStatus: () => ({ enabled: true, minRated, minConfirmed: 5 }),
}));
mock.module("@/services/use-manager-card", () => ({
  ...realHooks,
  useMyManagerCard: () => ({ data: myCard, isLoading: false }),
  useManagerCards: () => ({ data: cards, isLoading: cardsLoading }),
}));
afterAll(() => {
  mock.module("@/i18n/provider", () => realI18n);
  mock.module("@/services/manager-card-status", () => realStatus);
  mock.module("@/services/use-manager-card", () => realHooks);
});

const { GuestIntroCardPoint } = await import("./GuestIntroCardPoint");
const { CardSaveLine, BuilderReturnLine } = await import("./CardSaveLine");
const { saveLineProfile } = await import("./inline-model");
const { HubCardBlockView } = await import("./HubCardBlock");
const { RankCardTokenView } = await import("./RankCardToken");
const { RecapCardLineView } = await import("./RecapCardLine");
const { FirstTransferLineView } = await import("./FirstTransferLine");
const { PepitesHubTile } = await import("./PepitesHubTile");
const { LeagueCardBand, LeagueCompareLink } = await import("./LeagueCardBand");
const { LeagueRowMini } = await import("./LeagueRowMini");
const { CardHint } = await import("./CardHint");
const { claimHint } = await import("./hint-once");
const { DEVICE_KEYS } = await import("../storage");

beforeEach(() => {
  language = "fr";
  minRated = 3;
  myCard = FIXTURES.forming1.card;
  cards = undefined;
  cardsLoading = false;
});

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/fantasy"] }),
  });
  await router.load();
  return renderToString(
    <realI18n.I18nProvider>
      <RouterProvider router={router} />
    </realI18n.I18nProvider>,
  )
    .replace(/<!-- -->/g, "")
    .replace(/[⁦-⁩]/g, "");
}

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const card = (id: keyof typeof FIXTURES, over: Partial<MyCardDto> = {}): MyCardDto => ({
  ...(FIXTURES[id].card as MyCardDto),
  ...over,
});
const LANGUAGES: Language[] = ["fr", "ar"];
const GAMEWEEK: Gameweek = {
  number: 6,
  deadline: new Date(Date.now() + 2 * 24 * 3_600_000).toISOString(),
  isCurrent: true,
  status: "open",
  averagePoints: null,
  highestPoints: null,
};

/** Plan 2.5, both languages. */
const BANNED =
  /\b(pull|pack|level up|monter de niveau|débloquer|tirage|chance|révélation|officiel|signature|exclusif|rare|limité|édition|VIP|dernière chance|vite|collectionner|gagner)\b|رسمي|توقيع|محدود/i;

describe("GuestIntroCardPoint", () => {
  it("names the card as the result of playing, with the rounds the status sent", async () => {
    const html = await render(
      <ul>
        <GuestIntroCardPoint />
      </ul>,
    );
    const plain = text(html);
    expect(plain).toContain(escapeHtml(dictionaries.fr["card.onboarding.m1.intro.title"]));
    expect(plain).toContain(
      "Elle démarre avec votre équipe. Sa note arrive après 3 journées terminées.",
    );
    expect(html).toContain('data-testid="fantasy-intro-card-point"');
  });
  it("says it in Arabic with the rounds' own plural", async () => {
    language = "ar";
    const plain = text(
      await render(
        <ul>
          <GuestIntroCardPoint />
        </ul>,
      ),
    );
    expect(plain).toContain("بطاقتك كمدرّب");
    expect(plain).toContain("3 جولات منتهية");
  });
  it("follows the status's rounds, never a constant", async () => {
    minRated = 5;
    expect(
      text(
        await render(
          <ul>
            <GuestIntroCardPoint />
          </ul>,
        ),
      ),
    ).toContain("5 journées terminées");
    minRated = 1;
    expect(
      text(
        await render(
          <ul>
            <GuestIntroCardPoint />
          </ul>,
        ),
      ),
    ).toContain("1 journée terminée");
  });
  it("renders nothing when the status carries no rounds", async () => {
    minRated = null;
    expect(
      await render(
        <ul>
          <GuestIntroCardPoint />
        </ul>,
      ),
    ).not.toContain("fantasy-intro-card-point");
  });
  it("sits in the same gradient disc as the four steps, hidden from assistive technology, with no request", async () => {
    const html = await render(
      <ul>
        <GuestIntroCardPoint />
      </ul>,
    );
    expect(html).toContain("--ui-grad-action");
    expect(html).toMatch(/<span aria-hidden="true"[^>]*h-9 w-9/);
    // A drawn card, not an icon: no SVG glyph of the lucide set.
    expect(html).not.toContain("lucide");
  });
});

describe("the save step's line", () => {
  const clubs = [
    {
      id: "war",
      slug: "war",
      name: { fr: "Wydad AC", ar: "الوداد" },
      shortName: { fr: "Wydad", ar: "الوداد" },
      crestPlaceholder: "WAC",
    },
  ] as unknown as Club[];

  it("is the unnamed base card for a visitor, the card's name and club for a signed-in manager", () => {
    const visitor = saveLineProfile({
      signedIn: false,
      displayName: "Rachid",
      teamName: "Atlas XI",
      club: null,
    });
    expect(visitor.name).toBe("");
    expect(visitor.club).toBeNull();
    expect(visitor.ovr).toBeNull();
    expect(visitor.serial).toBeNull();
    const signed = saveLineProfile({
      signedIn: true,
      displayName: " Rachid ",
      teamName: "Atlas XI",
      club: null,
    });
    expect(signed.name).toBe("Rachid");
    // The team name only while the display name is blank (D17).
    expect(
      saveLineProfile({ signedIn: true, displayName: "  ", teamName: "Atlas XI", club: null }).name,
    ).toBe("Atlas XI");
  });

  it("draws a 64 px row with the token and the approved line above the button", async () => {
    const html = await render(
      <CardSaveLine
        signedIn={false}
        displayName={null}
        teamName=""
        clubs={clubs}
        favoriteClubId={null}
      />,
    );
    expect(html).toContain('data-testid="card-save-line"');
    expect(html).toContain("min-h-16");
    expect(text(html)).toContain(
      "À l’enregistrement, votre carte de manager démarre avec votre équipe. Sa note arrive après 3 journées terminées.",
    );
    // The object is named for what it is, and says it has no number: never 0.
    expect(text(html)).toContain("Carte de manager, pas encore de note");
    expect(html).not.toContain(">0<");
  });

  it("names the account on the card and the club it chose, for a manager without a team", async () => {
    const html = await render(
      <CardSaveLine
        signedIn
        displayName="Rachid Demo"
        teamName="Atlas XI"
        clubs={clubs}
        favoriteClubId="war"
      />,
    );
    // The token is drawn on the client; on the server the box carries the card's own sentence.
    expect(html).toContain("sr-only");
  });

  it("is silent when the status carries no rounds", async () => {
    minRated = null;
    expect(
      await render(
        <CardSaveLine
          signedIn={false}
          displayName={null}
          teamName=""
          clubs={clubs}
          favoriteClubId={null}
        />,
      ),
    ).not.toContain("card-save-line");
  });

  it("says the account is made and the team remains, once, as a status the button points at", async () => {
    const html = await render(<BuilderReturnLine id="card-builder-return-line" />);
    expect(html).toContain('id="card-builder-return-line"');
    expect(html).toContain('role="status"');
    expect(text(html)).toContain("Compte créé. Il reste à enregistrer votre équipe.");
    language = "ar";
    expect(text(await render(<BuilderReturnLine id="x" />))).toContain("بقي حفظ فريقك");
  });
});

describe("HubCardBlockView", () => {
  it("shows the counter, the forming label and the next round while the card forms", async () => {
    const html = await render(<HubCardBlockView card={card("forming1")} gameweek={GAMEWEEK} />);
    const plain = text(html);
    expect(html).toContain('href="/curva"');
    expect(html).toContain('data-testid="hub-card-block"');
    expect(plain).toContain("1/3");
    expect(plain).toContain("Carte en formation");
    expect(plain).toContain("Note après 3 journées terminées");
    expect(plain).toContain("prochaine : J6");
    expect(plain).toContain("Voir votre carte");
    expect(html).not.toContain("Nouveau");
  });
  it("carries « Nouveau » while a moment waits for the card page, and nothing when none does", async () => {
    expect(
      text(await render(<HubCardBlockView card={card("born0")} gameweek={GAMEWEEK} />)),
    ).toContain("Nouveau");
    expect(
      text(await render(<HubCardBlockView card={card("forming1")} gameweek={GAMEWEEK} />)),
    ).not.toContain("Nouveau");
  });
  it("shows the number, its tier and « Provisoire » once rated, and the next round", async () => {
    const plain = text(await render(<HubCardBlockView card={card("rated")} gameweek={GAMEWEEK} />));
    expect(plain).toContain("84");
    expect(plain).toContain("OVR");
    expect(plain).toContain("PRO");
    expect(plain).toContain("Provisoire");
    expect(plain).toContain("J6 · date limite");
    expect(plain).not.toContain("Carte en formation");
    // Not provisional: no pill.
    expect(
      text(await render(<HubCardBlockView card={card("cleared")} gameweek={GAMEWEEK} />)),
    ).not.toContain("Provisoire");
  });
  it("says the minimum is reached and the number waits for a statistic", async () => {
    expect(
      text(await render(<HubCardBlockView card={card("insufficient3")} gameweek={GAMEWEEK} />)),
    ).toContain("Les journées nécessaires sont comptées. La note attend encore une statistique.");
  });
  it("leads a late signer with the late line and « 1/3 · 2026/27 » beneath, with no title and no big counter", async () => {
    const late = card("forming1", { seasonClosed: true });
    const html = await render(<HubCardBlockView card={late} gameweek={GAMEWEEK} />);
    const plain = text(html);
    expect(plain).toContain("Saison terminée avant votre première note : elle viendra en 2027/28.");
    expect(plain).toContain("1/3 · 2026/27");
    expect(plain).not.toContain("Carte en formation");
    expect(html).not.toContain(escapeHtml("text-[length:var(--ui-stat-hero)]"));
    expect(html.indexOf("Saison terminée")).toBeLessThan(html.indexOf("1/3"));
  });
  it("says the season is over with its number when it ended rated", async () => {
    expect(
      text(await render(<HubCardBlockView card={card("seasonClosed")} gameweek={GAMEWEEK} />)),
    ).toContain("Saison 2026/27 terminée : 86, PRO. Elle reste sur votre carte.");
  });
  it("is mirrored and worded in Arabic, the counter one left-to-right run", async () => {
    language = "ar";
    const html = await render(<HubCardBlockView card={card("forming1")} gameweek={GAMEWEEK} />);
    expect(text(html)).toContain("البطاقة قيد التكوين");
    expect(html).toContain('<bdi dir="ltr"');
    expect(text(html)).toContain("1/3");
    expect(text(html)).toContain("التالية: الجولة");
  });
  it("binds the journée's number to its word, so Arabic never ends a line on « الجولة » alone", async () => {
    language = "ar";
    const html = await render(<HubCardBlockView card={card("forming1")} gameweek={GAMEWEEK} />);
    expect(html).toMatch(/الجولة\u00a0(?:<!-- -->)?<bdi dir="ltr"[^>]*>(?:<!-- -->)?6/);
    // The separators already bind to the word before them.
    expect(html).toContain("\u00a0· ");
  });
  it("keeps the sentence's case: no uppercase, letter-spaced label anywhere in the block", async () => {
    const html = await render(<HubCardBlockView card={card("born0")} gameweek={GAMEWEEK} />);
    expect(html).not.toContain("uppercase");
    // The numerals' own tightening is the stat step's; a letter-spaced label is `tracking-wide`.
    expect(html).not.toContain("tracking-wide");
  });
  it("is one link, with no control inside it, and a 112 px floor", async () => {
    const html = await render(<HubCardBlockView card={card("rated")} gameweek={GAMEWEEK} />);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).not.toContain("<button");
    expect(html).toContain("min-h-28");
  });
});

describe("RankCardTokenView", () => {
  it("shows « k/n » while forming and the number with OVR once rated, and is named for what it is", async () => {
    const forming = await render(<RankCardTokenView card={card("forming1")} />);
    expect(text(forming)).toContain("1/3");
    expect(forming).toContain('href="/curva"');
    expect(forming).toMatch(/aria-label="Carte de manager, [^"]*pas encore de note/);
    expect(forming).toContain("Voir votre carte");
    const rated = text(await render(<RankCardTokenView card={card("rated")} />));
    expect(rated).toContain("84");
    expect(rated).toContain("OVR");
  });
});

describe("RecapCardLineView", () => {
  it("says which counted round this was, in French", async () => {
    const html = await render(<RecapCardLineView card={card("eve2")} gameweek={6} />);
    expect(text(html)).toContain("Journée comptée pour votre carte : 2/3");
  });
  it("keeps « 2/3 » one left-to-right run in Arabic, never « 3/2 »", async () => {
    language = "ar";
    const html = await render(<RecapCardLineView card={card("eve2")} gameweek={6} />);
    expect(html).toContain('<bdi dir="ltr">2/3</bdi>');
    expect(text(html)).toContain("جولة محتسبة لبطاقتك");
  });
  it("is absent for a round that did not count, and once the card has a number", async () => {
    expect(await render(<RecapCardLineView card={card("eve2")} gameweek={9} />)).not.toContain(
      "recap-card-line",
    );
    expect(await render(<RecapCardLineView card={card("rated")} gameweek={6} />)).not.toContain(
      "recap-card-line",
    );
  });
});

describe("FirstTransferLineView", () => {
  it("says TRF will measure the transfer after the rounds, in both languages", async () => {
    const withTrf = card("ratedTrfNull");
    expect(text(await render(<FirstTransferLineView card={withTrf} />))).toContain(
      "TRF mesurera ce transfert après 3 journées terminées.",
    );
    language = "ar";
    expect(text(await render(<FirstTransferLineView card={withTrf} />))).toContain(
      "3 جولات منتهية",
    );
  });
});

describe("PepitesHubTile", () => {
  it("is a plain link to /pepites with Pépites' own name and the hub's line", async () => {
    const html = await render(<PepitesHubTile className="mt-2" />);
    expect(html).toContain('href="/pepites"');
    expect(html).toContain('data-testid="fantasy-hub-pepites-tile"');
    expect(text(html)).toContain("Pépites");
    expect(text(html)).toContain(escapeHtml(dictionaries.fr["fantasy.hub.pepites_body"]));
    expect(html).toContain("min-h-16");
    language = "ar";
    expect(text(await render(<PepitesHubTile />))).toContain(dictionaries.ar["nav.pepites"]);
  });
});

describe("the league band, minis and compare link", () => {
  const base = FIXTURES.rated.league!.members;
  const member = (teamId: string, firstRated: number | null, name: string): MemberCardDto => ({
    ...(base[0] as MemberCardDto),
    teamId,
    name,
    firstRatedGameweekSeq: firstRated,
  });

  it("names the members first rated in the latest journée, in the league's order, without the reader", async () => {
    myCard = card("rated"); // evaluated through 7
    cards = [
      member("a", 7, "Sami"),
      member("me", 7, "Rachid"),
      member("b", 5, "Nora"),
      member("c", 7, "Imane"),
    ];
    const html = await render(<LeagueCardBand order={["a", "me", "b", "c"]} ownTeamId="me" />);
    const plain = text(html);
    expect(html).toContain('data-testid="league-card-band"');
    expect(html).toContain('data-testid="league-card-band-rail"');
    expect(plain).toContain("Nouvelles notes après la J7 : Sami, Imane");
    expect(plain).not.toContain("Rachid");
    expect(plain).not.toContain("Nora");
    // Names only in the sentence: no member's number is written there (the minis are drawn and
    // hidden from assistive technology, so the band's spoken text is this line alone).
    const sentence = text(/<p [^>]*>([\s\S]*?)<\/p>/.exec(html)![1]!);
    expect(sentence).toBe("Nouvelles notes après la J7 : Sami, Imane");
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>(?:<span class="mc-token)/);
  });
  it("shows at most three, and only when someone is new", async () => {
    myCard = card("rated");
    cards = ["a", "b", "c", "d", "e"].map((id, index) => member(id, 7, `M${index}`));
    const plain = text(
      await render(<LeagueCardBand order={["a", "b", "c", "d", "e"]} ownTeamId="x" />),
    );
    expect(plain).toContain("M0, M1, M2");
    expect(plain).not.toContain("M3");
    cards = [member("a", 5, "Sami")];
    expect(await render(<LeagueCardBand order={["a"]} ownTeamId="x" />)).not.toContain(
      "league-card-band",
    );
    cards = undefined;
    expect(await render(<LeagueCardBand order={["a"]} ownTeamId="x" />)).not.toContain(
      "league-card-band",
    );
  });
  it("mirrors the names' separator in Arabic and isolates each name", async () => {
    language = "ar";
    myCard = card("rated");
    cards = [member("a", 7, "Sami"), member("c", 7, "Imane")];
    const html = await render(<LeagueCardBand order={["a", "c"]} ownTeamId="x" />);
    expect(html).toContain('<bdi dir="auto">Sami</bdi>');
    expect(text(html)).toContain("تقييمات جديدة بعد الجولة");
  });
  it("draws a mini only for a member with a card, hidden from assistive technology", async () => {
    cards = [member("a", 7, "Sami")];
    const withCard = await render(<LeagueRowMini teamId="a" teamIds={["a", "z"]} />);
    expect(withCard).toContain('data-testid="league-row-mini"');
    expect(withCard).toContain('aria-hidden="true"');
    expect(await render(<LeagueRowMini teamId="z" teamIds={["a", "z"]} />)).not.toContain(
      "league-row-mini",
    );
  });
  it("holds a mini's place while the cards load, and takes it away if the read gave nothing", async () => {
    cards = undefined;
    cardsLoading = true;
    expect(await render(<LeagueRowMini teamId="a" teamIds={["a"]} />)).toContain("h-7 w-7");
    cardsLoading = false;
    expect(await render(<LeagueRowMini teamId="a" teamIds={["a"]} />)).not.toContain("h-7 w-7");
  });
  it("links to « Les vôtres » for this league, as a plain muted line with 44 px to tap", async () => {
    const html = await render(
      <LeagueCompareLink leagueId="3c000000-0000-4000-8000-000000000001" />,
    );
    expect(html).toContain('href="/curva/les-votres?ligue=3c000000-0000-4000-8000-000000000001"');
    expect(text(html)).toContain("Comparer les cartes de la ligue");
    expect(html).toContain("min-h-11");
    expect(html).not.toContain("bg-[color:var(--ui-surface-sunken)]");
  });
});

describe("CardHint", () => {
  it("draws nothing on the server: it decides after mount, so the markup matches on hydration", async () => {
    for (const kind of ["cap", "sel", "trf"] as const) {
      expect(await render(<CardHint kind={kind} />)).not.toContain("card-hint");
    }
  });
});

describe("claimHint: once per phone, blocked storage counts as seen", () => {
  const globals = globalThis as { window?: unknown };
  const previous = globals.window;
  const store = new Map<string, string>();
  afterEach(() => {
    store.clear();
    if (previous === undefined) delete globals.window;
    else globals.window = previous;
  });
  const working = () => {
    globals.window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    };
  };

  it("is true once, then false, and each hint has its own key", () => {
    working();
    expect(claimHint(DEVICE_KEYS.hintCap)).toBe(true);
    expect(claimHint(DEVICE_KEYS.hintCap)).toBe(false);
    expect(store.get("botolago.card.hint.cap.v1")).toBe("1");
    expect(claimHint(DEVICE_KEYS.hintSel)).toBe(true);
    expect(claimHint(DEVICE_KEYS.hintTrf)).toBe(true);
    expect(claimHint(DEVICE_KEYS.hintTrf)).toBe(false);
  });
  it("is false when storage throws or is missing, and writes nothing", () => {
    globals.window = {
      get localStorage(): never {
        throw new Error("blocked");
      },
    };
    expect(claimHint(DEVICE_KEYS.hintCap)).toBe(false);
    globals.window = {};
    expect(claimHint(DEVICE_KEYS.hintCap)).toBe(false);
    expect(store.size).toBe(0);
  });
  it("is false on the server, where there is no phone", () => {
    delete globals.window;
    expect(claimHint(DEVICE_KEYS.hintSel)).toBe(false);
  });
});

describe("what the inline surfaces say and how they are written", () => {
  it("uses no banned word (plan 2.5) in either language, in any state", async () => {
    const ids = [
      "born0",
      "forming1",
      "eve2",
      "insufficient3",
      "rated",
      "cleared",
      "seasonClosed",
      "seasonStarted",
    ] as const;
    for (const lang of LANGUAGES) {
      language = lang;
      const pages: string[] = [];
      pages.push(
        text(
          await render(
            <ul>
              <GuestIntroCardPoint />
            </ul>,
          ),
        ),
      );
      pages.push(
        text(
          await render(
            <CardSaveLine
              signedIn={false}
              displayName={null}
              teamName=""
              clubs={[]}
              favoriteClubId={null}
            />,
          ),
        ),
      );
      pages.push(text(await render(<BuilderReturnLine id="x" />)));
      pages.push(text(await render(<PepitesHubTile />)));
      pages.push(text(await render(<LeagueCompareLink leagueId="x" />)));
      for (const id of ids) {
        pages.push(text(await render(<HubCardBlockView card={card(id)} gameweek={GAMEWEEK} />)));
        pages.push(text(await render(<RankCardTokenView card={card(id)} />)));
        pages.push(text(await render(<RecapCardLineView card={card(id)} gameweek={6} />)));
        pages.push(text(await render(<FirstTransferLineView card={card(id)} />)));
      }
      pages.push(
        dictionaries[lang]["card.onboarding.m3.hint.cap"],
        dictionaries[lang]["card.onboarding.m3.hint.sel"],
        dictionaries[lang]["card.onboarding.m3.hint.trf"],
      );
      for (const page of pages) expect(page).not.toMatch(BANNED);
    }
  });

  it("never prints 0 for an unknown number, and no padlock, lock, question mark or sealed icon", async () => {
    for (const id of ["born0", "forming1", "insufficient3"] as const) {
      const html = await render(<HubCardBlockView card={card(id)} gameweek={GAMEWEEK} />);
      expect(text(html)).not.toMatch(/\b0 OVR\b|\bOVR 0\b/);
      expect(html).not.toMatch(/lucide-(lock|padlock|help|circle-help|shield-question)/);
    }
  });

  it("is written with the kit, the tokens and logical properties only", () => {
    const folder = join(ROOT, "src", "components", "manager-card", "inline");
    const files = readdirSync(folder).filter(
      (name) => /\.tsx$/.test(name) && !/\.test\./.test(name),
    );
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const name of files) {
      const source = readFileSync(join(folder, name), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(source, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source, name).not.toMatch(/\brgba?\(/);
      expect(source, name).not.toMatch(
        /["'`\s](?:m[lr]|p[lr]|border-[lr]|rounded-[lr]|text-(?:left|right))-/,
      );
      expect(source, name).not.toMatch(/["'`\s]-?(?:left|right)-(?:\d|\[|1\/2|full)/);
      expect(source, name).not.toContain("uppercase");
      expect(source, name).not.toMatch(/(?<!ltr:)tracking-/);
      expect(source, name).not.toMatch(/\banimate-|\btransition-(?:all|transform)\b|\bkeyframes\b/);
    }
  });

  it("is lazy-loaded wherever an existing page uses it: only useManagerCardLive is imported statically", () => {
    const pages = [
      "src/components/fantasy/FantasyGuestIntro.tsx",
      "src/routes/fantasy.create.tsx",
      "src/components/fantasy/FantasyHubPersonal.tsx",
      "src/routes/fantasy.index.tsx",
      "src/components/fantasy/MyRankCard.tsx",
      "src/components/fantasy/GameweekRecapCard.tsx",
      "src/components/fpl/PlayerActionSheet.tsx",
      "src/routes/fantasy.team.tsx",
      "src/routes/fantasy.transfers.tsx",
      "src/routes/fantasy.leagues.$leagueId.tsx",
      "src/components/fantasy/FantasyImportPrompt.tsx",
      "src/components/fpl/SquadBuilderScreen.tsx",
      "src/components/fpl/TransferConfirmScreen.tsx",
    ];
    for (const path of pages) {
      const source = readFileSync(join(ROOT, path), "utf8");
      const staticImports = [...source.matchAll(/^import[^;]*?from\s+["']([^"']+)["'];?$/gms)].map(
        (m) => m[1]!,
      );
      const cardImports = staticImports.filter((from) => /manager-card|curva/.test(from));
      for (const from of cardImports) expect(from, path).toBe("@/services/manager-card-status");
      // And the one name taken from it is the live hook.
      const statusImport = /import\s*\{([^}]*)\}\s*from\s*"@\/services\/manager-card-status"/.exec(
        source,
      );
      if (statusImport) expect(statusImport[1]!.trim(), path).toBe("useManagerCardLive");
    }
  });
});
