/**
 * BG-0014 — localization gate for the fr/ar dictionaries.
 *
 * WHAT THIS IS
 * ------------
 * `auditI18n()` is a pure function over (dictionaries, usage index, allow-lists,
 * baselines). The CLI wrapper at the bottom builds the real inputs, prints a
 * report and exits 1 when anything fails. It has no dependencies beyond
 * `bun:test`-free standard Bun APIs (`Bun.Glob`, `Bun.file`).
 *
 * ERRORS (always fail the gate)
 * -----------------------------
 *   E1  key present in one language only
 *   E2  empty / whitespace-only value
 *   E3  placeholder-token set differs between fr and ar
 *   E4  unbalanced or repeated {accent}…{/accent} span
 *   E5  literal t("…") key absent from the dictionary
 *   E6  stale allow-list entry (allow-listed key no longer in the dictionary)
 *
 * WARNINGS (ratcheted against committed baselines)
 * ------------------------------------------------
 *   W1  keys whose fr and ar values are identical
 *   W2  ar values containing no Arabic script
 *   W3  dictionary keys not referenced anywhere in src/
 *   W4  t() call sites whose argument is not a literal key (enumerable template
 *       prefixes and fully opaque expressions alike)
 *
 * Warnings are counted over the whole dictionary; the allow-lists do not change
 * a count, they annotate it — an allow-listed finding is printed as `suppressed`
 * with its justification, an unlisted one is printed by name. That is what keeps
 * `profile.title` (English copy with trailing newlines, repaired separately by
 * BG-0024) visible in the report instead of silently absorbed.
 *
 * THE BASELINES ARE EXACT-EQUALITY ON PURPOSE. A count that goes *up* is new
 * drift; a count that goes *down* means the committed baseline is stale and must
 * be lowered in the same commit that improved it. Either way the gate fails and
 * a human edits `BASELINES` below. This friction is the feature — see the
 * BG-0014 EngineeringBrief, `risks`.
 *
 * W3 is static analysis over source text. It is a *reporting* signal only:
 * never wire it to key deletion. A key can be reachable through a runtime
 * expression that no regex can see (that is exactly what W4 counts).
 *
 * Usage:
 *   bun scripts/qa/i18n-gate.ts             audit the real dictionaries
 *   bun scripts/qa/i18n-gate.ts --fixture   audit the deliberately broken fixture
 */

import { dictionaries } from "../../src/i18n/dictionaries";
import { IDENTICAL_ALLOWED, NO_ARABIC_SCRIPT_ALLOWED } from "../../src/i18n/i18n-allowlist";
import {
  brokenDictionaries,
  BROKEN_FIXTURE_BASELINES,
} from "../../src/i18n/__fixtures__/broken-dictionary";

/* ------------------------------------------------------------------ types */

export type GateLanguage = "fr" | "ar";

export type GateDictionaries = Record<GateLanguage, Record<string, string>>;

export interface UsageIndex {
  /** key used as a literal `t("key")` argument -> the sites that do so. */
  literalKeys: Map<string, string[]>;
  /** static prefix of a `t(`prefix.${…}`)` argument -> the sites that do so. */
  templatePrefixes: Map<string, string[]>;
  /** `t(…)` call sites whose argument is neither literal nor a usable prefix. */
  opaqueSites: string[];
  /** every quoted string literal seen in the scanned sources. */
  quotedStrings: Set<string>;
}

export interface AllowLists {
  identical: Readonly<Record<string, string>>;
  noArabicScript: Readonly<Record<string, string>>;
}

export type WarningCode = "W1" | "W2" | "W3" | "W4";

export type Baselines = Record<WarningCode, number>;

export interface Finding {
  code: "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | WarningCode;
  key: string;
  message: string;
}

export interface WarningGroup {
  code: WarningCode;
  label: string;
  count: number;
  baseline: number;
  /** findings with no allow-list entry — printed by name. */
  reported: Finding[];
  /** findings with an allow-list entry — printed with their justification. */
  suppressed: Finding[];
}

export interface AuditResult {
  errors: Finding[];
  warnings: WarningGroup[];
  baselineViolations: Finding[];
  ok: boolean;
}

/* ------------------------------------------------------- committed baselines */

/**
 * Measured on the tree at BG-0014. Changing any of these numbers is a deliberate,
 * reviewed act: state in the commit message why the count moved.
 */
export const BASELINES: Baselines = {
  // Legal pages (/terms, /privacy): the two consent sentences on
  // /auth/register and /auth/login were split into five ordered segments each
  // so that "Conditions d'utilisation" and "Politique de confidentialité" can
  // be real links in both languages without slicing a finished string in JS —
  // impossible to do safely for Arabic. Four of each sentence's five segments
  // differ between fr and ar. The fifth, `tail`, is the sentence-final full
  // stop, which is "." in both languages and in Latin script in both.
  //
  // That is two new W1 findings and the same two new W2 findings —
  // `auth.register.accept_terms.tail` and `auth.terms_notice.tail` — and they
  // are counted, not suppressed: the allow-lists annotate a finding, they
  // never remove it. The alternative shapes were all worse. Folding the stop
  // into the privacy link label would underline it and put punctuation inside
  // the link text; dropping it would silently change the copy; inventing
  // trailing words for both languages so the segment differs would be editing
  // a consent sentence to satisfy a lint baseline. Moving the number and
  // saying why is what this baseline is for. W1 4 -> 6, W2 4 -> 6.
  //
  // BG-0071: `fantasy.stat.none` is the placeholder a stat cell renders when
  // there is no value yet — a player's form before any gameweek has scored.
  // Its value is an en dash, identical in fr and ar and in neither script,
  // which is one new W1 finding and one new W2 finding. It is punctuation
  // standing in for an absent number, not copy: translating it would mean
  // putting an Arabic letter where a manager expects a missing figure, and
  // any letter-shaped substitute would read as data. Both findings are
  // annotated in `src/i18n/i18n-allowlist.ts`, and — as the header above
  // says — an allow-list entry annotates a count, it never removes it, so
  // the two baselines move with it. W1 6 -> 7, W2 6 -> 7.
  W1: 7,
  W2: 7,
  // BG-0012: the /news redesign replaced the hardcoded tab UI
  // (news.tab.*, and its category-name-keyed news.section.transfers/
  // analysis/interviews) with real taxonomy-driven category chips, and
  // dropped the on-page saved-articles rail (still reachable from
  // /profile) and the manual fr/ar edition selector. That retires 10
  // dictionary keys (news.tab.for_you/latest/transfers/analysis/
  // interviews, news.section.transfers/analysis/interviews/saved,
  // news.saved.empty) and 4 template-key t() call sites that switched
  // between them, moving W3 237 -> 245 and W4 100 -> 96.
  //
  // BG-0012 (Agent D3, account/profile redesign): the redesigned Profile
  // "Informations personnelles" section now renders an explicit e-mail row
  // via a literal `t("profile.email")` call, which was previously dead
  // copy. That takes one more key off the unreferenced list, moving
  // W3 245 -> 244.
  //
  // BG-0012 (Agent A, shared shell + Accueil redesign): the Accueil rebuild
  // added 3 new copy keys and retired 11 keys that became fully unused,
  // and dropped one non-literal t() call site.
  //
  // BG-0012 (Agent D1, Matches redesign): the new Lineups tab / standings
  // table replaced the fake "Momentum" tab, retiring its dictionary keys.
  //
  // BG-0012 (Agent D2, Players/Stats/Transfers redesign): porting
  // fantasy.players.tsx, fantasy.players.$playerId.tsx and
  // fantasy.rankings.tsx off `LegacyFantasyPage`/ad hoc back links onto
  // the shared `FplHeader` orphans fantasy.players.title,
  // fantasy.rankings.title, fantasy.rankings.subtitle and common.back, and
  // replaces a non-literal ternary t() call with FplSegmented options
  // carrying one literal t() call each.
  //
  // Combined effect of all four parallel redesign workstreams, re-measured
  // on the fully integrated tree (each workstream's own delta above was
  // computed independently against the pre-integration baseline of
  // W3 245 / W4 96 in its own isolated worktree; overlapping keys/call
  // sites between workstreams mean the sum of the deltas isn't the actual
  // total, so the true combined numbers were measured directly by running
  // `bun scripts/qa/i18n-gate.ts` on the merged tree): W3 245 -> 248,
  // W4 96 -> 94.
  //
  // MFA/TOTP setup + login step-up: new dynamic-key t() call sites for
  // rendering a `TranslationKey`-typed error state (`t(error)`), the same
  // established pattern already used by auth.verify.tsx/auth.login.tsx,
  // in the new /profile/security enrollment page and /auth/mfa-challenge
  // login step-up page. W3 unchanged (every new key is referenced); W4
  // 94 -> 97.
  // BG-0071: the player-detail History tab stopped restating the Overview
  // numbers in a sentence and now renders the real per-gameweek rows from
  // api.fantasy_player_gameweek_history. Those rows carry a state, so
  // `fantasy.points.status.provisional` — dictionary copy that until now was
  // referenced nowhere in src/ — has its first literal call site. Nothing was
  // orphaned in exchange (`fpl.gameweek`, dropped from that sentence, is still
  // used on five other screens). W3 248 -> 247; W4 unchanged, because the new
  // branches are `cond ? t("a") : t("b")`, two literal calls, not `t(cond ? …)`.
  //
  // BG-0075 points breakdown: /fantasy/points now renders the scoring lines
  // behind each player's total and the auto-substitutions finalization applied.
  // Both are server-supplied codes -- `category` from
  // app.fantasy_player_point_events and `reason` from
  // app.fantasy_auto_substitutions -- so the two new call sites are template
  // prefixes (`fantasy.points.event.`, `fantasy.points.autosub_reason.`), the
  // same shape as `player.pos.` and `fantasy.chip.state.`. Every one of the 21
  // new keys is reachable through those prefixes, so W3 is unchanged; W4
  // 97 -> 99.
  // Dead-code removal, 2026-09-21: eighteen files with no reference anywhere in
  // src/, tests/ or scripts/ were deleted -- fourteen vendored shadcn components
  // nothing imports (carousel, chart, sidebar, menubar, navigation-menu and
  // friends) and four Fantasy components no screen renders (SquadListView,
  // TransferReviewPanel, GameweekStatusStrip, FantasyChipCard). Their keys are
  // still in the dictionaries, so W3 rises 247 -> 262: fifteen keys that were
  // only ever referenced by components the product never mounted. W4 falls
  // 99 -> 88 because those files carried eleven dynamic t() call sites. Both
  // moves are the deletion showing up in the meter, not new drift. The keys are
  // deliberately left in place -- the Fantasy screens are mid-migration and the
  // strings will be wanted again; delete them in the same pass that settles the
  // Fantasy copy, not before.
  //
  // BG-0094 (pitch / My Team / Points): /fantasy/points now states the things
  // it was computing but never showing -- how settled the gameweek's scoring
  // is, who the armband actually landed on and at what multiplier, what the
  // bench scored, what a transfer hit cost and which chip was live. Nine keys
  // that were written for exactly this and had no call site anywhere get
  // their first one: fantasy.points.status.live, .status.final,
  // .effective_captain, .multiplier, .vice_takeover, .hit, .active_chip,
  // .no_active_chip and .bench. That is the "strings will be wanted again"
  // case above arriving, so W3 falls 262 -> 253. Nothing was orphaned in
  // exchange. W4 is unchanged on purpose: every new branch is
  // `cond ? t("a") : t("b")`, a chain of literal calls, including the active
  // chip's name, which is spelled out per chip rather than interpolated from
  // the chip key.
  //
  // BG-0093 (squad building, player picker, transfers). Two moves, both the
  // consequence of named decisions rather than drift:
  //
  // W3 262 -> 264. Three keys gained their first call site: the picker's
  // filters now use `fantasy.picker.filter_position` / `.filter_price` /
  // `.filter_club`, the copy that was written for them, instead of
  // `fpl.position` / `fpl.price` / `fpl.view`. "Prix max" is what that control
  // actually does, and `fpl.view` ("Vue") labelled a filter that has always
  // filtered by club. Those three go the other way, and two more join them:
  // `fantasy.picker.title`, whose only caller was the deleted second picker
  // `PlayerPickerDrawer`, and `fpl.all_clubs` ("Tous les clubs"), which does
  // not fit a three-abreast filter column at 390px -- the field's own label
  // already says Club, so its empty option is `fpl.all` ("Tous"). Net +5/-3.
  //
  // W4 88 -> 81. Seven fewer call sites assemble their key at runtime. Three
  // left with `PlayerPickerDrawer`. The other four are conversions:
  // PlayerActionSheet, SquadBuilderScreen, SquadListTable and
  // TransferConfirmScreen each replaced a `t(`prefix.${expr}`)` with explicit
  // literal branches, so the position, group and chip labels are now keys the
  // gate and the TranslationKey type can both see.
  //
  // Integration, 2026-09-21: BG-0094 and BG-0093 were measured independently
  // against the same base (W3 262, W4 88) and each moved it, so neither lane's
  // number survives the merge. The figures below are the merged tree measured
  // once, and they are the sum of the two moves rather than a third
  // adjustment: W3 262 - 9 (BG-0094 gave nine written-but-uncalled keys their
  // first call site) + 2 (BG-0093 net +5 orphaned / -3 adopted) = 255. W4 88
  // - 0 (BG-0094 wrote every branch as `cond ? t("a") : t("b")`) - 7 (BG-0093
  // converted four call sites and deleted three with PlayerPickerDrawer) = 81.
  //
  // BG-0092 (Fantasy V2, Lane A — shared chrome and the hub): converting
  // `FantasyScreenGate` and `FantasyUnavailableState` onto the kit's state
  // primitives replaced four computed-key call sites —
  // ``t(`fantasy.availability.${phase}.title`)`` and its `.body` twin in each
  // file — with explicit `cond ? t("a") : t("b")` branches, i.e. literal keys
  // the gate can actually check. That is the shape the gate asks for, so the
  // four findings are gone rather than suppressed: W4 88 -> 84. W3 is
  // unchanged: the same keys are still reached, now literally, and the three
  // keys added in this pass (`fpl.rank.up`/`.down`/`.same`, the accessible
  // names for the rank-movement glyph, which used to announce a hardcoded
  // English "up"/"down") each have a literal call site.
  //
  // Integration, second pass: Lane A measured against the same base again
  // (W3 262, W4 88), so its numbers do not survive either. W3 stays 255 --
  // Lane A moved no key on or off the unreferenced list, because the three it
  // added each have a literal call site and the four it converted still reach
  // the same keys. W4 81 - 4 = 77.
  //
  // BG-0095 leagues/players migration, 2026-09-21: exactly two of those
  // "wanted again" keys were wanted again. `/fantasy/players/$playerId` used
  // to mark a double or blank gameweek with the literal English strings "DGW"
  // and "BGW" hardcoded in the JSX; the Calendrier tab now renders
  // `fantasy.fixtures.double` and `fantasy.fixtures.blank`, which were already
  // translated in both languages and referenced by nothing. W3 262 -> 260.
  //
  // Every other key this migration added is referenced by the screen that
  // added it, so it does not move the count; W1, W2 and W4 are unchanged. W4
  // in particular is deliberate: the new copy is written as
  // `cond ? t("a") : t("b")`, never `t(cond ? "a" : "b")`, and the eight
  // dynamic call sites these files already had (`player.pos.`,
  // `player.status.`, and the two label-from-a-table lookups) are all still
  // there.
  //
  // Integration, third pass — and the last, all four lanes are in. Each lane
  // measured against W3 262 / W4 88 and each moved it, so no lane's pair is
  // the merged tree's. Measured once on the merge: W3 253, W4 77. That is
  // 255 - 2, BG-0095's two keys (fantasy.fixtures.double/.blank, which
  // replaced hardcoded English "DGW"/"BGW" in the Calendrier tab) coming off
  // the unreferenced list, and W4 unchanged because BG-0095 added no dynamic
  // call site — its new copy is `cond ? t("a") : t("b")` throughout.
  // Design migration, `fpl-primitives` lane. `FplRankMovement` was retired in
  // favour of the kit's `UiRankMovement`, and it was the only consumer of
  // `fpl.rank.up/.down/.same` — a DUPLICATE set. The live standings tables
  // (fantasy.leagues.$leagueId, LeagueTable) pass `fantasy.rank.*`, which is
  // the set the product actually renders and which is unaffected.
  //
  // So three keys come onto the unreferenced list and the count rises to 256.
  // The duplicates are deliberately NOT deleted here: this pass is a design
  // migration and does not change i18n, and a provably dead key is cheaper to
  // carry than a dictionary edit smuggled into a restyle. Deleting them is a
  // clean follow-up that lands W3 back at 253.
  // Design migration, dead-code pass. `FantasyMobileNav`, `FantasySubNav` and
  // `GlassCard` were deleted: a grep across the whole tree found no reference
  // to any of them outside their own files and each other's comments, so no
  // route could render them. BG-0132 had already recorded two of the three and
  // deferred the deletion precisely because it moves these two numbers.
  //
  // W3 rises by one: `fantasy.tab.more` labelled the "More" menu in both navs
  // and nothing else uses it. (`nav.fantasy` was in both too and still has
  // three live call sites.) The key is left in the dictionary for the same
  // reason as the `fpl.rank.*` set below — a design migration does not edit
  // i18n — and comes off the list in the follow-up that removes both.
  //
  // News design pass: the category chips and the article eyebrow printed the
  // taxonomy's raw slug ("for_you", "latest") in English in both languages.
  // They now go through `categoryLabel`, which maps the five shipped slugs to
  // `news.tab.for_you/.latest/.transfers/.analysis/.interviews` — copy written
  // for exactly this and referenced nowhere until now. W3 257 -> 252; nothing
  // orphaned in exchange. W4 unchanged: each key is its own literal
  // `t("news.tab.…")` call in a switch, not built from the slug.
  //
  // Motion pass (scorers under the score): the match header's "+" opens each
  // goal's assist, labelled with `matches.event.assist` — already translated
  // in both languages and referenced by nothing until now. W3 252 -> 251.
  // Every key the pass added is referenced by the component that added it,
  // and each is its own literal call, so W1, W2 and W4 do not move.
  //
  // Option A, Lane 1 (Home + Matches): W3 251 -> 252, net +4 orphaned / -3
  // adopted. Orphaned: `home.deadline` (the band's pill now reads
  // `home.deadline_fantasy`, "Date limite Fantasy"), `matches.section.live`
  // and `matches.competition.country` (A-Matches drops the per-status section
  // titles and the deleted CompetitionHeader), `fantasy.transfers` (Home's
  // Fantasy card is the gradient card: rank and gameweek points only). Left
  // in the dictionary, as above: a screen lane does not delete keys.
  // Adopted: `matches.date.yesterday` / `.tomorrow` (the date band and Home's
  // day groups name the day) and `matches.a11y.live_minute` (a live card's
  // accessible name states the minute).
  //
  // Option A, Lane 2 (match page): 251 -> 245. The Stats tab now names each
  // statistic through `matches.stats.<code>` (the API's label is English in
  // every language), giving eight written-but-uncalled keys their first call,
  // and `matches.detail.summary` heads the Résumé panel (-9); the retired
  // header footer and section title orphan `matches.detail.elapsed`,
  // `.competition` and `.lineups_title` (+3, left in place like the others).
  // Lanes 1 and 2 together: 251 + 1 - 6, plus `matches.kickoff`, which
  // each lane still called once from a screen the other rewrote (the
  // match card, the match header) and so neither saw orphaned. 247.
  //
  // Option A, Lane 5 (Fantasy lists): player tabs + podium gone (6 keys orphaned), 4 unused keys now called, 8 new keys referenced. 251 -> 253.
  // With Lanes 1 and 2: 247 + 2 = 249.
  W3: 249,
  // Down six with the same deletion: both dead navs mapped over their item
  // tables with `t(item.labelKey)`, three call sites each. Every one of those
  // was a real dynamic key — the gate was right about them — and they are gone
  // with the components rather than fixed.
  //
  // Accueil art-direction pass: Home's two identical "create a team" links
  // each carried `t(canCreate ? "fantasy.create.title" : "fantasy.title")`.
  // They are one `CreateTeamLink` now, so the same dynamic call appears once.
  // 71 -> 70.
  //
  // Option A, Lane 1: that link is now `FantasyCreateCard`, which picks its
  // title with two literal calls instead. 70 -> 69.
  //
  // Option A, Lane 2 (match page): EventTimeline's `t(table[event.type])` is a
  // literal-key switch now. 70 -> 69.
  // Both together: 70 -> 68.
  //
  // Option A, Lane 5 (Fantasy lists): player-page tab loop + status template gone, players sort loop now literal calls. 70 -> 67.
  // With Lanes 1 and 2: 68 - 3 = 65.
  W4: 65,
};

export const LANGUAGES: GateLanguage[] = ["fr", "ar"];

/** Arabic, Arabic Supplement, Extended-A and the presentation forms. */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

const ACCENT_OPEN = "{accent}";
const ACCENT_CLOSE = "{/accent}";

/* --------------------------------------------------------------- pure audit */

/** Placeholder tokens such as `{n}` or `{name}`; the {accent} markup is E4's job. */
export function placeholderTokens(value: string): string[] {
  const tokens = new Set<string>();
  for (const match of value.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    if (match[1] !== "accent") tokens.add(match[1]);
  }
  return [...tokens].sort();
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

export function emptyUsageIndex(): UsageIndex {
  return {
    literalKeys: new Map(),
    templatePrefixes: new Map(),
    opaqueSites: [],
    quotedStrings: new Set(),
  };
}

function isReachable(key: string, usage: UsageIndex): boolean {
  if (usage.quotedStrings.has(key)) return true;
  if (usage.literalKeys.has(key)) return true;
  for (const prefix of usage.templatePrefixes.keys()) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * The gate proper. Pure: no filesystem, no process, no clock.
 */
export function auditI18n(
  dicts: GateDictionaries,
  usage: UsageIndex,
  allow: AllowLists,
  baselines: Baselines = BASELINES,
): AuditResult {
  const errors: Finding[] = [];

  const fr = dicts.fr;
  const ar = dicts.ar;
  const allKeys = [...new Set([...Object.keys(fr), ...Object.keys(ar)])].sort();

  // E1 — one-sided keys.
  for (const key of allKeys) {
    const inFr = Object.prototype.hasOwnProperty.call(fr, key);
    const inAr = Object.prototype.hasOwnProperty.call(ar, key);
    if (inFr && !inAr) {
      errors.push({ code: "E1", key, message: `present in fr but missing from ar` });
    } else if (inAr && !inFr) {
      errors.push({ code: "E1", key, message: `present in ar but missing from fr` });
    }
  }

  // E2 — empty or whitespace-only values.
  for (const lang of LANGUAGES) {
    for (const [key, value] of Object.entries(dicts[lang])) {
      if (value.trim().length === 0) {
        errors.push({ code: "E2", key, message: `${lang} value is empty or whitespace-only` });
      }
    }
  }

  // E3 — placeholder parity, for keys present in both languages.
  for (const key of allKeys) {
    if (fr[key] === undefined || ar[key] === undefined) continue;
    const frTokens = placeholderTokens(fr[key]);
    const arTokens = placeholderTokens(ar[key]);
    if (frTokens.join("|") !== arTokens.join("|")) {
      errors.push({
        code: "E3",
        key,
        message: `placeholder tokens differ: fr {${frTokens.join(", ")}} vs ar {${arTokens.join(", ")}}`,
      });
    }
  }

  // E4 — {accent} spans: balanced, and at most one per value (the Trans renderer
  // resolves only the first span).
  for (const lang of LANGUAGES) {
    for (const [key, value] of Object.entries(dicts[lang])) {
      const open = countOccurrences(value, ACCENT_OPEN);
      const close = countOccurrences(value, ACCENT_CLOSE);
      if (open !== close) {
        errors.push({
          code: "E4",
          key,
          message: `${lang} value has ${open} {accent} and ${close} {/accent}`,
        });
      } else if (open > 1) {
        errors.push({
          code: "E4",
          key,
          message: `${lang} value has ${open} {accent} spans; only the first is rendered`,
        });
      }
    }
  }

  // E5 — literal t("…") keys that do not resolve.
  for (const [key, sites] of [...usage.literalKeys].sort(([a], [b]) => a.localeCompare(b))) {
    if (fr[key] === undefined && ar[key] === undefined) {
      errors.push({
        code: "E5",
        key,
        message: `t("${key}") resolves to no dictionary entry (${sites[0]}${sites.length > 1 ? ` +${sites.length - 1} more` : ""})`,
      });
    }
  }

  // E6 — stale allow-list entries.
  for (const [name, list] of [
    ["IDENTICAL_ALLOWED", allow.identical],
    ["NO_ARABIC_SCRIPT_ALLOWED", allow.noArabicScript],
  ] as const) {
    for (const key of Object.keys(list)) {
      if (fr[key] === undefined && ar[key] === undefined) {
        errors.push({ code: "E6", key, message: `${name} entry is not a dictionary key` });
      }
    }
  }

  // W1 — identical fr/ar values.
  const w1: WarningGroup = {
    code: "W1",
    label: "keys whose fr and ar values are identical",
    count: 0,
    baseline: baselines.W1,
    reported: [],
    suppressed: [],
  };
  for (const key of allKeys) {
    if (fr[key] === undefined || ar[key] === undefined) continue;
    if (fr[key] !== ar[key]) continue;
    w1.count += 1;
    const justification = allow.identical[key];
    const finding: Finding = {
      code: "W1",
      key,
      message: justification ?? `fr and ar are both ${JSON.stringify(fr[key])}`,
    };
    (justification ? w1.suppressed : w1.reported).push(finding);
  }

  // W2 — ar values with no Arabic script.
  const w2: WarningGroup = {
    code: "W2",
    label: "ar values containing no Arabic script",
    count: 0,
    baseline: baselines.W2,
    reported: [],
    suppressed: [],
  };
  for (const key of Object.keys(ar).sort()) {
    if (ARABIC_SCRIPT.test(ar[key])) continue;
    w2.count += 1;
    const justification = allow.noArabicScript[key];
    const finding: Finding = {
      code: "W2",
      key,
      message: justification ?? `ar value is ${JSON.stringify(ar[key])}`,
    };
    (justification ? w2.suppressed : w2.reported).push(finding);
  }

  // W3 — keys not referenced anywhere in the scanned sources.
  const w3: WarningGroup = {
    code: "W3",
    label: "dictionary keys not referenced anywhere in src/",
    count: 0,
    baseline: baselines.W3,
    reported: [],
    suppressed: [],
  };
  for (const key of Object.keys(fr).sort()) {
    if (isReachable(key, usage)) continue;
    w3.count += 1;
    w3.reported.push({ code: "W3", key, message: "no literal, prefix or quoted reference" });
  }

  // W4 — t() call sites whose argument is not a literal key. Enumerable template
  // prefixes are counted too: the gate can list the keys such a call *might*
  // reach, but not which one it does reach at runtime.
  const nonLiteral: Finding[] = [];
  for (const [prefix, sites] of usage.templatePrefixes) {
    for (const site of sites) {
      nonLiteral.push({ code: "W4", key: site, message: `template prefix \`${prefix}\`` });
    }
  }
  for (const site of usage.opaqueSites) {
    nonLiteral.push({ code: "W4", key: site, message: "opaque expression" });
  }
  nonLiteral.sort((a, b) => a.key.localeCompare(b.key));
  const w4: WarningGroup = {
    code: "W4",
    label: "t() call sites whose argument is not a literal key",
    count: nonLiteral.length,
    baseline: baselines.W4,
    reported: nonLiteral,
    suppressed: [],
  };

  const warnings = [w1, w2, w3, w4];
  const baselineViolations: Finding[] = warnings
    .filter((group) => group.count !== group.baseline)
    .map((group) => ({
      code: group.code,
      key: group.code,
      message: `${group.label}: ${group.count} != committed baseline ${group.baseline} — review the change and update BASELINES in scripts/qa/i18n-gate.ts`,
    }));

  return {
    errors,
    warnings,
    baselineViolations,
    ok: errors.length === 0 && baselineViolations.length === 0,
  };
}

/* --------------------------------------------------------------- usage index */

const SINGLE_LINE_STRING = /(["'])((?:\\.|(?!\1)[^\\\r\n])*)\1/g;
const SIMPLE_TEMPLATE = /`([^`\\$\r\n]*)`/g;

/** Slice the argument list of a `t(` call, tracking quotes and nesting. */
function sliceCallArgument(source: string, openParenIndex: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openParenIndex; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === "\\") {
        i += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    else if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openParenIndex + 1, i);
    }
  }
  return null;
}

/**
 * Classify a `t(…)` argument. A template literal counts as statically
 * enumerable only when its leading static chunk ends in "." or "_", i.e. it
 * names a dictionary namespace rather than an arbitrary fragment.
 */
export function classifyArgument(
  raw: string,
): { kind: "literal"; value: string } | { kind: "prefix"; value: string } | { kind: "opaque" } {
  const arg = raw.trim();
  const quoted = /^(["'])((?:\\.|(?!\1)[^\\\r\n])*)\1$/.exec(arg);
  if (quoted) return { kind: "literal", value: quoted[2] };

  if (arg.startsWith("`")) {
    const plain = /^`([^`\\$\r\n]*)`$/.exec(arg);
    if (plain) return { kind: "literal", value: plain[1] };
    const withExpression = /^`([^`\\$\r\n]*)\$\{/.exec(arg);
    if (withExpression) {
      const prefix = withExpression[1];
      if (prefix.endsWith(".") || prefix.endsWith("_")) return { kind: "prefix", value: prefix };
    }
  }
  return { kind: "opaque" };
}

/** Index one source file into `index`. Exported so the test can drive it. */
export function indexSource(index: UsageIndex, file: string, source: string): void {
  for (const match of source.matchAll(SINGLE_LINE_STRING)) {
    index.quotedStrings.add(match[2]);
  }
  for (const match of source.matchAll(SIMPLE_TEMPLATE)) {
    index.quotedStrings.add(match[1]);
  }

  for (const match of source.matchAll(/\bt\(/g)) {
    const openParenIndex = match.index + match[0].length - 1;
    const raw = sliceCallArgument(source, openParenIndex);
    if (raw === null) continue;
    const line = source.slice(0, match.index).split("\n").length;
    const site = `${file}:${line}`;
    const classified = classifyArgument(raw);
    if (classified.kind === "literal") {
      const sites = index.literalKeys.get(classified.value) ?? [];
      sites.push(site);
      index.literalKeys.set(classified.value, sites);
    } else if (classified.kind === "prefix") {
      const sites = index.templatePrefixes.get(classified.value) ?? [];
      sites.push(site);
      index.templatePrefixes.set(classified.value, sites);
    } else {
      index.opaqueSites.push(site);
    }
  }
}

/**
 * Scan `root` for TypeScript sources. The i18n module itself is excluded: the
 * dictionaries, the allow-list and the broken fixture declare keys, they do not
 * consume them, and counting them would make every key trivially reachable.
 */
export async function buildUsageIndex(root = "src"): Promise<UsageIndex> {
  const index = emptyUsageIndex();
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  const files: string[] = [];
  for await (const relative of glob.scan({ cwd: root })) {
    if (relative.startsWith("i18n/")) continue;
    files.push(relative);
  }
  files.sort();
  for (const relative of files) {
    const path = `${root}/${relative}`;
    indexSource(index, path, await Bun.file(path).text());
  }
  return index;
}

export const ALLOW_LISTS: AllowLists = {
  identical: IDENTICAL_ALLOWED,
  noArabicScript: NO_ARABIC_SCRIPT_ALLOWED,
};

/* ----------------------------------------------------------------- reporting */

export function formatReport(result: AuditResult): string {
  const lines: string[] = [];
  lines.push("i18n gate");
  lines.push("=========");
  lines.push("");

  if (result.errors.length === 0) {
    lines.push("errors: none");
  } else {
    lines.push(`errors: ${result.errors.length}`);
    for (const finding of result.errors) {
      lines.push(`  ${finding.code} ${finding.key} — ${finding.message}`);
    }
  }
  lines.push("");

  for (const group of result.warnings) {
    const verdict = group.count === group.baseline ? "at baseline" : "BASELINE MISMATCH";
    lines.push(
      `${group.code} ${group.label}: ${group.count} (baseline ${group.baseline}) ${verdict}`,
    );
    for (const finding of group.reported.slice(0, 20)) {
      lines.push(`  - ${finding.key} — ${finding.message}`);
    }
    if (group.reported.length > 20) {
      lines.push(`  - … ${group.reported.length - 20} more`);
    }
    for (const finding of group.suppressed) {
      lines.push(`  · ${finding.key} — suppressed: ${finding.message}`);
    }
    lines.push("");
  }

  if (result.baselineViolations.length > 0) {
    lines.push("baseline violations:");
    for (const finding of result.baselineViolations) {
      lines.push(`  ${finding.code} — ${finding.message}`);
    }
    lines.push("");
  }

  lines.push(result.ok ? "RESULT: pass" : "RESULT: fail");
  return lines.join("\n");
}

/* ----------------------------------------------------------------------- CLI */

export async function runCli(argv: string[]): Promise<number> {
  const fixtureMode = argv.includes("--fixture");
  const result = fixtureMode
    ? auditI18n(
        brokenDictionaries,
        emptyUsageIndex(),
        { identical: {}, noArabicScript: {} },
        BROKEN_FIXTURE_BASELINES,
      )
    : auditI18n(
        dictionaries as unknown as GateDictionaries,
        await buildUsageIndex("src"),
        ALLOW_LISTS,
      );
  console.log(fixtureMode ? "(fixture mode: auditing the deliberately broken fixture)" : "");
  console.log(formatReport(result));
  return result.ok ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await runCli(process.argv.slice(2)));
}
