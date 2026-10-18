# Advertising readiness

The owner requested placements for future AdSense and direct sponsors on 19 October 2026. This change prepares spaces; it does not enable paid Google ads, claim account approval or guarantee revenue.

## Placement plan

| Configuration key | Placement | Reserved space |
| --- | --- | --- |
| `homeFeed` | Home feed, after the gameweek/match band and before editorial news | Container width, at most 970 px, × 100 px |
| `newsFeed` | Between editorial highlights and the chronological News feed | Container width, at most 970 px, × 100 px |
| `articleEnd` | After the article and its attribution, before related articles | Up to 336 × 250 px; capped to the actual container width |

The spaces use the existing UI kit, French/Arabic copy, logical RTL alignment and light/dark tokens. They sit in the page flow with clear advertising labels and separation from controls. No sticky, overlay, refresh timer or ad inside a game flow is added. The unconfigured version shows an honest partner-space placeholder with the existing public business support address for inquiries.

AdSense stays off by default. BotolaGO+ members and native app webviews are excluded. Authentication and membership must settle before any Google request; an unknown signed-in membership or failed entitlement read does not qualify. The Google library loads once per document, only as a configured unit nears the viewport. Each rendered ad node is requested once. Unfilled/error responses show the same-size fallback. A blocker that silently stalls a request may leave the reserved space blank.

## Direct sponsors

In `src/lib/advertising.ts`, set `ADVERTISING.sponsors[placement]` to a real creative:

```ts
{ image: "/sponsors/brand.webp", href: "https://brand.example", alt: "Brand campaign description" }
```

Use local absolute paths or HTTPS URLs. Provide mobile-friendly artwork. Images use `object-fit: contain`; no crop or distortion. A configured sponsor overrides AdSense for that placement, uses a clear sponsor label and `rel="sponsored noopener noreferrer"`. Remove it to return to Google or the house placeholder. Sponsors and placeholders are also hidden for Plus members.

## Activate Google after approval

1. Register botolago.com with AdSense. Add its public `ca-pub-…` ID to `ADVERTISING.publisherId`. The root page metadata will include Google's verification meta tag even while `enabled` is false. Follow the normal review/publish workflow to expose it.
2. Create three **responsive display** units, one per placement. Copy their numeric IDs into `ADVERTISING.units`. The inline expandable-width / fixed-height sizing follows Google's supported responsive code modifications. Do not add `data-ad-format="auto"` or `data-full-width-responsive` without revisiting the reserved geometry.
3. Copy the actual `pub-…` seller ID into `sellerId`. `/ads.txt` serves the Google DIRECT entry only when that ID matches the publisher; the unconfigured route returns 404 without an invented account. Verify Google's exact supplied entry and adjust the relationship/certification fields if it differs.
4. Complete site approval and review the privacy notice to describe Google advertising. Publish the appropriate certified CMP message in AdSense **Privacy & messaging**, including the EEA/UK/Switzerland requirements for relevant visitors. This component is not a certified CMP. Keep Auto ads off if you want only these deliberate placements.
5. Only after those steps, set `enabled: true`, review, merge and Publish in Lovable. Check the live release ID, all three placements, narrow mobile/tablet/desktop, AdSense's site status and its ads.txt report. Do not click your own ads. Approval, inventory and consent determine actual delivery.

A Google account, genuine IDs, a published CMP and privacy review are account-owner steps. No database migration, production data write or paid service is required for the preparation.

## References

- [Google: supported responsive code modifications](https://support.google.com/adsense/answer/9183363)
- [Google: create display units](https://support.google.com/adsense/answer/9274025)
- [Google: certified CMP requirements](https://support.google.com/adsense/answer/13554116)
