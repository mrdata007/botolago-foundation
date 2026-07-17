import { useRouterState } from "@tanstack/react-router";

export type BackgroundVariant =
  | "home"
  | "news"
  | "fantasy"
  | "matches"
  | "profile"
  | "auth";

export function resolveVariant(pathname: string): BackgroundVariant {
  if (pathname.startsWith("/fantasy")) return "fantasy";
  if (pathname.startsWith("/news")) return "news";
  if (pathname.startsWith("/matches")) return "matches";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/welcome") || pathname.startsWith("/auth")) return "auth";
  return "home";
}

// Per-variant tint layers. Base app color stays light so editorial content and
// dense tables remain readable; each variant adds restrained radial washes
// and a section accent. `auth` is the exception: full-bleed dark gradient.
const VARIANTS: Record<
  BackgroundVariant,
  { base: string; accents: { style: React.CSSProperties }[]; dark?: boolean }
> = {
  home: {
    base:
      "radial-gradient(1200px 600px at 100% -10%, oklch(0.94 0.03 250) 0%, transparent 60%), radial-gradient(900px 500px at -10% 110%, oklch(0.93 0.04 240) 0%, transparent 55%), var(--app-bg)",
    accents: [
      { style: { top: "-8rem", insetInlineEnd: "-8rem", width: "24rem", height: "24rem", background: "color-mix(in oklab, var(--brand-accent) 22%, transparent)", filter: "blur(80px)", borderRadius: "9999px" } },
      { style: { bottom: "-10rem", insetInlineStart: "-6rem", width: "24rem", height: "24rem", background: "color-mix(in oklab, var(--brand-primary) 22%, transparent)", filter: "blur(80px)", borderRadius: "9999px" } },
    ],
  },
  news: {
    base:
      "radial-gradient(1100px 550px at 100% 0%, oklch(0.90 0.04 258) 0%, transparent 55%), radial-gradient(900px 500px at 0% 100%, oklch(0.88 0.05 250) 0%, transparent 55%), var(--app-bg)",
    accents: [
      { style: { top: "-6rem", insetInlineStart: "-8rem", width: "26rem", height: "26rem", background: "color-mix(in oklab, var(--brand-primary) 28%, transparent)", filter: "blur(90px)", borderRadius: "9999px" } },
    ],
  },
  fantasy: {
    base:
      "radial-gradient(1200px 600px at 100% -10%, oklch(0.93 0.06 220) 0%, transparent 60%), radial-gradient(900px 500px at -10% 110%, oklch(0.94 0.05 200) 0%, transparent 55%), var(--app-bg)",
    accents: [
      { style: { top: "-8rem", insetInlineEnd: "-6rem", width: "26rem", height: "26rem", background: "color-mix(in oklab, oklch(0.72 0.16 210) 30%, transparent)", filter: "blur(90px)", borderRadius: "9999px" } },
      { style: { bottom: "-10rem", insetInlineStart: "-8rem", width: "22rem", height: "22rem", background: "color-mix(in oklab, oklch(0.68 0.14 160) 18%, transparent)", filter: "blur(90px)", borderRadius: "9999px" } },
    ],
  },
  matches: {
    base:
      "radial-gradient(1200px 600px at 100% -10%, oklch(0.93 0.04 240) 0%, transparent 60%), radial-gradient(900px 500px at -10% 110%, oklch(0.94 0.05 165) 0%, transparent 55%), var(--app-bg)",
    accents: [
      { style: { top: "-8rem", insetInlineEnd: "-8rem", width: "24rem", height: "24rem", background: "color-mix(in oklab, var(--brand-primary) 24%, transparent)", filter: "blur(90px)", borderRadius: "9999px" } },
      { style: { bottom: "-10rem", insetInlineStart: "-6rem", width: "22rem", height: "22rem", background: "color-mix(in oklab, oklch(0.68 0.14 155) 20%, transparent)", filter: "blur(90px)", borderRadius: "9999px" } },
    ],
  },
  profile: {
    base:
      "radial-gradient(1100px 550px at 100% 0%, oklch(0.93 0.04 265) 0%, transparent 55%), radial-gradient(900px 500px at 0% 110%, oklch(0.93 0.05 285) 0%, transparent 55%), var(--app-bg)",
    accents: [
      { style: { top: "-6rem", insetInlineEnd: "-6rem", width: "24rem", height: "24rem", background: "color-mix(in oklab, oklch(0.55 0.14 285) 22%, transparent)", filter: "blur(90px)", borderRadius: "9999px" } },
    ],
  },
  auth: {
    dark: true,
    base:
      "linear-gradient(160deg, oklch(0.20 0.08 262) 0%, oklch(0.28 0.10 258) 45%, oklch(0.42 0.16 256) 100%)",
    accents: [
      { style: { top: "-4rem", insetInlineEnd: "-4rem", width: "26rem", height: "26rem", background: "color-mix(in oklab, oklch(0.75 0.15 220) 30%, transparent)", filter: "blur(100px)", borderRadius: "9999px" } },
      { style: { bottom: "-6rem", insetInlineStart: "-6rem", width: "26rem", height: "26rem", background: "color-mix(in oklab, oklch(0.42 0.16 256) 60%, transparent)", filter: "blur(100px)", borderRadius: "9999px" } },
    ],
  },
};

interface Props {
  variant?: BackgroundVariant;
}

export function PageBackground({ variant }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const v = variant ?? resolveVariant(pathname);
  const cfg = VARIANTS[v];

  const arcStroke = cfg.dark ? "rgba(255,255,255,0.10)" : "color-mix(in oklab, var(--brand-primary) 12%, transparent)";
  const arcSoft = cfg.dark ? "rgba(255,255,255,0.06)" : "color-mix(in oklab, var(--brand-primary) 6%, transparent)";

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0" style={{ background: cfg.base }} />
      {cfg.accents.map((a, i) => (
        <div key={i} className="absolute motion-safe:animate-[bgdrift_18s_ease-in-out_infinite] motion-reduce:animate-none" style={a.style} />
      ))}
      <svg
        className="absolute inset-0 h-full w-full"
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
