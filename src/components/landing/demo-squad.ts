import { inkOn, type KitConfig } from "@/lib/kits";

/**
 * The demonstration XI the landing page's pitch holds (`DemoPitch`): a
 * position and a shirt number per plate, generic colourways — no player, no
 * club, no price and no points.
 */

export type DemoPosition = "gk" | "def" | "mid" | "fwd";

export interface DemoSlot {
  id: string;
  position: DemoPosition;
  number: number;
  kit: number;
}

/** Five generic colourways, not modelled on any club's kit. */
export const DEMO_KITS: KitConfig[] = [
  { pattern: "solid", primary: "#f2b705", secondary: "#1b1b1b", ink: inkOn("#f2b705") },
  { pattern: "stripes-vertical", primary: "#ffffff", secondary: "#1d4ed8", ink: inkOn("#ffffff") },
  { pattern: "solid", primary: "#b91c1c", secondary: "#ffffff", ink: inkOn("#b91c1c") },
  { pattern: "bands-horizontal", primary: "#15803d", secondary: "#ffffff", ink: inkOn("#15803d") },
  { pattern: "central-stripe", primary: "#1e3a8a", secondary: "#f97316", ink: inkOn("#1e3a8a") },
];

/** A 4-3-3, goalkeeper first, as `UiPitchSurface` lays rows out. */
export const DEMO_ROWS: DemoSlot[][] = [
  [{ id: "gk1", position: "gk", number: 1, kit: 0 }],
  [
    { id: "d2", position: "def", number: 2, kit: 1 },
    { id: "d4", position: "def", number: 4, kit: 2 },
    { id: "d5", position: "def", number: 5, kit: 3 },
    { id: "d3", position: "def", number: 3, kit: 4 },
  ],
  [
    { id: "m8", position: "mid", number: 8, kit: 3 },
    { id: "m6", position: "mid", number: 6, kit: 1 },
    { id: "m10", position: "mid", number: 10, kit: 2 },
  ],
  [
    { id: "f7", position: "fwd", number: 7, kit: 4 },
    { id: "f9", position: "fwd", number: 9, kit: 2 },
    { id: "f11", position: "fwd", number: 11, kit: 1 },
  ],
];

export const DEMO_DEFAULT_CAPTAIN = "f9";
