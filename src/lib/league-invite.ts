import { inviteLink } from "@/components/predictions/leagues/invite-link";

/** The message a manager sends with a league's invite link. */
export function inviteMessage(template: string, name: string, link: string): string {
  return template.replace("{name}", name).replace("{link}", link);
}

/** The WhatsApp share URL for a message: opens the app on a phone, WhatsApp Web elsewhere. */
export function whatsappUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** A league's invite link: the one Pronostics uses, since one league serves both games. */
export function leagueInviteLink(code: string, origin?: string): string {
  return inviteLink(code, origin);
}
