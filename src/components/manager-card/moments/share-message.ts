import { PUBLIC_SITE_ORIGIN } from "@/lib/site-origin";
import type { Language } from "@/types/domain";

import { fillText, isolateText } from "../interpolate";

/**
 * The words that go out with a shared card (plan 4.7): « Ma carte BotolaGO : 84 (provisoire). Et
 * toi ? Rejoins ma ligue « … » : lien ». « tu » is allowed here (and only here): it is a message
 * the manager sends in their own voice, not the app speaking.
 *
 * Numbers are isolated with U+2068 … U+2069 in Arabic (`fillText`), so WhatsApp keeps their
 * order inside a right-to-left line; the league's name (anything its owner typed) is isolated the
 * same way. The link is left bare: an invisible mark glued to « https » can stop a chat app from
 * recognising it as a link, and it closes the message, where its direction does no harm.
 */
export interface ShareMessageTemplates {
  league: string;
  leagueProvisional: string;
  plain: string;
  plainProvisional: string;
}

export interface ShareMessageInput {
  templates: ShareMessageTemplates;
  lang: Language;
  /** The number on the card; a message is only made for a card that has one. */
  ovr: number;
  provisional: boolean;
  /** The manager's private league, when they have one: the message invites to it. */
  league: { name: string } | null;
  /** The link the message ends with (`plainShareLink` or `leagueShareLink`). */
  link: string;
}

export function shareMessage(input: ShareMessageInput): string {
  const { templates, lang, ovr, provisional, league, link } = input;
  const template = league
    ? provisional
      ? templates.leagueProvisional
      : templates.league
    : provisional
      ? templates.plainProvisional
      : templates.plain;
  return fillText(template, {
    ovr,
    league: league ? (lang === "ar" ? isolateText(league.name) : league.name) : "",
    link,
  });
}

/** The channel a share leaves through; it tags the link, never the picture. */
export type CardShareChannel = "whatsapp" | "native" | "copy" | "download";

export const SHARE_CAMPAIGN = "manager_card";

function tagged(link: string, channel: CardShareChannel): string {
  const url = new URL(link);
  if (channel === "whatsapp") {
    url.searchParams.set("utm_source", "whatsapp");
  } else {
    url.searchParams.set("utm_source", "share");
    url.searchParams.set("utm_medium", channel);
  }
  url.searchParams.set("utm_campaign", SHARE_CAMPAIGN);
  return url.toString();
}

/** `/jouer`, the landing page, tagged for the channel: where a card without a league sends people. */
export function plainShareLink(channel: CardShareChannel, origin: string = PUBLIC_SITE_ORIGIN) {
  return tagged(`${origin}/jouer`, channel);
}

/** A league's own invite link (code after `#`, never sent to a server), tagged for the channel. */
export function leagueShareLink(inviteLink: string, channel: CardShareChannel): string {
  return tagged(inviteLink, channel);
}

/** What the sheet shows under the picture: the message with the link's address in plain sight. */
export function visibleLink(link: string): string {
  try {
    const url = new URL(link);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return link;
  }
}
