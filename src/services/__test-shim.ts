// of any test file that touches fantasyStateStore / storage.ts helpers.
if (typeof globalThis.window === "undefined") {
  const mem = new Map<string, string>();
  // @ts-expect-error test-only window shim; global type intentionally overridden
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  // @ts-expect-error test-only CustomEvent shim; global type intentionally overridden
  globalThis.CustomEvent = class {
    constructor(_t: string, _o?: any) {}
  };
}
export {};
