// Design System V2 — Route-aware mesh background.
//
// Renders a fixed, subtle mesh gradient per route family plus a very light
// SVG "stadium arcs" overlay to keep the BotolaGO editorial identity. The
// meshes are pure CSS (defined as @utility classes in styles.css) so this
// component ships zero runtime work beyond selecting a variant.
//
// Motion is opt-in via `.mesh-drift` on hero surfaces only, and disabled
// under prefers-reduced-motion.

import { useRouterState } from "@tanstack/react-router";
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

const MESH_CLASS: Record<BackgroundVariant, string> = {
  home: "mesh-home",
  news: "mesh-news",
  matches: "mesh-matches",
  fantasy: "mesh-fantasy",
  profile: "mesh-profile",
  auth: "mesh-auth",
  neutral: "mesh-neutral",
};

interface Props {
  variant?: BackgroundVariant;
}

export function PageBackground({ variant }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const v = variant ?? resolveVariant(pathname);
  const dark = v === "auth";

  const arcStroke = dark
    ? "rgba(255,255,255,0.14)"
    : "color-mix(in oklab, var(--brand-primary) 12%, transparent)";
  const arcSoft = dark
    ? "rgba(255,255,255,0.07)"
    : "color-mix(in oklab, var(--brand-primary) 6%, transparent)";

  return (
    <div aria-hidden className={cn("mesh-base", MESH_CLASS[v])}>
      <svg
        className="absolute inset-0 h-full w-full opacity-90"
        viewBox="0 0 400 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <circle cx="60" cy="120" r="240" fill="none" stroke={arcStroke} strokeWidth="1" />
        <circle cx="60" cy="120" r="340" fill="none" stroke={arcSoft} strokeWidth="1" />
        <circle cx="360" cy="700" r="280" fill="none" stroke={arcSoft} strokeWidth="1" />
        <path d="M -20 640 Q 200 540 420 660" fill="none" stroke={arcSoft} strokeWidth="30" strokeLinecap="round" />
      </svg>
    </div>
  );
}
