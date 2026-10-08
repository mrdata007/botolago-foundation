/**
 * `bun --preload` for `serve-built.ts`: the server's clock stands still at one instant, the one
 * `capture-off.mjs` gives the browser, so a countdown, a "kicks off at" time or a stub deadline
 * reads the same in every render of both trees and nothing differs for being a minute apart.
 */
const FIXED = Date.parse("2026-10-08T20:00:00Z");
const RealDate = Date;

class FixedDate extends RealDate {
  constructor(...args: ConstructorParameters<typeof Date>) {
    if (args.length === 0) super(FIXED);
    else super(...(args as [number]));
  }
  static override now(): number {
    return FIXED;
  }
}

(globalThis as { Date: DateConstructor }).Date = FixedDate as unknown as DateConstructor;
