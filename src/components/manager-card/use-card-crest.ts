import { QueryClientContext } from "@tanstack/react-query";
import { useContext, useEffect, useState } from "react";

import { responsiveMedia } from "@/lib/media";
import { footballService } from "@/services/football";

import { findCardClub } from "./catalogue-club";
import { crestHref } from "./crest-href";
import type { CardClub, CardLang, CardProfile } from "./types";

/**
 * The club's real crest for the card's tab disc (owner request 2026-10-10).
 *
 * The Manager Card API carries no crest, so the card's club is found in the app's own club
 * catalogue (the same query, key and reader as the top bar's search, Home, the Fantasy lists and
 * Pépites, so it is usually cached already): by id, then slug, then name (`findCardClub`). Its
 * crest is then loaded in this browser before the card is told about it, so the card never shows a
 * broken picture or an empty plate: until the crest has loaded, for a club the catalogue has no
 * crest for, or when the picture fails, the card keeps the initials disc. Browser only; no database
 * is read beyond the catalogue the app already reads.
 */

/** The query the catalogue is read under (`useClubCatalogue`, the search, Home, Fantasy). */
const catalogueKey = (lang: CardLang) => ["football", "clubs", lang] as const;

/**
 * The addresses to try for a crest drawn on the card, best first: the image service's largest crest
 * cut (128 px: the share picture's disc, the card on a 3x screen), then the stored original, which
 * still loads when the image service is off. Only addresses the card may draw (`crestHref`).
 */
export function crestCandidates(
  url: string | null | undefined,
  /** The Supabase project's origin; the configured one by default (tests pass their own). */
  supabaseUrl?: string,
): string[] {
  const media = responsiveMedia(url, { kind: "crest", sizes: "128px" }, supabaseUrl);
  if (!media.src) return [];
  const largest = media.srcSet?.split(", ").at(-1)?.split(" ")[0];
  const all = [largest, media.src].map(crestHref).filter((href): href is string => href !== null);
  return [...new Set(all)];
}

/** The profile with its club's crest set to `crest` (or removed); the same object when unchanged. */
export function withCrest(profile: CardProfile, crest: string | null): CardProfile {
  const club = profile.club;
  if (!club) return profile;
  if ((club.crest ?? null) === crest) return profile;
  if (crest === null) {
    const { crest: _crest, ...rest } = club;
    return { ...profile, club: rest };
  }
  return { ...profile, club: { ...club, crest } };
}

/** Whether a picture loads in this browser (a broken or refused one answers false). */
export function loadsInBrowser(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image.naturalWidth > 0);
    image.onerror = () => resolve(false);
    image.src = src;
  });
}

/** The first candidate that loads, or null. */
export async function firstLoaded(
  candidates: readonly string[],
  loads: (src: string) => Promise<boolean> = loadsInBrowser,
): Promise<string | null> {
  for (const src of candidates) {
    if (await loads(src)) return src;
  }
  return null;
}

/**
 * The crest the card may draw for `club`, once it has loaded; null before that, for no club, for a
 * club the catalogue has no crest for, outside a query client, and on the server.
 */
export function useCardCrest(club: CardClub | null, lang: CardLang): string | null {
  const client = useContext(QueryClientContext);
  const id = club?.id ?? null;
  const slug = club?.slug ?? null;
  const nameFr = club?.name.fr ?? "";
  const nameAr = club?.name.ar ?? "";
  const key = id ? `${id}|${slug ?? ""}|${nameFr}|${nameAr}` : "";
  const [found, setFound] = useState<{ key: string; crest: string | null }>({
    key: "",
    crest: null,
  });

  useEffect(() => {
    if (!id || !client || typeof window === "undefined") return;
    let cancelled = false;
    client
      .fetchQuery({
        queryKey: catalogueKey(lang),
        queryFn: ({ signal }) => footballService.getClubs(lang, signal),
        staleTime: 10 * 60_000,
      })
      .then((clubs) =>
        firstLoaded(
          crestCandidates(
            findCardClub(clubs, { id, slug, name: { fr: nameFr, ar: nameAr } })?.crestUrl,
          ),
        ),
      )
      .then(
        (crest) => {
          if (!cancelled) setFound({ key, crest });
        },
        () => {
          if (!cancelled) setFound({ key, crest: null });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [client, id, slug, nameFr, nameAr, key, lang]);

  return found.key === key ? found.crest : null;
}
