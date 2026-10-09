# Gradins: the Manager Card section, build plan

Written 2026-10-08 by the planner (Claude Opus) for the parallel build that follows. Branch
`claude/manager-card-section` (worktree `/home/user/botolago-app`, based on `origin/main`
`3f9c57fc`). The screen-work brief is [`MANAGER_CARD_SECTION_BRIEF.md`](MANAGER_CARD_SECTION_BRIEF.md);
both files are committed before any interface change (AGENTS.md "Screen work" rule 3).

**What the owner asked (2026-10-08).** A new section for what comes after the Manager Card
onboarding, in Pépites' place in the main navigation, with Pépites moved inside Fantasy at the same
moment. It sells belonging. It has a creative, non-generic name. Its onboarding animations are not
generic. It is built in the real app behind a switch: after merge and publish nobody sees a change
until the backend exists and the switch is on.

**Sources.** AGENTS.md, CLAUDE.md, PRODUCT.md, DESIGN.md; the design lab on branch
`claude/affectionate-galileo-8l9mxh` (`design-lab/manager-cards-claude/`: `ONBOARDING_PLAN.md`, whose nine
decisions the owner approved; `ONBOARDING.md`; `CRITIQUE.md`; `DIRECTIONS.md`; `CONTRACT.md`;
`BACKEND_HANDOFF.md` with D1–D21; `src/kit.js`; `src/concepts/07-v2.js`; `src/onboarding/states.js`);
the app code at `3f9c57fc`. Impeccable references `shape`, `new-work`, `onboard`, `animate`, `delight`,
`operate`; marketing `brand-review` and `content-creation`; design `ux-copy`. No database was read.

**How to read this.** "WPn" is a work package (section 8). "G1–G7" are the section's screens
(section 4). "M1–M12" are the approved onboarding moments (lab `ONBOARDING_PLAN.md` section 3).
"Dn" is a backend decision in `BACKEND_HANDOFF.md`. Code in this file is the contract; packages build
to it exactly. Where a package finds the contract wrong, it stops and reports, it does not improvise.

---

## Decisions

| #   | Decision                                    | What is built                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Name**                                    | **Gradins** / **المدرجات** ("the stands"). Route `/gradins`. Nav icon `UsersRound` (lucide). Section 1.                                                                                                                                                                                       |
| 2   | **Card direction**                          | Écharpe v2 (lab 07-v2), behind a `CardRenderer` interface so the direction can change later. Section 6.                                                                                                                                                                                       |
| 3   | **Build switch**                            | `MANAGER_CARD_ENABLED = false` in `src/lib/feature-flags.ts`, plus a development-only `MANAGER_CARD_PREVIEW`. Section 3.1.                                                                                                                                                                    |
| 4   | **Runtime switch**                          | `api.manager_card_status()` read **on the server only**, during the server render, cached 60 s per server instance, never from the browser. Any failure, timeout or missing function reads as off, silently. Section 3.2.                                                                     |
| 5   | **When it is live**                         | Live = build switch on **and** status `enabled`. Then, in the same render: Gradins takes Pépites' fifth slot; Pépites leaves the bar and gets a tile in the Fantasy hub; the Fantasy tab is lit on every `/pepites` page; the Pépites home band gets a back pill to Fantasy. Section 3.3–3.4. |
| 6   | **Pépites URLs**                            | Unchanged. Every `/pepites/*` address, canonical, sitemap entry, robots rule, share link and test stays as it is.                                                                                                                                                                             |
| 7   | **Off means identical**                     | With the build switch off: no new DOM, request, storage key or nav change; server HTML body byte-identical on the pages checked. Measured (section 9).                                                                                                                                        |
| 8   | **Screens**                                 | G1 home, G2 « Votre carte », G3 « Les vôtres », G4 face-à-face sheet, G6 « Vos saisons » with the replay sheet, G7 share. The club and city layer is a G1 block plus a G3 filter; the founder story is a G2 block plus a hero. Section 4.                                                     |
| 9   | **Onboarding placement**                    | Account path, save step, team-page panel, hub block, hints and league band stay inline in Fantasy (approved). First rating, tier, founder, season, provisional-cleared, returning and replay live in Gradins. Section 5.                                                                      |
| 10  | **Changes to the approved onboarding plan** | M4b detail sheet becomes the G2 page; M5b face-à-face opens from G3 rows, not from Fantasy league rows; the M12 card page is G2 + G6 at `/gradins/*`, not `/fantasy/carte`; the « insufficient » line drops its count. Each is listed in section 5.2 for the owner.                           |
| 11  | **Motion thesis**                           | « Rang par rang »: in Gradins things are knitted, never faded or slid in. Seven object beats, each ≤ 600 ms (the birth beat ≤ 700 ms), none touching the number or the serial. Section 5.4.                                                                                                   |
| 12  | **Card rendering**                          | SVG strings from typed data only, every text escaped, inserted on the client only, code-split into its own chunk. Full card only on G1, G2, G4, the replay sheet and the M2 panel; tokens elsewhere. Section 6.                                                                               |
| 13  | **Data layer**                              | `src/backend/manager-card/` on the repository pattern (`contracts`, `errors`, `supabase-repository`, `mock-repository`), service `src/services/manager-card.ts`. camelCase DTOs. Section 7.                                                                                                   |
| 14  | **Fixtures**                                | `VITE_MANAGER_CARD_DATA_MODE=mock` plus `?mc=<fixture>`, development builds only. The mock module is reachable only through an `import.meta.env.DEV` branch, so a production build contains none of it; a build gate proves it. Section 7.7.                                                  |
| 15  | **SEO**                                     | `/gradins*` are `noindex`, not in the sitemap, `Cache-Control: private, no-store`. Pépites SEO unchanged.                                                                                                                                                                                     |
| 16  | **Copy**                                    | French « vous », « tu » only in messages the manager sends; Arabic MSA with verbal-noun buttons and neutral or passive statements. The object is called « carte de manager » / «بطاقة المدرّب» in copy (direction-independent). Every new key in Appendix A.                                  |
| 17  | **Packages**                                | Six: WP1 foundation, WP2 renderer, WP3 Gradins screens, WP4 moments and share, WP5 Fantasy inline and the Pépites tile, WP6 account path, Pépites band, profile line, then evidence. Section 8.                                                                                               |
| 18  | **Launch**                                  | The backend PR ships with the database switch off. The owner can flip `MANAGER_CARD_ENABLED` and publish at any time after it is applied; the section appears when the database read switch goes on, and goes away again within a minute of it going off, with no republish. Section 3.6.     |

Open for the owner, each with what the build does meanwhile: section 11.

---

## 1. The name

### 1.1 Candidates

The name has to work as a bottom-nav label (about 10 characters in each language), carry the
section's four belongings (club and city, friends, the founding season, a lineage of supporters),
avoid Darija in Arabic (PRODUCT.md: MSA only), and not collide with an app section.

| Candidate    | FR / AR            | Meaning                                                 | In Morocco                                                                                                                                 | Risks                                                                                                                                                                                                           | Verdict    |
| ------------ | ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Gradins**  | Gradins / المدرجات | The terraces: the rows of the stand where everyone sits | Neutral, everyday football French and MSA; families and ultras alike sit in the gradins; «جماهير المدرجات» is standard sports-press Arabic | Stadium violence stories use « violence dans les gradins » (low: the word itself is neutral); singular «مدرج» is also a runway or lecture hall (the plural in context is unambiguous); no trademark search done | **Chosen** |
| Virage       | Virage / الفيراج   | The curve, the end where the ultras stand               | The strongest supporter word in Moroccan football                                                                                          | Arabic form is Darija (rule broken; MSA «المنعطف» is a road bend); ultras' political history and the 2016 ban; each virage belongs to one club, so it excludes                                                  | Cut        |
| Tifo         | Tifo / التيفو      | The choreography thousands make together                | Moroccan tifos are famous; "every manager is one square of the tifo" is a strong idea                                                      | Italian loanword; ultras and pyrotechnics; some tifos were political                                                                                                                                            | Cut        |
| Tribune      | Tribune / المنصة   | The stand, also the VIP box                             | Common                                                                                                                                     | « Tribune présidentielle » is the VIP box; « tribune » is also an op-ed; «المنصة» is a stage or platform                                                                                                        | Cut        |
| Écharpe      | Écharpe / الوشاح   | The scarf itself                                        | Supporters' scarves are everywhere                                                                                                         | Ties the section to one card direction; «وشاح» reads first as a ceremonial sash (decorations), not a supporter's scarf                                                                                          | Cut        |
| Les Couleurs | Couleurs / الألوان | "Wearing the colours"                                   | « Porter les couleurs », «حمل ألوان النادي»                                                                                                | Reads as a theme or appearance setting; says nothing of friends or seasons                                                                                                                                      | Cut        |
| Les Miens    | Les miens / جماعتي | My people                                               | Warm in French                                                                                                                             | «الجماعة» is the commune (local government) and colloquially an Islamist movement                                                                                                                               | Cut        |
| Fidèles      | Fidèles / الأوفياء | The faithful                                            | Supporter loyalty                                                                                                                          | Religious register in both languages                                                                                                                                                                            | Cut        |
| Rang         | Rang / الصف        | A row (of seats, of knitting), a rank                   | « Rang par rang »                                                                                                                          | « Rang » is already the Fantasy hub's rank label (Valeur · Banque · Rang); «الصف» is also a school class and a Qur'anic surah title                                                                             | Cut        |

### 1.2 Why Gradins

The stands are where a Moroccan supporter belongs: with the people of their club and city, in a row
next to their friends, season after season, the way their father sat there before them. The section
is that place for a Fantasy manager. It also fits the chosen object without naming it: the scarf
hangs on the barrier rail of the gradins, and the share caption « rang par rang » reads both as
knitting and as rows of seats. If the card direction changes later, the name still holds.

### 1.3 Label, icon, route

- `nav.gradins`: « Gradins » (7 characters) / «المدرجات» (8). Both fit the five-slot bar at 320 px:
  the longest existing labels are « Actualités » (10) and «المباريات» (9).
- Icon: `UsersRound` from `lucide-react` (0.575.0, already installed). The section is about people;
  the profile button in the top bar is `UserRound` (one figure) in a round soft button, so the two
  read apart. `UsersRound` is not directional: no mirror, no change to the icon mirror contract.
- Route slug `/gradins`; children `/gradins/carte`, `/gradins/les-votres`, `/gradins/saisons`.
- Desktop top bar shows text links only, so « Gradins » / «المدرجات» appears as text there.

---

## 2. Selling belonging: positioning, voice, copy rules

Built with `marketing:brand-review`, `marketing:content-creation` and `design:ux-copy` against
PRODUCT.md's voice (score and answer first, short, specific, no hype, never invent).

### 2.1 Positioning

For Moroccan Fantasy managers who already follow the Botola, Gradins is their place in the stands:
a manager card in their name and their club's colours, made by their own decisions journée after
journée, shown beside the friends they play with. Unlike a collectible card game it is never bought,
opened or traded: it is earned, it is honest about what it does not know yet, and it is the same
for everyone who plays.

### 2.2 The four belongings and what makes each true

| Pillar                          | The line it earns                    | Proof in the product (never a claim without it)                                                                                                                                       |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Votre club, votre ville**     | « Aux couleurs de votre club »       | The card's colours come from the club chosen in the profile (club palette); the club's city comes from club data; league mates who support the same club are named from the card read |
| **Les vôtres**                  | « À côté des vôtres »                | Private leagues' members' cards in the league's own points order; face-à-face                                                                                                         |
| **Votre saison, rang par rang** | « Une note qui vient de vos choix »  | Four stats from captains, starting XI, transfers and regularity; one stripe per counted journée; the history table                                                                    |
| **Depuis le début**             | « Fondateur 2026 », « Depuis la J5 » | The founder mark granted once by the owner's cut-off; the first counted journée; one season carrier per season                                                                        |

### 2.3 Voice attributes

**Proud, not boastful**

- We are: the supporter who knows where they stand and says it plainly.
- We are not: hype, superlatives, trophies we did not win.
- Sounds like: « Votre place dans les gradins. »
- Does not sound like: « Rejoignez l'élite des managers ! »

**Honest about the wait**

- We are: exact about what is not known yet (a dash, « provisoire », « pas encore »).
- We are not: a countdown, a tease, a « bientôt » with no date.
- Sounds like: « Sa note arrive après 3 journées terminées : J5, J6, J7. »
- Does not sound like: « Votre note arrive très bientôt, restez connecté ! »

**Ours, not official**

- We are: BotolaGO's game, with club names that identify.
- We are not: the club, the league, the FRMF or a Fan ID.
- Sounds like: « Le club choisi dans votre profil donne sa couleur à votre carte. »
- Does not sound like: « Votre carte officielle du Raja. »

### 2.4 Terminology

| Use                                                       | Never                                    | Why                                                |
| --------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| carte de manager / بطاقة المدرّب                          | « ta carte », badge, NFT, collection     | Approved onboarding wording; direction-independent |
| note / تقييم; OVR as a unit after the number (« 84 OVR ») | score, niveau, level                     | Lab rule 6; the Fantasy points are the score       |
| palier / فئة; tier words HOMA → LEGEND                    | rang (taken by the Fantasy rank), niveau | Avoid the « level up » family                      |
| journées terminées / جولات منتهية                         | journées jouées                          | Only final results count                           |
| provisoire / مبدئي (agreeing: «تقييم مبدئي»)              | confirmée / مؤكَّد, مؤقت                 | Approved copy discipline                           |
| Fondateur 2026 / عضو مؤسس 2026, « ALI ·26 »               | membre VIP, édition limitée              | Founder is granted, never sold or counted          |
| les vôtres / أصحابك                                       | communauté de X membres                  | No counts                                          |
| Gradins / المدرجات                                        | « la tribune officielle »                | Independence                                       |

### 2.5 Banned words (all strings, both languages, the share image and messages)

Inherited from the approved plan (lab `ONBOARDING_PLAN.md` section 5): pull, pack, level up, monter
de niveau, débloquer, tirage, chance (for the rating or the serial), révélation, officiel / رسمي,
signature / توقيع, any lucky or special-number wording about the serial. Added for Gradins:
exclusif, rare, limité / محدود, édition, VIP, dernière chance, vite, collectionner, gagner (for the
card; prizes are elsewhere), classement des cartes, meilleure carte. No counts of managers,
founders, supporters or ratings anywhere.

### 2.6 Compliance flags

- **No invented facts.** Every number, name and date on screen comes from a read; unknown is « — ».
- **Independence.** A club's name identifies it; nothing implies the club, the LNFP or the FRMF
  endorses the card. No crest in share images (club disc and initials, as today).
- **Free to play.** One plain line in the guest view: « Le jeu est gratuit : sans achat, sans pari. »
- **Names other people chose.** Every list or sheet that shows another manager's name carries the
  existing `ReportNameMenu` (G3 rows, G4).
- **Minors and parents.** The name hint keeps « Un prénom ou un surnom suffit » (approved).
- **Urgency.** The only deadline in copy is the real Fantasy deadline from the gameweek read.

### 2.7 Arabic

Modern Standard Arabic written as Arabic. Buttons are verbal nouns (إنشاء فريقي، مشاركة بطاقتي،
عرض التفاصيل، دعوة الأصدقاء، إغلاق). Statements are neutral or passive (يأتي تقييمها، تُحتسب). Imperatives
appear only in messages the manager sends (انضمّ إلى دوريي). Gender-neutral constructions where the
subject's gender is unknown («من مشجّعي الرجاء أيضًا: كريم، سلمى»). «الجولة n» in card copy. Western digits,
isolated: `<bdi dir="ltr">` in the interface, U+2068…U+2069 in messages. Counts go through the plural
families of section 7.8, never «3 جولة».

---

## 3. The switch, and Pépites moving inside Fantasy

### 3.1 Two layers

Add to `src/lib/feature-flags.ts`, after the Pépites block, exactly this (WP1):

```ts
/**
 * Gradins (the Manager Card section) — OFF.
 *
 * Owner decision, 2026-10-08: a new section, Gradins, takes Pépites' place in
 * the main navigation and Pépites moves inside Fantasy, at the same moment.
 * It is built in the app behind this switch so that merging and publishing
 * change nothing anyone sees. Plan: docs/product/MANAGER_CARD_SECTION_PLAN.md.
 *
 * Two layers decide whether it shows:
 *   1. this build constant, which the owner flips in a one-line commit once
 *      the backend is applied (it can be flipped before the database switch);
 *   2. the database's own answer, `api.manager_card_status()`, read during the
 *      server render only. Off, missing, failing or slow all read as off.
 * Live = both. Set this false and republish for an application-level rollback;
 * turning the database read switch off hides the section without a republish.
 *
 * Gated surfaces (keep this list current):
 *   - `src/components/shell/primary-nav.ts` — the fifth slot, the Fantasy tab on /pepites
 *   - `src/routes/__root.tsx` — the server-side status read (beforeLoad)
 *   - `src/routes/gradins.tsx` — the /gradins routes (redirect to /fantasy when not live)
 *   - `src/routes/fantasy.index.tsx` — the Pépites tile, the card block
 *   - `src/components/pepites/PepitesHome.tsx` — the back pill to Fantasy
 *   - every inline card surface listed in the plan, section 5.1
 */
export const MANAGER_CARD_ENABLED: boolean = false;

/**
 * Development preview of Gradins: `VITE_MANAGER_CARD_PREVIEW=1` on a development
 * server only. `import.meta.env.DEV` is replaced by `false` in a production
 * build, so this is `false` there and every branch it guards is removed.
 */
export const MANAGER_CARD_PREVIEW: boolean =
  import.meta.env.DEV === true && import.meta.env.VITE_MANAGER_CARD_PREVIEW === "1";

/** The build lets Gradins exist; the database status decides whether it shows. */
export const MANAGER_CARD_BUILD: boolean = MANAGER_CARD_ENABLED || MANAGER_CARD_PREVIEW;
```

Write `import.meta.env.DEV` exactly, never `import.meta.env?.DEV`: only the plain form is replaced
statically. Under `bun test`, `import.meta.env.DEV` is undefined, so the preview is false in tests
unless a test sets the value on purpose.

| Build constant | Preview (dev only) | Status read                       | What anyone sees                                     |
| -------------- | ------------------ | --------------------------------- | ---------------------------------------------------- |
| false          | unset              | not made                          | Today's app, exactly                                 |
| false          | `1` (dev)          | mock or real                      | Gradins live in that development server only         |
| true           | —                  | off, missing, failed or timed out | Today's app, exactly (the read cost one server call) |
| true           | —                  | `enabled: true`                   | Gradins live                                         |

### 3.2 The status read: server only

Why server only: a browser call to a function that does not exist yet answers HTTP 404, and Chromium
logs every 4xx as a console error, which the e2e harness fails on (`tests/e2e/support.ts`). A server
read also means the first HTML already carries the right navigation, so the bar never flips after
hydration.

Shape (WP1, `src/services/manager-card-status.ts`):

```ts
export interface ManagerCardStatus {
  enabled: boolean;
  minRated: number | null;
  minConfirmed: number | null;
}
export const STATUS_OFF: ManagerCardStatus = { enabled: false, minRated: null, minConfirmed: null };
export const managerCardStatusKey = ["manager-card", "status"] as const;

/** Server: one read per 60 s per server instance, 800 ms at most, never throws, never logs. */
export async function readManagerCardStatusOnServer(fixture?: string): Promise<ManagerCardStatus>;

/** The query the root's beforeLoad fills on the server. In the browser its queryFn returns
    STATUS_OFF with no network call: the browser only ever reads what the server sent. */
export function managerCardStatusQuery(fixture?: string): {
  queryKey: typeof managerCardStatusKey;
  queryFn: () => Promise<ManagerCardStatus>;
  staleTime: number; // Infinity
  gcTime: number; // Infinity
  retry: false;
  meta: { ssr: true };
};

/** Root beforeLoad, server only: `queryClient.fetchQuery(managerCardStatusQuery(fixture))`. */
export async function ensureManagerCardStatus(
  queryClient: QueryClient,
  search: string,
): Promise<void>;

/** Synchronous read for route guards: what the cache holds, else STATUS_OFF. */
export function managerCardStatusFrom(queryClient: QueryClient): ManagerCardStatus;

/** For components. With MANAGER_CARD_BUILD false this is the constant-off hook (no query at all). */
export const useManagerCardLive: () => boolean;
export const useManagerCardStatus: () => ManagerCardStatus;

/** A card read that answers "switched off" mid-session flips the cached status off. */
export function markManagerCardOff(queryClient: QueryClient): void;
```

Rules:

1. **Not through `prefetchForSsr`.** That helper registers its keys for `ssrAvailability`, and a
   timed-out status read would turn a healthy `/pepites` page into a 503. The status uses
   `queryClient.fetchQuery` directly with `meta: { ssr: true }` so it is dehydrated with the page.
2. **Never throws, never waits long.** The server read races 800 ms; on timeout, error, `PGRST202`,
   any HTTP error or a malformed answer it returns `STATUS_OFF` without calling `console.*`.
3. **Memo.** A module-level `{ at, value }` on the server keeps a successful answer 60 s. `STATUS_OFF`
   from a failure is kept 10 s, so a database hiccup does not hammer the RPC.
4. **Root route** (WP1, `src/routes/__root.tsx`): add `beforeLoad` only when
   `MANAGER_CARD_BUILD` is true, written as `...(MANAGER_CARD_BUILD ? { beforeLoad: rootBeforeLoad } : {})`
   so the route object is unchanged when off. `rootBeforeLoad` runs `ensureManagerCardStatus` on the
   server only (`isServerRender()`); in the browser it does nothing. beforeLoad (not loader) because
   the `/gradins` guard in a child `beforeLoad` must see the answer.
5. **Hooks without conditional calls.** `useManagerCardLive = MANAGER_CARD_BUILD ? useLiveFromStatus : useAlwaysOff`,
   chosen at module level, so `react-hooks/rules-of-hooks` stays clean and the off build has no query.
6. **Mid-session switch-off.** When any card read answers `{ available: false }` (section 7.5),
   `markManagerCardOff` sets the cached status to `STATUS_OFF`; the bar returns to Pépites and
   `/gradins` routes redirect on the next navigation. Only an owner rollback causes this.
7. **Development fixture.** In mock mode the server read takes the fixture from the request's `mc`
   search parameter (`?mc=featureOff` answers off; anything else answers
   `{ enabled: true, minRated: 3, minConfirmed: 5 }`) and skips the memo, so switching fixtures between
   page loads is never masked.

### 3.3 The navigation, exactly (WP1)

Everything stays in `src/components/shell/primary-nav.ts`, because `src/lib/feature-flags.test.ts`
allows `PEPITES_PROMOTED` only in the files that mention it today, and the file must keep the literal
`NEWS_ENABLED || item.to !== "/news"`.

```ts
export type PrimaryRoute =
  | "/"
  | "/news"
  | "/fantasy"
  | "/matches"
  | "/pepites"
  | "/gradins"
  | "/profile";

// allPrimaryNavItems gains, between /pepites and /profile:
//   { to: "/gradins", labelKey: "nav.gradins", icon: UsersRound },

/** Unchanged signature and behaviour; it now also removes /gradins. */
export function withPepitesSlot(items, promoted): PrimaryNavItem[];

/** The fifth slot: Gradins when live, else Pépites when promoted, else Profil. */
export function withFifthSlot(
  items: readonly PrimaryNavItem[],
  slot: { pepitesPromoted: boolean; gradinsLive: boolean },
): PrimaryNavItem[];

/** Exactly today's list (Gradins never in it). Existing tests keep reading this. */
export const primaryNavItems: PrimaryNavItem[];
/** The list when Gradins is live: Accueil, Actualités, Fantasy, Matches, Gradins. */
export const liveNavItems: PrimaryNavItem[];

/** The bar's items: `primaryNavItems` (the same array object) unless Gradins is live. */
export function usePrimaryNavItems(): PrimaryNavItem[];

/**
 * `gradinsLive` lights Fantasy on /pepites pages (Pépites lives in Fantasy then)
 * and never lights a slot that is not in the bar. Default false keeps every
 * existing call and test as it is.
 */
export function isPrimaryRouteActive(
  pathname: string,
  route: PrimaryRoute,
  gradinsLive = false,
): boolean;
```

- `BottomNav.tsx` and `TopBar.tsx` (`PrimaryNavLinks`) replace the module import with
  `const primaryNavItems = usePrimaryNavItems();` and `const gradinsLive = useManagerCardLive();`,
  keeping the identifier `primaryNavItems` (`shell.option-a.test.tsx` checks for
  `primaryNavItems.map`) and passing `gradinsLive` to `isPrimaryRouteActive`.
- The profile button in the top bar stays as it is: it shows while `PEPITES_PROMOTED` is true, which
  covers the live state (Profil is not in the bar in either case).
- With the build switch off, `usePrimaryNavItems` is the module-level function returning
  `primaryNavItems`; no hook runs.

|               | Slot 1  | Slot 2     | Slot 3  | Slot 4  | Slot 5      | Lit on `/pepites/*` |
| ------------- | ------- | ---------- | ------- | ------- | ----------- | ------------------- |
| Today and off | Accueil | Actualités | Fantasy | Matches | Pépites     | Pépites             |
| Live          | Accueil | Actualités | Fantasy | Matches | **Gradins** | **Fantasy**         |

The sliding pill already measures the active icon, so it lands on Fantasy on a Pépites page with no
change to `BottomNav`'s motion code.

### 3.4 Pépites inside Fantasy

**Where it lives.** A wide tile in the Fantasy hub, directly under the four shortcut tiles (WP5,
`src/routes/fantasy.index.tsx`, new component `src/components/manager-card/inline/PepitesHubTile.tsx`):
a `UiCard` link to `/pepites`, full width (`col-span-2` look, its own row), 64 px tall, a 36 px sunken
disc with the `Gem` icon (the icon Pépites has in the bar today), the title `nav.pepites`
(« Pépites » / «جواهر») in body-strong and one muted line `fantasy.hub.pepites_body`, a mirrored
chevron at the end. It shows to every hub audience (guest, no team, owner) while live.

**How it reads to a fan.** « Pépites: the best under-23s of the Botola Pro, to spot your next
players. » It becomes Fantasy's scouting room, next to « Statistiques joueurs » and « Meilleurs
joueurs », which is where a manager looks for players.

**URLs, SEO, active state.** Nothing about Pépites' addresses changes: `/pepites`, `/pepites/classement`,
`/pepites/joueur/$playerId`, `/pepites/semaine/$n`, `/pepites/comparer`, `/pepites/methode`,
`/pepites/revelation`, their canonicals, `src/lib/sitemap.ts` (Pépites stays in it,
`PEPITES_PROMOTED` stays true), robots, share URLs and the Home discovery tile. While live, the
Fantasy tab is lit on every `/pepites` page (3.3).

**The way back.** While live, the Pépites home's title band shows the kit back pill above the
« PÉPITES » label, labelled « Fantasy », to `/fantasy` (WP6: `PepitesPageTitle` gains an optional
`backLabel` passed to `PepitesBack`; `PepitesHome` passes `backTo="/fantasy"` and
`backLabel={t("nav.fantasy")}` only when `useManagerCardLive()`). The other Pépites pages keep their
back pills to `/pepites`. This is the hub-and-back pattern DESIGN.md records for Fantasy.

**Existing tests.** All Pépites unit and e2e tests run with the switch off and are untouched. New
tests (WP1, WP5, WP6) cover the live state: the bar list, `isPrimaryRouteActive("/pepites/x", "/fantasy", true)`,
the hub tile, the back pill.

### 3.5 The `/gradins` routes (WP1)

| File                                | Path                  | Notes                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/routes/gradins.tsx`            | `/gradins` layout     | `beforeLoad`: `if (!MANAGER_CARD_BUILD) throw redirect({ to: "/fantasy", replace: true });` then `if (!managerCardStatusFrom(context.queryClient).enabled) throw redirect({ to: "/fantasy", replace: true });`. Component renders `<Outlet />` (`nested-route-outlet.test.ts`). `headers`: `Cache-Control: private, no-store`. |
| `src/routes/gradins.index.tsx`      | `/gradins/`           | `GradinsHome` (G1)                                                                                                                                                                                                                                                                                                             |
| `src/routes/gradins.carte.tsx`      | `/gradins/carte`      | `GradinsCardPage` (G2)                                                                                                                                                                                                                                                                                                         |
| `src/routes/gradins.les-votres.tsx` | `/gradins/les-votres` | `GradinsPeoplePage` (G3); `validateSearch`: `ligue` (uuid, optional)                                                                                                                                                                                                                                                           |
| `src/routes/gradins.saisons.tsx`    | `/gradins/saisons`    | `GradinsSeasonsPage` (G6); `validateSearch`: `saison` (uuid, optional)                                                                                                                                                                                                                                                         |

Each `head()` serves the French title and `{ name: "robots", content: "noindex" }`; the reader's
title is set after mount as `pepites.index.tsx` does. Titles: `gradins.meta.home`,
`gradins.meta.card`, `gradins.meta.people`, `gradins.meta.seasons`; description `gradins.meta.description`.

**Route tree.** `src/routeTree.gen.ts` is generated by the TanStack Start plugin and committed
(prettier ignores it). After adding the five files, run `bun run build` (or start `bun run dev` until
it logs that it generated the route tree), then commit the regenerated file unedited. Only WP1 does
this; no other package adds a route.

### 3.6 Launch and rollback

1. This PR merges with `MANAGER_CARD_ENABLED = false`. Publish changes nothing (measured, section 9).
2. The backend PR (next Opus pass) lands and is applied by the owner with its read switch off; club
   resolution, serials, rules v1 and the compute catch-up are done (section 10).
3. The owner flips `MANAGER_CARD_ENABLED` to `true` in a one-line commit and publishes. Still nothing
   changes, because the status says off.
4. The owner turns the database read switch on. Within about a minute (the server memo) every new page
   load shows Gradins and Pépites in Fantasy. Pages cached by the CDN follow within their own cache
   lifetime (at most 5 minutes for a Pépites edition page).
5. Rollback: read switch off (no republish), or the constant back to `false` and republish.

### 3.7 What "no change when off" means

No new DOM node, network request, `localStorage`/`sessionStorage` key or console message on any page;
the bar exactly as today; `/gradins*` redirect to `/fantasy`; every inline card surface absent;
`autoFocus` on the team-name field and the create flow's opening step unchanged. Proof in section 9.
The one deliberate exception is decision 6 of the approved onboarding plan (`fantasy_team_created` on
the import path), which is analytics only, invisible, owner-approved and shipped in its own commit.

---

## 4. The screens

### 4.0 Shared rules for every Gradins screen

- **Frame.** `FantasyFrame` (`src/components/fpl/FantasyFrame.tsx`): G1 with `bottomNav topBar="always"`
  and `UiPageTitle title={t("nav.gradins")}`; G2, G3, G6 with `bottomNav` and a `UiHeader` (back pill,
  kicker `nav.gradins` in the label step, centred title). From 768 px the column is the 672 px raised
  column with 28 px corners under the global top bar (DESIGN.md "Fantasy inner screens").
- **Kit only.** `UiCard`, `UiButton`, `UiLinkButton`, `UiChip`, `UiStatBlock`, `UiTable`, `UiSheet`,
  `UiSkeleton`, `UiErrorState`, `UiAlert`, `UiBadge`/`UiPill`. No new shadow, radius or colour token.
  Club colour only through `clubPalette`/`clubStyle`. Logical properties only. No letter-spacing in
  Arabic. Every tap target ≥ 44 px, rows ≥ 48 px.
- **The card stage** (`src/components/gradins/CardStage.tsx`, WP3): the full card at 240 px wide on
  phones (264 px from 768 px), centred, height from the renderer's aspect (about 360 px for PRO in
  Latin; longer for HOMA, Arabic and long names: the page grows, nothing clips). A 6 px rounded line in
  `--ui-control-edge` runs across the column at the height of the card's barrier rail, so the scarf
  hangs on the gradins' rail rather than floating. Under the card, always in text: the rating line
  (« 84 OVR · PRO » + `Provisoire` pill, or « Carte en formation · 1/3 ») and the identity line. The
  rating line is ordinary DOM, so the number is on screen the moment the data is, before the renderer
  chunk has loaded.
- **Audience.** Resolved with the existing `fantasyHubLayout` and `useFantasyScreen({ needsTeam: false, needsAuth: false })`:
  guest (`signed_out`), signed in without a team (`no_team`), registration closed (intro with
  `gameweek.enrolment === null`), owner. The card read is issued only for an owner (never for a guest
  or a no-team account, so no read can answer 404).
- **Deadline and next round** come from the gameweek the Fantasy screens already read, formatted with
  the hub's deadline helpers (`src/components/fantasy/deadline-card-copy.ts`, Morocco time).
- **Names.** Display name if not blank, else the team name (D17). No heading carries a name.

### 4.1 G1 · Section home `/gradins`

**Purpose.** "This is who I am in the stands": my card, what it says about me, my journée, my
people, my club, my seasons. **Belonging sold:** all four pillars, in that order.

> **As built (5.2 item 6):** after the identity line comes one line with the next round and its
> deadline, then the people, club and seasons blocks, then « Cette journée » and the stat tiles. The
> order below is the plan's; the build differs on purpose.

**Layout at 390 × 844** (top to bottom): top bar → title band « Gradins » → [hero slot, only when a
moment is due] → card stage → identity line → « Cette journée » card → « Ce que dit votre carte »
(2 × 2 stat tiles) → « Les vôtres » card → « Votre club » card → « Vos saisons » row → the share
button (gradient, `m4.sheet.share`) when there is a number, else the soft « Inviter des amis »
(`fantasy.hub.invite_share`) → bottom nav. Blocks are 16 px apart with the 16 px gutter. With no hero,
the stage, the rating line and the top of « Cette journée » are in the first viewport.

**Layout from 768 px** (672 px column): a two-column grid `264px 1fr`, 24 px gap. Start column: the
card stage, sticky at `calc(var(--topbar-h) + 16px)`, with the rating line, identity line and the
share button under it. End column: the blocks in the same order. The hero slot spans both columns.
1440 px is the same column centred (DESIGN.md: 1440 is a test width).

**Content and hierarchy**

| Block                  | Content                                                                                                                                                                                                                                                                                                                                                           | Data                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Identity line          | Parts joined by « · »: `gradins.identity.since` (« Depuis la J5 »), founder (`m9.heading`) when granted, club short name, league count (`gradins.leagues_*`). Omit any unknown part. Meta step, muted, centred.                                                                                                                                                   | `firstCountedGameweekSeq`, `founder`, `club`, private leagues query |
| Cette journée          | Forming: the counter « 1/3 » in the 30 px stat step, `m3.label`, `m3.line` or its sub-state (`m3.first_counted`, `m3.eve`, `m3.over`, `m3.insufficient`, `m3.late`). Rated: `gradins.round.line` (« J8 · date limite sam. 16:30 ») and `gradins.round.recalc`. Both: a « Composer l’équipe » link (`fpl.pick_team`) to `/fantasy/team`.                           | card + gameweek                                                     |
| Ce que dit votre carte | Four `UiStatBlock`s: value (30 px stat) or « — », label `card.stat.<x>` with `card.stat_long.<x>` under it; a null shows its reason line (`card.reason.*`, muted). The whole block links to G2.                                                                                                                                                                   | `stats`                                                             |
| Les vôtres             | The first private league (or the one remembered in `botolago.gradins.league.v1`): its name, then three rows in the league's points order: the row above you, you, the row below (fewer if you lead or trail). Each row: rank, 28 px mini, name, secondary line (`{ovr} · {tier}` + pill, or `m5.row.forming`, or « — »). Link `gradins.people.view_league` to G3. | league standings (existing) + batch card read                       |
| Votre club             | Club disc (`ClubCrest`), club name and city; `gradins.club.mates_one/_other` naming league mates who support the same club (names only, omitted when none); the club's next match through the existing match row component, linking to the match page. No club: `gradins.club.none` + soft button `gradins.club.choose` to `/profile`.                            | card `club`, club data, club fixtures (existing query), batch read  |
| Vos saisons            | One row: a 44 px token per season with a season row (newest first), `gradins.seasons.counted_*` for the current season, chevron to G6.                                                                                                                                                                                                                            | `seasons`                                                           |

**States**

| State                                                  | What G1 shows                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature off                                            | Route redirects to `/fantasy` (never rendered).                                                                                                                                                                                                                                                                                              |
| Loading                                                | `role="status"` `aria-label={t("state.loading")}`: a 240 × 360 `UiSkeleton` with sheet radius in the stage, two text-line skeletons, three block skeletons.                                                                                                                                                                                  |
| Error / offline (card read failed)                     | The stage area shows `UiErrorState` with `card.onboarding.state.offline.text` and an ink « Réessayer » (`state.retry`). No stale number presented as new. Other blocks hidden.                                                                                                                                                               |
| MFA step-up refused                                    | The existing step-up notice (`showStepUpNotice`), the same error panel, no moment.                                                                                                                                                                                                                                                           |
| Guest                                                  | **Guest hero** (below).                                                                                                                                                                                                                                                                                                                      |
| Signed in, no team                                     | **No-team hero**: the stage card drawn locally with the account's display name and its favourite club (`user.favoriteClubId` through `findClub`), base material, dash; headline `gradins.noteam.headline`; body `card.onboarding.m1.intro.body`; primary `fantasy.next.create` to `/fantasy/create`. Then the four guest points (no try-on). |
| Registration closed (guest or no team)                 | The same hero without the create button: `fantasy.availability.registration_closed.title` and `.body` (existing keys) replace headline and body.                                                                                                                                                                                             |
| Forming k/3                                            | Stage card with dash and k of 3 stripes knitted; rating line « Carte en formation · 1/3 »; Cette journée in its forming form; stat tiles all « — » with `card.reason.pending_minimum`; share button replaced by « Inviter des amis ».                                                                                                        |
| Insufficient (3/3, OVR null)                           | As forming with `m3.insufficient`; tiles show values that exist and reasons for the others.                                                                                                                                                                                                                                                  |
| Rated, provisional                                     | Number on the card; rating line with the `Provisoire` pill; tiles filled.                                                                                                                                                                                                                                                                    |
| Rated                                                  | As provisional, no pill.                                                                                                                                                                                                                                                                                                                     |
| Founder                                                | ·26 on the card, the cream cast-on; « Fondateur 2026 » in the identity line.                                                                                                                                                                                                                                                                 |
| Season closed (no new season yet)                      | Card with the season's final values; Cette journée replaced by `m10.closed`.                                                                                                                                                                                                                                                                 |
| New season started, no number yet                      | Card shows last season's number and tier with its season label (D7); Cette journée shows `m10.started` and the new counter.                                                                                                                                                                                                                  |
| Deleted-pending, or the read says no card for an owner | `gradins.unavailable` and a link to Profil (`nav.profile`).                                                                                                                                                                                                                                                                                  |

**Guest hero.** Stage: the base scarf drawn locally (no name, base material, dash, empty marks), with
the `make` beat once per device (`botolago.card.guest_make.v1`). Then `gradins.guest.headline`
(Changa 22 px title step), `gradins.guest.body`, primary `fantasy.next.create` to `/fantasy/create`,
ghost `gradins.guest.sign_in` to `/auth/login?next=/gradins`. Then **try-on**: the label
`gradins.guest.try_title`, the 16 Botola clubs as 44 px crest discs in a wrapping row (club list from
the existing football clubs query), a tap recolours the stage card instantly (no beat) and is stored
nowhere; `gradins.guest.try_hint` under the row. Then the four points (`gradins.guest.point.*`) in
the hub's icon-disc row anatomy, each disc holding a 24 px token in the matching state (named, club
colour, a number slot, two minis side by side). Then `gradins.guest.free`.

**Interactions.** Stat tiles block → G2. People rows and link → G3 (`?ligue=`). Club next match →
match page. Seasons row → G6. Share → G7 sheet. Drag on the card (fine pointer, mouse or pen only)
swings the scarf from the rail (sway). Hero buttons per section 5.3.

**Motion.** Section 5.4: `make` (guest first view, M2 on G1), `tick` (a newly counted journée), hero
beats. Blocks use the app's existing `enter-rise` only on first mount. Under reduced motion: none.

**Data.** `useMyManagerCard()`, `useFantasyScreen`, private leagues (`fantasyService.getLeagues("private")`),
league standings (the league page's query), `useManagerCards(teamIds)`, clubs query, club fixtures
query. Events: `gradins_view_guest` / `gradins_view_no_team` / `gradins_view_manager` once per mount,
`gradins_guest_cta`, `gradins_guest_club_try`.

### 4.2 G2 · Votre carte `/gradins/carte`

**Purpose.** Where the number comes from, and what the card records. **Belonging:** "my season,
rank by rank" and "since the start".

**Layout at 390.** `UiHeader` (back to `/gradins`, kicker « Gradins », title `gradins.card.title`).
Card stage. Then sections, each a `UiCard` with an h2 in the title step:

1. **D'où vient votre note** (`gradins.card.where`): intro `gradins.card.intro` (rated) or
   `gradins.card.intro_forming`; the provisional line `card.onboarding.m4.hero.fresh.line` when
   provisional; four tiles in a 2 × 2 grid, each 64 px min: code + long label, value (30 px stat) or
   « — » + reason; a formula sentence per tile only when `FORMULA_KEYS[rulesVersion]` exists (empty in
   v1; section 7.8); the footer `m4.sheet.footer` under the same condition.
2. **Votre palier** (`gradins.card.tier`): five 44 px tokens (the current profile drawn at each tier),
   tier word under each; the current one carries the selected-state ring and `gradins.card.tier_now`;
   the season's best, when different, `gradins.card.tier_best`; `m4.sheet.tier_distance` when
   `nextTier` exists; `m8.up.line`'s second sentence as the explanation (`gradins.card.tier_explain`);
   unrated: `gradins.card.tier_none` and no token marked. A fall shows `m8.down.line`.
3. **Numéro** (only when the serial is not null): `gradins.card.serial`.
4. **Fondateur 2026** (founders only; section 4.8).
5. **Revoir** (`m4.sheet.replay` as the heading): the moments that happened (section 4.6), each opening
   the replay sheet. Under reduced motion the list stays (each opens the static stored state).
6. Actions: primary `m4.sheet.share` (G7, only with a number), soft `m4.sheet.league` to G3.

**From 768 px:** the same two-column grid as G1 (stage sticky at start, sections at end).

**States.** Off: redirect. Loading: skeleton stage and three section skeletons. Error: the G1 error
panel. Guest or no team: redirect to `/gradins` (`beforeLoad` cannot know; the component navigates with
`replace`). Forming / insufficient / rated / provisional / founder / closed / new season: as G1, with
the tiles' reasons. Deleted-pending: `gradins.unavailable`.

**Motion.** A « Revoir » text button by the stage (`m4.sheet.replay`) replays the current card's
latest beat (`first` if rated in the current season, else `make`); hidden under reduced motion.

**Data.** `useMyManagerCard()`, `useMyManagerCardHistory()` for the Revoir list. Event `gradins_card_view`.

### 4.3 G3 · Les vôtres `/gradins/les-votres?ligue=<uuid>`

**Purpose.** My friends' cards beside mine. **Belonging:** les vôtres.

**Layout at 390.** `UiHeader` (back to `/gradins`, kicker « Gradins », title `gradins.people.title`).
Then:

1. League chips: one `UiChip` per private league (wrapping row; `selected` sets `aria-pressed`), the
   selected league stored in `botolago.gradins.league.v1`.
2. The band (M5a) when at least one member's `firstRatedGameweekSeq` equals the latest evaluated
   gameweek: `m5.band` with up to three 24 px minis and names only.
3. The compare hint once per device (`botolago.card.compare_hint.v1`): `UiAlert tone="info"` with
   `m5.hint.compare` and a `common.close` icon button in its `action` slot.
4. A filter chip `gradins.people.same_club` (with the club's short name) when the caller has a club.
5. A real table (`UiCard padding="none"` + `UiTable`, like the Fantasy league page): Pos (13 px stat),
   Manager (28 px mini at the cell's start, name in body-strong `dir="auto"`, secondary line: rated
   `{ovr} · {tier}` + `Provisoire` pill, forming `m5.row.forming`, no card « — »), Total (17 px stat,
   end). Rows in the league's points order, never sorted by OVR. The name is a button stretched over
   the row (the clubs' `STRETCHED_LINK` pattern) opening G4; `ReportNameMenu` sits above it for other
   managers. Your row: a 4 px inline-start bar in the action gradient and `gradins.people.you` in the
   secondary line; scrolled into view on load (`block: "center"`, instant under reduced motion).
6. Under the table, soft `fantasy.leagues.invite_friends` sharing that league's join link through the
   existing league invite helper.

**From 768 px:** the same single column at 672 px.

**States.** No private league: `gradins.people.empty` + the existing `CreateLeagueInvite`. A league
with only you: `gradins.people.alone`. Standings loading: three row skeletons. Standings failed:
`UiErrorState` with retry (existing league error copy). Batch card read failed: the table still shows
with « — » in the card line and one muted line `gradins.people.cards_failed` with retry. A member
without a card (no team this season, deleted-pending): the row shows without a mini and with « — ».

**Data.** Private leagues; standings for the selected league (the league page's query and paging);
`useManagerCards(teamIds of the page)`. Events `gradins_people_view`, `card_league_band_view`,
`card_h2h_open`.

### 4.4 G4 · Face-à-face (sheet, from G3 rows)

`UiSheet` titled `gradins.h2h.title`. Two cards side by side, yours at the inline start, each 160 px
wide on phones (200 px from 768 px), names under them in Changa 800. A score line `m5.h2h.score`.
Four rows « CAP 91 · 85 »: code + long label at the start, the two values at the end; the higher value
in the 800 weight with a 3 px bar under it whose width is value/99 of 48 px, in `--ui-ink-fg`; equal
values both at 700; a null is « — ». `Provisoire` pill under either card when it applies. A ghost
`common.close` at the bottom; `ReportNameMenu` for the friend in the sheet header's trailing slot. **No
share** (D19: a friend's rating stays in the app). No beat. Event `card_h2h_open`.

### 4.5 The club and city layer (G1 block + G3 filter), and why not a screen

There is no honest club-wide data to fill a page: there are no club leagues (`League.type` is
`private | public | cup`, and public leagues have no working backend), OVR may not rank anyone (lab
rule, D-display-only), and counts of supporters are banned. What is true and worth showing: your club
and its city, your card in its colours, the people you play with who support it, and its next match.
That is a block on G1 and a filter on G3. Club leagues (FPL-style, every manager auto-joins their
club's league) would earn a page; they change Fantasy rules, so they are the owner's call (section 11).

### 4.6 G6 · Vos saisons `/gradins/saisons?saison=<uuid>`

**Purpose.** The record: every season, every counted journée, every moment. **Belonging:** depuis le
début, rang par rang.

**Layout at 390.** `UiHeader` (back to `/gradins`, title `gradins.seasons.title`). Then:

1. **The rack**: a 6 px rail line across the column, one item per season hanging from it (a 56 px token
   at that season's final or current tier, `gradins.seasons.season` label, « 86 · CHAMPION » or the
   counter). Items are buttons (`aria-pressed`) choosing the season the rest of the page shows.
2. **This season**: `gradins.seasons.counted_*`, and `gradins.seasons.first_rating` when there is one.
3. **The line**: a sparkline of OVR per evaluated journée (`aria-hidden`; nulls are gaps; provisional
   points hollow), 64 px tall, `--ui-ink-fg` stroke. WP3 loads the `dataviz` skill before drawing it.
4. **The table**: Journée / Note / Palier (`gradins.seasons.col_*`), newest first, 20 rows per page,
   `gradins.seasons.more` loads the next page (keyset on `gameweekSeq`). Provisional rows carry the pill.
5. **Revoir** (`m4.sheet.replay` heading): derived, never invented: the season's first rating (earliest
   non-null history row), the first time at each tier (earliest row per tier across seasons), founder
   (card), each closed season. Items `m12.item.*`. Each opens the replay sheet.

**Replay sheet.** `UiSheet` titled with the item's label. The full card drawn from that journée's
stored values (stats, number, tier, season), playing that moment's beat, number visible from the first
frame; under it `m12.replay.line` (« À la J3 : 84. Aujourd’hui : 87. »). Close only. Static under
reduced motion. Event `card_replay_open`.

**States.** Off: redirect. Loading: rack and table skeletons. Error: `gradins.seasons.error` + retry.
No counted journée yet: `gradins.seasons.empty`. Guest or no team: redirect to `/gradins`.

**Data.** `useMyManagerCard()` (`seasons`, `founder`), `useMyManagerCardHistory(seasonId)`. Event
`gradins_seasons_view`.

### 4.7 G7 · Share

Opens from G1, G2 and the heroes. Never automatic; only when the number is not null (an unrated share
was cut by the approved plan).

- **Sheet:** the existing `ShareImageSheet` with `aspect="story"`, `campaign="manager_card"`,
  `fileName="botolago-carte.png"`, `label={t("gradins.share.label")}`, WhatsApp first, then native
  share, copy link, and download where the phone cannot share a file. `onEvent` fires
  `card_share_preview_<tier>`, `card_share_whatsapp`, `card_share_native`, `card_share_copy`,
  `card_share_download`.
- **Image (1080 × 1920),** drawn on a canvas like `src/components/fantasy/recap-image.ts`, on the
  share palette (`SHARE_PALETTE`: Tunnel Navy ground, white type): the wordmark (light file) at the
  top; the card large (renderer `image()`, section 6.7), centred, 760 px wide; the name in Changa 800;
  « 84 OVR · PRO »; `m6.image.provisional` when provisional; the serial « BOT #482913 » when not null;
  the season; the club as a colour disc with initials (no crest); the caption `gradins.share.caption`
  (« Ma saison, rang par rang »); « botolago.com ». Arabic image fully right-to-left. Only the sharer's
  own card.
- **Message:** `m6.msg.league` / `_provisional` when the manager has a private league (its join link),
  else `m6.msg.plain` / `_provisional` with `/jouer?utm_source=whatsapp&utm_campaign=manager_card`.
  Numbers isolated with U+2068…U+2069.

### 4.8 The founder story: a block and a hero, not a route

Founder is a small cohort and, before the grant, nothing may hint at it (approved: no teaser, no
« eligible », no « missed it »). A route would be an empty page for almost everyone. So: the M9 hero on
G1 (section 5.3); on G2 a « Fondateur 2026 » card with the renderer's founder detail (the cream cast-on
with 2026, drawn 2× from the same SVG by `detail(profile, "founder")`), `m9.line`, `m9.cutoff` when a
cut-off date exists, and a « Revoir » button playing the `founder` beat; on G6 a Revoir item.

### 4.9 Not built, and why

- A public club page or club board: no honest data (4.5).
- A global or league ranking by OVR: banned (display-only).
- A three-frame story (M4c): v2 only if measured (approved decision 7).
- XP, badges, achievements: not in v1 (D10).
- A notification or nav badge for new moments: a dot on every page would need the card read on every
  page; the Fantasy hub block carries « Nouveau » instead (5.1).
- Builder lines tied to PR #376 (M3g) and the weekly fact (M3h): only after #376 and D2/D3/D5.

---

## 5. Onboarding in the app

### 5.1 Where each moment lands

| Moment                 | Where                                 | Surface (package)                                                                                                                  | Notes                                                                                                       |
| ---------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| M1a first contact      | Fantasy                               | Fifth « Comment jouer » point in `FantasyGuestIntro` (WP5)                                                                         | 36 px disc with the 24 px guest mini; `m1.intro.*`; only with an enrolment gameweek                         |
| M1b save step          | Fantasy                               | `/fantasy/create` name step: 64 px row, 48 px token + `m1.save.line` above « Entrer l’effectif » (WP5)                             | Guest token local and unnamed; `autoFocus={!live}` on the team name                                         |
| M1c account path       | Auth                                  | Register hint under « Nom complet »; profile setup live token on steps 1–2 (WP6)                                                   | Club step hint and recolour: live only (club resolution is a launch prerequisite, section 10)               |
| M1c back in builder    | Fantasy                               | `/fantasy/create` opens on the name step with `m1.builder.line` when a restored draft is complete (WP5)                            | Live only                                                                                                   |
| M2 card born           | Fantasy, and Gradins if reached first | `CardBornPanel` above the pitch on `/fantasy/team`, or in G1's hero slot (WP4 component, WP5 and WP3 place it)                     | Data-driven trigger; `make` beat                                                                            |
| M3a formation          | Fantasy                               | `HubCardBlock` under the team card in `FantasyHubPersonal` (WP5)                                                                   | 64 px token, counter or number, next round, taps to `/gradins`; « Nouveau » badge while a moment is pending |
| M3b sub-states         | Both                                  | Hub block and G1 « Cette journée »                                                                                                 | Same copy keys                                                                                              |
| M3c rankings           | Fantasy                               | 44 px token + « 1/3 » or « 84 OVR » in `MyRankCard` (WP5)                                                                          | Taps to `/gradins`                                                                                          |
| M3d recap              | Fantasy                               | `m3.recap` under the total in `GameweekRecapCard` while forming (WP5)                                                              |                                                                                                             |
| M3e hints              | Fantasy                               | `CardHint` (`UiAlert tone="info"`) in `PlayerActionSheet` (captain), team page (first substitution), transfers (first visit) (WP5) | Device keys, once each                                                                                      |
| M3f first transfer     | Fantasy                               | Line on the transfer confirmation while TRF's reason is `no_transfers` (WP5)                                                       |                                                                                                             |
| M4 first rating        | Gradins                               | G1 hero; « Voir le détail » goes to G2 (WP4 hero, WP3 placement)                                                                   | The number shows everywhere at once regardless                                                              |
| M5 league              | Fantasy + Gradins                     | Fantasy league page: band, 28 px minis in name cells, link `gradins.people.compare` to G3 (WP5). G3: band, rows, face-à-face (WP3) |                                                                                                             |
| M6 share               | Gradins                               | G7 (WP4)                                                                                                                           |                                                                                                             |
| M7 provisional cleared | Gradins                               | One line in G1 « Cette journée » (WP4 line, WP3 placement)                                                                         | Ack on display                                                                                              |
| M8 tier changed        | Gradins                               | G1 hero (up); G2 line (down)                                                                                                       |                                                                                                             |
| M9 founder             | Gradins                               | G1 hero; G2 block                                                                                                                  |                                                                                                             |
| M10 season             | Gradins                               | G1 hero (closed); G1 state line (started)                                                                                          |                                                                                                             |
| M11 returning / launch | Gradins                               | One coalesced G1 hero; M2 arrival-forming panel                                                                                    |                                                                                                             |
| M12 replay             | Gradins                               | G2 Revoir, G6 list, replay sheet                                                                                                   |                                                                                                             |
| Deletion line          | Profile                               | One line in the deletion request when a card exists (WP6)                                                                          | `state.deletion` / `_noserial`                                                                              |

### 5.2 Changes to the approved onboarding plan (for the owner's review)

1. M4b's detail sheet is the G2 page: the section now has a page for it, and a page can be returned to.
2. M5b's face-à-face opens from G3's rows. The Fantasy league page keeps the band and minis and links to
   G3: its rows already hold the report control, and a row-wide sheet trigger would fight it.
3. M12's card page is `/gradins/carte` + `/gradins/saisons`, not `/fantasy/carte`.
4. M3b « insufficient » reads « Les journées nécessaires sont comptées. La note attend encore une
   statistique. » (no number), so no Arabic count has to agree with a subject.
5. Heroes (M4, M8, M9, M10, M11) play in Gradins, not on the Fantasy hub; the hub block shows the
   number at once and a « Nouveau » badge that leads to the hero.
6. **G1's order (section 4.1), changed in the build and recorded here at the finish review.** Section
   4.1 lists stage, identity, « Cette journée », the stat tiles, then people, club, seasons. The build
   puts belonging first (people, club, seasons), then « Cette journée » and the stat tiles, because
   belonging is what the owner asked the section to sell. The cost was that « Cette journée » started
   about 1,440 px down at 390 (French, card forming), out of the first screen. So **one line under the
   identity line** now says the next round and its deadline, from the same read and the same words as
   « Cette journée » (`gradins.round.line`), and leads where that block's button does
   (`/fantasy/team`). Measured at 390 × 844, French, `forming1`: « Cette journée » at about 606 px in the
   plan's order (derived from the layout), 1,438 px in the build before the line, 1,482 px with it (the line is 44 px); the line
   itself sits at 586 to 630 px, on the first screen. The line is absent when the season is over or no
   round is known. To restore the plan's order, move `ThisRoundBlock` and the stat tiles above
   `PeopleBlock` in `GradinsHome.tsx` and drop `RoundGlance`.

### 5.3 Rules kept from the approved plan

- **Nothing opens by itself.** Heroes are inline expansions of G1's stage; the only sheets (G4,
  replay, G7) open on a tap.
- **One hero per session.** A `sessionStorage` flag `botolago.card.hero_session.v1` set when a hero or
  the M2 panel is shown, on any surface. Priority: `card_created` panel > `first_rating` (fresh, arrival,
  coalesced) > `founder_granted` > `tier_changed` > `season_closed` > `season_started` >
  `provisional_cleared` (a line). Lower ones wait or show as their one-line state.
- **Launch gate.** Nothing expands and no view is counted before `useSplashDone() && isHydrated && hasChosen`
  (the PrizeWelcome gate).
- **Deadline first.** Within 60 minutes of a Fantasy deadline, G1 heroes stay collapsed (the number
  still shows); the M2 panel is exempt.
- **PrizeWelcome** waits for a session in which the hero flag is not set (WP5, `fantasy.index.tsx`).
  No hero or panel shows while `FantasyImportPrompt` or the step-up notice is open.
- **Acknowledgement.** The ×, either hero button, or two seconds at least half on screen
  (`IntersectionObserver`, threshold 0.5) calls `ack(keys)`; a coalesced hero acknowledges every key it
  folds in, in one call. Acknowledged keys are cached in `botolago.card.moments.v1` so nothing flashes
  back while the call is in flight; a failed ack is retried on the next visit.
- **Hero anatomy on G1** (390): a 44 px row with the hero label (label step) at the start and a 44 px
  × (`common.close`) at the end; the stage card playing the beat; the hero line; two 48 px buttons
  (primary, then soft). After acknowledgement the label row, line and buttons collapse (CSS
  `grid-template-rows: 1fr → 0fr`, 260 ms `var(--ease-standard)`), leaving the ordinary stage.

| Hero               | Label                         | Line                                                                                                              | Primary                                       | Second               | Beat                        | Acks                                                                       |
| ------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------- | --------------------------- | -------------------------------------------------------------------------- |
| M2 new             | `m2.heading`                  | `m2.line1` (or `_from`), `m2.line2`, `m2.serial` if serial, `m2.invite` while the first counted deadline is ahead | `fantasy.hub.invite_share` (soft, full width) | —                    | `make`                      | `card_created`                                                             |
| M2 arrival-forming | `m2.heading`                  | `m2.arrival`                                                                                                      | `fantasy.hub.invite_share`                    | —                    | `make`                      | `card_created`                                                             |
| M4 fresh           | `m4.hero.fresh.label`         | `m4.hero.fresh.line` if provisional                                                                               | `m4.hero.detail` → G2                         | `article.share` → G7 | `first`                     | `first_rating:<fs>`                                                        |
| M4 arrival         | `m4.hero.arrival.label`       | `m4.hero.arrival.line`                                                                                            | same                                          | same                 | `make`                      | `card_created`, `first_rating:<fs>`, `provisional_cleared:<fs>` if pending |
| M4 coalesced       | `m4.hero.coalesced.label`     | `m4.hero.fresh.line` if provisional                                                                               | same                                          | same                 | none                        | every key folded in                                                        |
| M8 up              | `m8.up.heading`               | `m8.up.line`                                                                                                      | `m8.view` → G2                                | `article.share`      | `tier` (`legend` at LEGEND) | `tier_changed:<tier>`                                                      |
| M9                 | `m9.heading`                  | `m9.line` + `m9.cutoff`                                                                                           | `m8.view` → G2                                | `article.share`      | `founder`                   | `founder_granted`                                                          |
| M10 closed         | `gradins.season.closed_label` | `m10.closed`                                                                                                      | `m8.view`                                     | `article.share`      | `castoff`                   | `season_closed:<fs>`                                                       |
| M7 (line)          | —                             | `m7.line`                                                                                                         | —                                             | —                    | none                        | `provisional_cleared:<fs>` on display                                      |
| M10 started (line) | —                             | `m10.started`                                                                                                     | —                                             | —                    | none                        | `season_started:<fs>` on display                                           |

Events: `card_born_view`, `card_born_invite`, `card_born_close`, `card_arrival_view`,
`card_first_rating_view`, `card_first_rating_detail`, `card_first_rating_close`,
`card_provisional_cleared_view`, `card_tier_up_view`, `card_founder_view`, `card_season_closed_view`,
`card_season_started_view`.

### 5.4 Motion: « Rang par rang »

**Thesis.** Your card is being made for you, row by row, by the season you play. In Gradins nothing
fades, slides or counts up: it is knitted. A row appears across the scarf from the reading side (left
to right in French, right to left in Arabic) in visible stitch steps, one row after another, at the
pace of hands on needles. The number and the serial are never inside a row that moves.

**How.** Each knitted row is a `<g class="mc-kr">` with `--mc-d` (delay) and `--mc-t` (duration). The
reveal is a `clip-path` from `inset(0 100% 0 0)` (French) or `inset(0 0 0 100%)` (Arabic) to
`inset(0)`, with `animation-timing-function: steps(8, end)` so it reads as stitches, not a wipe, and
`animation-fill-mode: both`. The renderer emits the classes; `echarpe.css` holds the keyframes, all
inside `@media (prefers-reduced-motion: no-preference)` and scoped under `.mc-echarpe`.

| Beat      | Name                | Trigger                                                                   | What moves                                                                                                                                                                                                                         | Timing                                                                                                                                                                         | Total    |
| --------- | ------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `make`    | Le montage          | M2 born, M4 arrival, guest first view                                     | The five cast-on rows (cream with 2026 for a founder, ground yarn otherwise), then the empty tacking lines for the counted journées, then the name band row by row                                                                 | cast-on start 0, gap 36 ms, 170 ms per row; tacking start 110, gap 45, 190; name band start 200, gap min(26, 310 ÷ (rows − 1)), 190, so a 14-row Arabic band still ends by 700 | ≤ 700 ms |
| `tick`    | La journée tricotée | G1, when `gameweeksCounted` is above the device's `botolago.card.tick.v1` | The newest counted stripe, two rows                                                                                                                                                                                                | start 30, gap 90, 240 per row                                                                                                                                                  | 360 ms   |
| `first`   | Le troisième rang   | M4 fresh, replay of a first rating                                        | The last counted stripe knits in under the 84 already there                                                                                                                                                                        | start 80, gap 110, 300 per row                                                                                                                                                 | 490 ms   |
| `tier`    | Une frange de plus  | M8 up (STADE, PRO, CHAMPION)                                              | The new tassel drops into place (translateY −8 px → 0, opacity 0 → 1, 240 ms, `cubic-bezier(0.16, 1, 0.3, 1)`, delay 80) while the fringe swings once (skewX 0 → 5° → −2° → 0, 520 ms, `cubic-bezier(0.3, 0.7, 0.3, 1)`, delay 80) | as stated                                                                                                                                                                      | 600 ms   |
| `legend`  | L’écharpe levée     | M8 up to LEGEND                                                           | Arms rise (translateY 18 px → 0, opacity .4 → 1, 420 ms, `cubic-bezier(0.2, 0.9, 0.25, 1)`); the band lifts and settles (translateY 12 px, scaleY .96 → none, 420 ms, `cubic-bezier(0.16, 1, 0.3, 1)`, delay 120)                  | as stated                                                                                                                                                                      | 540 ms   |
| `founder` | La première maille  | M9, G2 founder Revoir                                                     | The five cream cast-on rows knit across in turn from the bottom (row i delay 60 + (4 − i) × 80 ms, 100 ms each, steps(8)), then ·26 on the name band (opacity 0 → 1, 120 ms at 480 ms)                                             | as stated                                                                                                                                                                      | 600 ms   |
| `castoff` | Fin de saison       | M10 closed                                                                | One cast-off row of bound loops across the scarf's lower edge                                                                                                                                                                      | start 60, one row of 320 ms, steps(8)                                                                                                                                          | 380 ms   |
| sway      | Le balancement      | G1 and G2 full card, `pointermove` from a mouse or pen while pressed      | The whole scarf swings from the rail as a damped pendulum (the lab's `mount`), back to rest                                                                                                                                        | physics, ≤ 1.2 s                                                                                                                                                               | —        |

Rules:

- **The number is never held back.** No digit of the OVR, no serial, no « — » carrier is ever inside an
  animated group; at t = 0 the OVR group has opacity 1 and is on top (`elementFromPoint` at its centre).
  No count-up, flip, cover, blur, scratch or tap-to-reveal anywhere.
- **Once.** A beat plays when its moment is first shown, then the component drops the beat class
  (after the beat's total) so later re-renders do not replay it. Replays only on a tap.
- **Interruption.** Closing a hero mid-beat removes the class: the card jumps to its finished state.
- **Reduced motion.** No beat, no sway, no hero collapse transition, no « Revoir » beat buttons; the
  finished state at frame 0; heroes still show their content and acknowledge the same way. The global
  rule in `styles.css` also clamps any CSS animation.
- **Low-end phones.** Beats only on full cards (never tokens or minis); at most 16 rows animate at once
  (the `make` beat's longest moment); nothing runs while `document.hidden`.
- **Another direction.** Screens request beats by name; a renderer lists the beats it supports
  (`renderer.beats`) and silently ignores the others.

---

## 6. The card in the app

### 6.1 Files

| Path                                                                                   | Owner                                                           | What                                                                                                                            |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/manager-card/types.ts`                                                 | WP1                                                             | Render-facing types (6.2)                                                                                                       |
| `src/components/manager-card/renderer.ts`                                              | WP1                                                             | The `CardRenderer` interface (6.3)                                                                                              |
| `src/components/manager-card/plain-renderer.ts`                                        | WP1                                                             | A small, fast test renderer (rounded rect in the club colour, number or dash, name text) used by unit tests and until WP2 lands |
| `src/components/manager-card/active-renderer.ts`                                       | WP1 creates (plain); WP2 switches to Écharpe in its last commit | `{ id, load: () => Promise<CardRenderer>, estimateAspect(profile) }`                                                            |
| `src/components/manager-card/ManagerCard.tsx`, `CardToken.tsx`, `use-card-renderer.ts` | WP1                                                             | React wrappers (6.5)                                                                                                            |
| `src/components/manager-card/to-profile.ts`                                            | WP1                                                             | DTO → `CardProfile` (7.3)                                                                                                       |
| `src/components/manager-card/echarpe/*`                                                | WP2                                                             | The port (6.4)                                                                                                                  |

### 6.2 Types (verbatim, WP1)

```ts
export const TIER_CODES = ["homa", "stade", "pro", "champion", "legend"] as const;
export type TierCode = (typeof TIER_CODES)[number];
export const STAT_CODES = ["cap", "sel", "trf", "con"] as const;
export type StatCode = (typeof STAT_CODES)[number];
export type CardLang = "fr" | "ar";
export type CardTheme = "light" | "dark";
export type BeatName = "make" | "tick" | "first" | "tier" | "legend" | "founder" | "castoff";
export type TokenSize = 24 | 28 | 32 | 44 | 56 | 64 | 80;

export interface CardClub {
  id: string;
  /** Two or three letters for discs: the club code, else from the short name. */
  initials: string;
  name: { fr: string; ar: string };
  /** `#rrggbb` from `clubPalette(club).base`; never a literal in a component. */
  primary: string;
  /** `#rrggbb` from `clubPalette(club).secondary`, or null. */
  secondary: string | null;
}

/** What a renderer draws. Every field may be empty; empty draws as the object's own empty part. */
export interface CardProfile {
  /** Display name, else team name (D17). "" for an unnamed guest: an empty name band. */
  name: string;
  /** null: a dash on the number carrier, never 0. */
  ovr: number | null;
  /** null: the base material with no tier word. Never HOMA before a rating. */
  tier: TierCode | null;
  /** No change to the art; the app shows the « Provisoire » pill beside it. */
  provisional: boolean;
  /** Counted journées and the minimum: k of N marks while forming. null: no marks. */
  counted: number | null;
  minRated: number | null;
  /** "2026/27". */
  season: string;
  /** "482913" (no prefix, no leading zero) or null: a dash on the ID carrier. */
  serial: string | null;
  /** 2026 or null: no founder part at all. */
  founder: number | null;
  club: CardClub | null;
  stats: Record<StatCode, number | null>;
  /** Development fixtures only: prints the sample label on the object. */
  sample?: true;
}

/** The words a renderer may print or speak, from the app dictionary (WP1 `cardStrings`). */
export interface CardStrings {
  lang: CardLang;
  ovr: string; // "OVR"
  stats: Record<StatCode, string>; // CAP… / القائد…
  statsLong: Record<StatCode, string>;
  tiers: Record<TierCode, string>;
  founderLine: string; // « Fondateur 2026 »
  sample: string; // « Exemple » / «مثال»
  serial: (serial: string) => string; // "BOT #482913"
  a11y: {
    cardOf: string;
    noRating: string;
    counted: (k: number, n: number) => string;
    separator: string; // ", " / "، "
  };
}
```

### 6.3 The renderer interface (verbatim, WP1)

```ts
export interface RenderOptions {
  strings: CardStrings;
  theme: CardTheme;
  /** One beat, or none. Ignored by tokens. Never animates the number or the serial. */
  beat?: BeatName;
}
export interface TokenOptions {
  strings: CardStrings;
  theme: CardTheme;
  size: TokenSize; // ≤ 32: the mini (row cells); 44–80: the token
}
export interface TextRun {
  text: string;
  /** In the image's coordinate space. */
  x: number;
  y: number;
  size: number;
  weight: 400 | 600 | 700 | 800;
  face: "display" | "body" | "arabic";
  anchor: "start" | "middle" | "end";
  dir: "ltr" | "rtl";
  colour: string;
}
export interface CardImageArt {
  /** Text-free SVG (knitted glyphs are geometry; every <text> is moved to `texts`). */
  svg: string;
  width: number;
  height: number;
  texts: TextRun[];
}
export interface CardRenderer {
  readonly id: string; // "echarpe-v2"
  readonly beats: readonly BeatName[];
  /** One root element: role="img", aria-label from `label`, dir from strings.lang. */
  full(profile: CardProfile, options: RenderOptions): string;
  token(profile: CardProfile, options: TokenOptions): string;
  /** height ÷ width of `full`, computed without the DOM (exact for charted names). */
  aspect(profile: CardProfile, strings: CardStrings): number;
  /** Token box in CSS px for a size: { width, height }. */
  tokenBox(profile: CardProfile, size: TokenSize): { width: number; height: number };
  /** A cropped view of one part of the full card (G2's founder block). */
  detail(profile: CardProfile, part: "founder", options: RenderOptions): string | null;
  /** The share image art (6.7). */
  image(profile: CardProfile, strings: CardStrings): CardImageArt;
  /** The one-sentence accessible name (also used as the root's aria-label). */
  label(profile: CardProfile, strings: CardStrings): string;
  /** Total length of a beat in ms (0 when unsupported). */
  beatMs(beat: BeatName): number;
}
```

### 6.4 The Écharpe port (WP2)

**Source.** `design-lab/manager-cards-claude/src/concepts/07-v2.js` and `07-v2.css` at the head of the
lab branch `claude/affectionate-galileo-8l9mxh` when WP2 starts, read with
`git show origin/claude/affectionate-galileo-8l9mxh:<path>` (the working copy in
`/home/user/botolago-foundation` is being edited by other agents; never copy uncommitted lab files).
Record the lab commit sha in `echarpe/README.md`. If the lab's beat code (`BEATS`, `knit()`) is not
committed by then, port the geometry and implement the beats from section 5.4.

**Files** (all under `src/components/manager-card/echarpe/`, TypeScript `strict`, no `any`):

| File          | From the lab                                                                                                                | Notes                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `charts.ts`   | `D913`, `N8`, `N7`, `N6`, `T4`, `F35`, `F34`, `F710`, `F69`, `F57`, `AR_NAME`, `AR_TIER`                                    | Data only; `as const`                                                                                                                          |
| `knit.ts`     | `word`, `hjoin`, `grid`, `stamp`, `bmpRects`, `gridRuns`, `keyRects`, `keyRectsIn`, `vstack`, `trim`, `trimRows`, `castOff` | Pure                                                                                                                                           |
| `names.ts`    | `latinName`, `arabicName`, `nameArt`, `yearArt`, `yearInline`, `yearTuck`, `splits` + new `knitName` (6.4.1)                | `rasterText` injected (below)                                                                                                                  |
| `palette.ts`  | `palette`, `reach`, `mix`, `lum`, `contrast`, `hex`                                                                         | Use `contrastRatio`/`parseHex` from `src/lib/colour.ts` where they match                                                                       |
| `full.ts`     | `fullHanging`, `fullLegend`, `castOn`, `patch`, `tassel`, `looseFringe`, `footLine`                                         | Beat classes per 5.4                                                                                                                           |
| `token.ts`    | `token`, `tokenHanging`, `tokenLegend`, `tokTassels`, `chevron`, `tokenFigures`                                             | Mini at ≤ 32 px                                                                                                                                |
| `image.ts`    | —                                                                                                                           | `image()` (6.7)                                                                                                                                |
| `avatar.ts`   | `MC.AVATAR`, `MC.avatar`                                                                                                    | Hood up only                                                                                                                                   |
| `wordmark.ts` | `MC.logo("wordmark")`                                                                                                       | `import wordmark from "@/assets/brand/botolago-wordmark-color.svg?raw"` (and the light file for dark), inlined as a nested `<svg>`, unmodified |
| `sway.ts`     | `mount`                                                                                                                     | Pointer types mouse and pen only; returns a cleanup                                                                                            |
| `raster.ts`   | `rasterText`                                                                                                                | Browser only: canvas sampling of Changa 800; `null` on the server                                                                              |
| `echarpe.css` | `07-v2.css`                                                                                                                 | Every selector under `.mc-echarpe` (rename `c07v2` → `mc-echarpe`); beats per 5.4                                                              |
| `index.ts`    | the registration object                                                                                                     | `export const echarpeRenderer: CardRenderer`                                                                                                   |
| `README.md`   | —                                                                                                                           | Lab sha, what was dropped, how to add a beat                                                                                                   |

**Dropped from the lab:** the gallery registration fields (philosophy, idea, belonging, risks, notes,
colourways), `share()` (an HTML composition; replaced by `image()`), the country (D16: none in v1), the
« J.01–J.07 · Exemple » note (replaced: the patch's note is the season label; `sample` profiles add
`strings.sample`), the 03 Porte-clés, 05 Semelle, 01 Lucarne and Touchline modules (not used).

**Kept as designed:** knit typography and fit ladder, five tiers by gauge/panel/binding/tassels (2, 3,
4, 5) and LEGEND raised, the cream cast-on and ALI ·26, the Logo Blue selvedge thread (owner's lab
allowance of 2026-10-07; section 11), one polarity per tier, the rim on dark grounds, the onboarding
states of `CONTRACT.md` (null number → knitted dash on plain rib; null tier → base scarf; k of N
stripes; null serial → dash on the ID carrier; null club → own material; null name → rib band).

#### 6.4.1 Names on the scarf

The app has one name string, not a Latin and an Arabic pair. `knitName(name)`:

1. Trim, collapse spaces, remove emoji and symbols (`\p{Extended_Pictographic}`, `\p{S}`).
2. If it contains Arabic letters (`\p{Script=Arabic}`): keep Arabic letters and spaces, drop tatweel and
   harakat (U+064B–U+065F, U+0640); knit with the Arabic path (hand charts for the charted names, else
   `rasterText`).
3. Otherwise: NFD, drop combining marks, uppercase, keep `A–Z`, space and hyphen; knit with the Latin
   path (charts cover A–Z and hyphen).
4. Knit at most 24 characters, cut at a word boundary. An empty result knits a plain rib band (the
   name still shows in text under the card).

The **script of the name** chooses the chart. The **interface language** chooses the mirroring (the
selvedge side, the back drop, the patch's reading order, `dir` on the root). A Latin name in the Arabic
interface is knitted in Latin capitals on a mirrored scarf, and the reverse.

`rasterText` needs a canvas and the loaded Changa font: in the browser `raster.ts` provides it after
`document.fonts.load('800 100px "Changa"')`; on the server and in tests it is absent and the renderer
falls back to an empty rib band. Cards are drawn on the client only (6.5), so users always get the
raster.

### 6.5 Rendering in React, safely (WP1)

```tsx
/** The full card, client-only. Reserves its height from `estimateAspect` before the renderer loads. */
export function ManagerCard(props: {
  profile: CardProfile;
  width: number; // CSS px
  beat?: BeatName;
  className?: string;
  /** Set on the stage: `data-mc-ready="1"` once painted (tests and the perf probe wait on it). */
  testId?: string;
}): JSX.Element;

export function CardToken(props: {
  profile: CardProfile;
  size: TokenSize;
  className?: string;
}): JSX.Element;
```

- **Client only.** Server and first client render: a box with `aspect-ratio` from
  `activeRenderer.estimateAspect(profile)` holding a `UiSkeleton` and a visually hidden `<span>` with
  the label from `cardLabel(profile, strings)` (WP1, `copy.ts`; renderers' `label()` returns the same
  sentence by calling it). After mount, `use-card-renderer.ts` loads the renderer (`activeRenderer.load()`, a dynamic
  import, so the Écharpe code is its own chunk) and the box takes the exact aspect.
- **Insertion.** `<div dangerouslySetInnerHTML={{ __html: html }} />` where `html` is the renderer's
  output and nothing else. The renderer builds every attribute and text node through one `esc()` (the
  lab's `MC.esc`), knitted names are geometry, and the aria-label is escaped. A unit test feeds hostile
  names (`<img src=x onerror=alert(1)>`, `"><script>alert(1)</script>`, `{{7*7}}`, `‮`) and
  asserts no `<img`, `<script`, `onerror`, `javascript:` and no unescaped `"` inside an attribute in
  `full`, `token`, `detail` and `image().svg`; and that every tag in the output is one of `div, span,
p, bdi, svg, g, defs, clipPath, pattern, linearGradient, radialGradient, stop, path, rect, circle,
ellipse, line, polyline, polygon, text, tspan, use`.
- **Memo.** `useMemo` on a stable key (`JSON.stringify(profile)` + lang + theme + beat + width bucket);
  a module LRU of 64 renders keyed the same way, so league tables re-render cheaply.
- **Theme.** From the app's theme provider (resolved light or dark); the renderer adds its rim on dark.
- **Beat.** Passed only when `!prefersReducedMotion()` and `renderer.beats.includes(beat)`; removed
  after `renderer.beatMs(beat)` + 50 ms.
- **Ids.** SVG ids come from the renderer's own counter (`mc-<n>-…`), unique per page.

### 6.6 Performance

- Full cards only on G1 (one), G2 (one, plus five 44 px ladder tokens and the founder detail), G4 (two),
  the replay sheet (one) and the M2 panel (one). Everywhere else tokens (44–80 px) or minis (24–28 px).
- Budget, measured by WP2 and WP6: `full()` for a charted Latin PRO profile ≤ 25 ms, an Arabic raster
  name ≤ 60 ms, `token()` ≤ 3 ms, on the CI runner; G1 from data to `data-mc-ready="1"` ≤ 400 ms in
  Chromium with CPU throttling ×4 (`Emulation.setCPUThrottlingRate`); the Écharpe chunk ≤ 60 kB gzip.
- With the build switch off the chunk is never requested.

### 6.7 The share image art

`image(profile, strings)` returns the full hanging card at 760 px wide as a text-free SVG plus the text
runs the SVG would have drawn (the patch figures, codes and footer), in image coordinates. The share
module (WP4, `card-share-image.ts`) draws: the ground, the SVG through `new Image()` from a Blob URL,
then each text run with `ctx.fillText` after `loadShareFonts(lang, sample)` (from
`src/components/pepites/share-image.ts`), then the wordmark, name, number, lines and caption. This keeps
fonts reliable (an SVG drawn as an image cannot use the page's web fonts).

---

## 7. Data layer

### 7.1 Files (WP1)

| Path                                                         | What                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| `src/backend/manager-card/contracts.ts`                      | zod schemas and types (7.2), `ManagerCardRepository` |
| `src/backend/manager-card/errors.ts`                         | `ManagerCardError`, `mapManagerCardError` (7.5)      |
| `src/backend/manager-card/supabase-repository.ts`            | RPC calls through `getManagerCardApi()`              |
| `src/backend/manager-card/mock-repository.ts`, `fixtures.ts` | Development fixtures (7.7)                           |
| `src/integrations/supabase/v2-client.ts`                     | add `getManagerCardApi()` (same body as the others)  |
| `src/services/manager-card.ts`                               | data-mode selection, `managerCardService`            |
| `src/services/manager-card-status.ts`                        | section 3.2                                          |
| `src/services/use-manager-card.ts`                           | React Query hooks (7.4)                              |
| `src/components/manager-card/to-profile.ts`                  | DTO → `CardProfile` (7.3)                            |
| `src/components/manager-card/copy.ts`, `interpolate.tsx`     | copy accessors and plural families (7.8)             |
| `src/components/manager-card/storage.ts`                     | device keys, each read and write in `try/catch`      |

### 7.2 Contracts (verbatim shapes, WP1; the backend plan must return exactly these, camelCase)

```ts
const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const localized = z.object({ fr: z.string(), ar: z.string() });
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const tier = z.enum(TIER_CODES);
const ovr = z.number().int().min(1).max(99);

export const STAT_NULL_REASONS = [
  "pending_minimum",
  "no_transfers",
  "window_open",
  "excluded_weeks_only",
  "board_not_final",
  "pre_captain_fix",
] as const;
export const OVR_NULL_REASONS = ["pending_minimum", "too_few_stats"] as const;
export const RATING_STATES = ["forming", "insufficient", "provisional", "rated"] as const;

export const managerCardStatusSchema = z.object({
  enabled: z.boolean(),
  minRated: z.number().int().positive().nullable(),
  minConfirmed: z.number().int().positive().nullable(),
});

export const cardClubSchema = z.object({
  id: uuid,
  slug: z.string().nullable(),
  code: z.string().nullable(),
  name: localized,
  shortName: localized,
  city: localized.nullable(),
  primaryColor: hex.nullable(),
  secondaryColor: hex.nullable(),
});
const statSchema = z.object({
  value: ovr.nullable(),
  nullReason: z.enum(STAT_NULL_REASONS).nullable(),
});
const statsSchema = z.object({
  cap: statSchema,
  sel: statSchema,
  trf: statSchema,
  con: statSchema,
});

export const momentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("card_created"),
    key: z.literal("card_created"),
    occurredAt: iso.nullable(),
    seasonLabel: z.string(),
  }),
  z.object({
    kind: z.literal("first_rating"),
    key: z.string().startsWith("first_rating:"),
    occurredAt: iso,
    gameweekSeq: z.number().int(),
    ovr,
    tier,
    provisional: z.boolean(),
    gameweeksCounted: z.number().int(),
    firstEver: z.boolean(),
  }),
  z.object({
    kind: z.literal("provisional_cleared"),
    key: z.string().startsWith("provisional_cleared:"),
    occurredAt: iso,
    gameweekSeq: z.number().int(),
    ovr,
    gameweeksCounted: z.number().int(),
  }),
  z.object({
    kind: z.literal("tier_changed"),
    key: z.string().startsWith("tier_changed:"),
    occurredAt: iso,
    tier,
    previousTier: tier.nullable(),
    ovr,
    gameweekSeq: z.number().int(),
    seasonLabel: z.string(),
  }),
  z.object({
    kind: z.literal("founder_granted"),
    key: z.literal("founder_granted"),
    occurredAt: iso,
    cohort: z.number().int(),
    cutoffDate: z.string().date().nullable(),
  }),
  z.object({
    kind: z.literal("season_closed"),
    key: z.string().startsWith("season_closed:"),
    occurredAt: iso,
    seasonLabel: z.string(),
    ovr: ovr.nullable(),
    tier: tier.nullable(),
  }),
  z.object({
    kind: z.literal("season_started"),
    key: z.string().startsWith("season_started:"),
    occurredAt: iso,
    seasonLabel: z.string(),
    previous: z.object({ label: z.string(), ovr: ovr.nullable(), tier: tier.nullable() }),
  }),
]);

export const seasonSummarySchema = z.object({
  seasonId: uuid,
  label: z.string(),
  ovr: ovr.nullable(),
  tier: tier.nullable(),
  bestTier: tier.nullable(),
  gameweeksCounted: z.number().int().nonnegative(),
  closedAt: iso.nullable(),
});

export const myCardSchema = z.object({
  teamId: uuid,
  name: z.string(),
  handle: z.string().nullable(),
  season: z.object({ id: uuid, label: z.string() }),
  serial: z
    .string()
    .regex(/^[1-9][0-9]{5}$/)
    .nullable(),
  founder: z
    .object({ cohort: z.number().int(), grantedAt: iso, cutoffDate: z.string().date().nullable() })
    .nullable(),
  club: cardClubSchema.nullable(),
  ratingState: z.enum(RATING_STATES),
  ovr: ovr.nullable(),
  ovrNullReason: z.enum(OVR_NULL_REASONS).nullable(),
  tier: tier.nullable(),
  bestTier: tier.nullable(),
  nextTier: z.object({ code: tier, fromOvr: ovr }).nullable(),
  provisional: z.boolean(),
  stats: statsSchema,
  gameweeksCounted: z.number().int().nonnegative(),
  minRated: z.number().int().positive(),
  minConfirmed: z.number().int().positive(),
  rulesVersion: z.string().nullable(),
  throughGameweekSeq: z.number().int().nullable(),
  calculatedAt: iso.nullable(),
  firstCountedGameweekSeq: z.number().int().nullable(),
  firstRatedGameweekSeq: z.number().int().nullable(),
  ratingGameweeks: z.array(z.number().int()).nullable(),
  ratingGameweeksComplete: z.boolean(),
  previousSeason: z
    .object({ label: z.string(), ovr: ovr.nullable(), tier: tier.nullable() })
    .nullable(),
  seasonClosed: z.boolean(),
  seasons: z.array(seasonSummarySchema),
  createdAt: iso.nullable(),
  moments: z.array(momentSchema),
});

export const memberCardSchema = z.object({
  teamId: uuid,
  name: z.string(),
  club: cardClubSchema.nullable(),
  serial: z
    .string()
    .regex(/^[1-9][0-9]{5}$/)
    .nullable(),
  founderCohort: z.number().int().nullable(),
  seasonLabel: z.string(),
  ratingState: z.enum(RATING_STATES),
  ovr: ovr.nullable(),
  tier: tier.nullable(),
  provisional: z.boolean(),
  stats: z.object({
    cap: ovr.nullable(),
    sel: ovr.nullable(),
    trf: ovr.nullable(),
    con: ovr.nullable(),
  }),
  gameweeksCounted: z.number().int().nonnegative(),
  minRated: z.number().int().positive(),
  firstRatedGameweekSeq: z.number().int().nullable(),
});

export const historyRowSchema = z.object({
  seasonId: uuid,
  seasonLabel: z.string(),
  gameweekSeq: z.number().int(),
  ovr: ovr.nullable(),
  tier: tier.nullable(),
  provisional: z.boolean(),
  gameweeksCounted: z.number().int(),
  stats: z.object({
    cap: ovr.nullable(),
    sel: ovr.nullable(),
    trf: ovr.nullable(),
    con: ovr.nullable(),
  }),
  calculatedAt: iso,
});

const off = z.object({ available: z.literal(false) });
export const myCardResponseSchema = z.union([
  off,
  z.object({ available: z.literal(true), card: myCardSchema.nullable() }),
]);
export const cardsResponseSchema = z.union([
  off,
  z.object({ available: z.literal(true), cards: z.array(memberCardSchema) }),
]);
export const historyResponseSchema = z.union([
  off,
  z.object({
    available: z.literal(true),
    items: z.array(historyRowSchema),
    nextBeforeSeq: z.number().int().nullable(),
  }),
]);
export const ackResponseSchema = z.object({
  acknowledged: z.array(z.string()),
  ignored: z.array(z.string()),
});

export interface ManagerCardRepository {
  status(context: RepositoryContext): Promise<ManagerCardStatus>;
  myCard(context: RepositoryContext): Promise<MyCardResponse>;
  cards(teamIds: readonly string[], context: RepositoryContext): Promise<CardsResponse>;
  myHistory(
    query: { seasonId: string | null; beforeSeq: number | null; limit: number },
    context: RepositoryContext,
  ): Promise<HistoryResponse>;
  ackMoments(keys: readonly string[], context: RepositoryContext): Promise<AckResponse>;
}
```

RPC names (the backend plan confirms them): `api.manager_card_status()`, `api.get_my_manager_card()`,
`api.get_manager_cards(p_team_ids uuid[])` (≤ 100), `api.get_my_manager_card_history(p_season_id uuid,
p_before_seq integer, p_limit integer)`, `api.ack_manager_card_moments(p_keys text[])` (≤ 16). Until the
backend PR regenerates `src/backend/generated/database.types.ts`, the repository calls them through one
typed cast (`const rpc = api.rpc as unknown as UntypedRpc;`) in a single helper, with a comment to remove
it once the types exist. `card: null` means the caller has no team this season.

### 7.3 DTO → CardProfile (WP1, `to-profile.ts`)

- `fromMyCard(card)`: name, ovr, tier, provisional, `counted = gameweeksCounted`, `minRated`, season
  label, serial, `founder = founder?.cohort ?? null`, club through `toCardClub`, stat values. When
  `ratingState === "forming"` and `previousSeason` exists (a new season, D7), the profile shows the
  previous season's `ovr`, `tier` and label, with `counted = null`.
- `fromMember(card)`, `fromHistoryRow(row, card)` (replay: the row's stats, number, tier and season),
  `withTier(profile, tier)` (the G2 ladder), `guestProfile()` (all empty, season label from the current
  Fantasy season), `localProfile({ displayName, club })` (signed in, no team).
- `toCardClub(dto)`: `clubPalette({ id, slug, name, shortName, primaryColor, secondaryColor })`; `primary = palette.base ?? null`
  (if null, the card has no club: own material); `secondary = palette.secondary`; `initials` from `code`,
  else the short name's first letters (two, three for three-word names).

### 7.4 Service and hooks (WP1)

```ts
export const managerCardKeys = {
  status: ["manager-card", "status"] as const,
  me: (userId: string) => ["manager-card", "me", userId] as const,
  cards: (teamIds: readonly string[]) => ["manager-card", "cards", [...teamIds].sort().join(",")] as const,
  history: (userId: string, seasonId: string | null) => ["manager-card", "history", userId, seasonId] as const,
};
/** Enabled only when live, signed in and the Fantasy screen has a team. staleTime 60 s, refetch on focus. */
export function useMyManagerCard(): UseQueryResult<MyCardDto | null, ManagerCardError>;
/** staleTime 5 min. Empty array: no query. */
export function useManagerCards(teamIds: readonly string[]): UseQueryResult<MemberCardDto[], ManagerCardError>;
/** Infinite query, 20 per page, keyset on beforeSeq. */
export function useMyManagerCardHistory(seasonId: string | null): UseInfiniteQueryResult<…>;
/** Optimistic: writes the device cache and removes the moments from the cached card; never throws. */
export function useAckMoments(): (keys: readonly string[]) => Promise<void>;
/** After a first save or an import: invalidate (never awaited, never on the critical path). */
export function invalidateMyManagerCard(queryClient: QueryClient): void;
```

Any response with `available: false` calls `markManagerCardOff(queryClient)` (3.2).

### 7.5 Errors (WP1)

Codes: `unauthenticated`, `mfa_required` (through `reportMfaStepUp`), `not_found`, `unavailable`
(`PGRST202`, `{ available: false }`), `invalid_request` (`PT400`), `network`, `data_unavailable`
(anything else, and a DTO that fails its schema). Never log to the console. The screens map them:
`unavailable` → redirect via the status; `mfa_required` → the existing notice; the rest → the error panel.

### 7.6 Moments on the client (WP4)

Types (in WP1's `types.ts`, verbatim; the DTO types are `z.infer` of 7.2's schemas, exported from
`contracts.ts` as `ManagerCardStatus`, `MyCardDto`, `MemberCardDto`, `HistoryRowDto`, `MomentDto`,
`SeasonSummaryDto`, `MyCardResponse`, `CardsResponse`, `HistoryResponse`, `AckResponse`):

```ts
export type HeroKind =
  | "born_new"
  | "born_arrival"
  | "first_fresh"
  | "first_arrival"
  | "first_coalesced"
  | "tier_up"
  | "founder"
  | "season_closed";
export interface HeroSpec {
  kind: HeroKind;
  /** Every moment key this hero acknowledges, in one call. */
  keys: string[];
  beat: BeatName | null;
  gameweekSeq: number | null;
  tier: TierCode | null;
  /** first_coalesced only: the first rating it folds in. */
  first: { ovr: number; gameweekSeq: number } | null;
}
export interface LineSpec {
  kind: "provisional_cleared" | "season_started" | "tier_down";
  /** Acknowledged on display; [] for tier_down (never a moment). */
  keys: string[];
}
export interface ReplayItem {
  kind: "first_rating" | "tier" | "founder" | "season";
  seasonId: string | null;
  gameweekSeq: number | null;
  tier: TierCode | null;
  beat: BeatName | null;
  /** The stored journée the replay draws; null for founder (drawn from the current card). */
  row: HistoryRowDto | null;
}
```

`src/components/manager-card/moments/moments.ts` (pure, tested): `pickHero(moments, ctx)` applies
priority, coalescing (launch arrival when `card_created` and `first_rating` are both pending; returning
when the first rating is older than the latest evaluated journée), the deadline rule and the session
flag, and returns `{ hero: HeroSpec | null; lines: LineSpec[]; ackOnDisplay: string[] }`.
`use-moment-gate.ts` wraps it with the launch gate, storage, the IntersectionObserver and `useAckMoments`.

### 7.7 Development fixtures, and why production never has them (WP1)

- **Selection.** `selectManagerCardDataMode(configured, production)`: in production, any configured value
  other than `"supabase"` throws, like `selectPepitesDataMode`; otherwise `"mock"` or `"supabase"`,
  defaulting to `"mock"` in development. `.env.example` gains `VITE_MANAGER_CARD_DATA_MODE=mock` and a
  commented `# VITE_MANAGER_CARD_PREVIEW=1`.
- **Not in the bundle.** `src/services/manager-card.ts` reaches the mock only through
  `if (import.meta.env.DEV) { const { MockManagerCardRepository } = await import("@/backend/manager-card/mock-repository"); … }`.
  Vite replaces `import.meta.env.DEV` with `false` in a production build, so the branch and its dynamic
  import are removed and no fixture chunk is emitted. No other module imports `mock-repository.ts` or
  `fixtures.ts` statically (a source test checks it).
- **Proof.** `fixtures.ts` exports `MANAGER_CARD_FIXTURE_SENTINEL = "mc-fixture-sentinel-6b1f"`, and
  `scripts/qa/manager-card-fixture-gate.ts` scans every file under `.output/` after `bun run build` and
  exits 1 if the sentinel or any fixture name (« KARIM », « mc=rated ») appears. WP6 runs it.
- **Choosing a fixture.** `?mc=<id>` on any URL in a development build: the server render reads it from
  the request (status and the first card), the browser stores it in `sessionStorage`
  (`botolago.mc.fixture`) on first load so client navigations keep it. Default `rated`. Fixtures are in
  Appendix B; every sample profile has `sample: true`, so the object prints « Exemple » / «مثال».
- **Auth.** Fixtures do not sign anyone in. Guest screens: signed out. Manager screens: the mock login the
  e2e suite already uses (`tests/e2e/fantasy.journey.e2e.ts`, `login()`), with the mock Fantasy team.

### 7.8 Copy accessors and plurals (WP1, `copy.ts`)

The i18n gate's warning baselines are exact (`scripts/qa/i18n-gate.ts`), so the build must add no new
W3 (unreferenced key) or W4 (non-literal `t()` argument). Rule: **every new key is read through
`copy.ts` with a literal `t("…")` call**; components never build key names. `copy.ts` exports grouped
accessors (`gradinsCopy(t)`, `cardCopy(t)`, `momentCopy(t)`) and one function per plural family with
literal calls in a ternary, as `src/lib/read-time.ts` does:

- `finalRounds(n)`: `card.final_one|two|few|other` (« 3 journées terminées » / «3 جولات منتهية»), used only
  after a preposition (« après », « jusqu’à », « sur » / «بعد»، «حتى»، «من»).
- `rounds(n)`: `card.rounds_*` (« 3 journées » / «3 جولات»), after a preposition.
- `countedA11y(k, n)`: `card.a11y.counted_zero|one|two|few|other`.
- `countedRounds(n)`: `gradins.seasons.counted_zero|one|two|few|other`.
- `leagues(n)`: `gradins.leagues_one|two|few|other`.

Rule for the category: `n === 0` → `zero` when the family has it; French: 1 → one, 2 → two (same text as
other), else few/other (same text); Arabic: `Intl.PluralRules("ar")`, `many` → `other`. `gwList(seqs)`
uses `card.gw_list_1|2|3`; more than three uses the `_from` sentence instead. `interpolate.tsx`:
`fill(template, values: Record<string, ReactNode>)` for the interface (numbers wrapped in
`<bdi dir="ltr">`) and `fillText(template, values)` for messages and labels (U+2068…U+2069 around
digits in Arabic). `FORMULA_KEYS: Record<string, Record<StatCode, TranslationKey>> = {}` (empty until
the rules' formulas are decided; then a follow-up adds keys for that `rulesVersion`).

Two keys have identical French and Arabic values on purpose: `card.ovr` (« OVR ») and `card.serial`
(« BOT #{serial} »). WP1 adds both to `IDENTICAL_ALLOWED` and `NO_ARABIC_SCRIPT_ALLOWED` in
`src/i18n/i18n-allowlist.ts` with a justification ("a unit / an identifier format, the same in both
languages") and raises W1 and W2 by exactly 2 each in `BASELINES`, with a comment in the file's style.

---

## 8. Work packages

### 8.1 Waves and git

| Wave | Packages                                                                                                              | Starts when                                                                                                               |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 0    | **WP1** foundation; **WP2** renderer                                                                                  | Now. WP2 starts when WP1's first commit (the brief, this plan, `types.ts`, `renderer.ts`) is on the branch.               |
| 1    | **WP3** screens, **WP4** moments and share, **WP5** Fantasy inline, **WP6a** account path, Pépites band, profile line | WP1 merged. WP2 may still be running: everything renders with the plain renderer until WP2 switches `active-renderer.ts`. |
| 2    | **WP6b** integration and evidence                                                                                     | All of WP1–WP5 and WP6a merged, `active-renderer.ts` on Écharpe.                                                          |

- Each package works in its own worktree and branch from `claude/manager-card-section`
  (`git worktree add /home/user/mc-wpN -b claude/manager-card-section-wpN claude/manager-card-section`),
  commits only the files it owns, and is merged into `claude/manager-card-section` with a merge commit
  (`--no-ff`). Never rebase, amend or force-push anything already pushed (the branch syncs to Lovable).
- **Shared files have one owner.** Dictionaries, `i18n-allowlist.ts`, `scripts/qa/i18n-gate.ts`,
  `feature-flags.ts`, `primary-nav.ts`, `BottomNav.tsx`, `TopBar.tsx`, `__root.tsx`, `v2-client.ts`,
  `analytics.ts`, `.env.example`, `routeTree.gen.ts` and every `src/routes/gradins*.tsx`: **WP1** in waves
  0–1, then **WP6b**. A package that needs a missing key or event uses what exists, notes it in its
  report, and WP6b adds it.
- **Stubs.** WP1 creates the files other packages will own, each exporting its final signature (given
  below) with a placeholder body (`return null` or a `UiSkeleton`), so every package compiles alone. The
  receiving package replaces the body and keeps the signature.
- **Ports.** Each package runs its own dev server on its own port with `E2E_BASE_URL` set, never reusing
  another worktree's server: WP3 4183, WP4 4184, WP5 4185, WP6 4186; base tree 4181, branch 4182 for the
  before/after pair. Command: `VITE_MANAGER_CARD_PREVIEW=1 VITE_MANAGER_CARD_DATA_MODE=mock
VITE_AUTH_MODE=mock VITE_FANTASY_DATA_MODE=mock VITE_FOOTBALL_DATA_MODE=mock VITE_PEPITES_DATA_MODE=mock
bun run dev -- --host 127.0.0.1 --port <port> --strictPort`.
- **Captures.** Each package writes its screenshots and its capture script under
  `docs/product/manager-card-section/wpN/` (its own folder, named
  `<screen>-<fixture>-<fr|ar>-<light|dark>-<390|1440>.png`), with a short `INDEX.md` listing each file and
  the command that made it. WP6 links them from the evidence index.
- **WP2's switch commit** (`active-renderer.ts`) lands only after WP1 is merged; it is the one file that
  changes owner inside a wave, and nobody else edits it.
- **No database writes.** No package touches a database, applies a migration, deploys an Edge Function,
  publishes in Lovable or merges to `main` (AGENTS.md; the backend is a separate pass).

### 8.2 Common checks (every package, on its own files)

`bun run typecheck` · `bun run lint` · `bunx prettier --check <touched files>` · `bun test <touched dirs>` ·
`bun test src/components/ui-kit src/components/shell src/theme src/i18n src/lib/feature-flags.test.ts src/components/a11y-source.test.ts src/routes/nested-route-outlet.test.ts`
(the source-scanning guards) · `bun scripts/qa/i18n-gate.ts` (exit 0). Report every command with its
result; never claim a check that did not run (CLAUDE.md "Evidence").

### 8.3 WP1 · Foundation (wave 0, first)

**Owns:** `docs/product/MANAGER_CARD_SECTION_PLAN.md` and `_BRIEF.md` (commit them first, unchanged);
`src/lib/feature-flags.ts` (+ `.test.ts`); `src/components/shell/primary-nav.ts` (+ `.test.ts`),
`BottomNav.tsx`, `TopBar.tsx`; `src/routes/__root.tsx`; `src/routes/gradins.tsx`,
`gradins.index.tsx`, `gradins.carte.tsx`, `gradins.les-votres.tsx`, `gradins.saisons.tsx`;
`src/routeTree.gen.ts`; `src/integrations/supabase/v2-client.ts`; `src/lib/analytics.ts` (events,
Appendix C); `src/i18n/dictionary-fr.ts`, `dictionary-ar.ts` (every key of Appendix A),
`src/i18n/i18n-allowlist.ts`, `scripts/qa/i18n-gate.ts` (BASELINES only); `.env.example`;
`src/backend/manager-card/*`; `src/services/manager-card.ts`, `manager-card-status.ts`,
`use-manager-card.ts`; `src/components/manager-card/{types,renderer,plain-renderer,active-renderer,to-profile,copy,storage}.ts`,
`ManagerCard.tsx`, `CardToken.tsx`, `use-card-renderer.ts`, `interpolate.tsx`;
`scripts/qa/manager-card-fixture-gate.ts`; all their tests.

**Stubs it creates for others:** `src/components/gradins/GradinsHome.tsx`, `GradinsCardPage.tsx`,
`GradinsPeoplePage.tsx`, `GradinsSeasonsPage.tsx` (each `export function X(): JSX.Element`, WP3);
`src/components/manager-card/moments/MomentHero.tsx` (`MomentHero(props: { surface: "gradins"; card: MyCardDto; profile: CardProfile; onDetail: () => void; onShare: () => void }): JSX.Element | null`),
`CardBornPanel.tsx` (`CardBornPanel(props: { card: MyCardDto; profile: CardProfile; nextDeadline: string | null; surface: "team" | "gradins" }): JSX.Element | null`),
`MomentLines.tsx` (`MomentLines(props: { card: MyCardDto }): JSX.Element | null`),
`ReplaySheet.tsx` (`ReplaySheet(props: { open: boolean; onOpenChange(open: boolean): void; item: ReplayItem | null; current: MyCardDto }): JSX.Element`),
`ShareCardSheet.tsx` (`ShareCardSheet(props: { open: boolean; onOpenChange(open: boolean): void; card: MyCardDto }): JSX.Element`),
`use-moment-gate.ts` (`useMomentGate(surface: "gradins" | "team", card: MyCardDto | null): { hero: HeroSpec | null; lines: LineSpec[]; ack(keys: readonly string[]): void }`),
`moments.ts`, `card-share-image.ts` (WP4). `HeroSpec`, `LineSpec`, `ReplayItem` are declared in `types.ts`.

**Tests:** flag source tests (constant false; preview expression literal; listed gated surfaces exist);
`withFifthSlot` and `isPrimaryRouteActive` truth tables (3.3); `usePrimaryNavItems` returns the same array
object when the build is off; status: server memo, 800 ms timeout, `PGRST202`, HTTP errors and malformed
JSON → off with no console call (spy), browser queryFn makes no fetch (spy on `fetch`); root route object
has no `beforeLoad` when the build is off; `/gradins` guard redirects for both layers; contracts accept
every fixture and reject a leading-zero serial, `homa` as a tier-changed key, an out-of-range OVR; error
mapping table; mock not imported statically anywhere (source scan); plural families for 0, 1, 2, 3, 5, 11,
100 in both languages; `fill`/`fillText` isolation; `to-profile` for every fixture, including D7; the
`ManagerCard` wrapper's server render (a sized box with the label, no SVG) via `renderToString`.

**Done when:** the common checks pass; `bun run build` passes; with the preview unset the dev server's
Home, Fantasy and Pépites are unchanged; with the preview on, the bar shows Gradins and `/gradins` renders
the stubs.

### 8.4 WP2 · Écharpe renderer (wave 0, after WP1's first commit)

**Owns:** `src/components/manager-card/echarpe/**`; `src/components/manager-card/active-renderer.ts`
(its last commit only: point `load` at `echarpe/index.ts` and `estimateAspect` at a cheap version of
`aspect`).

**Builds:** section 6.4 and the beats of 5.4.

**Tests (`bun test src/components/manager-card/echarpe`):** every fixture profile renders `full` and every
token size in both languages and both themes without throwing; a null OVR prints the knitted dash and never
« 0 »; null serial, null club, null founder and the empty name render their empty parts; ·26 and the cream
cast-on only with `founder`; tassel count by tier (2, 3, 4, 5) and LEGEND's raised outline; the hostile-name
escape test and tag allow-list (6.5); `aspect` equals the real SVG's ratio within 1% for charted names;
`knitName` table (accents, digits, emoji, mixed script, 30-character names); Latin name in Arabic
interface and the reverse; no number inside an element with a `mc-kr` class (structural test on every beat);
`image()` returns no `<text>` and one text run per removed text; the renderer bench (6.6) recorded.

**Screenshots:** a dev-only harness page is not added to the app. WP2 captures the card through WP1's
`/gradins` stub with fixtures: `rated`, `forming1`, `founder`, `legend`, `longNameLatin`, `arabicName`,
`clubNull`, at 390 in French and Arabic, light and dark, plus a t = 0 capture with motion on for `rated`
and `founder` (number visible).

### 8.5 WP3 · Gradins screens (wave 1)

**Owns:** `src/components/gradins/**` (replacing WP1's four stubs): `GradinsHome.tsx`,
`GradinsCardPage.tsx`, `GradinsPeoplePage.tsx`, `GradinsSeasonsPage.tsx`, `CardStage.tsx`,
`IdentityLine.tsx`, `ThisRoundBlock.tsx`, `StatTiles.tsx`, `PeopleBlock.tsx`, `ClubBlock.tsx`,
`SeasonsBlock.tsx`, `GuestHero.tsx`, `NoTeamHero.tsx`, `ClubTryOn.tsx`, `TierLadder.tsx`,
`FounderBlock.tsx`, `RevoirList.tsx`, `SeasonRack.tsx`, `Sparkline.tsx`, `HistoryTable.tsx`,
`HeadToHeadSheet.tsx`, `gradins-state.ts` (pure: audience + card → the G1 state of 4.1), and their tests.

**Uses (does not edit):** WP1's hooks, copy and wrappers; WP4's `MomentHero`, `CardBornPanel`,
`MomentLines`, `ReplaySheet`, `ShareCardSheet`, `useMomentGate`.

**Tests:** `gradins-state.ts` for every row of the G1 state table; server renders (`renderToString` in the
app's providers, as `FantasyHubPersonal.test.tsx` does) of G1 for guest, no team, closed registration,
forming, rated, founder, season closed, unavailable; G3 keeps the standings order and never sorts by OVR;
own row marked; no heading contains the name; every interactive element named.

**Screenshots (port 4183):** G1 (guest, no team, forming1, rated, founder, seasonClosed, seasonStarted,
offline), G2 (rated, ratedTrfNull, insufficient3, founder, tierDown), G3 (rated with league, no league,
alone), G4, G6 (rated, empty) at 390 × 844 and 1440 × 900, French and Arabic, light and dark.

### 8.6 WP4 · Moments and share (wave 1)

**Owns:** `src/components/manager-card/moments/**` (replacing WP1's stubs): `moments.ts`,
`use-moment-gate.ts`, `MomentHero.tsx`, `CardBornPanel.tsx`, `MomentLines.tsx`, `ReplaySheet.tsx`,
`ShareCardSheet.tsx`, `card-share-image.ts`, `share-message.ts`, and their tests (including
`card-share-image.draw.test.ts` in the style of `src/components/pepites/share-image.draw.test.ts`).

**Builds:** sections 5.3, 4.6 (replay sheet), 4.7, 6.7, 7.6.

**Tests:** `pickHero` for every fixture's pending moments (priority, coalescing, the 60-minute rule, the
session flag, launch gate); a coalesced hero acknowledges every folded key in one call; ack writes the
device cache before the network; the share message for both variants in both languages with isolated
numbers; the share image model (provisional line present when provisional; no serial line when null; no
crest; Arabic mirrored); no banned word in any string this package renders (section 2.5, checked against
the dictionary values it reads).

**Screenshots (port 4184):** G1 heroes for `born0`, `born0Serial`, `forming1` (arrival), `rated` (fresh),
`launchArrival`, `returning`, `tierUp`, `legend`, `founder`, `seasonClosed`, `cleared` (line); the share
sheet and the 1080 × 1920 image in French and Arabic; the replay sheet; each at 390, light and dark, plus a
t = 0 capture with motion on for `rated` and `founder`.

### 8.7 WP5 · Fantasy inline and the Pépites tile (wave 1)

**Owns:** new `src/components/manager-card/inline/**`: `GuestIntroCardPoint.tsx`, `CardSaveLine.tsx`,
`HubCardBlock.tsx`, `RankCardToken.tsx`, `RecapCardLine.tsx`, `CardHint.tsx`, `FirstTransferLine.tsx`,
`LeagueCardBand.tsx`, `LeagueRowMini.tsx`, `PepitesHubTile.tsx`, and their tests. Edits, each gated on
`useManagerCardLive()` (nothing renders and nothing changes when it is false):
`src/components/fantasy/FantasyGuestIntro.tsx` (M1a), `src/routes/fantasy.create.tsx` (M1b line,
`autoFocus={!live}`, M1c reopen on the name step, invalidate after save), `src/routes/fantasy.team.tsx`
(M2 panel via `CardBornPanel surface="team"`, the SEL hint), `src/components/fantasy/FantasyHubPersonal.tsx`
(M3a block), `src/routes/fantasy.index.tsx` (the Pépites tile under the shortcuts; PrizeWelcome waits per
5.3), `src/components/fantasy/MyRankCard.tsx` (M3c), `src/components/fantasy/GameweekRecapCard.tsx` (M3d),
`src/components/fpl/PlayerActionSheet.tsx` (CAP hint), `src/routes/fantasy.transfers.tsx` (TRF hint, M3f),
`src/routes/fantasy.leagues.$leagueId.tsx` (band, 28 px minis in the name cell before the team name, link
`gradins.people.compare` to G3), `src/components/fantasy/FantasyImportPrompt.tsx` (invalidate the card
after an import; and, **in its own commit**, `track("fantasy_team_created")` on the import's success path,
approved decision 6). Existing tests of these files are updated only where a live-state case is added.

**Tests:** each edited file renders exactly as before with the hook off (existing tests unchanged and
passing); live-state server renders for each inline surface; hints store their device key and show once;
blocked storage counts as seen; the league rows keep their order and report menus.

**Screenshots (port 4185):** Fantasy hub (guest with the fifth point, owner forming, owner rated with
« Nouveau »), the Pépites tile, `/fantasy/create` name step (guest and signed in, keyboard closed), team
page with the M2 panel, rankings card, recap line, the three hints, the league page band and minis; 390
and 1440, French and Arabic, light and dark for the hub and the league page, light for the rest.

### 8.8 WP6 · Account path, Pépites band, profile line (wave 1), then integration and evidence (wave 2)

**Owns (wave 1):** `src/routes/auth.register.tsx` (M1c hint), `src/routes/auth.profile-setup.tsx` (live
64 px token on steps 1–2, name hint, club hint and recolour), `src/routes/profile.tsx` (deletion line),
`src/components/pepites/PepitesShell.tsx` (`backLabel`), `src/components/pepites/PepitesHome.tsx` (back
pill to Fantasy when live), their tests.

**Owns (wave 2):** the shared files listed in 8.1 (taking over from WP1); `tests/e2e/gradins.e2e.ts`,
`tests/e2e/gradins-off.e2e.ts`; `scripts/qa/gradins-capture.ts`; `docs/product/manager-card-section/`
(`before-base/`, `after-off/`, `after-on/`, `INDEX.md`); the draft PR description.

**Wave 2 does, in order:** merge check (all packages in, `active-renderer.ts` on Écharpe); add any keys or
events the packages reported missing; run the full suite (`bun test`, `bun run build`, the fixture gate,
the i18n gate, lint, typecheck); the evidence of section 9; the Impeccable detector
(`/home/user/botolago-foundation/.claude/skills/impeccable/scripts/impeccable detect --json <changed files>`);
open the **draft** pull request from `claude/manager-card-section` with the brief, this plan's link, the
evidence index, what ships off and what the owner does next. Then stop: no merge, no publish without the
owner (AGENTS.md "Screen work" rule 7).

---

## 9. Acceptance criteria (each measured; CLAUDE.md "Evidence")

**Switch off: no change**

1. Before/after screenshots of Home, Fantasy hub, Pépites home and the bottom nav at 390 × 844 and
   1440 × 900, French and Arabic, light: base tree (`origin/main` `3f9c57fc` in its own worktree, port 4181) against the branch with the build switch off (port 4182), same mock modes. Pixel difference
   ≤ 0.1% per pair (anti-aliasing only), every differing region listed. The owner's reference set is
   `docs/product/manager-card-section/before/`.
2. Server HTML of `/`, `/fantasy`, `/pepites`, `/matches` from both trees' built output
   (`bun tests/e2e/built-output-build.ts`, served on distinct ports): the `<body>` markup byte-identical
   after removing `<script>` elements and normalising hashed asset names.
3. The same pages make the same set of network requests (method + path) and write no new storage key
   (Playwright request log and `localStorage`/`sessionStorage` key lists compared).
4. `/gradins`, `/gradins/carte`, `/gradins/les-votres`, `/gradins/saisons` redirect to `/fantasy`.

**Switch on (development preview only)** 5. The bar reads Accueil · Actualités · Fantasy · Matches · Gradins at 390 in both languages; the desktop
top bar has the same five text links; on every `/pepites/*` page the Fantasy item has
`aria-current="page"`. 6. The Fantasy hub shows the Pépites tile; every Pépites URL answers 200 with its canonical unchanged; the
Pépites home shows the « Fantasy » back pill. 7. Every screen and state of section 4 renders for its fixture with no console error and no failed request
(`observePage` from `tests/e2e/support.ts`), in both languages and both themes. 8. Status off or missing (`?mc=featureOff`, and a server stub answering 404 / `PGRST202`): the bar is
today's, `/gradins` redirects, no console error.

**Every screen** 9. No element escapes 390 px, measured by element rectangles (`scripts/qa/layout-probe.mjs` style), not
`scrollWidth` (`html, body { overflow-x: clip }` hides overflow). 10. Every button and link ≥ 44 × 44 (`getBoundingClientRect`), list rows ≥ 48 px. 11. Text contrast ≥ 4.5:1 (≥ 3:1 for the 30 px figures and the display number) read from rasterised pixels
(`scripts/qa/contrast-probe.mjs`), light and dark, including text over the card art; the card's own
labels (patch figures, knitted number) checked the same way at the stage size. 12. Arabic: `dir="rtl"` on `<html>`, computed `letter-spacing` 0 on Arabic text, Western digits isolated
(`bdi` or U+2068/U+2069), names in Changa 800, the mirror (back pill at the right, the own-row bar at
the right edge, chips and rack right to left), plural forms correct for 1, 2, 3, 5, 11. 13. Reduced motion (`reducedMotion: "reduce"`): `document.getAnimations()` is empty after load on every
screen; no « Revoir » beat button; heroes still show and acknowledge. 14. The number is never held back: with motion on, at t = 0 of every beat, the OVR element has opacity 1,
is visible, and `elementFromPoint` at its centre returns it or a descendant; a null number renders
« — » (never « 0 ») and is announced « pas encore de note » / «لا تقييم بعد». 15. « Provisoire » / «مبدئي» on every surface showing a provisional number, the share image included. 16. No banned word (section 2.5) in any rendered `innerText` or share image text, in both languages; no
padlock, lock, question-mark or sealed icon in any card state. 17. No `h1`–`h3` contains a manager's name; no serial with a leading zero; no serial sentence while the
serial is null; ·26 and the founder part only for the founder fixture. 18. Exactly one expanded hero per session; the `returning` fixture shows one coalesced hero and
acknowledges both keys in one call.

**Build and tests** 19. `bun test` (full), `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run build`,
`bun scripts/qa/i18n-gate.ts` and `bun scripts/qa/manager-card-fixture-gate.ts` all exit 0; the
existing Playwright suites `anonymous.acceptance`, `fantasy.journey`, `pepites`, `empty-states`,
`mobile-readability`, `seo-rendering`, `dark-mode-flag` and `built-output.smoke` pass with the switch off. 20. Performance (6.6) recorded: renderer timings, G1 data-to-card at CPU ×4, the Écharpe chunk size. 21. The Impeccable detector's findings on the changed files are fixed or listed with a reason.

Evidence lives in `docs/product/manager-card-section/INDEX.md` (each capture, each command, each number).

---

## 10. What the backend plan must add beyond `BACKEND_HANDOFF.md`

1. **camelCase DTOs** exactly as section 7.2 (`teamId`, `ratingState`, `gameweeksCounted`, `minRated`,
   `nullReason`…), localized names as `{ fr, ar }`, as the app's other `api` RPCs do.
2. **Switched off is an answer, not an error.** With reads off (or no rules row), the card reads return
   HTTP 200 `{ "available": false }` (the Pépites pattern), not `PT403`: a 4xx is a console error in
   every browser.
3. **The ack RPC ignores unavailable keys** and returns `{ acknowledged: [...], ignored: [...] }` with
   HTTP 200, instead of `PT409` (a benign race must not log an error). `PT400` stays for malformed input.
4. **`card: null`** in `get_my_manager_card` when the caller has no current-season team (instead of
   `PT404`); `teamId` in the answer.
5. **Club resolution is a launch prerequisite**: the card's club from `favorite_team_id`, else the
   resolved `favorite_team_provisional_ref`, as `{ id, slug, code, name, shortName, city, primaryColor,
secondaryColor }` (city from club data). Gradins promises club colours to guests.
6. **`firstCountedGameweekSeq`** (the team's first counted journée) for « Depuis la J5 ».
7. **`seasons[]`** in `get_my_manager_card` (every season with a season row, newest first: `seasonId`,
   `label`, `ovr`, `tier`, `bestTier`, `gameweeksCounted`, `closedAt`).
8. **History read** `api.get_my_manager_card_history(p_season_id, p_before_seq, p_limit)`: rows with the
   four stat values, tier, provisional, counted, `calculatedAt`; `nextBeforeSeq` for keyset paging; limit ≤ 40.
9. **Batch read** `api.get_manager_cards(p_team_ids uuid[])` with section 7.2's member shape, including
   `serial`, `founderCohort`, `club`, `minRated` and a forming answer for members with a team and no card
   row yet; omits deleted-pending profiles and teams outside the current season.
10. **Status** `api.manager_card_status()` returns `{ enabled, minRated, minConfirmed }`, `STABLE`, cheap,
    callable by `anon`; the app reads it from its server about once a minute per instance.
11. **Latency targets** for the runbook: `get_my_manager_card` p95 ≤ 150 ms, batch of 100 ≤ 300 ms.
12. **Moments** carry the values of section 7.2's union (including `firstEver`, `previousTier`,
    `cutoffDate`, `previous`).
13. **No new write path from the app** other than the ack RPC; nothing at save time (approved).
14. **Privacy line (D20)** covers names and serials on share images and on other signed-in managers' cards.
15. **Launch runbook** lists the app's flip: `MANAGER_CARD_ENABLED` can go to `true` before or after the
    read switch; the read switch is the moment of launch (section 3.6).

---

## 11. Open for the owner (the build's default in bold)

1. **The name.** Gradins / المدرجات (**built**). Another candidate later is a key change and a redirect.
2. **Arabic tier words.** «حومة، ملعب، محترف، بطل، أسطورة» (**built, as the lab**) or the Latin brand words in
   both languages. «حومة» is closer to Maghrebi usage than to MSA.
3. **« LEGEND » in the French interface** (an English word). **Kept, as the owner's tier names.**
4. **Logo Blue in the card art** (the selvedge thread), allowed in the lab on 2026-10-07; the Two Blues
   Rule keeps it out of the interface. **Kept inside the art only.**
5. **Club leagues** (every manager in their club's league, as FPL does) for a real club page. **Not built**;
   G1 block and G3 filter meanwhile.
6. **Guest club try-on** on G1 (a local preview of any club's colours). **Built.**
7. **Other managers' serials** on face-à-face cards (signed-in readers only, D19). **Shown.**
8. **The five changes to the approved onboarding plan** (section 5.2). **Built as written there.**
9. **Trademark check** of « Gradins » (OMPIC, INPI): not done.

---

## Appendix A. Copy deck (WP1 adds every key; both languages; reuse marked)

Typographic apostrophe ’ in French. `{final}` takes `finalRounds(n)`, `{rounds}` takes `rounds(n)`,
`{gws}` takes `gwList(seqs)`, `{deadline}` the hub's formatted deadline, `{tier}` a tier word,
`{serial}` the result of `card.serial`. Placeholders are identical in both languages for every key
(the gate's E3).

**Reused, already in the dictionaries:** `nav.fantasy`, `nav.pepites`, `nav.profile`, `common.close`,
`state.loading`, `state.retry`, `fpl.pick_team`, `fantasy.next.create`, `fantasy.hub.invite_share`,
`fantasy.hub.invite_message`, `fantasy.leagues.invite_friends`, `article.share`,
`fantasy.availability.registration_closed.title`, `fantasy.availability.registration_closed.body`.

### A.1 Navigation, heads, section

| Key                        | FR                                                          | AR                                            |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| `nav.gradins`              | Gradins                                                     | المدرجات                                      |
| `gradins.meta.home`        | Gradins — BotolaGO                                          | المدرجات — BotolaGO                           |
| `gradins.meta.card`        | Votre carte — BotolaGO                                      | بطاقتك — BotolaGO                             |
| `gradins.meta.people`      | Les vôtres — BotolaGO                                       | أصحابك — BotolaGO                             |
| `gradins.meta.seasons`     | Vos saisons — BotolaGO                                      | مواسمك — BotolaGO                             |
| `gradins.meta.description` | Votre carte de manager BotolaGO, vos ligues et vos saisons. | بطاقتك كمدرّب في BotolaGO، ودورياتك، ومواسمك. |
| `gradins.unavailable`      | Votre carte n’est pas disponible pour ce compte.            | بطاقتك غير متاحة لهذا الحساب.                 |
| `gradins.badge_new`        | Nouveau                                                     | جديد                                          |

### A.2 G1 guest and no team

| Key                                | FR                                                                                                                                                   | AR                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `gradins.guest.headline`           | Votre place dans les gradins                                                                                                                         | مكانك في المدرجات                                                                         |
| `gradins.guest.body`               | Votre carte de manager démarre avec votre équipe : votre nom, les couleurs de votre club, et une note qui vient de vos choix, journée après journée. | تبدأ بطاقتك كمدرّب مع فريقك: اسمك، وألوان ناديك، وتقييمٌ نابع من قراراتك، جولةً بعد جولة. |
| `gradins.guest.sign_in`            | Se connecter                                                                                                                                         | تسجيل الدخول                                                                              |
| `gradins.guest.try_title`          | Essayer les couleurs d’un club                                                                                                                       | تجربة ألوان نادٍ                                                                          |
| `gradins.guest.try_hint`           | Un aperçu seulement : votre club se choisit à la création du compte, et se change dans votre profil.                                                 | معاينة فقط: يُختار ناديك عند إنشاء الحساب، ويمكن تغييره من ملفك الشخصي.                   |
| `gradins.guest.point.name.title`   | À votre nom                                                                                                                                          | باسمك                                                                                     |
| `gradins.guest.point.name.body`    | Votre nom figure sur votre carte et dans les classements. Un prénom ou un surnom suffit.                                                             | يظهر اسمك على بطاقتك وفي الترتيب. يكفي اسم أول أو لقب.                                    |
| `gradins.guest.point.club.title`   | Aux couleurs de votre club                                                                                                                           | بألوان ناديك                                                                              |
| `gradins.guest.point.club.body`    | Le club choisi dans votre profil donne sa couleur à votre carte.                                                                                     | يمنح النادي الذي تختاره في ملفك الشخصي لونه لبطاقتك.                                      |
| `gradins.guest.point.rating.title` | Une note qui vient de vos choix                                                                                                                      | تقييمٌ نابع من قراراتك                                                                    |
| `gradins.guest.point.rating.body`  | Capitaine, titulaires, transferts, régularité : votre note arrive après {final}, puis suit votre saison.                                             | القائد، والتشكيلة، والانتقالات، والثبات: يأتي تقييمك بعد {final}، ثم يواكب موسمك.         |
| `gradins.guest.point.people.title` | À côté des vôtres                                                                                                                                    | بجانب أصحابك                                                                              |
| `gradins.guest.point.people.body`  | Dans vos ligues privées, les cartes de vos amis apparaissent à côté de la vôtre.                                                                     | في دورياتك الخاصة، تظهر بطاقات أصدقائك بجانب بطاقتك.                                      |
| `gradins.guest.free`               | Le jeu est gratuit : sans achat, sans pari.                                                                                                          | اللعبة مجانية: بلا شراء ولا رهان.                                                         |
| `gradins.noteam.headline`          | Votre carte attend votre équipe                                                                                                                      | بطاقتك في انتظار فريقك                                                                    |

### A.3 G1 manager

| Key                           | FR                                                                                         | AR                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `gradins.identity.since`      | Depuis la J{gw}                                                                            | منذ الجولة {gw}                                                     |
| `gradins.leagues_one`         | 1 ligue                                                                                    | دوري واحد                                                           |
| `gradins.leagues_two`         | 2 ligues                                                                                   | دوريان                                                              |
| `gradins.leagues_few`         | {n} ligues                                                                                 | {n} دوريات                                                          |
| `gradins.leagues_other`       | {n} ligues                                                                                 | {n} دوريًا                                                          |
| `gradins.round.title`         | Cette journée                                                                              | هذه الجولة                                                          |
| `gradins.round.line`          | J{gw} · date limite {deadline}                                                             | الجولة {gw} · الموعد النهائي {deadline}                             |
| `gradins.round.recalc`        | Votre note est recalculée après chaque journée terminée.                                   | يُعاد حساب تقييمك بعد كل جولة منتهية.                               |
| `gradins.stats.title`         | Ce que dit votre carte                                                                     | ما تقوله بطاقتك                                                     |
| `gradins.people.title`        | Les vôtres                                                                                 | أصحابك                                                              |
| `gradins.people.view_league`  | Voir les cartes de la ligue                                                                | عرض بطاقات الدوري                                                   |
| `gradins.people.you`          | Vous                                                                                       | أنت                                                                 |
| `gradins.people.empty`        | Créez une ligue et invitez vos amis : leurs cartes apparaîtront ici, à côté de la vôtre.   | عند إنشاء دوري ودعوة أصدقائك، تظهر بطاقاتهم هنا بجانب بطاقتك.       |
| `gradins.people.alone`        | Personne n’a encore rejoint « {league} ».                                                  | لم ينضمّ أحد إلى «{league}» بعد.                                    |
| `gradins.people.cards_failed` | Impossible de charger les cartes de la ligue.                                              | تعذّر تحميل بطاقات الدوري.                                          |
| `gradins.people.same_club`    | Supporters de {club}                                                                       | مشجّعو {club}                                                       |
| `gradins.people.compare`      | Comparer les cartes de la ligue                                                            | مقارنة بطاقات الدوري                                                |
| `gradins.club.title`          | Votre club                                                                                 | ناديك                                                               |
| `gradins.club.mates_one`      | Dans « {league} », supporter de {club} aussi : {names}                                     | في «{league}»، من مشجّعي {club} أيضًا: {names}                      |
| `gradins.club.mates_other`    | Dans « {league} », supporters de {club} aussi : {names}                                    | في «{league}»، من مشجّعي {club} أيضًا: {names}                      |
| `gradins.club.next_match`     | Prochain match                                                                             | المباراة القادمة                                                    |
| `gradins.club.none`           | Votre carte n’a pas encore de club. Le club choisi dans votre profil lui donne sa couleur. | لا نادي لبطاقتك بعد. يمنحها النادي الذي تختاره في ملفك الشخصي لونه. |
| `gradins.club.choose`         | Choisir mon club                                                                           | اختيار ناديي                                                        |
| `gradins.seasons.title`       | Vos saisons                                                                                | مواسمك                                                              |
| `gradins.seasons.season`      | Saison {season}                                                                            | موسم {season}                                                       |
| `gradins.season.closed_label` | Fin de saison                                                                              | نهاية الموسم                                                        |

### A.4 G2, G3, G4, G6, share

| Key                             | FR                                                                                      | AR                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `gradins.card.title`            | Votre carte                                                                             | بطاقتك                                                             |
| `gradins.card.where`            | D’où vient votre note                                                                   | من أين يأتي تقييمك                                                 |
| `gradins.card.intro`            | Votre note vient de vos décisions, journée après journée.                               | يأتي تقييمك من قراراتك، جولةً بعد جولة.                            |
| `gradins.card.intro_forming`    | Pas encore de note. Les quatre statistiques se remplissent avec vos journées terminées. | لا تقييم بعد. تكتمل الإحصاءات الأربع مع جولاتك المنتهية.           |
| `gradins.card.tier`             | Votre palier                                                                            | فئتك                                                               |
| `gradins.card.tier_now`         | Actuel                                                                                  | الحالية                                                            |
| `gradins.card.tier_best`        | Meilleur cette saison                                                                   | الأفضل هذا الموسم                                                  |
| `gradins.card.tier_none`        | Le palier arrive avec votre première note.                                              | تأتي الفئة مع تقييمك الأول.                                        |
| `gradins.card.tier_explain`     | Le palier suit votre note, journée après journée.                                       | تتبع الفئة تقييمك جولةً بعد جولة.                                  |
| `gradins.card.serial`           | Numéro {serial} : il ne changera jamais.                                                | الرقم {serial} لن يتغيّر أبدًا.                                    |
| `gradins.h2h.title`             | Face à face                                                                             | وجهًا لوجه                                                         |
| `gradins.seasons.counted_zero`  | Aucune journée comptée                                                                  | لا جولات محتسبة بعد                                                |
| `gradins.seasons.counted_one`   | 1 journée comptée                                                                       | جولة واحدة محتسبة                                                  |
| `gradins.seasons.counted_two`   | 2 journées comptées                                                                     | جولتان محتسبتان                                                    |
| `gradins.seasons.counted_few`   | {n} journées comptées                                                                   | {n} جولات محتسبة                                                   |
| `gradins.seasons.counted_other` | {n} journées comptées                                                                   | {n} جولة محتسبة                                                    |
| `gradins.seasons.first_rating`  | Première note à la J{gw} : {ovr}                                                        | أول تقييم في الجولة {gw}: {ovr}                                    |
| `gradins.seasons.col_round`     | Journée                                                                                 | الجولة                                                             |
| `gradins.seasons.col_rating`    | Note                                                                                    | التقييم                                                            |
| `gradins.seasons.col_tier`      | Palier                                                                                  | الفئة                                                              |
| `gradins.seasons.more`          | Afficher plus                                                                           | عرض المزيد                                                         |
| `gradins.seasons.empty`         | Votre première journée comptée apparaîtra ici.                                          | تظهر هنا أول جولة محتسبة لك.                                       |
| `gradins.seasons.error`         | Impossible de charger votre historique.                                                 | تعذّر تحميل سجلّك.                                                 |
| `gradins.share.label`           | Ma carte BotolaGO                                                                       | بطاقتي في BotolaGO                                                 |
| `gradins.share.caption`         | Ma saison, rang par rang                                                                | موسمي، جولةً بعد جولة                                              |
| `fantasy.hub.pepites_body`      | Les meilleurs moins de 23 ans de la Botola Pro, pour repérer vos prochains joueurs.     | أفضل لاعبي البطولة الاحترافية دون 23 سنة، لاكتشاف لاعبيك القادمين. |
| `fantasy.hub.card_view`         | Voir votre carte                                                                        | عرض بطاقتك                                                         |

### A.5 Card words and plural families

| Key                                                            | FR                                                      | AR                                        |
| -------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| `card.ovr`                                                     | OVR                                                     | OVR                                       |
| `card.serial`                                                  | BOT #{serial}                                           | BOT #{serial}                             |
| `card.provisional`                                             | Provisoire                                              | مبدئي                                     |
| `card.sample`                                                  | Exemple                                                 | مثال                                      |
| `card.founder_line`                                            | Fondateur 2026                                          | عضو مؤسس 2026                             |
| `card.stat.cap` · `.sel` · `.trf` · `.con`                     | CAP · SEL · TRF · CON                                   | القائد · التشكيلة · الانتقالات · الثبات   |
| `card.stat_long.cap`                                           | Vos capitaines                                          | قرارات القائد                             |
| `card.stat_long.sel`                                           | Votre onze de départ                                    | اختيار التشكيلة                           |
| `card.stat_long.trf`                                           | Vos transferts                                          | قرارات الانتقالات                         |
| `card.stat_long.con`                                           | Votre régularité                                        | الثبات                                    |
| `card.tier.homa` · `.stade` · `.pro` · `.champion` · `.legend` | HOMA · STADE · PRO · CHAMPION · LEGEND                  | حومة · ملعب · محترف · بطل · أسطورة        |
| `card.a11y.card_of`                                            | Carte de manager                                        | بطاقة المدرّب                             |
| `card.a11y.no_rating`                                          | pas encore de note                                      | لا تقييم بعد                              |
| `card.a11y.separator`                                          | `, `                                                    | `، `                                      |
| `card.a11y.counted_zero`                                       | aucune journée comptée sur {n}                          | لا جولات محتسبة بعد من {n}                |
| `card.a11y.counted_one`                                        | 1 journée comptée sur {n}                               | جولة واحدة محتسبة من {n}                  |
| `card.a11y.counted_two`                                        | 2 journées comptées sur {n}                             | جولتان محتسبتان من {n}                    |
| `card.a11y.counted_few`                                        | {k} journées comptées sur {n}                           | {k} جولات محتسبة من {n}                   |
| `card.a11y.counted_other`                                      | {k} journées comptées sur {n}                           | {k} جولة محتسبة من {n}                    |
| `card.final_one`                                               | 1 journée terminée                                      | جولة واحدة منتهية                         |
| `card.final_two`                                               | 2 journées terminées                                    | جولتين منتهيتين                           |
| `card.final_few`                                               | {n} journées terminées                                  | {n} جولات منتهية                          |
| `card.final_other`                                             | {n} journées terminées                                  | {n} جولة منتهية                           |
| `card.rounds_one`                                              | 1 journée                                               | جولة واحدة                                |
| `card.rounds_two`                                              | 2 journées                                              | جولتين                                    |
| `card.rounds_few`                                              | {n} journées                                            | {n} جولات                                 |
| `card.rounds_other`                                            | {n} journées                                            | {n} جولة                                  |
| `card.gw_list_1`                                               | J{a}                                                    | الجولة {a}                                |
| `card.gw_list_2`                                               | J{a}, J{b}                                              | الجولتان {a} و{b}                         |
| `card.gw_list_3`                                               | J{a}, J{b}, J{c}                                        | الجولات {a} و{b} و{c}                     |
| `card.reason.pending_minimum`                                  | pas encore assez de journées                            | لا جولات كافية بعد                        |
| `card.reason.no_transfers`                                     | pas encore de transfert                                 | لا انتقالات بعد                           |
| `card.reason.window_open`                                      | calculé {rounds} après le transfert                     | يُحسب بعد {rounds} من الانتقال            |
| `card.reason.excluded_weeks_only`                              | semaines non comptées                                   | جولات غير محتسبة                          |
| `card.reason.board_not_final`                                  | classement pas encore définitif                         | الترتيب لم يُعتمد نهائيًا بعد             |
| `card.reason.pre_captain_fix`                                  | journées au capitaine attribué par défaut, non comptées | جولات القائد المعيَّن تلقائيًا غير محتسبة |

`card.stat.*` and `card.tier.*` are five and four separate keys; the table groups them for space.

### A.6 Approved onboarding copy (`card.onboarding.*`, lab key names; `{final}` where the plan wrote « 3 journées terminées »)

| Key                         | FR                                                                                                                 | AR                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `m1.intro.title`            | Votre carte de manager                                                                                             | بطاقتك كمدرّب                                                                       |
| `m1.intro.body`             | Elle démarre avec votre équipe. Sa note arrive après {final}.                                                      | تبدأ مع فريقك، ويأتي تقييمها بعد {final}.                                           |
| `m1.save.line`              | À l’enregistrement, votre carte de manager démarre avec votre équipe. Sa note arrive après {final}.                | عند حفظ فريقك تبدأ بطاقتك كمدرّب، ويأتي تقييمها بعد {final}.                        |
| `m1.register.hint`          | Sert de nom affiché sur votre carte et dans les classements. Modifiable à l’étape suivante.                        | يُستخدم اسمًا معروضًا على بطاقتك وفي الترتيب، ويمكن تغييره في الخطوة التالية.       |
| `m1.setup.card_label`       | Votre carte                                                                                                        | بطاقتك                                                                              |
| `m1.setup.name_hint`        | Ce nom figure sur votre carte et dans les classements. Un prénom ou un surnom suffit.                              | يظهر هذا الاسم على بطاقتك وفي الترتيب. يكفي اسم أول أو لقب.                         |
| `m1.setup.club_hint`        | Votre club donne sa couleur à votre carte. Modifiable dans votre profil.                                           | يمنح ناديك لونه لبطاقتك، ويمكن تغييره من ملفك الشخصي.                               |
| `m1.builder.line`           | Compte créé. Il reste à enregistrer votre équipe.                                                                  | تمّ إنشاء حسابك. بقي حفظ فريقك.                                                     |
| `m2.heading`                | Votre carte de manager                                                                                             | بطاقتك كمدرّب                                                                       |
| `m2.line1`                  | Sa note arrive après {final} : {gws}.                                                                              | يأتي تقييمها بعد {final}: {gws}.                                                    |
| `m2.line1_from`             | Sa note arrive après {final}, à partir de la J{gw}.                                                                | يأتي تقييمها بعد {final}، ابتداءً من الجولة {gw}.                                   |
| `m2.line2`                  | Elle mesurera vos choix : capitaine, titulaires, transferts, régularité.                                           | ستقيس قراراتك: القائد، والتشكيلة، والانتقالات، والثبات.                             |
| `m2.serial`                 | Son numéro, {serial}, ne changera jamais.                                                                          | رقمها {serial} لن يتغيّر أبدًا.                                                     |
| `m2.invite`                 | Invitez vos amis avant la date limite de la J{gw} : leurs journées compteront en même temps que les vôtres.        | إذا انضمّ أصدقاؤك قبل الموعد النهائي للجولة {gw}، تُحتسب جولاتهم مع جولاتك.         |
| `m2.arrival`                | Nouveau : votre carte est calculée à partir de votre équipe. Sa note arrive après {final} ({k}/{n}).               | جديد: تُحسب بطاقتك انطلاقًا من فريقك. يأتي تقييمها بعد {final} ({k}/{n}).           |
| `m3.label`                  | Carte en formation                                                                                                 | البطاقة قيد التكوين                                                                 |
| `m3.line`                   | Note après {final} · prochaine : J{gw} · date limite {deadline}                                                    | التقييم بعد {final} · التالية: الجولة {gw} · الموعد النهائي {deadline}              |
| `m3.first_counted`          | Première journée comptée : J{gw}.                                                                                  | أول جولة محتسبة: الجولة {gw}.                                                       |
| `m3.eve`                    | Dernière journée avant votre note : J{gw}.                                                                         | آخر جولة قبل تقييمك: الجولة {gw}.                                                   |
| `m3.over`                   | J{gw} terminée, pas encore définitive. La note arrive dès qu’elle l’est.                                           | انتهت الجولة {gw} ولم تُعتمد نهائيًا بعد. يظهر التقييم فور اعتمادها.                |
| `m3.insufficient`           | Les journées nécessaires sont comptées. La note attend encore une statistique.                                     | اكتمل احتساب الجولات اللازمة. ينتظر التقييم إحصاءً آخر.                             |
| `m3.late`                   | Saison terminée avant votre première note : elle viendra en {season}.                                              | انتهى الموسم قبل تقييمك الأول: يأتي في موسم {season}.                               |
| `m3.recap`                  | Journée comptée pour votre carte : {k}/{n}                                                                         | جولة محتسبة لبطاقتك: {k}/{n}                                                        |
| `m3.hint.cap`               | Votre capitaine compte pour CAP sur votre carte.                                                                   | اختيار القائد يُحتسب في خانة «القائد» على بطاقتك.                                   |
| `m3.hint.sel`               | Votre onze de départ compte pour SEL.                                                                              | التشكيلة الأساسية تُحتسب في خانة «التشكيلة».                                        |
| `m3.hint.trf`               | Vos transferts comptent pour TRF. Sans transfert, TRF reste vide (—).                                              | الانتقالات تُحتسب في خانة «الانتقالات». من دون انتقالات تبقى فارغة (—).             |
| `m3.first_transfer`         | TRF mesurera ce transfert après {final}.                                                                           | يُقاس هذا الانتقال في خانة «الانتقالات» بعد {final}.                                |
| `m4.hero.fresh.label`       | Première note · J{gw}                                                                                              | أول تقييم · الجولة {gw}                                                             |
| `m4.hero.fresh.line`        | Provisoire jusqu’à {final}.                                                                                        | يبقى مبدئيًا حتى {final}.                                                           |
| `m4.hero.arrival.label`     | Votre carte de manager est là                                                                                      | بطاقتك كمدرّب هنا                                                                   |
| `m4.hero.arrival.line`      | Calculée sur {final} de votre saison.                                                                              | حُسبت من {final} هذا الموسم.                                                        |
| `m4.hero.coalesced.label`   | Première note : {first} (J{gw}). Aujourd’hui : {ovr}, {tier}.                                                      | أول تقييم: {first} (الجولة {gw}). اليوم: {ovr}، {tier}.                             |
| `m4.hero.detail`            | Voir le détail                                                                                                     | عرض التفاصيل                                                                        |
| `m4.sheet.footer`           | La note est la moyenne des statistiques disponibles.                                                               | التقييم هو متوسط الإحصاءات المتوفرة.                                                |
| `m4.sheet.tier_distance`    | {tier} à partir de {from}.                                                                                         | فئة {tier} ابتداءً من {from}.                                                       |
| `m4.sheet.share`            | Partager ma carte                                                                                                  | مشاركة بطاقتي                                                                       |
| `m4.sheet.league`           | Voir ma ligue                                                                                                      | عرض الدوري                                                                          |
| `m4.sheet.replay`           | Revoir                                                                                                             | إعادة العرض                                                                         |
| `m5.band`                   | Nouvelles notes après la J{gw} : {names}                                                                           | تقييمات جديدة بعد الجولة {gw}: {names}                                              |
| `m5.row.forming`            | en formation {k}/{n}                                                                                               | قيد التكوين {k}/{n}                                                                 |
| `m5.hint.compare`           | Touchez un manager pour comparer vos cartes.                                                                       | للمقارنة بين البطاقتين، يكفي لمس اسم مدرّب.                                         |
| `m5.h2h.score`              | Vous {a} · {name} {b}                                                                                              | أنت {a} · {name} {b}                                                                |
| `m6.image.provisional`      | Note provisoire · J{gw}                                                                                            | تقييم مبدئي · الجولة {gw}                                                           |
| `m6.msg.league`             | Ma carte BotolaGO : {ovr}. Et toi ? Rejoins ma ligue « {league} » : {link}                                         | بطاقتي في BotolaGO: ‏{ovr}. وأنت؟ انضمّ إلى دوريي « {league} »: {link}              |
| `m6.msg.league_provisional` | Ma carte BotolaGO : {ovr} (provisoire). Et toi ? Rejoins ma ligue « {league} » : {link}                            | بطاقتي في BotolaGO: ‏{ovr} (مبدئي). وأنت؟ انضمّ إلى دوريي « {league} »: {link}      |
| `m6.msg.plain`              | Ma carte BotolaGO : {ovr}. Et toi ? {link}                                                                         | بطاقتي في BotolaGO: ‏{ovr}. وأنت؟ {link}                                            |
| `m6.msg.plain_provisional`  | Ma carte BotolaGO : {ovr} (provisoire). Et toi ? {link}                                                            | بطاقتي في BotolaGO: ‏{ovr} (مبدئي). وأنت؟ {link}                                    |
| `m7.line`                   | Votre note n’est plus provisoire : {ovr} après {final}.                                                            | لم يعد تقييمك مبدئيًا: {ovr} بعد {final}.                                           |
| `m8.up.heading`             | Votre carte passe {tier}.                                                                                          | بطاقتك الآن في فئة {tier}.                                                          |
| `m8.up.line`                | {ovr} OVR après la J{gw}. Le palier suit votre note, journée après journée.                                        | {ovr} بعد الجولة {gw}. تتبع الفئة تقييمك جولةً بعد جولة.                            |
| `m8.view`                   | Voir ma carte                                                                                                      | عرض بطاقتي                                                                          |
| `m8.down.line`              | Palier actuel : {tier}. Meilleur cette saison : {best}.                                                            | الفئة الحالية: {tier}. الأفضل هذا الموسم: {best}.                                   |
| `m9.heading`                | Fondateur 2026                                                                                                     | عضو مؤسس 2026                                                                       |
| `m9.line`                   | Votre année s’inscrit après votre nom : {name} ·26. Cette marque a été accordée une seule fois et ne le sera plus. | تُكتب سنتك بعد اسمك: {name} ·26. مُنحت هذه العلامة مرة واحدة ولن تُمنح مجددًا.      |
| `m9.cutoff`                 | Accordée aux équipes 2026/27 créées avant le {date}.                                                               | مُنحت لفرق موسم 2026/27 المُنشأة قبل {date}.                                        |
| `m10.closed`                | Saison {season} terminée : {ovr}, {tier}. Elle reste sur votre carte.                                              | انتهى موسم {season}: {ovr}، {tier}. يبقى على بطاقتك.                                |
| `m10.started`               | Saison {season} : votre carte garde sa note {prev} jusqu’à votre première note de la saison, après {final}.        | موسم {season}: تحتفظ بطاقتك بتقييم {prev} حتى أول تقييم لك هذا الموسم، بعد {final}. |
| `m12.replay.line`           | À la J{gw} : {then}. Aujourd’hui : {now}.                                                                          | في الجولة {gw}: {then}. اليوم: {now}.                                               |
| `m12.item.first_rating`     | La première note · J{gw}                                                                                           | أول تقييم · الجولة {gw}                                                             |
| `m12.item.tier`             | Première fois {tier} · J{gw}                                                                                       | أول مرة في فئة {tier} · الجولة {gw}                                                 |
| `m12.item.season`           | Saison {season}                                                                                                    | موسم {season}                                                                       |
| `state.deletion`            | Votre carte de manager et son numéro {serial} seront supprimés. Ce numéro ne sera jamais réattribué.               | ستُحذف بطاقتك كمدرّب ورقمها {serial}، ولن يُعاد إسناد هذا الرقم أبدًا.              |
| `state.deletion_noserial`   | Votre carte de manager sera supprimée.                                                                             | ستُحذف بطاقتك كمدرّب.                                                               |
| `state.offline.text`        | Impossible de charger votre carte.                                                                                 | تعذّر تحميل البطاقة.                                                                |

Every key in A.6 is prefixed `card.onboarding.` (for example `card.onboarding.m2.heading`). The founder
item in M12's list uses `m9.heading`; « Partager » uses `article.share`; « Fermer » `common.close`.

---

## Appendix B. Development fixtures (WP1, `fixtures.ts`; all `sample: true`)

Translated from the lab's `src/onboarding/states.js` (serial `482913`, never a leading zero), plus the
cases the app needs. Each fixture is `{ id, status, card: MyCardDto | null, league?: { name, members: MemberCardDto[], standings }, history: HistoryRow[] }`.

| `?mc=`            | What it is                                                                    |
| ----------------- | ----------------------------------------------------------------------------- |
| `featureOff`      | Status off                                                                    |
| `offline`         | Every card read throws `network`                                              |
| `unavailable`     | `{ available: false }` from the card read (mid-session switch-off)            |
| `noCard`          | `card: null` for an owner (deleted-pending path)                              |
| `born0`           | Saved, 0/3, serial null, `card_created` pending, rating journées J5–J7        |
| `born0Serial`     | As `born0` with serial                                                        |
| `forming1`        | 1/3, next J6                                                                  |
| `eve2`            | 2/3, J7 locked                                                                |
| `notFinal2`       | 2/3, J7 over, provisional                                                     |
| `insufficient3`   | 3/3, OVR null (TRF `no_transfers`, CON `pending_minimum`)                     |
| `rated` (default) | 84 PRO provisional, CAP 91 SEL 82 TRF 86 CON 78, `first_rating` pending at J7 |
| `ratedTrfNull`    | As `rated`, TRF null `no_transfers`                                           |
| `cleared`         | 85 PRO, not provisional, `provisional_cleared` pending                        |
| `tierUp`          | 88 CHAMPION, `tier_changed:champion` pending, previous PRO                    |
| `legend`          | 93 LEGEND, `tier_changed:legend` pending                                      |
| `tierDown`        | 79 STADE, best PRO                                                            |
| `founder`         | 84 PRO, founder 2026, `founder_granted` pending, cut-off 2026-11-30           |
| `seasonClosed`    | 86 PRO, `season_closed` pending, 30 counted                                   |
| `seasonStarted`   | 2027/28 forming 0/3, previous 2026/27 86 PRO                                  |
| `launchArrival`   | 84 PRO at 7 counted, `card_created` and `first_rating` pending                |
| `returning`       | 81 STADE today, first rating 84 at J3, both pending                           |
| `clubNull`        | `rated` with no club                                                          |
| `longNameLatin`   | « Abdelkarim Benjelloun-Alaoui »                                              |
| `arabicName`      | «فاطمة الزهراء» (raster fallback)                                             |
| `homa`            | 61 HOMA                                                                       |

League sample « Les Lions du Derb » (fictional) with KARIM 78 STADE, SALMA forming 2/3, YASMINE 92
LEGEND founder, OTHMANE 88 CHAMPION, HAMZA 63 HOMA, and you; Raja for you and SALMA, Wydad for KARIM
(clubs from the mock football data; colours through the club palette). Names are labelled samples.

## Appendix C. Analytics events (WP1 adds to `AnalyticsEvent`; names only, no properties)

Approved: `card_save_line_view`, `card_born_view`, `card_born_invite`, `card_born_close`,
`card_arrival_view`, `card_block_open`, `card_hint_cap_view`, `card_hint_sel_view`, `card_hint_trf_view`,
`card_first_rating_view`, `card_first_rating_detail`, `card_first_rating_close`,
`card_share_preview_homa`, `card_share_preview_stade`, `card_share_preview_pro`,
`card_share_preview_champion`, `card_share_preview_legend`, `card_share_whatsapp`, `card_share_native`,
`card_share_copy`, `card_share_download`, `card_league_band_view`, `card_h2h_open`,
`card_provisional_cleared_view`, `card_tier_up_view`, `card_founder_view`, `card_season_closed_view`,
`card_season_started_view`, `card_replay_open`.

New for Gradins: `gradins_view_guest`, `gradins_view_no_team`, `gradins_view_manager`,
`gradins_guest_cta`, `gradins_guest_club_try`, `gradins_card_view`, `gradins_people_view`,
`gradins_seasons_view`, `pepites_from_fantasy`.

Page views need no change: `pageviewPath` (`src/lib/analytics.ts`) already keeps only the `utm_*`
parameters, so `/gradins/les-votres?ligue=…` and any `?mc=` are reported as the bare path. WP1 adds one
test case that pins it.
