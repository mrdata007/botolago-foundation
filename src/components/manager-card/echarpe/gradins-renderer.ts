/**
 * The entry `active-renderer.ts` loads lazily. It is a file of its own, named `gradins-renderer`,
 * for one reason: a bundler names a chunk after its entry file, and `scripts/qa/manager-card-off-
 * bundle-gate.ts` allows the chunks named `gradins-*` to hold the Manager Card's code (they are
 * the section's own, reached only by a dynamic import from it). The Écharpe chunk shares modules
 * with the section's chunk (the geometry and the name cleaner the cheap height estimate uses, the
 * card's words for the label), so it imports that chunk, and under any other name the gate would
 * read it as an ordinary page doing so.
 */
export { echarpeRenderer, ready } from "./index";
