/**
 * Reporting a name another user chose (App Store guideline 1.2, user-generated
 * content): a Fantasy team, a league, a username.
 *
 * A report is an e-mail to support, written by the reader's own mail app from
 * a `mailto:` link, so it needs no table, no endpoint and no moderation queue
 * to exist first. Inside the phone app the link still works: neither shell
 * loads a `mailto:` in the web view, they hand it to the phone (iOS:
 * `WebViewDelegationHandler` opens any top-level address outside the app with
 * `UIApplication.shared.open`; Android: `Bridge.launchIntent` starts an
 * `ACTION_VIEW` intent for any address whose host is not the app's).
 *
 * The message names what is reported in words a person reads (the kind, the
 * name as shown) and in what staff look up (the kind's code, the id, the page
 * address), in the reader's language.
 */

export const SUPPORT_EMAIL = "support@botolago.com";

export type ReportKind = "team" | "league" | "user";

export interface ReportTarget {
  kind: ReportKind;
  /** The name exactly as the page shows it. */
  name: string;
  /** The id staff look it up by: a team, league or user id. */
  id: string;
}

/** The words of the message, from the dictionaries. */
export interface ReportCopy {
  /** "{kind}" and "{name}" are replaced: "Signalement : {kind} « {name} »". */
  subject: string;
  /** "Type :", "Nom :", "Identifiant :", "Page :" — the colon as each language sets it. */
  kindLabel: string;
  nameLabel: string;
  idLabel: string;
  pageLabel: string;
  /** The line the reader writes under: "Pourquoi ce nom pose problème :". */
  reasonPrompt: string;
  /** What each kind is called in a sentence: "nom d'équipe". */
  kinds: Record<ReportKind, string>;
}

/** The longest name a report carries. Names are short; this only caps abuse of the link. */
const MAX_NAME = 120;

function clean(value: string): string {
  // One line, no control characters: a name is put into a subject line and
  // into "Label : value" lines, where a newline would forge a field.
  const flat = Array.from(value)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x20 || (code >= 0x7f && code < 0xa0) ? " " : ch;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(flat);
  return chars.length > MAX_NAME ? `${chars.slice(0, MAX_NAME).join("")}…` : flat;
}

/**
 * The `mailto:` address of one report. Subject and body are percent-encoded
 * (RFC 6068), lines end in CRLF, and the page address is passed in rather
 * than read here so the function stays pure.
 */
export function reportMailto(target: ReportTarget, pageUrl: string, copy: ReportCopy): string {
  const name = clean(target.name);
  const kind = copy.kinds[target.kind];
  const subject = copy.subject.replace("{kind}", kind).replace("{name}", name);
  const body = [
    `${copy.kindLabel} ${kind} (${target.kind})`,
    `${copy.nameLabel} ${name}`,
    `${copy.idLabel} ${clean(target.id)}`,
    `${copy.pageLabel} ${clean(pageUrl)}`,
    "",
    copy.reasonPrompt,
    "",
  ].join("\r\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** The plain contact link, for "Nous contacter". */
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
