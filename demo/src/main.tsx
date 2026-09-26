import "./demo.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { markSplashDone } from "@/lib/launch-sequence";

import { App } from "./App";

// The product holds some arrival notices until its launch splash has gone.
// The demo opens on the welcome screen with no splash, so nothing waits.
markSplashDone();

try {
  // French unless the presenter or the visitor chose Arabic before.
  if (!window.localStorage.getItem("botolago.language")) {
    window.localStorage.setItem("botolago.language", "fr");
  }
} catch {
  // Storage blocked: the provider falls back to French on its own.
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
