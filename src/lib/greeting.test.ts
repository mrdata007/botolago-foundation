import { describe, expect, it } from "bun:test";

import { greetingPart } from "./greeting";

/**
 * The home greeting follows the competition's clock (Africa/Casablanca, UTC+1
 * outside Ramadan), not the clock of the machine rendering it. The server
 * renders in UTC and a visitor's browser in its own zone; when each read its
 * own hour, the page hydrated with a different greeting around noon, 18:00
 * and midnight (audit 2026-09-26).
 */

/** The greeting for each instant, computed in a process running in `zone`. */
function inZone(zone: string, instants: string[]): string[] {
  const script = `
    import { greetingPart } from ${JSON.stringify(new URL("./greeting.ts", import.meta.url).pathname)};
    const instants = ${JSON.stringify(instants)};
    process.stdout.write(JSON.stringify(instants.map((at) => greetingPart(new Date(at)))));
  `;
  const proc = Bun.spawnSync(["bun", "-e", script], { env: { ...process.env, TZ: zone } });
  if (!proc.success) throw new Error(`child failed in ${zone}: ${proc.stderr.toString()}`);
  return JSON.parse(proc.stdout.toString()) as string[];
}

// Around each change of greeting in Casablanca on 26 September 2026 (UTC+1).
const INSTANTS = [
  "2026-09-26T10:59:00Z", // 11:59 in Casablanca
  "2026-09-26T11:00:00Z", // 12:00
  "2026-09-26T16:59:00Z", // 17:59
  "2026-09-26T17:00:00Z", // 18:00
  "2026-09-26T22:59:00Z", // 23:59
  "2026-09-26T23:00:00Z", // 00:00 the next day
];
const EXPECTED = ["morning", "afternoon", "afternoon", "evening", "evening", "morning"];

describe("greetingPart", () => {
  it("names the part of the day in Casablanca", () => {
    expect(INSTANTS.map((at) => greetingPart(new Date(at)))).toEqual(EXPECTED);
  });

  it("is the same whatever zone the server or browser runs in", () => {
    for (const zone of ["UTC", "Africa/Casablanca", "America/Los_Angeles", "Asia/Tokyo"]) {
      expect({ zone, parts: inZone(zone, INSTANTS) }).toEqual({ zone, parts: EXPECTED });
    }
  });
});
