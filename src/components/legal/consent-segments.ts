import type { TranslationKey } from "@/i18n/dictionaries";

/**
 * The two consent sentences, as ordered segments instead of one string.
 *
 * WHY NOT ONE STRING. Both sentences name the Terms and the Privacy Policy and
 * both have to turn those two names into links. Splitting a finished sentence
 * in JS means guessing where the link text starts and ends — impossible to do
 * safely for Arabic, where the words are not separated the way the French ones
 * are and where a byte offset that looks right in an editor is not where the
 * word boundary is. So the dictionary does the splitting: each language names
 * its own five parts and the renderer only concatenates them in array order.
 *
 * WHY FIVE PARTS, AND WHY THE SAME FIVE IN BOTH LANGUAGES. `lead`, the Terms
 * label, `middle`, the Privacy label, `tail`. The connective is a part on its
 * own because it is not the same shape in the two languages: French needs
 * spaces on both sides of " et la ", Arabic needs the conjunction bound
 * directly to the following word (" و" + "سياسة"). A single shared pattern
 * with slots would force one language's spacing onto the other. The five parts
 * are identical in shape across fr and ar so neither language ever needs a
 * blank segment — the i18n gate treats an empty value as an error (E2), so a
 * shape that is only right for French is not merely untidy, it fails the gate.
 *
 * The keys are spelled out as literals at each call site rather than looked up
 * through a map, so the gate's static analysis can see every one of them.
 */
export type ConsentSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; to: "/terms" | "/privacy" };

type Translate = (key: TranslationKey) => string;

/** `/auth/register` — the checkbox label next to "I accept …". */
export function registerConsentSegments(t: Translate): ConsentSegment[] {
  return [
    { kind: "text", text: t("auth.register.accept_terms.lead") },
    { kind: "link", to: "/terms", text: t("auth.register.accept_terms.terms_link") },
    { kind: "text", text: t("auth.register.accept_terms.middle") },
    { kind: "link", to: "/privacy", text: t("auth.register.accept_terms.privacy_link") },
    { kind: "text", text: t("auth.register.accept_terms.tail") },
  ];
}

/** `/auth/login` (and the foot of `/auth/register`) — the passive notice. */
export function noticeConsentSegments(t: Translate): ConsentSegment[] {
  return [
    { kind: "text", text: t("auth.terms_notice.lead") },
    { kind: "link", to: "/terms", text: t("auth.terms_notice.terms_link") },
    { kind: "text", text: t("auth.terms_notice.middle") },
    { kind: "link", to: "/privacy", text: t("auth.terms_notice.privacy_link") },
    { kind: "text", text: t("auth.terms_notice.tail") },
  ];
}
