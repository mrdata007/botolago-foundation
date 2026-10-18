# Rating publication browser evidence

Before: the existing points screen with its unchanged known-rating fixture. After: the same screen with a mixed fixture (one unknown rating, one partial rating, remaining known values). These are local development fixtures, not production manager data.

French and Arabic, 390/1280 pixels, pitch and list. Actual computed animation name: spin normally and none for reduced motion. No page errors or text outside viewport bounds. Numeric zero and missing ratings are independently covered by the API adapter and component tests.

The source-data audit is docs/backend/FANTASY_MATCH_RATING_AUDIT_20261019.md. The production publication rehearsal verified all 20 historical team/gameweek results against independent SQL arithmetic, then rolled back.

Production rollback rehearsal at reviewed migration SHA256 b153f6dd5708ce633e3da5efacd25fc2375321a418c4f93260c44b04cd34f662: three historical publications, 1,982 saved player rows, all 20 owned API reads verified, 1,176 ms for the batch. The existing create-team body hash was preserved. Independent reads confirmed the migration/publications were absent afterward, all historical/identity fingerprints matched, and all six writer switches were restored. No publication was committed by this rehearsal.

The first read implementation expanded source JSON repeatedly and exceeded the rehearsal timeout. The final implementation flattens the immutable revision at publication and serves indexed player rows. This change was measured against real production data, with all effects rolled back.
