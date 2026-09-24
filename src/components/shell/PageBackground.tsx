// BotolaGO shell — Page background, on the UI kit.
//
// Option A: the page is FLAT. Every product screen sits on `--ui-page` and
// nothing else — the boards draw no per-route wash, and the club colours,
// the action gradient and the photo bands now carry the identity a tinted
// page used to. The per-route radial wash (a 14% `--ui-wash-*` tint at the
// block start, one hue per route family) is retired; `BackgroundVariant`
// keeps its names so every caller that passes one still compiles, and they
// all paint the same page.
//
// The `auth` variant still paints the V2 `mesh-auth` utility, and that part
// stays: the utility lives in `src/styles.css`, which the screen lanes do not
// edit, and Welcome (and any screen still on the dark register) is
// white-on-dark and reads its whole contrast from it. What is drawn here is
// the photograph or the arc overlay BELOW that mesh.
//
// The auth SCREENS are no longer on it. Option A (Decision 7) moved login,
// register and the rest of the family to the light register: `AuthShell`
// draws its own photo band over a white sheet and stands on the flat page
// (`variant="neutral"`). The players'-tunnel photograph this file used to crop
// into a band for them went with it; the name `auth` stays because Welcome
// passes it.

import { useRouterState } from "@tanstack/react-router";

import welcomePhoto from "@/assets/photos/welcome.webp";
import welcomePhotoSmall from "@/assets/photos/welcome-720.webp";
import welcomePhotoWide from "@/assets/photos/welcome-wide.webp";

import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * Which background a screen sits on. Only `auth` paints something different
 * (the dark mesh, optionally over a photograph — Welcome's register); every
 * route-family name paints the flat `--ui-page`. They stay in the union so
 * callers compile and so a route family can be given its own treatment again
 * without a rename.
 */
export type BackgroundVariant =
  | "home"
  | "news"
  | "fantasy"
  | "matches"
  | "profile"
  | "auth"
  | "neutral";

export function resolveVariant(pathname: string): BackgroundVariant {
  if (pathname.startsWith("/fantasy")) return "fantasy";
  if (pathname.startsWith("/news")) return "news";
  if (pathname.startsWith("/matches")) return "matches";
  if (pathname.startsWith("/profile")) return "profile";
  // `/auth/*` is the light register now (Decision 7): it falls through to the
  // flat page like every other product route.
  if (pathname.startsWith("/welcome")) return "auth";
  if (pathname === "/") return "home";
  return "neutral";
}

interface Props {
  variant?: BackgroundVariant;
  /** Auth only: a night-stadium photograph under the mesh instead of the
   *  drawn arcs. `welcome` is the crowd. */
  photo?: "welcome";
}

const PHOTOS = {
  welcome: { small: welcomePhotoSmall, large: welcomePhoto, wide: welcomePhotoWide },
} as const;

export function PageBackground({ variant, photo }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const v = variant ?? resolveVariant(pathname);

  // Welcome's dark mesh — see the note at the top of this file.
  if (v === "auth" && photo) {
    const set = PHOTOS[photo];
    return (
      <div aria-hidden className="mesh-base mesh-auth">
        {/* Portrait photograph on a phone, the landscape cut from 768px.
            Decorative (the parent is aria-hidden) and the whole screen, so
            it is fetched eagerly. The wide cut keeps its calm side under the
            text, so it is mirrored in Arabic. */}
        <picture>
          <source media="(min-width: 768px)" srcSet={set.wide} />
          <img
            src={set.large}
            srcSet={`${set.small} 720w, ${set.large} 1080w`}
            sizes="100vw"
            alt=""
            decoding="async"
            fetchPriority="high"
            className={cn(
              "absolute w-full object-cover md:inset-0 md:h-full md:rtl:-scale-x-100",
              // Welcome: shifted down on a phone so the far stand's roof edge
              // lands below the subtitle instead of running through it like a
              // rule, and faded in at the top so the photo has no hard edge of
              // its own.
              "inset-x-0 top-[9svh] h-full [mask-image:linear-gradient(to_bottom,transparent,black_14%)] md:[mask-image:none]",
            )}
          />
        </picture>
        {/* The mesh's own navy, laid back over the photograph so the white
            foreground keeps its contrast wherever the floodlights land.
            `to bottom`: a degree angle would sit on the wrong edge in RTL. A
            deeper stop at 38% mutes the far stand's roof edge, which
            otherwise ran like a rule through the subtitle. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, color-mix(in oklab, var(--ui-ink-deep) 62%, transparent) 0%, color-mix(in oklab, var(--ui-ink-deep) 70%, transparent) 38%, color-mix(in oklab, var(--ui-ink-deep) 52%, transparent) 52%, color-mix(in oklab, var(--ui-ink-deep) 72%, transparent) 100%)",
          }}
        />
      </div>
    );
  }

  if (v === "auth") {
    return (
      <div aria-hidden className="mesh-base mesh-auth">
        {/* The stadium arcs. These were four `rgba(255,255,255,0.14 / 0.07)`
            literals — the same un-themed white the mesh register was created
            to retire. `--ui-mesh-rule` is that hairline as a token (the mesh
            foreground at 20%), stated once on the <svg> because `stroke` is an
            inherited SVG property, and the two weights the drawing needs come
            from `stroke-opacity` against it: 20% x 0.7 = 14%, 20% x 0.35 = 7%,
            i.e. the exact alphas the literals carried. */}
        <svg
          className="absolute inset-0 h-full w-full opacity-90 [stroke:var(--ui-mesh-rule)]"
          viewBox="0 0 400 800"
          preserveAspectRatio="xMidYMid slice"
        >
          <circle cx="60" cy="120" r="240" fill="none" strokeOpacity={0.7} strokeWidth="1" />
          <circle cx="60" cy="120" r="340" fill="none" strokeOpacity={0.35} strokeWidth="1" />
          <circle cx="360" cy="700" r="280" fill="none" strokeOpacity={0.35} strokeWidth="1" />
          <path
            d="M -20 640 Q 200 540 420 660"
            fill="none"
            strokeOpacity={0.35}
            strokeWidth="30"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  // Every other variant: the flat page.
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden", ui.surface.page)}
    />
  );
}
