# Instagram-style stories refinement

Current viewer: full portrait centered in a blue sheet, separate bottom headline and white previous/next footer. It reads as a modal rather than a story player. Owner requests Instagram-style stories; existing deploy/publish authorization applies to this continuing refinement.

Preserve BotolaGO identity, exact bilingual headlines, current published images, no AI/provider labels, manual photographer credits, admin publishing, responsive image fallback, dialog focus protection and RTL behavior. No backend changes.

Replace sheet chrome with an immersive dark full-screen phone player and portrait desktop viewer. Keep the whole source image centered over a soft full-bleed background, add slim segmented progress, a compact BotolaGO identity/close/pause row, and a bottom gradient headline overlay. Remove the white footer and visible previous/next pills. Add timed advancement after image load, edge taps, press-and-hold pause, horizontal swipes, swipe-down close, keyboard arrows/Space and explicit accessible controls. Pause while hidden or reading; reduced motion starts paused. Finish the sequence by closing, without looping or leaving Home.

Acceptance: French/Arabic × short/normal mobile/desktop × light/dark evidence; no status-bar overlap, clipping or AI labels; full portrait, legible headline; taps/swipes/hold/keyboard/progress/pause/end/close/focus; slow/broken image behavior and maximum-length manual captions. Relevant local tests plus full CI, draft PR and live verification before completion.
