import { useMemo } from "react";

import type { StatNullReason } from "@/backend/manager-card/contracts";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import type { Language } from "@/types/domain";

import { fillText, isArabicTemplate } from "./interpolate";
import { STAT_CODES, type CardProfile, type CardStrings, type StatCode } from "./types";

/**
 * The Manager Card's words (plan section 7.8). Every key of Appendix A is read here, by a literal
 * call of the translate function, and nowhere else builds a key name: that is what keeps the i18n gate's counts
 * exact (no unreferenced key, no computed call). A screen asks for a group and reads a property:
 *
 *   const copy = useCurvaCopy();
 *   <h2>{copy.statsTitle}</h2>
 *
 * Property names are the key without its prefix, camel-cased (`curva.guest.point.name.title`
 * is `guestPointNameTitle`). A value that still holds `{placeholders}` is a template: fill it
 * with `fill` / `fillText` (`./interpolate`), never with `String.replace`, so numbers in Arabic
 * stay isolated.
 *
 * Plural families are functions, bound to the language in each group (`copy.finalRounds(3)`),
 * and also exported as pure functions that take `(…, lang, t)`. Their text is ready to use,
 * numbers already isolated for Arabic with U+2068 … U+2069.
 */
export type Translate = (key: TranslationKey) => string;

/* ------------------------------------------------------------------------------------------ */
/* How many statistics a number needs                                                           */
/* ------------------------------------------------------------------------------------------ */

/** The statistics a card has: CAP, SEL, TRF, CON. */
export const CARD_STAT_TOTAL = STAT_CODES.length;

/**
 * How many of the four statistics must be filled (non-null) for the card to have a number. The
 * server decides it: `supabase/migrations/20261008123200_manager_card_compute.sql`, the `rated`
 * step of the calculation, « OVR is the rounded mean of the non-null stats (null under three) ».
 * A card whose journées are all counted and that has fewer than this is `insufficient`. This is
 * the one place the screens read the figure from; change it only with that rule.
 */
export const OVR_MIN_STATS = 3;

/** How many of a card's statistics are filled (the four values, in any order). */
export function filledStats(values: Iterable<number | null>): number {
  let filled = 0;
  for (const value of values) if (value !== null) filled += 1;
  return filled;
}

/* ------------------------------------------------------------------------------------------ */
/* Plural families                                                                              */
/* ------------------------------------------------------------------------------------------ */

export type PluralCategory = "zero" | "one" | "two" | "few" | "other";

const ARABIC_PLURALS = new Intl.PluralRules("ar");

/**
 * The category of a count. `0` is `zero` only in a family that has that form. French: one for 1,
 * two for 2 (the same text as `other`), `other` for the rest; Arabic: `Intl.PluralRules("ar")`,
 * with `many` read as `other` (the form for 11 and over).
 */
export function pluralCategory(n: number, lang: Language, hasZero = false): PluralCategory {
  if (n === 0) return hasZero ? "zero" : "other";
  if (lang !== "ar") return n === 1 ? "one" : n === 2 ? "two" : "other";
  const rule = ARABIC_PLURALS.select(n);
  return rule === "many" || rule === "zero" ? "other" : rule;
}

/** « 3 journées terminées » / «3 جولات منتهية»: used only after a preposition (« après », «بعد»). */
export function finalRounds(n: number, lang: Language, t: Translate): string {
  const category = pluralCategory(n, lang);
  const template =
    category === "one"
      ? t("card.final_one")
      : category === "two"
        ? t("card.final_two")
        : category === "few"
          ? t("card.final_few")
          : t("card.final_other");
  return fillText(template, { n });
}

/** « 3 journées » / «3 جولات»: after a preposition. */
export function rounds(n: number, lang: Language, t: Translate): string {
  const category = pluralCategory(n, lang);
  const template =
    category === "one"
      ? t("card.rounds_one")
      : category === "two"
        ? t("card.rounds_two")
        : category === "few"
          ? t("card.rounds_few")
          : t("card.rounds_other");
  return fillText(template, { n });
}

/**
 * « 2 journées comptées sur 3 »: the accessible sentence. `isolate: false` leaves the digits bare
 * (an aria-label is spoken, not laid out).
 */
export function countedA11y(
  k: number,
  n: number,
  lang: Language,
  t: Translate,
  isolate = true,
): string {
  const category = pluralCategory(k, lang, true);
  const template =
    category === "zero"
      ? t("card.a11y.counted_zero")
      : category === "one"
        ? t("card.a11y.counted_one")
        : category === "two"
          ? t("card.a11y.counted_two")
          : category === "few"
            ? t("card.a11y.counted_few")
            : t("card.a11y.counted_other");
  if (isolate) return fillText(template, { k, n });
  return template.replace("{k}", String(k)).replace("{n}", String(n));
}

/** « 3 journées comptées » / «3 جولات محتسبة», and the zero form « Aucune journée comptée ». */
export function countedRounds(n: number, lang: Language, t: Translate): string {
  const category = pluralCategory(n, lang, true);
  const template =
    category === "zero"
      ? t("curva.seasons.counted_zero")
      : category === "one"
        ? t("curva.seasons.counted_one")
        : category === "two"
          ? t("curva.seasons.counted_two")
          : category === "few"
            ? t("curva.seasons.counted_few")
            : t("curva.seasons.counted_other");
  return fillText(template, { n });
}

/** « 2 ligues » / «دوريان»: the leagues a manager is in. */
export function leagues(n: number, lang: Language, t: Translate): string {
  const category = pluralCategory(n, lang);
  const template =
    category === "one"
      ? t("curva.leagues_one")
      : category === "two"
        ? t("curva.leagues_two")
        : category === "few"
          ? t("curva.leagues_few")
          : t("curva.leagues_other");
  return fillText(template, { n });
}

/**
 * « J5, J6, J7 » / «الجولات 5 و6 و7». Up to three journées; more than that has no list, and the
 * caller uses the `…line1From` sentence instead. Null for none.
 */
export function gwList(seqs: readonly number[], lang: Language, t: Translate): string | null {
  const [a, b, c] = seqs;
  if (seqs.length === 1) return fillText(t("card.gw_list_1"), { a: a! });
  if (seqs.length === 2) return fillText(t("card.gw_list_2"), { a: a!, b: b! });
  if (seqs.length === 3) return fillText(t("card.gw_list_3"), { a: a!, b: b!, c: c! });
  void lang;
  return null;
}

/** The reason a statistic is empty (« pas encore de transfert »). `minRated` is the window of `window_open`. */
export function statReasonText(
  reason: StatNullReason,
  lang: Language,
  t: Translate,
  minRated: number | null,
): string {
  switch (reason) {
    case "pending_minimum":
      return t("card.reason.pending_minimum");
    case "no_transfers":
      return t("card.reason.no_transfers");
    case "window_open":
      return fillText(t("card.reason.window_open"), { rounds: rounds(minRated ?? 3, lang, t) });
    case "excluded_weeks_only":
      return t("card.reason.excluded_weeks_only");
    case "board_not_final":
      return t("card.reason.board_not_final");
    case "pre_captain_fix":
      return t("card.reason.pre_captain_fix");
  }
}

/* ------------------------------------------------------------------------------------------ */
/* The groups                                                                                   */
/* ------------------------------------------------------------------------------------------ */

/** The section's own words: heads, Curva screens G1 to G6, the share sheet, two hub lines. */
export function curvaCopy(t: Translate, lang: Language) {
  return {
    nav: t("nav.curva"),
    metaHome: t("curva.meta.home"),
    metaCard: t("curva.meta.card"),
    metaPeople: t("curva.meta.people"),
    metaSeasons: t("curva.meta.seasons"),
    metaDescription: t("curva.meta.description"),
    unavailable: t("curva.unavailable"),
    badgeNew: t("curva.badge_new"),
    guestHeadline: t("curva.guest.headline"),
    guestBody: t("curva.guest.body"),
    guestSignIn: t("curva.guest.sign_in"),
    guestTryTitle: t("curva.guest.try_title"),
    guestTryHint: t("curva.guest.try_hint"),
    guestPointNameTitle: t("curva.guest.point.name.title"),
    guestPointNameBody: t("curva.guest.point.name.body"),
    guestPointClubTitle: t("curva.guest.point.club.title"),
    guestPointClubBody: t("curva.guest.point.club.body"),
    guestPointRatingTitle: t("curva.guest.point.rating.title"),
    guestPointRatingBody: t("curva.guest.point.rating.body"),
    guestPointPeopleTitle: t("curva.guest.point.people.title"),
    guestPointPeopleBody: t("curva.guest.point.people.body"),
    guestFree: t("curva.guest.free"),
    noteamHeadline: t("curva.noteam.headline"),
    identitySince: t("curva.identity.since"),
    roundTitle: t("curva.round.title"),
    roundLine: t("curva.round.line"),
    roundRecalc: t("curva.round.recalc"),
    statsTitle: t("curva.stats.title"),
    peopleTitle: t("curva.people.title"),
    peopleViewLeague: t("curva.people.view_league"),
    peopleYou: t("curva.people.you"),
    peopleEmpty: t("curva.people.empty"),
    peopleAlone: t("curva.people.alone"),
    peopleCardsFailed: t("curva.people.cards_failed"),
    peopleSameClub: t("curva.people.same_club"),
    peopleCompare: t("curva.people.compare"),
    clubTitle: t("curva.club.title"),
    clubMatesOne: t("curva.club.mates_one"),
    clubMatesOther: t("curva.club.mates_other"),
    clubNextMatch: t("curva.club.next_match"),
    clubNone: t("curva.club.none"),
    clubChoose: t("curva.club.choose"),
    seasonsTitle: t("curva.seasons.title"),
    revoirTitle: t("curva.revoir.title"),
    seasonsSeason: t("curva.seasons.season"),
    seasonClosedLabel: t("curva.season.closed_label"),
    cardTitle: t("curva.card.title"),
    cardWhere: t("curva.card.where"),
    cardIntro: t("curva.card.intro"),
    cardIntroForming: t("curva.card.intro_forming"),
    cardTier: t("curva.card.tier"),
    cardTierNow: t("curva.card.tier_now"),
    cardTierBest: t("curva.card.tier_best"),
    cardTierNone: t("curva.card.tier_none"),
    cardTierExplain: t("curva.card.tier_explain"),
    cardSerial: t("curva.card.serial"),
    h2hTitle: t("curva.h2h.title"),
    seasonsFirstRating: t("curva.seasons.first_rating"),
    seasonsColRound: t("curva.seasons.col_round"),
    seasonsColRating: t("curva.seasons.col_rating"),
    seasonsColTier: t("curva.seasons.col_tier"),
    seasonsMore: t("curva.seasons.more"),
    seasonsEmpty: t("curva.seasons.empty"),
    seasonsError: t("curva.seasons.error"),
    shareLabel: t("curva.share.label"),
    shareCaption: t("curva.share.caption"),
    hubPepitesBody: t("fantasy.hub.pepites_body"),
    hubCardView: t("fantasy.hub.card_view"),
    leagues: (n: number) => leagues(n, lang, t),
    countedRounds: (n: number) => countedRounds(n, lang, t),
  };
}
export type CurvaCopy = ReturnType<typeof curvaCopy>;

/** The card's words: unit, serial format, provisional pill, stat and tier names, reasons, plurals. */
export function cardCopy(t: Translate, lang: Language) {
  return {
    ovr: t("card.ovr"),
    serial: t("card.serial"),
    provisional: t("card.provisional"),
    sample: t("card.sample"),
    founderLine: t("card.founder_line"),
    stat: {
      cap: t("card.stat.cap"),
      sel: t("card.stat.sel"),
      trf: t("card.stat.trf"),
      con: t("card.stat.con"),
    },
    statLong: {
      cap: t("card.stat_long.cap"),
      sel: t("card.stat_long.sel"),
      trf: t("card.stat_long.trf"),
      con: t("card.stat_long.con"),
    },
    tier: {
      homa: t("card.tier.homa"),
      stade: t("card.tier.stade"),
      pro: t("card.tier.pro"),
      champion: t("card.tier.champion"),
      legend: t("card.tier.legend"),
    },
    a11y: {
      cardOf: t("card.a11y.card_of"),
      noRating: t("card.a11y.no_rating"),
      separator: t("card.a11y.separator"),
    },
    reason: {
      pendingMinimum: t("card.reason.pending_minimum"),
      noTransfers: t("card.reason.no_transfers"),
      windowOpen: t("card.reason.window_open"),
      excludedWeeksOnly: t("card.reason.excluded_weeks_only"),
      boardNotFinal: t("card.reason.board_not_final"),
      preCaptainFix: t("card.reason.pre_captain_fix"),
    },
    finalRounds: (n: number) => finalRounds(n, lang, t),
    rounds: (n: number) => rounds(n, lang, t),
    countedA11y: (k: number, n: number) => countedA11y(k, n, lang, t),
    /** « Statistiques remplies » (the waiting box's title, before « · 2/4 »). */
    statsFilled: t("card.stats_filled.title"),
    /** « Statistiques remplies : 2 sur 4 »: the accessible sentence, numbers isolated. */
    statsFilledA11y: (k: number, n: number) => fillText(t("card.stats_filled.a11y"), { k, n }),
    gwList: (seqs: readonly number[]) => gwList(seqs, lang, t),
    reasonText: (reason: StatNullReason, minRated: number | null) =>
      statReasonText(reason, lang, t, minRated),
  };
}
export type CardCopy = ReturnType<typeof cardCopy>;

/** The approved onboarding copy, grouped by moment (`m1` … `m12`, `state`). */
export function momentCopy(t: Translate) {
  return {
    m1: {
      introTitle: t("card.onboarding.m1.intro.title"),
      introBody: t("card.onboarding.m1.intro.body"),
      saveLine: t("card.onboarding.m1.save.line"),
      registerHint: t("card.onboarding.m1.register.hint"),
      setupCardLabel: t("card.onboarding.m1.setup.card_label"),
      setupNameHint: t("card.onboarding.m1.setup.name_hint"),
      setupClubHint: t("card.onboarding.m1.setup.club_hint"),
      builderLine: t("card.onboarding.m1.builder.line"),
    },
    m2: {
      heading: t("card.onboarding.m2.heading"),
      line1: t("card.onboarding.m2.line1"),
      line1From: t("card.onboarding.m2.line1_from"),
      line2: t("card.onboarding.m2.line2"),
      serial: t("card.onboarding.m2.serial"),
      invite: t("card.onboarding.m2.invite"),
      arrival: t("card.onboarding.m2.arrival"),
    },
    m3: {
      label: t("card.onboarding.m3.label"),
      line: t("card.onboarding.m3.line"),
      firstCounted: t("card.onboarding.m3.first_counted"),
      eve: t("card.onboarding.m3.eve"),
      over: t("card.onboarding.m3.over"),
      insufficient: t("card.onboarding.m3.insufficient"),
      late: t("card.onboarding.m3.late"),
      recap: t("card.onboarding.m3.recap"),
      hintCap: t("card.onboarding.m3.hint.cap"),
      hintSel: t("card.onboarding.m3.hint.sel"),
      hintTrf: t("card.onboarding.m3.hint.trf"),
      firstTransfer: t("card.onboarding.m3.first_transfer"),
    },
    m4: {
      heroFreshLabel: t("card.onboarding.m4.hero.fresh.label"),
      heroFreshLine: t("card.onboarding.m4.hero.fresh.line"),
      heroArrivalLabel: t("card.onboarding.m4.hero.arrival.label"),
      heroArrivalLine: t("card.onboarding.m4.hero.arrival.line"),
      heroCoalescedLabel: t("card.onboarding.m4.hero.coalesced.label"),
      heroDetail: t("card.onboarding.m4.hero.detail"),
      sheetFooter: t("card.onboarding.m4.sheet.footer"),
      sheetTierDistance: t("card.onboarding.m4.sheet.tier_distance"),
      sheetShare: t("card.onboarding.m4.sheet.share"),
      sheetLeague: t("card.onboarding.m4.sheet.league"),
      sheetReplay: t("card.onboarding.m4.sheet.replay"),
    },
    m5: {
      band: t("card.onboarding.m5.band"),
      rowForming: t("card.onboarding.m5.row.forming"),
      rowInsufficient: t("card.onboarding.m5.row.insufficient"),
      hintCompare: t("card.onboarding.m5.hint.compare"),
      h2hScore: t("card.onboarding.m5.h2h.score"),
    },
    m6: {
      imageProvisional: t("card.onboarding.m6.image.provisional"),
      msgLeague: t("card.onboarding.m6.msg.league"),
      msgLeagueProvisional: t("card.onboarding.m6.msg.league_provisional"),
      msgPlain: t("card.onboarding.m6.msg.plain"),
      msgPlainProvisional: t("card.onboarding.m6.msg.plain_provisional"),
    },
    m7: {
      line: t("card.onboarding.m7.line"),
    },
    m8: {
      upHeading: t("card.onboarding.m8.up.heading"),
      upLine: t("card.onboarding.m8.up.line"),
      view: t("card.onboarding.m8.view"),
      downLine: t("card.onboarding.m8.down.line"),
    },
    m9: {
      heading: t("card.onboarding.m9.heading"),
      line: t("card.onboarding.m9.line"),
      cutoff: t("card.onboarding.m9.cutoff"),
    },
    m10: {
      closed: t("card.onboarding.m10.closed"),
      started: t("card.onboarding.m10.started"),
    },
    m12: {
      replayLine: t("card.onboarding.m12.replay.line"),
      itemFirstRating: t("card.onboarding.m12.item.first_rating"),
      itemTier: t("card.onboarding.m12.item.tier"),
      itemSeason: t("card.onboarding.m12.item.season"),
    },
    state: {
      deletion: t("card.onboarding.state.deletion"),
      deletionNoserial: t("card.onboarding.state.deletion_noserial"),
      offlineText: t("card.onboarding.state.offline.text"),
    },
  };
}
export type MomentCopy = ReturnType<typeof momentCopy>;

export function useCurvaCopy(): CurvaCopy {
  const { t, lang } = useI18n();
  return useMemo(() => curvaCopy(t, lang), [t, lang]);
}
export function useCardCopy(): CardCopy {
  const { t, lang } = useI18n();
  return useMemo(() => cardCopy(t, lang), [t, lang]);
}
export function useMomentCopy(): MomentCopy {
  const { t } = useI18n();
  return useMemo(() => momentCopy(t), [t]);
}

/**
 * The formula sentences of the details page, per rules version and statistic. Empty until the
 * rules' formulas are decided: with no entry for a card's `rulesVersion` the page shows no
 * formula sentence and no footer. A follow-up adds the keys for that version here.
 */
export const FORMULA_KEYS: Record<string, Record<StatCode, TranslationKey>> = {};

/* ------------------------------------------------------------------------------------------ */
/* What a renderer prints and speaks                                                            */
/* ------------------------------------------------------------------------------------------ */

const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);

/**
 * A Latin word placed in Arabic text that leaves the interface (an image caption drawn on a
 * canvas, an accessible sentence built by concatenation, a `title`): wrapped in the left-to-right
 * isolate U+2066 … U+2069, so a neighbouring Arabic word, a dot or a number cannot pull it out of
 * place. This is « LASTREET » in the Arabic interface (plan section 11).
 *
 * French text, empty text and a word that already carries Arabic script come back as they were.
 * In the interface itself a tier word is a `<bdi>` (`TierWord`, `tierNode`). A card's accessible
 * label keeps the bare word (`cardLabel`): it is spoken, not laid out.
 */
export function isolateLatin(text: string, lang: Language): string {
  if (lang !== "ar" || text === "" || isArabicTemplate(text)) return text;
  return `${LRI}${text}${PDI}`;
}

/** The words a card renderer may print or speak, in one language (the plan's `CardStrings`). */
export function cardStrings(t: Translate, lang: Language): CardStrings {
  const serialTemplate = t("card.serial");
  return {
    lang,
    ovr: t("card.ovr"),
    stats: {
      cap: t("card.stat.cap"),
      sel: t("card.stat.sel"),
      trf: t("card.stat.trf"),
      con: t("card.stat.con"),
    },
    statsLong: {
      cap: t("card.stat_long.cap"),
      sel: t("card.stat_long.sel"),
      trf: t("card.stat_long.trf"),
      con: t("card.stat_long.con"),
    },
    tiers: {
      homa: t("card.tier.homa"),
      stade: t("card.tier.stade"),
      pro: t("card.tier.pro"),
      champion: t("card.tier.champion"),
      legend: t("card.tier.legend"),
    },
    founderLine: t("card.founder_line"),
    sample: t("card.sample"),
    serial: (serial) => serialTemplate.replace("{serial}", serial),
    a11y: {
      cardOf: t("card.a11y.card_of"),
      noRating: t("card.a11y.no_rating"),
      counted: (k, n) => countedA11y(k, n, lang, t, false),
      statsFilled: (k, n) =>
        t("card.stats_filled.a11y").replace("{k}", String(k)).replace("{n}", String(n)),
      separator: t("card.a11y.separator"),
    },
  };
}

export function useCardStrings(): CardStrings {
  const { t, lang } = useI18n();
  return useMemo(() => cardStrings(t, lang), [t, lang]);
}

/**
 * The one-sentence accessible name of a card: « Carte de manager, Ali, 84 OVR, PRO, Raja CA,
 * Fondateur 2026, BOT #482913 ». A card with no rating says so, and says how far it has got
 * (« pas encore de note, 1 journée comptée sur 3 »). The renderers' `label()` returns this.
 * The « Provisoire » pill is app text beside the card, not part of the object.
 */
export function cardLabel(profile: CardProfile, strings: CardStrings): string {
  const parts: string[] = [strings.a11y.cardOf];
  const name = profile.name.trim();
  if (name) parts.push(name);
  if (profile.ovr !== null) {
    parts.push(`${profile.ovr} ${strings.ovr}`);
    if (profile.tier) parts.push(strings.tiers[profile.tier]);
  } else {
    parts.push(strings.a11y.noRating);
    if (profile.counted !== null && profile.minRated !== null) {
      // Every journée counted and still no number: what it waits for is a statistic, so the
      // label says how many are filled, not « 3 journées comptées sur 3 ».
      const statsFilled = strings.a11y.statsFilled;
      parts.push(
        profile.counted >= profile.minRated && statsFilled
          ? statsFilled(filledStats(STAT_CODES.map((code) => profile.stats[code])), CARD_STAT_TOTAL)
          : strings.a11y.counted(profile.counted, profile.minRated),
      );
    }
  }
  if (profile.club) parts.push(profile.club.name[strings.lang]);
  if (profile.founder !== null) parts.push(strings.founderLine);
  if (profile.serial !== null) parts.push(strings.serial(profile.serial));
  if (profile.sample) parts.push(strings.sample);
  return parts.join(strings.a11y.separator);
}
