import { expect, test } from "bun:test";
import { loadAdSense, requestAd } from "./adsense";

test("loads one asynchronous library and requests each eligible ad node once", async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalCapacitor = Object.getOwnPropertyDescriptor(globalThis, "Capacitor");
  const inserted: Array<Record<string, unknown>> = [];
  const queue: object[] = [];
  try {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => ({}),
        head: { appendChild: (script: Record<string, unknown>) => inserted.push(script) },
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { adsbygoogle: queue },
    });
    const a = loadAdSense("ca-pub-1234567890123456");
    const b = loadAdSense("ca-pub-1234567890123456");
    expect(a).toBe(b);
    expect(inserted.length).toBe(1);
    expect(inserted[0].async).toBe(true);
    expect(inserted[0].crossOrigin).toBe("anonymous");
    (inserted[0].onload as () => void)();
    await Promise.all([a, b]);
    const node = { isConnected: true, offsetWidth: 0, dataset: {} } as unknown as HTMLElement;
    requestAd(node);
    expect(queue.length).toBe(0);
    Object.assign(node, { offsetWidth: 300 });
    requestAd(node);
    requestAd(node);
    expect(queue.length).toBe(1);
    requestAd({ isConnected: false, offsetWidth: 300, dataset: {} } as unknown as HTMLElement);
    expect(queue.length).toBe(1);
    Object.defineProperty(globalThis, "Capacitor", {
      configurable: true,
      value: { isNativePlatform: () => true, getPlatform: () => "android" },
    });
    requestAd({ isConnected: true, offsetWidth: 300, dataset: {} } as unknown as HTMLElement);
    expect(queue.length).toBe(1);
    await expect(loadAdSense("ca-pub-1234567890123456")).rejects.toThrow("native app");
  } finally {
    for (const [name, descriptor] of [
      ["document", originalDocument],
      ["window", originalWindow],
      ["Capacitor", originalCapacitor],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
