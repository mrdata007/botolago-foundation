import { describe, expect, test } from "bun:test";

import { dictionaries } from "./dictionaries";

/**
 * Arabic wording pass, owner "approve all" (native reader), 2026-10-16. The
 * rows are those of docs/review/2026-10-16-arabic-wording-review.md. This file
 * pins the rows the pre-read rated ERROR-LIKELY, where the old wording was
 * wrong rather than merely stiff, and fails if it comes back:
 *
 *   - a transfer is انتقال, never تبديل (a substitution), in the recap;
 *   - the points cost of a transfer is خصم, never غرامة (a money fine);
 *   - managers are مدربون, never مدراء;
 *   - counted words that were fixed after a number now sit in a label form
 *     ("label: {n}"), so no count from 1 to 99 reads wrongly.
 */

const ar = dictionaries.ar as Record<string, string>;
const fr = dictionaries.fr as Record<string, string>;

const plusKeys = Object.keys(ar).filter((key) => key.startsWith("plus."));
const recapKeys = Object.keys(ar).filter((key) => key.startsWith("plus.recap."));

describe("the approved wording of the ERROR-LIKELY rows", () => {
  const APPROVED: Record<string, string> = {
    // Transfer, not substitution (RC-23, RC-33, RC-38, RC-70, RC-71).
    "plus.recap.transfer_badge": "انتقال",
    "plus.recap.cause_transfer": "انتقال",
    "plus.recap.others_line":
      "الباقي محسوب: الفارق بعد طرح القائد والانتقال. لم يُحسب بعد لاعبًا لاعبًا.",
    "plus.recap.tile_best_transfer": "أفضل انتقال",
    "plus.recap.tile_worst_transfer": "الانتقال الأكثر كلفة",
    // Hit, not fine (RC-34, RC-35, RC-42, RC-75).
    "plus.recap.transfer_line": "{out} ← {in}: {gain} نقطة، خصم {hit} = {net}",
    "plus.recap.transfer_free": "{out} ← {in}: {gain} نقطة، بلا خصم",
    "plus.recap.part_hit": "الخصم {n}",
    "plus.recap.tile_hits": "نقاط الخصم",
    // Counts that no longer carry a fixed plural (RC-45, RC-61, RC-66, RC-67, TR-59, G-03).
    "plus.recap.pending_many": "لاعبون بانتظار التقييم: {n}",
    "plus.recap.share_waiting": "تقييمات بانتظار النشر: {n}",
    "plus.recap.season_title": "موسمك حتى الآن: {pts} نقطة، {rank}، بعد {n} من الجولات",
    "plus.recap.season_title_plain": "موسمك حتى الآن: {pts} نقطة بعد {n} من الجولات",
    "plus.tr.frames_title": "اختر إطار بطاقتك من بين الأُطر التي ربحتها ({n})",
    "fantasy.leagues.members": "من الأعضاء",
    // Managers are مدربون (TR-75, TR-78).
    "plus.tr.prog_rank_none": "تُمنح في نهاية الموسم، في دوري خاص يضم 3 مدربين أو أكثر.",
    "plus.tr.vis_hint":
      "يرى مدربو دورياتك الخاصة الكؤوس التي ربحتها، ولا يرون أبدًا نقاطك أو تقييماتك أو مستوياتك. ولا أحد غيرهم.",
    // The brand stays in Latin letters (RC-58, TR-57); chip names are the approved Arabic ones (BR-94).
    "plus.recap.share_message": "جولتي {n} على BotolaGO: {points} نقطة.",
    "plus.tr.share_message": "كأسي «{label}» على BotolaGO، فانتازي البطولة الاحترافية.",
    "plus.brief.tr_honest":
      "كل انتقال يتجاوز الانتقالات المجانية يخصم نقاطًا من مجموعك في {gw}. لا تخصم الورقة الحرة ولا الضربة الحرة أي نقطة.",
  };

  for (const [key, expected] of Object.entries(APPROVED)) {
    test(`${key}`, () => {
      expect(ar[key]).toBe(expected);
    });
  }

  test("every approved line keeps the placeholders of the French", () => {
    const holes = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(APPROVED)) {
      expect(holes(ar[key]!), key).toEqual(holes(fr[key]!));
    }
  });
});

describe("the old wording does not come back", () => {
  test("the recap says انتقال for a transfer, never تبديل", () => {
    const offenders = recapKeys.filter((key) => /تبديل|التبديل/u.test(ar[key]!));
    expect(offenders).toEqual([]);
  });

  test("no BotolaGO+ text calls the points cost a fine (غرامة)", () => {
    const offenders = plusKeys.filter((key) => /غرام/u.test(ar[key]!));
    expect(offenders).toEqual([]);
  });

  test("managers are never مدراء anywhere in the Arabic dictionary", () => {
    const offenders = Object.keys(ar).filter((key) => /مدراء/u.test(ar[key]!));
    expect(offenders).toEqual([]);
  });

  test("the briefing prints the approved chip names, not the Latin ones", () => {
    const offenders = Object.keys(ar).filter(
      (key) => key.startsWith("plus.brief.") && /Wildcard|Free Hit/.test(ar[key]!),
    );
    expect(offenders).toEqual([]);
  });

  test("the brand is written BotolaGO in share messages, not in Arabic letters", () => {
    for (const key of ["plus.recap.share_message", "plus.tr.share_message"]) {
      expect(ar[key], key).toContain("BotolaGO");
      expect(ar[key], key).not.toMatch(/بوطولا/u);
    }
  });
});

describe("counts that were a fixed plural are now label then number", () => {
  // Arabic agrees the noun with the number: a fixed "{n} <plural noun>" is wrong
  // for most values. Each of these was reachable with a value for which the old
  // line was ungrammatical.
  const FIXED_AFTER_NUMBER: Array<[string, RegExp]> = [
    ["plus.recap.pending_many", /\{n\}\s*لاعب/u], // RC-45: 2 and 11+
    ["plus.recap.share_waiting", /\{n\}\s*تقييم/u], // RC-61: 2 to 10, and 1
    ["plus.recap.season_title", /\{n\}\s*جولات/u], // RC-66: 11 to 30
    ["plus.recap.season_title_plain", /\{n\}\s*جولات/u], // RC-67
    ["plus.recap.league_note", /\{n\}\s*مدربين/u], // RC-49: leagues of 11 and more
    ["plus.recap.tile_captain_v", /\{k\}\s*جولات/u], // RC-74: 1, 2 and 11+
    ["plus.brief.cap_total", /\{n\}\s*جولات/u], // BR-74: up to 30
    ["plus.tr.frames_title", /\{n\}\s*أُطر/u], // TR-59: 2 and 11+
  ];
  for (const [key, old] of FIXED_AFTER_NUMBER) {
    test(`${key} has no fixed plural noun after the number`, () => {
      expect(ar[key]).not.toMatch(old);
    });
  }

  test("a league member count is not followed by a bare singular عضو (G-03)", () => {
    expect(ar["fantasy.leagues.members"]).not.toBe("عضو");
    expect(ar["fantasy.leagues.members"]).toMatch(/^من /u);
  });

  test("the pending-players line reads label then count for any count", () => {
    for (const n of [2, 3, 10, 11, 25]) {
      expect(ar["plus.recap.pending_many"]!.replace("{n}", String(n))).toBe(
        `لاعبون بانتظار التقييم: ${n}`,
      );
    }
  });

  test("the season line reads with a 'من الجولات' count for rounds 11 to 30", () => {
    for (const n of [3, 10, 11, 14, 30]) {
      expect(
        ar["plus.recap.season_title_plain"]!.replace("{pts}", "400").replace("{n}", String(n)),
      ).toBe(`موسمك حتى الآن: 400 نقطة بعد ${n} من الجولات`);
    }
  });
});

describe("RC-31: a captain total of 3 to 10 takes the plural (نقاط)", () => {
  test("the few form exists in both languages with the same placeholders", () => {
    expect(ar["plus.recap.captain_plain_few"]).toBe("{name}: {formula} نقاط");
    expect(ar["plus.recap.captain_plain"]).toBe("{name}: {formula} نقطة");
    expect(fr["plus.recap.captain_plain_few"]).toBe(fr["plus.recap.captain_plain"]);
  });
});

describe("owner decisions of 2026-10-16", () => {
  const OFFER_KEYS = [
    "plus.meta.offer",
    "plus.s2.cta",
    "plus.season.name",
    "plus.s3.feat_title",
    "plus.pay.title",
    "plus.s3.cta",
    "plus.pay.lede",
    "plus.pay.wa_message",
    "plus.s3.terms_link",
    "plus.s4.manage",
    "plus.page.member_title",
    "plus.page.member_body",
    "plus.in.member_aria",
    "plus.lock.aria",
    "plus.profile.active_line",
    "plus.profile.active_nodate",
    "plus.profile.ended",
    "plus.profile.offer_link",
    "plus.hub.title",
    "plus.hub.status_t",
    "plus.hub.expired_line",
    "plus.hub.expired_nodate",
    "plus.profile.loading",
    "lock.curva.title.plus",
    "plus.tr.locked_tag",
    "plus.tr.frames_note",
  ];

  test("the BotolaGO+ offer is called اشتراك (standard spelling), never موسم, where it names the offer", () => {
    for (const key of OFFER_KEYS) {
      expect(ar[key], key).toContain("اشتراك");
      expect(ar[key], key).not.toMatch(/موسم/u);
      expect(ar[key], key).not.toContain("إشتراك");
    }
  });

  test("the logo rule holds: only the browser-tab title types the product name", () => {
    expect(ar["plus.meta.offer"]).toBe("اشتراك BotolaGO+");
    for (const key of plusKeys) {
      if (key === "plus.meta.offer") continue;
      expect(ar[key], key).not.toContain("BotolaGO+");
    }
  });

  test("Top 10 is written توب 10 in the Prospects keys, never أفضل 10", () => {
    const keys = Object.keys(ar).filter((key) => key.startsWith("pepites."));
    expect(keys.filter((key) => /أفضل 10/u.test(ar[key]!))).toEqual([]);
    expect(ar["pepites.tab.top"]).toBe("توب 10");
    expect(ar["pepites.email.sign_in_reason"]).toContain("توب 10");
  });

  test("the brand word المواهب and the word الجاهزية are left as they were", () => {
    expect(ar["pepites.sort.form"]).toContain("الجاهزية");
    expect(ar["unsubscribe.pepites_reenable_hint"]).toContain("إعادة الاشتراك في المواهب");
    expect(ar["pepites.share.player_message"]).toStartWith("{name} في المواهب،");
  });
});
