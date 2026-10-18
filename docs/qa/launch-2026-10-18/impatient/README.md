# Impatient first-time user — PASS

Real installed Chromium controlled by Playwright; fresh contexts; 1440 × 900; reduced motion. Root executed the bounded persona script centrally. Target: local repository app at `http://127.0.0.1:4173` with real production public backend reads. Backend responses were not mocked.

## Journey and first success

1. Open `/` and click **Continuer** with French already selected.
2. Skim landing and click its first primary CTA, **Découvrir le jeu**.
3. `/fantasy` clearly explains **Les inscriptions sont fermées pour cette journée** and offers calendar/player alternatives.
4. Click the visible **Matchs** header link and open the first live match.
5. Reach match detail with **Widad Témara 0–1 Kawkab Marrakech**, live clock, and goalscorer Saleh Al Sellami. First public success reached.

| Run | Result | Live clock | Authoritative record | Final screenshot |
| --- | --- | --- | --- | --- |
| Before | PASS; 0 defects before first success | 55′ | `before.json` | `before-06-first-public-match.png` |
| After | PASS; 0 defects before first success | 59′ | `after.json` | `after-06-first-public-match.png` |

Both JSON records and both final screenshots were inspected. No first error, stuck state, or additional confusion was observed along the actual public journey. Closed registration is an explained business state; Fantasy team creation/saving was unavailable for the current round and was not tested.

Initial environment TLS failures and a superseded harness selector miss are excluded from this verdict; `baseline.json` is superseded. Chromium used the environment TLS certificate workaround. No application files, production accounts, or databases were changed by this persona.
