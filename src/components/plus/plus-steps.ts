export type PlusStep = 1 | 2 | 3 | 4 | 5;

/** An address's `step` as a screen: anything but 2 to 5 is the first. */
export function clampStep(value: number | undefined): PlusStep {
  return value === 2 || value === 3 || value === 4 || value === 5 ? value : 1;
}

/**
 * The screen an address without a `step` opens: the short paywall. The three-screen story (style,
 * season, Saison) is reached from its « Voir l'aperçu » link, which asks for `step=1`.
 */
export const DEFAULT_PLUS_STEP: PlusStep = 3;

/** The « Payer ma Saison » screen: how to pay by hand and where to send the receipt. */
export const PAY_PLUS_STEP: PlusStep = 5;

/** Where the reader came from, so the paywall's headline can say what they were looking at. */
export const PLUS_CONTEXTS = [
  "season",
  "duel",
  "career",
  "editions",
  "rivals",
  "briefing",
] as const;
export type PlusContext = (typeof PLUS_CONTEXTS)[number];

/** An address's `via` as a context, or nothing for an unknown value. */
export function clampContext(value: unknown): PlusContext | undefined {
  return (PLUS_CONTEXTS as readonly unknown[]).includes(value) ? (value as PlusContext) : undefined;
}
