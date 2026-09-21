// BotolaGO shell — Page background, on the UI kit.
//
// Converted from the Design System V2 mesh (three stacked radial gradients
// per route plus an SVG "stadium arcs" overlay) to the Fantasy language: the
// flat `--ui-page` surface with a single soft wash at the block start, tinted
// per route family so sections stay distinguishable without a second visual
// identity. Fantasy itself is a flat page under a gradient header; this is
// the same idea applied product-wide.
//
// The `auth` variant is deliberately NOT converted. Auth and Welcome are
// white-on-dark screens that read their contrast from that dark mesh, and
// they are outside this change's scope; they keep the V2 treatment until a
// later pass converts those screens too.

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
 * The tint each route family washes into the block start of the page. All
 * five are existing semantic tokens, so a theme switch carries them.
 */
const WASH: Record<Exclude<BackgroundVariant, "auth">, string> = {
  home: "var(--brand-accent)",
  news: "var(--accent-indigo)",
  matches: "var(--accent-emerald)",
  fantasy: "var(--accent-cyan)",
  profile: "var(--accent-indigo)",
  neutral: "var(--ui-ink)",
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
        <svg
          className="absolute inset-0 h-full w-full opacity-90"
          viewBox="0 0 400 800"
          preserveAspectRatio="xMidYMid slice"
        >
          <circle
            cx="60"
            cy="120"
            r="240"
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="1"
          />
          <circle
            cx="60"
            cy="120"
            r="340"
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="1"
          />
          <circle
            cx="360"
            cy="700"
            r="280"
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="1"
          />
          <path
            d="M -20 640 Q 200 540 420 660"
            fill="none"
            stroke="rgba(255,255,255,0.07)"
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
