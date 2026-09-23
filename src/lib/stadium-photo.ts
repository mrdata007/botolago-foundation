import stadiumNight from "@/assets/photos/stadium-night-800.webp";
import stadiumGolden from "@/assets/photos/stadium-golden-800.webp";
import stadiumDay from "@/assets/photos/stadium-day-800.webp";

/** Generic stadium photographs (no venue has its own yet). A match — or a
 *  player — always gets the same one: picked from its id, so it never
 *  changes on reload. There is no rain shot: under the match header's white
 *  wash a wet, grey stadium read as a smudge rather than a ground. */
const STADIUM_PHOTOS = [stadiumNight, stadiumGolden, stadiumDay] as const;
/** Only the daylight shots survive a white wash: under the match header's
 *  veil the night photo's dark sky and stands turned to grey speckle. */
const BRIGHT_STADIUM_PHOTOS = [stadiumGolden, stadiumDay] as const;

export function stadiumPhotoFor(id: string, set: "any" | "bright" = "any"): string {
  const photos = set === "bright" ? BRIGHT_STADIUM_PHOTOS : STADIUM_PHOTOS;
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return photos[Math.abs(hash) % photos.length];
}
