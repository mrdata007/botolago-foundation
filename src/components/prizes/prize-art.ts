import calendarArt from "@/assets/illustrations/empty-matches.webp";
import trophyArt from "@/assets/illustrations/empty-leagues.webp";
import shirtArt from "@/assets/illustrations/points-pending.webp";
import podiumArt from "@/assets/illustrations/podium-soon.webp";
import stadiumNight from "@/assets/photos/stadium-night-800.webp";
import type { PrizeTier } from "@/backend/prizes/contracts";

/**
 * Pictures for the prize surfaces, drawn from the product's own illustration
 * set (the same photographed cut-outs the empty states use), so the prize
 * pages look like the rest of the app.
 *
 * A tier picture stands for the tier, never for a specific prize: the podium
 * for the gameweek, the calendar for the 4-gameweek "month", the cup for the
 * season, the shirt for the mini-league merchandise. An admin who sets a
 * prize image replaces it; nothing here claims to show what is won.
 */
export const PRIZE_TIER_ART: Readonly<Record<PrizeTier, string>> = {
  gameweek: podiumArt,
  monthly: calendarArt,
  season: trophyArt,
  mini_league: shirtArt,
};

/** The floodlit stadium behind the /prizes header, and the cup in front of it. */
export const PRIZE_HERO_PHOTO = stadiumNight;
export const PRIZE_HERO_ART = trophyArt;
