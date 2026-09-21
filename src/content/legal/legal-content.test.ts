import { describe, expect, it } from "bun:test";

import { LEGAL_DOCUMENTS, type LegalBlock, type LegalDocument } from "./documents";

// These two documents are binding statements about a real operator and its real
// handling of real people's data. Two failure modes matter more than anything
// about rendering:
//
//   - shipping them with the owner's blanks still in them. "[Raison sociale]"
//     on a live Terms page reads as unfinished; a "[numéro de récépissé CNDP]"
//     is worse, because the sentence around it asserts a registration that has
//     not been issued. A reader cannot tell a placeholder from a real claim.
//   - the two languages drifting apart. An Arabic reader agreeing to a
//     different document than a French reader is not a translation bug, it is
//     two different contracts.
//
// So this file blocks publication rather than describing the problem. It is
// expected to FAIL until the owner supplies the values, and that is the point.

// ---------------------------------------------------------------------------
// TODO — swap these interim values for the real ones, in BOTH languages, the
// moment the company exists. Each pair below is what is on the page today and
// what has to replace it. `bun run legal:gate` passes now because no bracketed
// blank remains; it will NOT catch a stale interim value, so this list is the
// only record of what is still provisional.
//
//   src/content/legal/documents.ts
//
//   1. Raison sociale
//        now  fr "BotolaGO (société en cours de constitution)"
//             ar "BotolaGO (شركة في طور التأسيس)"
//        then the registered company name exactly as it appears on the RC.
//
//   2. RC number
//        now  fr "RC : en cours d'immatriculation"
//             ar "السجل التجاري: في طور التسجيل"
//        then "RC n° <number>" / "السجل التجاري رقم <number>".
//
//   3. ICE number
//        now  fr "ICE : en cours d'immatriculation"
//             ar "التعريف الموحد للمقاولة: في طور التسجيل"
//        then "ICE n° <number>" / "التعريف الموحد للمقاولة رقم <number>".
//
//   4. Registered address
//        now  "Agadir, Maroc" / "أكادير، المغرب"
//        then the full registered address as filed.
//
//   5. CNDP declaration
//        now  fr "Déclaration CNDP : déclaration en cours"
//             ar "التصريح لدى اللجنة الوطنية ... (CNDP): التصريح جارٍ"
//        then the receipt number, and restore the assertion that the
//        processing IS declared -- the sentence was deliberately rewritten so
//        it no longer claims a registration that has not been issued.
//
//   6. Contact address
//        now  contact@botolago.com
//        then confirm this mailbox actually exists and is monitored; a privacy
//        contact that bounces is worse than none.
//
// Two rows in the subprocessor table describe the absence of a thing, and must
// be revisited when that changes rather than when the company registers:
//
//   7. "Aucun outil de mesure d'audience" / "لا تُستعمل أي أداة لقياس الجمهور"
//        True today: nothing in src/ loads an analytics script. The moment one
//        is added, name it here, say what it collects, and say where it stores
//        it -- and restore the cookie clause, which currently states that no
//        audience-measurement cookie is set.
//
//   8. "Supabase Auth" as the mail sender, "selon la politique de Supabase"
//        True today: confirmation mail is sent by Supabase's own service from
//        noreply@mail.app.supabase.io. If a dedicated sender is configured,
//        name it and state its region. There is no marketing mail system at
//        all, which is why the row no longer mentions marketing.
// ---------------------------------------------------------------------------

const LANGS = ["fr", "ar"] as const;

function textOf(block: LegalBlock): string[] {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return [block.text];
    case "list":
      return [...block.items];
    case "table":
      return [...block.head, ...block.rows.flat()];
  }
}

function allText(doc: LegalDocument): string[] {
  return [doc.title, ...doc.blocks.flatMap(textOf)];
}

/** `[...]` spans, which is how the source document marks a value it does not have. */
function placeholders(doc: LegalDocument): string[] {
  return allText(doc).flatMap((t) => [...t.matchAll(/\[([^\]]{2,80})\]/g)].map((m) => m[1]));
}

describe("legal documents are publishable", () => {
  for (const [name, byLang] of Object.entries(LEGAL_DOCUMENTS)) {
    for (const lang of LANGS) {
      it(`${name}.${lang} carries no unfilled placeholder`, () => {
        const remaining = [...new Set(placeholders(byLang[lang]))].sort();
        // Each of these is a value only the owner has: company name, RC and ICE
        // numbers, registered address, contact email, CNDP receipt number, and
        // the names of the analytics and email providers actually in use.
        expect(remaining).toEqual([]);
      });
    }
  }
});

describe("the two languages stay the same document", () => {
  for (const [name, byLang] of Object.entries(LEGAL_DOCUMENTS)) {
    it(`${name} has the same structure in French and Arabic`, () => {
      const shape = (doc: LegalDocument) => doc.blocks.map((b) => b.type);
      expect(shape(byLang.ar)).toEqual(shape(byLang.fr));
    });

    it(`${name} numbers its sections identically in both languages`, () => {
      // Both documents number their sections 1..n. If a section is dropped or
      // added on one side only, the two stop being the same agreement.
      const numbers = (doc: LegalDocument) =>
        doc.blocks
          .filter((b): b is Extract<LegalBlock, { type: "heading" }> => b.type === "heading")
          .map((b) => b.text.match(/^\s*(\d+)\./)?.[1])
          .filter((n): n is string => !!n);
      const fr = numbers(byLang.fr);
      expect(fr.length).toBeGreaterThan(0);
      expect(numbers(byLang.ar)).toEqual(fr);
    });

    it(`${name} keeps every table the same width in both languages`, () => {
      const widths = (doc: LegalDocument) =>
        doc.blocks
          .filter((b): b is Extract<LegalBlock, { type: "table" }> => b.type === "table")
          .map((b) => [b.head.length, ...b.rows.map((r) => r.length)]);
      expect(widths(byLang.ar)).toEqual(widths(byLang.fr));
    });
  }
});

describe("content integrity", () => {
  it("has no empty blocks in any document", () => {
    for (const byLang of Object.values(LEGAL_DOCUMENTS)) {
      for (const lang of LANGS) {
        const doc = byLang[lang];
        expect(doc.title.trim().length).toBeGreaterThan(0);
        expect(doc.blocks.length).toBeGreaterThan(0);
        for (const text of allText(doc)) expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("actually contains Arabic in the Arabic documents and none in the French", () => {
    // Guards the transcription: a copy/paste slip that left a French document
    // under the `ar` key would otherwise render silently.
    const arabic = /[؀-ۿ]/;
    for (const byLang of Object.values(LEGAL_DOCUMENTS)) {
      expect(arabic.test(allText(byLang.ar).join(" "))).toBe(true);
      // Latin brand names (BotolaGO, Supabase, Google) legitimately appear in
      // the Arabic text, so only the reverse direction is a hard rule.
      expect(arabic.test(allText(byLang.fr).join(" "))).toBe(false);
    }
  });

  it("states the verified Supabase region rather than asking for it", () => {
    const fr = allText(LEGAL_DOCUMENTS.privacy.fr).join(" ");
    expect(fr).toContain("eu-west-3");
    expect(fr).not.toContain("confirmer la région");
  });
});
