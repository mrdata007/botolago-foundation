# Email layout verification

Local browser evidence, 2026-10-19. Three proposed email variants in French/Arabic, at 390px and 1280px. Baseline screenshots use the existing `gameweek_finalized` email; sample scores differ, so compare presentation rather than scores. The after fixtures are fictional and do not represent any manager's real result.

All 12 after checks: actual logo images loaded, expected document direction, no offscreen text/CTA elements and no JavaScript page errors. `browser-checks.json` records link destinations and measurements. Requests to external hosts were blocked; no message was sent and no production data was accessed for these previews.

Readiness, HTML escaping, URL validation, zero/negative totals, optional ranks and all six localized renders are covered by the renderer's focused tests. Full inbox-client compatibility and real deliverability are not established by these screenshots. Live notification integration remains separate; see the sending contract in `docs/backend/FANTASY_POINTS_READY_EMAILS.md`.
