import { useMomentBlock } from "../moments/use-moment-gate";

/**
 * Keeps the card's heroes and born panel shut while it is mounted (plan 5.3: no hero or panel
 * shows while the import prompt is open). The import prompt mounts it, only while the section is
 * live, for as long as the prompt is on screen; a hero decided before the prompt opened is not
 * taken back. Draws nothing.
 */
export function MomentBlock() {
  useMomentBlock(true);
  return null;
}
