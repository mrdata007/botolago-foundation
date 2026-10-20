# Awaiting-rating popup

Owner correction: keep the ratings boxes compact; show the French/Arabic
waiting message and animated loop in a popup when a pending rating is tapped.

Preserve: earned points, real zeroes, Not rated markers, pending predicates,
all scoring and recovery rules, pitch geometry and existing language choice.

Change: replace the inline waiting words with a compact pending marker.
Pending pitch cards and list rating controls open one shared branded modal
with `En attente des notes` / `في انتظار التقييمات` and the loop inside.
Keep the popup dismissible and restore keyboard focus to its trigger.

Acceptance: no automatic interruption; only pending ratings open the popup.
Use existing UI primitives, 44px touch targets, French/Arabic including RTL,
reduced-motion support, and no nested buttons. Verify pitch/list views on
mobile/desktop, keyboard opening, Escape/close dismissal and focus return.
Capture screenshots and run the relevant existing tests and type checks.
