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
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function readableInk(hex: string): string {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Perceived luminance
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#111111" : "#ffffff";
}

export function getKitForClub(club: Club | undefined, patternOverride?: KitPattern): KitConfig {
  if (!club) {
    return { pattern: "solid", primary: "#1a3a7a", secondary: "#ffffff", ink: "#ffffff" };
  }
  const base = OVERRIDES[club.id];
  const primary = base?.primary ?? club.primaryColor;
  const secondary = base?.secondary ?? club.secondaryColor ?? shade(primary, primary.length ? -60 : 0);
  const ink = base?.ink ?? readableInk(primary);
  const pattern = patternOverride ?? base?.pattern ?? "solid";
  return { pattern, primary, secondary, ink };
}
