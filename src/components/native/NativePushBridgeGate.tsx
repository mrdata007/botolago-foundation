import { lazy, Suspense, useEffect, useState } from "react";

import { nativePlatform } from "@/lib/native-app";

const NativePushBridge = lazy(() =>
  import("./NativePushBridge").then((module) => ({ default: module.NativePushBridge })),
);

/**
 * Mounts the phone app's push plumbing, and downloads its code, only inside
 * the app. A browser never needed it: the bridge decides the same thing after
 * its first render and then renders nothing, so every visitor was fetching
 * the push code up front for no use. Decided after the first render so the
 * server and the first client render agree.
 */
export function NativePushBridgeGate() {
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(nativePlatform() !== null);
  }, []);
  if (!native) return null;
  return (
    <Suspense fallback={null}>
      <NativePushBridge />
    </Suspense>
  );
}
