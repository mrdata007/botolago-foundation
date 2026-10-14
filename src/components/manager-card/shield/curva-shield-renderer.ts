/**
 * The entry `active-renderer.ts` loads lazily. A file of its own, named `curva-…`, because a
 * bundler names a chunk after its entry file and `scripts/qa/manager-card-off-bundle-gate.ts`
 * allows the chunks named `curva-*` to hold the Manager Card's code (they are the section's own,
 * reached only by a dynamic import from it).
 */
export { shieldRenderer, ready } from "./index";
