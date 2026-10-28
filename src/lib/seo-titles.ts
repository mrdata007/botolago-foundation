import { rowClubName } from "@/lib/club-identity";
import { isKickoffDateUnconfirmed, isKickoffTimeUnconfirmed } from "@/lib/match-kickoff";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import type { Club, Match } from "@/types/domain";

/**
 * Title and description templates for the club and match pages, in French
 * (what the server renders). SEO brief, 2026-10-27: match titles used the
 * clubs' full legal names ("Renaissance Club Athletic Zemamra — FUS Rabat")
 * and drew a 0.1% click rate at position 7.7, while people search the names
 * they use ("rsb berkane", "zemamra fus rabat") with intent words ("live",
 * "compo", "résumé", "classement"). The titles lead with the short names and
 * those words; the descriptions carry the full names too, so both spellings
 * are on the page.
 */

type NamedClub = Pick<Club, "name" | "shortName">;

/**
 * The name people use for a club: its short name ("RSB Berkane", "FAR
 * Rabat"), else its full name. A short name that is only a code ("RSB") gives
 * way to the full name, as in the tables (`rowClubName`).
 */
export function clubSearchName(club: NamedClub): string {
  const short = club.shortName?.fr?.trim();
  return short ? rowClubName(short, club.name.fr.trim()) : club.name.fr.trim();
}

/** The full name when it says more than the short one, else `null`. */
function fullNameIfDifferent(club: NamedClub): string | null {
  const full = club.name.fr.trim();
  return full && full.toLowerCase() !== clubSearchName(club).toLowerCase() ? full : null;
}

const DAY_FORMAT = moroccoDateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "25 oct. 2026", in Morocco's time, or `null` when the date is not confirmed. */
export function matchDayLabel(
  match: Pick<Match, "kickoff" | "status" | "dateUnconfirmed" | "calledOff">,
): string | null {
  if (isKickoffDateUnconfirmed(match)) return null;
  const ms = Date.parse(match.kickoff);
  return Number.isFinite(ms) ? DAY_FORMAT.format(new Date(ms)) : null;
}

type TitledMatch = Pick<
  Match,
  "kickoff" | "status" | "dateUnconfirmed" | "calledOff" | "homeScore" | "awayScore"
>;

/**
 * - finished: "RSB Berkane 2-2 RCA Zemamra : résumé, buts et compo (25 oct. 2026) | BotolaGO"
 * - live: "RSB Berkane vs RCA Zemamra : score en direct et compo | BotolaGO"
 * - otherwise: "RSB Berkane vs RCA Zemamra : heure, compo et live (25 oct. 2026) | BotolaGO"
 */
export function matchSeoTitle(match: TitledMatch, home: NamedClub, away: NamedClub): string {
  const h = clubSearchName(home);
  const a = clubSearchName(away);
  const day = matchDayLabel(match);
  const when = day ? ` (${day})` : "";
  const scored = match.homeScore != null && match.awayScore != null;
  if (match.status === "finished" && scored) {
    return `${h} ${match.homeScore}-${match.awayScore} ${a} : résumé, buts et compo${when} | BotolaGO`;
  }
  if (match.status === "live") return `${h} vs ${a} : score en direct et compo | BotolaGO`;
  return `${h} vs ${a} : heure, compo et live${when} | BotolaGO`;
}

export function matchSeoDescription(match: TitledMatch, home: NamedClub, away: NamedClub): string {
  const h = clubSearchName(home);
  const a = clubSearchName(away);
  const fullHome = fullNameIfDifferent(home);
  const fullAway = fullNameIfDifferent(away);
  const full = fullHome || fullAway ? ` (${fullHome ?? h} – ${fullAway ?? a})` : "";
  const day = matchDayLabel(match);
  const time =
    day && !isKickoffTimeUnconfirmed(match)
      ? moroccoDateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
          new Date(match.kickoff),
        )
      : null;
  const scored = match.homeScore != null && match.awayScore != null;
  if (match.status === "finished" && scored) {
    return `${h} ${match.homeScore}-${match.awayScore} ${a}${full}${day ? `, le ${day}` : ""} en Botola Pro : résumé, buteurs, compositions et statistiques du match.`;
  }
  if (match.status === "live") {
    return `${h} – ${a}${full} en direct : score live, buteurs, compositions et statistiques du match de Botola Pro.`;
  }
  const at = day ? ` le ${day}${time ? ` à ${time}` : ""}` : "";
  return `${h} – ${a}${full}${at} en Botola Pro : heure du match, compositions, face-à-face, puis score en direct et résumé.`;
}

/** "RSB Berkane : calendrier, classement, effectif et news | BotolaGO" */
export function clubSeoTitle(club: NamedClub): string {
  return `${clubSearchName(club)} : calendrier, classement, effectif et news | BotolaGO`;
}

export function clubSeoDescription(club: NamedClub & Pick<Club, "city">): string {
  const name = clubSearchName(club);
  const full = fullNameIfDifferent(club);
  const city = club.city?.fr?.trim();
  return `${name}${full ? ` (${full})` : ""}${city ? `, club de ${city},` : ""} en Botola Pro : prochain match, résultats, classement ${name}, effectif et actualité.`;
}
