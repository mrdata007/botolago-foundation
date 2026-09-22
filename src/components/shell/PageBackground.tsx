// BotolaGO shell — Page background, on the UI kit.
//
// Converted from the Design System V2 mesh (three stacked radial gradients
// per route plus an SVG "stadium arcs" overlay) to the Fantasy language: the
// flat `--ui-page` surface with a single soft wash at the block start, tinted
// per route family so sections stay distinguishable without a second visual
// identity. Fantasy itself is a flat page under a gradient header; this is
// the same idea applied product-wide.
//
// The `auth` variant still paints the V2 `mesh-auth` utility, and that part
// stays: the utility lives in `src/styles.css`, which the screen lanes do not
// edit, and Welcome and Auth are white-on-dark screens that read their whole
// contrast from it. An earlier version of this note said those screens were
// "outside this change's scope ... until a later pass converts those screens
// too"; that pass has happened — Welcome, AuthShell and the language switcher
// are on the kit's mesh register now — so what is left here is the arc
// overlay drawn BELOW, and its colours are this file's to convert.

import { useRouterState } from "@tanstack/react-router";

import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

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
  if (pathname.startsWith("/welcome") || pathname.startsWith("/auth")) return "auth";
  if (pathname === "/") return "home";
  return "neutral";
}

/**
 * The tint each route family washes into the block start of the page.
 *
 * This list used to read `--brand-accent`, `--accent-indigo`,
 * `--accent-emerald` and `--accent-cyan`, under a comment claiming "all five
 * are existing semantic tokens, so a theme switch carries them". They are
 * tokens, but that claim was wrong: all four are declared once on `:root` and
 * never redeclared under `.dark`, so the wash kept painting its light-theme
 * tint behind a dark page. A `--brand-*` in a screen file is a conversion by
 * the checklist for exactly this reason.
 *
 * The first conversion folded them onto the three accents the kit already
 * had, which left four of the six families painting the identical string —
 * and the distinction between them is the whole point of the wash. So the
 * ramp is its own set of themed tokens now: the same six hues, carried into
 * the dark theme rather than dropped there.
 */
const WASH: Record<Exclude<BackgroundVariant, "auth">, string> = {
  home: "var(--ui-wash-home)",
  news: "var(--ui-wash-news)",
  matches: "var(--ui-wash-matches)",
  fantasy: "var(--ui-wash-fantasy)",
  profile: "var(--ui-wash-profile)",
  neutral: "var(--ui-wash-neutral)",
};

interface Props {
  variant?: BackgroundVariant;
}

export function PageBackground({ variant }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const v = variant ?? resolveVariant(pathname);

  // Auth keeps the V2 dark mesh — see the note at the top of this file.
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

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden", ui.surface.page)}
      style={{
        backgroundImage: `radial-gradient(120% 40% at 50% 0%, color-mix(in oklab, ${WASH[v]} 14%, transparent) 0%, transparent 70%)`,
      }}
    />
  );
}
