# Independent critical reviewer verdict

**Accepted for review: semantic/editorial changes and the personally inspected final visual evidence pass. No unresolved blocker remains in the implementation reviewed.** This is a review of the copy change, not a claim that every production-only state was visually accessible.

Read AGENTS.md and CLAUDE.md. Reviewed the implementation against dda4bea4, both applied-change ledgers, latest follow-up edits, protected business copy, actual component callsites and existing test contracts. Read-only reviewer: no repository or database edits. I did not execute tests; root owns test verification.

## Findings raised and resolved

1. **P2 — Superseded Prospects edition incorrectly called itself the correction.** The proposal said “Cette édition corrige…” / “تصحح هذه النسخة…” even though PepitesEditionPage renders the text only on `status === "superseded"`, alongside the link to the replacement. Actual correcting editions have a separate notice. Final FR/AR text now correctly states this edition was corrected after publication and the corrected version is authoritative. Verified resolved in source.
2. **P3 — Unnecessary Latin acronym newly inserted into Arabic.** The proposal inserted OVR into `card.onboarding.m8.up.line`, although the original Arabic conveyed the same value without it. Removed; verified resolved.
3. **P3 — Cup sentence advanced a score rather than a team.** Requested “L’équipe au meilleur score…” in place of “Le meilleur score… passe”. Final wording preserves transfer penalties, elimination, exemptions and repeated draws. Verified resolved.
4. **Evidence rejection — stale and mismatched captures.** Earlier `verified/` files still showed original copy; frozen profile also differed in Plus promo state. They are before-inspection evidence only. In the first fresh batch both Arabic register after images actually rendered French/LTR, and the manifest recorded `actualLang: fr`, `dir: ltr` while accepting them. Rejected immediately. Root froze source and visual agent fixed acceptance gating and recaptured. I opened corrected files and confirmed Arabic/RTL. Resolved for the reviewed comparisons.
5. **Evidence correction — viewport scroll position.** Initial AR rules after-viewport omitted the header while the full-page image was correct. Requested reset/assert scrollY=0 and document-relative measurements. Visual agent reports corrected captureVersion2. Full-page images were independently accepted; exact positional measurements remain the visual agent’s evidence, not my own measurement.

6. **P3 — Saved empty state repeated its heading.** Final image initially repeated “Aucun article enregistré” with “Vous n’avez encore rien enregistré.” Agreed with visual reviewer to keep only the concrete bookmark instruction. Root shortened FR/AR and recaptured all four afters. I personally opened final FR/AR mobile/desktop images and confirmed the repetition is gone with clean spacing. Resolved.
7. **Fallback bounds/targets.** Initial standalone rendering exposed pre-existing phone overflow and 40.5px recovery targets. Root added border-box sizing and a 44px target minimum. I opened final phone light/dark and desktop dark screenshots, reviewed actual CSS and all four final manifest cases: phone card 24..366 in a 390px viewport, no offscreen nodes, both actions 44px. Bilingual recovery reads clearly. Resolved.

## Accepted editorial / functional decisions

- Rating copy now says a visual style does not change the sporting rating; it no longer claims ratings never change.
- The ad-free promise lasts for the Saison. Expiry, manual payment/verification, no automatic collection, payment code and receipt attachment remain clear.
- Fantasy guest-draft and unsaved-local/cloud distinctions remain. Pronostics retained guest picks still have a per-match kick-off limit for account import.
- Squad/budget constraints, captain/vice-captain behavior, transfer penalties, chip names, provisional/correctable scoring, deletion timing and private-league privacy boundaries remain.
- Arabic transfers/form/availability terminology, player starts, ratings and chip names improve. Prospects retains the owner-approved name; terminology-only legal edits preserve rules.
- Removing the static rules intro is sound: adjacent cards/values retain the real constraints and scoring table, while the removed text duplicated them and implied only the historical actions scale.
- Player-mapping approval now correctly distinguishes saved approval from separately confirmed execution. Access-revocation prose still separates immediate local denial from requested provider session closure.
- Account notification language/default French and device-interface language remain distinct.

## Actual fresh screenshot review

I opened screenshots in `/tmp/botolago-comparisons`, comparing before/after where listed. Accepted within these rendered mock states:

| Family | Images personally inspected | Assessment |
|---|---|---|
| Register | FR mobile/desktop before+after; corrected AR mobile before+after and desktop after | Removed unsupported speed claim; helper stays useful; fields, consent and social login intact |
| Top players | FR mobile/desktop before+after; AR mobile before+after and desktop after | Selector/player card rise; statistics/actions remain legible |
| Rules | AR mobile before+full-page after; FR mobile/desktop after | Duplicated heading/intro gone; numeric rules, cards and scoring facts preserved |
| Setup step 3 | AR mobile before+after; FR desktop after | Less filler; notification-language/default distinction remains clear |
| Curva card | AR mobile and desktop before+after | Redundant support removed; rating components and tier information retained |
| Plus payment | AR mobile before+after, lower scrolled view, desktop after; FR mobile after | Amount/code/bank/RIB/CashPlus and verification survive; receipt instruction improves |
| Plus offer | AR mobile before+after; FR desktop after | Scoped ad promise, specific CTA, price/end date/single payment retained |
| Briefing | AR mobile before+after; AR desktop after | Reported versus unknown availability is clearer; confirmation elsewhere remains explicit |
| Profile | AR mobile before+after | Account-language distinction retained in fewer lines; matching promo state |
| Guest notifications | FR mobile before+after | Title and account actions suffice without redundant support |
| Saved articles empty state | FR mobile initial+final after; final FR/AR mobile/desktop after | Repeated empty sentence removed; bookmark action retained, clean spacing |
| Fatal fallback | Final 390px light/dark and1440px dark; actual HTML/CSS and four-case manifest | Clear bilingual recovery, in-bounds card and44px actions |

No new clipping or wrapping defect was found in these personally inspected images. Full-page screenshots containing fixed navigation should be read with the corresponding viewport evidence. Sample payment/identity data is not production verification.

## Unresolved criticisms / honest limits

- **Pre-existing desktop Curva layout:** analytics/trophies/rating/tier sections stack in a narrow side column below the card, leaving a large empty opposite region. Present in both screenshots; the copy change does not make this entire layout fully polished.
- **Pre-existing briefing layout:** Arabic desktop deadline/title wraps into a very narrow column next to the countdown; deck retains a large black blank height. Present before the copy change. Captures show the initial deck position, not every horizontal card state.
- Shared unused UI primitives retain English Close/pagination labels. Mounted public reachability was not established here; do not present them as inspected live defects.
- Inaccessible production/provider/admin states must remain explicitly unverified in the coverage report. Source review and tests supplement screenshots; they do not replace them.
- No pending fallback or Saved-state criticism remains; both were corrected and final rendered evidence was personally inspected.

No merge, deployment, entitlement change, backend logic change or production write is authorized by this verdict.
