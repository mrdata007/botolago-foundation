import { Fragment, type ReactNode } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import type { Language } from "@/types/domain";

import {
  cardCopy,
  gradinsCopy,
  momentCopy,
  type CardCopy,
  type GradinsCopy,
  type MomentCopy,
} from "../copy";
import { auto, fill, ltr } from "../interpolate";
import { tierNode } from "../tier-node";
import { fromHistoryRow, fromMyCard } from "../to-profile";
import type { CardProfile, HeroKind, HeroSpec, LineSpec, ReplayItem, TierCode } from "../types";
import type { AnalyticsEvent } from "@/lib/analytics";

/**
 * The words of the moments, built from the approved copy (plan Appendix A.6) and the card, with the
 * numbers isolated for Arabic (`fill`). Pure: a function of the dictionary, the language and the
 * data, so the same sentences are checked in tests and drawn by the components.
 *
 * Rules the sentences keep (plan 2.5 and the approved copy discipline): « terminées », never
 * « jouées »; « provisoire » until the server says otherwise, never « confirmée »; the manager's
 * name only in a body line, never in a heading; ·26 only for the founder; no serial sentence while
 * the serial is null.
 */
export interface MomentWords {
  moment: MomentCopy;
  card: CardCopy;
  gradins: GradinsCopy;
  lang: Language;
  /** The tier's word for a `{tier}` placeholder: LASTREET comes isolated left to right (`tierNode`). */
  tierWord(tier: TierCode | null): ReactNode;
}

export function momentWords(t: Parameters<typeof momentCopy>[0], lang: Language): MomentWords {
  const card = cardCopy(t, lang);
  return {
    moment: momentCopy(t),
    card,
    gradins: gradinsCopy(t, lang),
    lang,
    tierWord: (tier) => (tier ? tierNode(tier, card.tier[tier], lang) : ""),
  };
}

/** « 30 novembre 2026 » / «30 نوفمبر 2026», Latin digits, from a stored date (UTC midnight). */
export function formatCutoff(date: string, lang: Language): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

/** « BOT #482913 », as an isolated run for the interface. */
export function serialNode(words: MomentWords, serial: string): ReactNode {
  return ltr(fillSerial(words.card.serial, serial));
}
function fillSerial(template: string, serial: string): string {
  return template.replace("{serial}", serial);
}

/** The year after the name: « ·26 », always left to right. */
function yearMark(cohort: number): string {
  return `·${String(cohort).slice(-2)}`;
}

export interface HeroText {
  /** The hero's label: the one heading of the block. Never carries a manager's name. */
  label: ReactNode;
  /** The sentences under the card, in order. */
  lines: ReactNode[];
  /** The primary button: « Voir le détail » opens the details, the others lead to the card page. */
  primary: string;
}

/** The label, the lines and the primary button of a hero (plan 5.3's table). */
export function heroText(spec: HeroSpec, card: MyCardDto, words: MomentWords): HeroText {
  const { moment, card: copy } = words;
  const provisionalLine =
    card.provisional || card.ratingState === "provisional"
      ? [fill(moment.m4.heroFreshLine, { final: copy.finalRounds(card.minConfirmed) })]
      : [];
  switch (spec.kind) {
    case "first_fresh":
      return {
        label: fill(moment.m4.heroFreshLabel, { gw: spec.gameweekSeq ?? 0 }),
        lines: provisionalLine,
        primary: moment.m4.heroDetail,
      };
    case "first_arrival":
      return {
        label: moment.m4.heroArrivalLabel,
        lines: [
          fill(moment.m4.heroArrivalLine, { final: copy.finalRounds(card.gameweeksCounted) }),
        ],
        primary: moment.m4.heroDetail,
      };
    case "first_coalesced":
      return {
        label: fill(moment.m4.heroCoalescedLabel, {
          first: spec.first?.ovr ?? 0,
          gw: spec.first?.gameweekSeq ?? 0,
          ovr: card.ovr ?? 0,
          tier: words.tierWord(card.tier),
        }),
        lines: provisionalLine,
        primary: moment.m4.heroDetail,
      };
    case "tier_up":
      return {
        label: fill(moment.m8.upHeading, { tier: words.tierWord(spec.tier) }),
        lines: [fill(moment.m8.upLine, { ovr: card.ovr ?? 0, gw: spec.gameweekSeq ?? 0 })],
        primary: moment.m8.view,
      };
    case "founder": {
      const cohort = card.founder?.cohort ?? 2026;
      const cutoff = card.founder?.cutoffDate;
      return {
        label: moment.m9.heading,
        lines: [
          founderLine(moment.m9.line, card.name, cohort),
          ...(cutoff
            ? [fill(moment.m9.cutoff, { date: auto(formatCutoff(cutoff, words.lang)) })]
            : []),
        ],
        primary: moment.m8.view,
      };
    }
    case "season_closed":
      return {
        label: words.gradins.seasonClosedLabel,
        lines:
          card.ovr !== null
            ? [
                fill(moment.m10.closed, {
                  season: card.season.label,
                  ovr: card.ovr,
                  tier: words.tierWord(spec.tier ?? card.tier),
                }),
              ]
            : [],
        primary: moment.m8.view,
      };
    default:
      return { label: "", lines: [], primary: moment.m8.view };
  }
}

/**
 * « Votre année s'inscrit après votre nom : ALI ·26. … ». The name is another run of text with
 * its own direction; « ·26 » is isolated left to right, so in Arabic it stays after the name.
 */
export function founderLine(template: string, name: string, cohort: number): ReactNode {
  const mark = yearMark(cohort);
  // The dictionary writes the mark literally (« {name} ·26 »); it is replaced by the computed
  // one in an isolate, so the interface never depends on how a neighbour reorders it.
  const pieces = template.split("·26");
  return (
    <>
      {pieces.map((piece, index) => (
        <Fragment key={index}>
          {fill(piece, { name: auto(name || "") })}
          {index < pieces.length - 1 ? ltr(mark) : null}
        </Fragment>
      ))}
    </>
  );
}

/** The state and moment lines of G1 (plan 5.3's table). Null when the card has nothing to say. */
export function lineText(kind: LineSpec["kind"], card: MyCardDto, words: MomentWords): ReactNode {
  const { moment, card: copy } = words;
  switch (kind) {
    case "provisional_cleared":
      return card.ovr === null
        ? null
        : fill(moment.m7.line, {
            ovr: card.ovr,
            final: copy.finalRounds(card.minConfirmed),
          });
    case "season_started":
      return card.previousSeason?.ovr == null
        ? null
        : fill(moment.m10.started, {
            season: card.season.label,
            prev: card.previousSeason.ovr,
            final: copy.finalRounds(card.minRated),
          });
    case "tier_down":
      return card.tier && card.bestTier
        ? fill(moment.m8.downLine, {
            tier: words.tierWord(card.tier),
            best: words.tierWord(card.bestTier),
          })
        : null;
  }
}

/** What each hero kind counts as a view, and the events its buttons fire (plan 5.3 and Appendix C). */
export const HERO_EVENTS: Record<
  HeroKind,
  { view: AnalyticsEvent; detail?: AnalyticsEvent; close?: AnalyticsEvent }
> = {
  born_new: { view: "card_born_view", close: "card_born_close" },
  born_arrival: { view: "card_arrival_view", close: "card_born_close" },
  first_fresh: {
    view: "card_first_rating_view",
    detail: "card_first_rating_detail",
    close: "card_first_rating_close",
  },
  first_arrival: {
    view: "card_arrival_view",
    detail: "card_first_rating_detail",
    close: "card_first_rating_close",
  },
  first_coalesced: {
    view: "card_first_rating_view",
    detail: "card_first_rating_detail",
    close: "card_first_rating_close",
  },
  tier_up: { view: "card_tier_up_view" },
  founder: { view: "card_founder_view" },
  season_closed: { view: "card_season_closed_view" },
};

export const LINE_EVENTS: Partial<Record<LineSpec["kind"], AnalyticsEvent>> = {
  provisional_cleared: "card_provisional_cleared_view",
  season_started: "card_season_started_view",
};

/** The share-preview event of a tier. */
export function previewEvent(tier: TierCode | null): AnalyticsEvent {
  switch (tier) {
    case "stade":
      return "card_share_preview_stade";
    case "pro":
      return "card_share_preview_pro";
    case "champion":
      return "card_share_preview_champion";
    case "legend":
      return "card_share_preview_legend";
    default:
      return "card_share_preview_homa";
  }
}

/* ---- the born panel's words ---- */

export interface BornText {
  /**
   * The sentences about the card: its number, when the rating comes, what it measures. `kind` lets
   * a compact surface keep the first two and drop the third (the team page's panel).
   */
  lines: { text: ReactNode; strong: boolean; kind: "serial" | "timing" | "measure" }[];
  /** « Invitez vos amis avant la date limite de la J5 », only while that deadline is ahead. */
  invite: ReactNode | null;
}

/** What the panel says (plan 5.3 and the approved M2 copy), from the card alone. */
export function bornText(
  card: MyCardDto,
  words: MomentWords,
  nextDeadline: string | null,
  now: number = Date.now(),
): BornText {
  const { moment, card: copy } = words;
  const final = copy.finalRounds(card.minRated);

  // The card has counted journées already (an existing manager at launch, below the minimum).
  if (card.gameweeksCounted >= 1) {
    return {
      lines: [
        {
          // « 2/3 » is one figure: isolated whole, so Arabic never reads it as « 3/2 ».
          text: fill(moment.m2.arrival.replace("{k}/{n}", "{kn}"), {
            final,
            kn: ltr(`${card.gameweeksCounted}/${card.minRated}`),
          }),
          strong: true,
          kind: "timing",
        },
      ],
      invite: null,
    };
  }

  const seqs = card.ratingGameweeks ?? [];
  const list =
    card.ratingGameweeksComplete && seqs.length >= 1 && seqs.length <= 3 ? copy.gwList(seqs) : null;
  const first = seqs[0] ?? card.firstCountedGameweekSeq;
  const timing = list
    ? fill(moment.m2.line1, { final, gws: list })
    : first != null
      ? fill(moment.m2.line1From, { final, gw: first })
      : fill(moment.m1.introBody, { final });
  // Belonging leads: the number that is theirs (when it is assigned), then when the rating
  // arrives and what it will measure, quietly. With no serial yet the timing leads instead.
  const lines: BornText["lines"] = [];
  if (card.serial) {
    lines.push({
      text: fill(moment.m2.serial, { serial: serialNode(words, card.serial) }),
      strong: true,
      kind: "serial",
    });
  }
  lines.push({ text: timing, strong: !card.serial, kind: "timing" });
  lines.push({ text: moment.m2.line2, strong: false, kind: "measure" });
  const deadlineAhead = nextDeadline !== null && Date.parse(nextDeadline) > now;
  return {
    lines,
    invite: deadlineAhead && first != null ? fill(moment.m2.invite, { gw: first }) : null,
  };
}

/**
 * The born panel on the team page (plan M2): the number, when it is assigned, and when the rating
 * comes. The sentence on what the rating measures belongs to the hero and the card page: the panel
 * is about 220 px so the pitch's first row stays on screen at 390 × 844.
 */
export function compactBornLines(text: BornText): BornText["lines"] {
  return text.lines.filter((line) => line.kind !== "measure");
}

/* ---- the replay's words ---- */

export interface ReplayView {
  title: ReactNode;
  profile: CardProfile;
  lines: ReactNode[];
}

/** What the sheet draws and says for a moment, from the stored values (plan 4.6). */
export function replayView(item: ReplayItem, current: MyCardDto, words: MomentWords): ReplayView {
  const { moment } = words;
  const seasonLabel =
    current.seasons.find((season) => season.seasonId === item.seasonId)?.label ??
    item.row?.seasonLabel ??
    current.season.label;

  if (item.kind === "founder") {
    const cutoff = current.founder?.cutoffDate;
    return {
      title: moment.m9.heading,
      profile: fromMyCard(current),
      lines: [
        founderLine(moment.m9.line, current.name, current.founder?.cohort ?? 2026),
        ...(cutoff
          ? [fill(moment.m9.cutoff, { date: auto(formatCutoff(cutoff, words.lang)) })]
          : []),
      ],
    };
  }

  const profile = item.row
    ? fromHistoryRow(item.row, current)
    : { ...fromMyCard(current), season: seasonLabel };

  if (item.kind === "season") {
    const season = current.seasons.find((entry) => entry.seasonId === item.seasonId);
    const ovr = item.row?.ovr ?? season?.ovr ?? null;
    const tier = item.row?.tier ?? season?.tier ?? item.tier;
    return {
      title: fill(moment.m12.itemSeason, { season: seasonLabel }),
      profile: { ...profile, ovr, tier, provisional: false },
      lines:
        ovr !== null
          ? [
              fill(moment.m10.closed, {
                season: seasonLabel,
                ovr,
                tier: words.tierWord(tier),
              }),
            ]
          : [],
    };
  }

  const gw = item.row?.gameweekSeq ?? item.gameweekSeq;
  const then = item.row?.ovr ?? null;
  const title =
    item.kind === "tier"
      ? fill(moment.m12.itemTier, { tier: words.tierWord(item.tier), gw: gw ?? 0 })
      : fill(moment.m12.itemFirstRating, { gw: gw ?? 0 });
  return {
    title,
    profile,
    lines:
      gw !== null && gw !== undefined && then !== null && current.ovr !== null
        ? [fill(moment.m12.replayLine, { gw, then, now: current.ovr })]
        : [],
  };
}
