import { useEffect, useState } from "react";

import {
  nativeImageActions,
  NO_NATIVE_IMAGE_ACTIONS,
  type NativeImageActions,
} from "@/lib/native-share-image";

/**
 * What the running phone app can do with a share picture (save it to the
 * photos, share it as a file), for React.
 *
 * Nothing on the server and on the first client render, then the real answer
 * once mounted, like `useInNativeApp`: the two buttons only ever appear inside
 * an app that has the plugins, so adding them after mount never makes the
 * server HTML and the first client render differ, and hides nothing.
 */
export function useNativeImageActions(): NativeImageActions {
  const [actions, setActions] = useState<NativeImageActions>(NO_NATIVE_IMAGE_ACTIONS);
  useEffect(() => {
    setActions(nativeImageActions());
  }, []);
  return actions;
}
