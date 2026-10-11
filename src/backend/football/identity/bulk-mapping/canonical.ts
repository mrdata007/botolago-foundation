import { sha256Hex } from "../../../../../supabase/functions/_shared/canonical-json.ts";

// canonicalJson and sha256Hex live in the Edge-shared folder so the SofaScore
// Fantasy builder can run in the Edge Function and here from one source.
export {
  canonicalJson,
  sha256Hex,
} from "../../../../../supabase/functions/_shared/canonical-json.ts";

/**
 * A UUID derived from a seed (the same seed always gives the same UUID). Used for
 * idempotency keys, so pressing a button twice, or resuming after a closed
 * browser, replays the same database operation instead of starting a second one.
 */
export async function deterministicUuid(seed: string): Promise<string> {
  const h = await sha256Hex(seed);
  const variant = ((Number.parseInt(h.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
