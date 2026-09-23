import stadiumNight from "@/assets/photos/stadium-night-800.webp";
import stadiumGolden from "@/assets/photos/stadium-golden-800.webp";
import stadiumDay from "@/assets/photos/stadium-day-800.webp";
import stadiumRain from "@/assets/photos/stadium-rain-800.webp";

/** Generic stadium photographs (no venue has its own yet). A match — or a
 *  player — always gets the same one: picked from its id, so it never
 *  changes on reload. */
const STADIUM_PHOTOS = [stadiumNight, stadiumGolden, stadiumDay, stadiumRain] as const;

export function stadiumPhotoFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return STADIUM_PHOTOS[Math.abs(hash) % STADIUM_PHOTOS.length];
}
