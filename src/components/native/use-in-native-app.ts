import { useEffect, useState } from "react";

import { nativePlatform } from "@/lib/native-app";

/**
 * Whether the page runs inside the phone app, for React.
 *
 * `false` on the server and on the first client render, then the real answer
 * once mounted, so a page is never rendered differently on the server and the
 * first time on the client (the Push switch's `available` works the same way).
 * What the first paint must already get right is CSS's job: see `WebOnly`.
 */
export function useInNativeApp(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(nativePlatform() !== null);
  }, []);
  return native;
}
