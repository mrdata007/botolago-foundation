import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { useNativeImageActions } from "./use-native-image-actions";

function Probe() {
  const actions = useNativeImageActions();
  return <span>{`save=${actions.save} share=${actions.share}`}</span>;
}

describe("useNativeImageActions", () => {
  test("offers nothing in the server's HTML and the first render, even inside an app with the plugins", () => {
    // The first client render must match the server's, which cannot know
    // where the page will be opened; the buttons come after mount.
    const scope = globalThis as { androidBridge?: unknown; Capacitor?: unknown };
    expect(renderToString(<Probe />)).toBe("<span>save=false share=false</span>");
    scope.androidBridge = {};
    scope.Capacitor = {
      PluginHeaders: [{ name: "Media" }, { name: "Share" }, { name: "Filesystem" }],
    };
    try {
      expect(renderToString(<Probe />)).toBe("<span>save=false share=false</span>");
    } finally {
      delete scope.androidBridge;
      delete scope.Capacitor;
    }
  });
});
