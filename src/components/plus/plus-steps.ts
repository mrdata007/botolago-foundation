export type PlusStep = 1 | 2 | 3 | 4;

/** An address's `step` as a screen: anything but 2, 3 or 4 is the first. */
export function clampStep(value: number | undefined): PlusStep {
  return value === 2 || value === 3 || value === 4 ? value : 1;
}
