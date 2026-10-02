import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { clubPalette } from "@/lib/club-palette";
import type { Club } from "@/types/domain";
import { PlayerPhoto } from "./PlayerPhoto";

/**
 * `PlayerPhoto` needs no router and no i18n, so these render it for real
 * (`react-dom/server` needs no DOM) and assert on the markup a reader
 * receives. The failed-load path is `FailureAwareImage`'s and is covered in
 * `failure-aware-image.test.ts`; here it is enough that the silhouette shows
 * whenever there is no photo to show.
 */

const WYDAD: Club = {
  id: "1b0c5e2a-0000-4000-8000-000000000000",
  name: { fr: "Wydad Casablanca", ar: "Wydad Casablanca" },
  shortName: { fr: "Wydad Casablanca", ar: "Wydad Casablanca" },
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: "WAC",
};

const PHOTO = "https://example.test/players/123.webp";

const render = (node: React.ReactElement) => renderToStaticMarkup(node);

/** The value of one inline custom property in rendered markup. */
function styleVar(html: string, name: string): string | undefined {
  return new RegExp(`${name}:\\s*([^;"]+)`).exec(html)?.[1]?.trim();
}

describe("PlayerPhoto — the silhouette when there is no photo", () => {
  it("draws the silhouette and no image when the photo is null", () => {
    const html = render(<PlayerPhoto photoUrl={null} club={WYDAD} />);
    expect(html).toContain('data-photo-state="silhouette"');
    expect(html).toContain("data-player-silhouette");
    expect(html).not.toContain("<img");
  });

  it("treats a missing or empty URL as no photo", () => {
    for (const photoUrl of [undefined, ""]) {
      const html = render(<PlayerPhoto photoUrl={photoUrl} club={WYDAD} />);
      expect(html).toContain("data-player-silhouette");
      expect(html).not.toContain("<img");
    }
  });

  it("shows the photo, without the silhouette behind it, when there is one", () => {
    const html = render(<PlayerPhoto photoUrl={PHOTO} club={WYDAD} />);
    expect(html).toContain('data-photo-state="photo"');
    expect(html).toContain(`src="${PHOTO}"`);
    expect(html).not.toContain("data-player-silhouette");
  });

  it("dresses the silhouette in the club's shirt colour", () => {
    const html = render(<PlayerPhoto club={WYDAD} />);
    expect(styleVar(html, "--club-fill-l")).toBe(clubPalette(WYDAD).light.fill);
    expect(html).toContain('fill="var(--ui-club)"');
    // The edge keeps a white or yellow kit a shape on a light card.
    expect(html).toContain('stroke="var(--ui-club-edge)"');
  });

  it("falls back to the brand ink when the club is unknown", () => {
    const html = render(<PlayerPhoto />);
    expect(html).toContain('data-club=""');
    expect(html).not.toContain("--club-fill-l");
    expect(html).toContain("data-player-silhouette");
  });

  it("is a decorative disc: hidden from assistive tech, with an empty alt", () => {
    const withPhoto = render(<PlayerPhoto photoUrl={PHOTO} />);
    expect(withPhoto).toContain('aria-hidden="true"');
    expect(withPhoto).toContain('alt=""');
    expect(withPhoto).toContain("rounded-full");
  });

  it("draws at the crest's sizes, and larger for the player page", () => {
    expect(render(<PlayerPhoto size="md" />)).toContain("h-10 w-10");
    expect(render(<PlayerPhoto size="xl" />)).toContain("h-24 w-24");
  });
});
