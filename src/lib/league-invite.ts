import { inviteLink, type InviteGame } from "@/components/predictions/leagues/invite-link";

/**
 * A template with its `{placeholders}` filled in ONE pass. A league's name is
 * typed by a person, so it is never read as a replacement pattern (`$&`, `$$`
 * and `$'` mean something to `String.replace`: "Mo$$ Squad" lost a dollar) and
 * never searched for a placeholder (a league called "{link}" took the link's
 * place in the sentence and left the real `{link}` unfilled).
 */
export function fillInvite(template: string, values: Record<string, string>): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name: string) => values[name] ?? whole);
}

/** The message a manager sends with a league's invite link. */
export function inviteMessage(template: string, name: string, link: string): string {
  return fillInvite(template, { name, link });
}

/** The WhatsApp share URL for a message: opens the app on a phone, WhatsApp Web elsewhere. */
export function whatsappUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * A league's invite link: the one Pronostics uses, since one league serves
 * both games, naming the game it was shared from so the recipient lands on
 * the right join.
 */
export function leagueInviteLink(code: string, origin?: string, game?: InviteGame): string {
  return inviteLink(code, origin, game);
}
