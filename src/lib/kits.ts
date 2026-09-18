import type { Club } from "@/types/domain";
import type { KitPattern } from "@/types/fantasy";

export interface KitConfig {
  pattern: KitPattern;
  primary: string;
  secondary: string;
  /** Text/number color that contrasts against `primary`. */
  ink: string;
}

/**
 * Deterministic per-club kit configuration. Keeps club → visual jersey
 * mapping outside JSX so real Botola kit assets can replace this later
 * (via FantasyPlayer.jerseyImageUrl) without touching UI code.
 */
const OVERRIDES: Record<string, Partial<KitConfig>> = {
  war: { pattern: "solid", primary: "#c8102e", secondary: "#ffffff", ink: "#ffffff" },
  rca: { pattern: "solid", primary: "#0a8f3a", secondary: "#ffffff", ink: "#ffffff" },
  asfar: { pattern: "central-stripe", primary: "#1a3a7a", secondary: "#c8102e", ink: "#ffffff" },
  fus: { pattern: "stripes-vertical", primary: "#f28e00", secondary: "#111111", ink: "#111111" },
  rsb: { pattern: "central-stripe", primary: "#e63946", secondary: "#ffffff", ink: "#ffffff" },
  mat: { pattern: "bands-horizontal", primary: "#c00000", secondary: "#ffffff", ink: "#ffffff" },
  hus: { pattern: "two-tone-sleeves", primary: "#e63900", secondary: "#111111", ink: "#ffffff" },
  moas: { pattern: "stripes-vertical", primary: "#1e88e5", secondary: "#ffffff", ink: "#ffffff" },
};

/** Derive a slightly darker or lighter tone from a hex. */
function shade(hex: string, amount: number): string {
  const m = hex.replace("#", "");
  const n = parseInt(
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m,
    16,
  );
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function readableInk(hex: string): string {
  const m = hex.replace("#", "");
  const n = parseInt(
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m,
    16,
  );
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Perceived luminance
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#111111" : "#ffffff";
}

/**
 * Botola Pro club colours keyed by a lowercase fragment of the club name.
 * Used when the football catalog carries no colour for a club so every
 * squad renders in recognisable kits instead of one generic shirt.
 */
const BOTOLA_KITS: Array<[string, Partial<KitConfig>]> = [
  ["wydad", { pattern: "solid", primary: "#c8102e", secondary: "#ffffff", ink: "#ffffff" }],
  ["wca", { pattern: "solid", primary: "#c8102e", secondary: "#ffffff", ink: "#ffffff" }],
  ["raja", { pattern: "solid", primary: "#0a8f3a", secondary: "#ffffff", ink: "#ffffff" }],
  [
    "far rabat",
    { pattern: "central-stripe", primary: "#111111", secondary: "#c8102e", ink: "#ffffff" },
  ],
  [
    "fus",
    { pattern: "stripes-vertical", primary: "#f28e00", secondary: "#111111", ink: "#111111" },
  ],
  [
    "berkane",
    { pattern: "two-tone-sleeves", primary: "#f26522", secondary: "#111111", ink: "#ffffff" },
  ],
  [
    "maghreb",
    { pattern: "stripes-vertical", primary: "#ffd400", secondary: "#111111", ink: "#111111" },
  ],
  [
    "hassania",
    { pattern: "stripes-vertical", primary: "#e63900", secondary: "#ffffff", ink: "#ffffff" },
  ],
  ["tanger", { pattern: "solid", primary: "#1e5bb8", secondary: "#ffffff", ink: "#ffffff" }],
  ["difa", { pattern: "central-stripe", primary: "#0a7a3c", secondary: "#c8102e", ink: "#ffffff" }],
  [
    "kawkab",
    { pattern: "bands-horizontal", primary: "#c8102e", secondary: "#ffffff", ink: "#ffffff" },
  ],
  [
    "codm",
    { pattern: "stripes-vertical", primary: "#0a7a3c", secondary: "#ffffff", ink: "#ffffff" },
  ],
  ["uts", { pattern: "solid", primary: "#1e3a7a", secondary: "#ffd400", ink: "#ffffff" }],
  ["zemamra", { pattern: "solid", primary: "#ffffff", secondary: "#0a7a3c", ink: "#111111" }],
  [
    "tétouan",
    { pattern: "bands-horizontal", primary: "#c00000", secondary: "#ffffff", ink: "#ffffff" },
  ],
  [
    "tetouan",
    { pattern: "bands-horizontal", primary: "#c00000", secondary: "#ffffff", ink: "#ffffff" },
  ],
  [
    "tiznit",
    { pattern: "two-tone-sleeves", primary: "#1e5bb8", secondary: "#ffffff", ink: "#ffffff" },
  ],
  [
    "témara",
    { pattern: "central-stripe", primary: "#c8102e", secondary: "#1e3a7a", ink: "#ffffff" },
  ],
  [
    "temara",
    { pattern: "central-stripe", primary: "#c8102e", secondary: "#1e3a7a", ink: "#ffffff" },
  ],
  ["safi", { pattern: "solid", primary: "#7a1f1f", secondary: "#ffffff", ink: "#ffffff" }],
  ["dche", { pattern: "solid", primary: "#f2a900", secondary: "#111111", ink: "#111111" }],
  ["mansour", { pattern: "solid", primary: "#00703c", secondary: "#ffffff", ink: "#ffffff" }],
];

function botolaKit(club: Club): Partial<KitConfig> | undefined {
  const haystack = `${club.name.fr} ${club.shortName.fr} ${club.crestPlaceholder}`.toLowerCase();
  return BOTOLA_KITS.find(([fragment]) => haystack.includes(fragment))?.[1];
}

export function getKitForClub(club: Club | undefined, patternOverride?: KitPattern): KitConfig {
  if (!club) {
    return { pattern: "solid", primary: "#1a3a7a", secondary: "#ffffff", ink: "#ffffff" };
  }
  const base = OVERRIDES[club.id] ?? botolaKit(club);
  const primary = base?.primary ?? club.primaryColor;
  const secondary =
    base?.secondary ?? club.secondaryColor ?? shade(primary, primary.length ? -60 : 0);
  const ink = base?.ink ?? readableInk(primary);
  const pattern = patternOverride ?? base?.pattern ?? "solid";
  return { pattern, primary, secondary, ink };
}
