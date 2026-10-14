/**
 * The card's faces: the autograph's two (declared by `shield.css`, so they are fetched only when a
 * card is drawn and never with the section off) and the app's Changa and Manrope for the rating,
 * the words and the serial. `ready()` loads them within `timeoutMs` and never rejects;
 * `active-renderer.ts` waits for it before it hands the renderer over, so the first card is fitted
 * and drawn with the right faces (the autograph's fit measures the real face once it has loaded).
 */
const SAMPLE = "AaBbKkMmSsRr 0123456789 —·# ابتثجحخدذرزسشصضطظعغفقكلمنهوي";
const SPECS = [
  '400 100px "Mr Dafoe"',
  '700 100px "Aref Ruqaa"',
  '800 40px "Changa"',
  '700 30px "Manrope"',
] as const;

let loading: Promise<void> | null = null;

export function ready(timeoutMs = 1500): Promise<void> {
  if (loading) return loading;
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve();
  const load = Promise.all(SPECS.map((spec) => document.fonts.load(spec, SAMPLE).catch(() => [])))
    .then(() => undefined)
    .catch(() => undefined);
  const wait = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  loading = Promise.race([load, wait]);
  return loading;
}
