# Rating publication browser evidence

Before: the existing points screen with its unchanged known-rating fixture. After: the same screen with a mixed fixture (one unknown rating, one partial rating, remaining known values). These are local development fixtures, not production manager data.

French and Arabic, 390/1280 pixels, pitch and list. Actual computed animation name: spin normally and none for reduced motion. No page errors or text outside viewport bounds. Numeric zero and missing ratings are independently covered by the API adapter and component tests.

The source-data audit is docs/backend/FANTASY_MATCH_RATING_AUDIT_20261019.md. The production publication rehearsal verified all 20 historical team/gameweek results against independent SQL arithmetic, then rolled back.

Review follow-up: `negative/` covers a failed result request and a successful request with no computed result, in French/Arabic at 390/1280px. Local transport fixtures force the route's cloud branch while keeping the mock squad, then inject a query failure or null result. All eight cases showed the real retry/empty state, zero rating loops, zero false pending accessible labels and no page errors. These are local browser fixtures, not live account sessions. The positive pending screenshots were refreshed after the fix; confirmed pending signals still animate normally and stay static under reduced motion.
