import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { SOFASCORE_QUEUE_COPY } from "@/components/admin/sofascore-player-queue/copy";
import { validateUsername } from "@/lib/validation";
import { dictionaries } from "./dictionaries";

/**
 * Audit 2026-10-14, Phase C, lane C1 (FR-01, FR-02, FR-03, LOC-02, LOC-10,
 * LOC-11): exact French and Arabic wording. Each case pins the new text in
 * both languages and the absence of the old one, so a copy edit that brings
 * the old claim back fails here. Copy only: no rule or behaviour is tested
 * beyond the username validator, which must keep accepting exactly what it
 * accepted.
 */

const fr = dictionaries.fr as Record<string, string>;
const ar = dictionaries.ar as Record<string, string>;

/** Arabic text isolates Latin fragments with LRI ... PDI (U+2066 ... U+2069). */
const LRI = "⁦";
const PDI = "⁩";

describe("FR-01: the automatic-substitution reason names non-participation", () => {
  test("French says the player did not play; Arabic already did and is kept", () => {
    expect(fr["fantasy.points.autosub_reason.goalkeeper_did_not_play"]).toBe(
      "Le gardien n’a pas joué",
    );
    expect(fr["fantasy.points.autosub_reason.outfield_did_not_play"]).toBe(
      "Le joueur n’a pas joué",
    );
    expect(ar["fantasy.points.autosub_reason.goalkeeper_did_not_play"]).toBe("الحارس لم يشارك");
    expect(ar["fantasy.points.autosub_reason.outfield_did_not_play"]).toBe("اللاعب لم يشارك");
    for (const value of Object.values(fr)) expect(value).not.toMatch(/non aligné/i);
  });

  test("the list row can wrap the longer reason instead of squeezing the names", () => {
    const source = readFileSync(
      join(import.meta.dir, "..", "routes", "fantasy.points.tsx"),
      "utf8",
    );
    // The row wraps, and the names block has a floor, so a long reason drops
    // to its own line on a narrow screen rather than shrinking both names.
    expect(source).toContain('"flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5"');
    expect(source).toContain("min-w-[9rem] flex-1");
  });
});

describe("FR-02: a selected round is a round, not a week", () => {
  test("hero title and best-player label name the round, markup tokens kept", () => {
    expect(fr["fantasy.top.title"]).toBe("{accent}Top 5{/accent} de la journée");
    expect(fr["fantasy.top.best_player"]).toBe("Joueur de la journée");
    expect(ar["fantasy.top.title"]).toBe("{accent}أفضل 5{/accent} لاعبين في الجولة");
    expect(ar["fantasy.top.best_player"]).toBe("لاعب الجولة");
    // The share title strips the tokens; what is left must still read whole.
    expect(fr["fantasy.top.title"]!.replace(/\{\/?accent\}/g, "")).toBe("Top 5 de la journée");
    expect(ar["fantasy.top.title"]!.replace(/\{\/?accent\}/g, "")).toBe("أفضل 5 لاعبين في الجولة");
    expect(fr["fantasy.top.title"]).not.toMatch(/semaine/i);
    expect(ar["fantasy.top.title"]).not.toContain("الأسبوع");
    expect(ar["fantasy.top.best_player"]).not.toContain("الأسبوع");
  });

  test("genuinely weekly Pépites editions keep the word week", () => {
    expect(fr["pepites.home.week_title"]).toBe("Top 10 · Semaine {n}");
    expect(fr["pepites.player.edition_week"]).toBe("Semaine {n}");
    expect(fr["pepites.edition.meta_title"]).toContain("semaine");
    expect(ar["pepites.edition.not_found"]).toContain("الأسبوع");
  });
});

describe("FR-03: staff copy spells réessayé, réessayée and revérifiée", () => {
  const BAD = /ré-essay|re-essay|re-vérif|ré-vérif/i;

  /** Every source file under src/, except this test, as [path, text]. */
  function sources(dir: string, out: Array<[string, string]> = []): Array<[string, string]> {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) sources(path, out);
      else if (/\.(ts|tsx)$/.test(name) && !name.endsWith("wording-phase-c1.test.ts"))
        out.push([path, readFileSync(path, "utf8")]);
    }
    return out;
  }

  test("no source file under src/ carries the hyphenated spellings", () => {
    const offenders = sources(join(import.meta.dir, ".."))
      .filter(([, text]) => BAD.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  test("the SofaScore queue says réessayé / réessayée, with its 15-minute timing intact", () => {
    const copy = SOFASCORE_QUEUE_COPY.fr;
    expect(copy.confirm.consequence).toContain(
      "sera réessayé automatiquement d’ici environ 15 minutes",
    );
    expect(copy.done("A", "B")).toContain("sera réessayé automatiquement d’ici environ 15 minutes");
    expect(copy.doneAlias("A", "B")).toContain(
      "sera réessayé automatiquement d’ici environ 15 minutes",
    );
    expect(copy.doneCreate("A")).toContain(
      "sera réessayé automatiquement d’ici environ 15 minutes",
    );
    expect(copy.alias.consequence("123")).toContain("est réessayé d’ici environ 15 minutes");
    const all = JSON.stringify(copy);
    expect(all).toContain("la création est réessayée au prochain passage");
    expect(all).toContain("puis le match est réessayé automatiquement");
  });

  test("the news edition screen says revérifiée", () => {
    const source = readFileSync(
      join(import.meta.dir, "..", "routes", "admin.news.$articleEditionId.tsx"),
      "utf8",
    );
    expect(source).toContain(
      "Chaque transition est revérifiée côté serveur selon votre rôle réel.",
    );
  });
});

describe("LOC-02: the username message describes the rule the validator enforces", () => {
  test("French and Arabic state the real alphabet and the first-character rule", () => {
    expect(fr["auth.error.username_invalid"]).toBe(
      "3 à 20 caractères : lettres latines sans accent (a–z), chiffres, tiret (-) ou tiret bas (_). Commencez par une lettre ou un chiffre.",
    );
    expect(ar["auth.error.username_invalid"]).toBe(
      `من 3 إلى 20 حرفًا: أحرف لاتينية (${LRI}a–z${PDI}) وأرقام والرمزان ${LRI}-${PDI} و${LRI}_${PDI}. ابدأ بحرف لاتيني أو رقم.`,
    );
    expect(fr["auth.error.username_invalid"]).not.toContain("underscores");
    expect(ar["auth.error.username_invalid"]).not.toContain("فقط");
  });

  test("every Latin fragment in the Arabic message is isolated", () => {
    const text = ar["auth.error.username_invalid"]!;
    // Remove the isolated runs; no Latin letter, hyphen or underscore may remain.
    const outside = text.replace(new RegExp(`${LRI}[^${PDI}]*${PDI}`, "g"), "");
    expect(outside).not.toMatch(/[A-Za-z_-]/);
    expect((text.match(new RegExp(LRI, "g")) ?? []).length).toBe(3);
    expect((text.match(new RegExp(PDI, "g")) ?? []).length).toBe(3);
  });

  test("the validator is unchanged: ASCII letters and digits, - and _, 3 to 20, alphanumeric first", () => {
    expect(validateUsername("rachid_1998")).toBeNull();
    expect(validateUsername("ab-c")).toBeNull();
    expect(validateUsername("a".repeat(20))).toBeNull();
    for (const bad of ["رشيد", "élodie", "-rachid", "_rachid", "ab", "a".repeat(21), "a b c"]) {
      expect(validateUsername(bad), bad).toBe("auth.error.username_invalid");
    }
    expect(validateUsername("   ")).toBe("auth.error.username_required");
  });
});

describe("LOC-10: unsubscribe confirms notification e-mails, not all correspondence", () => {
  test("the success line is scoped to notification e-mails", () => {
    expect(fr["unsubscribe.done_title"]).toBe(
      "Vos e-mails de notification BotolaGO sont désactivés.",
    );
    expect(ar["unsubscribe.done_title"]).toBe(
      "تم إيقاف رسائل إشعارات BotolaGO عبر البريد الإلكتروني.",
    );
    expect(fr["unsubscribe.done_title"]).not.toContain("Vous ne recevrez plus d");
    expect(ar["unsubscribe.done_title"]).not.toContain("لن تصلك");
  });

  test("the hint says account-security messages remain, in both languages", () => {
    expect(fr["unsubscribe.reenable_hint"]).toContain(
      "Les messages nécessaires à la sécurité de votre compte restent disponibles.",
    );
    expect(ar["unsubscribe.reenable_hint"]).toContain("ستظل تصلك الرسائل الضرورية لأمان حسابك.");
  });

  test("the already-unsubscribed line has the same scope", () => {
    expect(fr["unsubscribe.already_title"]).toBe(
      "Vos e-mails de notification BotolaGO étaient déjà désactivés.",
    );
    expect(ar["unsubscribe.already_title"]).toBe(
      "كانت رسائل إشعارات BotolaGO عبر البريد الإلكتروني متوقفة من قبل.",
    );
  });

  test("the Pépites-only lines are untouched", () => {
    expect(fr["unsubscribe.pepites_done_title"]).toBe("Vous ne recevrez plus l'e-mail Prospects.");
    expect(ar["unsubscribe.pepites_done_title"]).toBe("لن تصلك بعد الآن رسالة المواهب.");
  });
});

describe("LOC-11: small editorial inconsistencies", () => {
  test("French and Arabic follow the register's table", () => {
    expect(fr["auth.login.title"]).toBe("Heureux de vous revoir");
    expect(ar["auth.login.title"]).toBe("مرحبًا بعودتك");
    expect(fr["auth.register.strength_weak"]).toBe("Faible");
    expect(fr["auth.register.strength_medium"]).toBe("Moyenne");
    expect(fr["auth.register.strength_strong"]).toBe("Forte");
    expect(ar["auth.register.strength_medium"]).toBe("متوسطة");
    expect(fr["fantasy.points.vice_takeover"]).toBe("Le vice-capitaine a pris le relais");
    expect(ar["fantasy.points.vice_takeover"]).toBe("تسلّم نائب القائد الشارة");
    expect(fr["nav.matches"]).toBe("Matchs");
    expect(fr["matches.title"]).toBe("Matchs");
    expect(fr["matches.table.played"]).toBe("Matchs joués");
    expect(fr["fantasy.players.tab.fixtures"]).toBe("Matchs");
    expect(fr["club.tab.matches"]).toBe("Matchs");
    expect(fr["prizes.admin.winners.empty"]).toBe("Aucun gagnant pour ce filtre.");
    expect(ar["prizes.admin.winners.empty"]).toBe("لا يوجد فائزون يطابقون هذه التصفية.");
    expect(fr["matches.status.delayed"]).toBe("Retardé");
    expect(ar["matches.status.delayed"]).toBe("تأخر الانطلاق");
  });

  test("the old wordings are gone", () => {
    expect(fr["auth.login.title"]).not.toBe("Bon retour");
    expect(fr["fantasy.points.vice_takeover"]).not.toBe("Vice a pris le relais");
    expect(ar["fantasy.points.vice_takeover"]).not.toBe("النائب استلم الشارة");
    expect(ar["prizes.admin.winners.empty"]).not.toContain("لهذا التصفية");
    expect(ar["matches.status.delayed"]).not.toBe("متأخر");
  });

  test("the vice-captain row can wrap the longer label instead of overflowing", () => {
    const source = readFileSync(
      join(import.meta.dir, "..", "routes", "fantasy.points.tsx"),
      "utf8",
    );
    expect(source).toContain(
      '<span className="flex flex-wrap items-baseline justify-end gap-x-2">',
    );
  });
});
