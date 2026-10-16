# Full-app UX copy overhaul

Owner-authorized scope: the full-app French/Arabic subtext and UX writing brief supplied on 16 October 2026. Implementation branch: `feat/full-app-ux-copy`. One implementation writer; six independent, read-only specialist lanes. No database writes, backend changes, merge or deployment.

## Preserve

- BotolaGO's identity, existing screen structure, navigation, Changa/Manrope/Noto Sans Arabic typography, design tokens, Arabic leading, logical alignment and minimum control targets.
- Every existing action and business rule: squad and budget limits, captain fallback, transfer deductions, chip behavior, scoring versions and correction windows, deadlines, rankings, eligibility, payment amounts/activation conditions, access duration, privacy and deletion consequences.
- Useful distinctions between unavailable data, a failed load, an empty result, provisional results, guest drafts and saved account data. Keep factual source credits and accessibility descriptions.

## Specific improvements

- Remove subtitles and paragraphs that repeat their heading or the immediately adjacent controls; remove their associated wrapper/margin rather than render empty text.
- Replace unsupported speed, delivery and permanent-entitlement promises with the behavior implemented by the current consumer. In particular: Fantasy points appear on publication; card styles do not affect ratings; a WhatsApp link inserts the code but the user must attach the receipt.
- Shorten supporting prose around Fantasy, profile/authentication, Prospects, Manager Cards, Pronostics, prizes and Plus while retaining functional instructions.
- Use consistent football terminology in French and natural Arabic: transfers versus substitutions, ratings versus points, recent form versus availability, and point deductions versus payments. Avoid implementation terms such as cloud and assurance-level identifiers in end-user text.
- Keep statistical scope and units. Where meaningful explanatory text wraps, allow readable wrapping rather than conceal it through truncation.

## Inspection baseline

Read `AGENTS.md`, `CLAUDE.md`, `PRODUCT.md`, the design system and current consumers before implementation. Inventoried 98 TSX route definitions, including layout/redirect, development and staff routes; all 3,258 French/Arabic translation-key pairs indexed. Independent source ledgers classify supporting-copy candidates and preserve rules/security/payment details.

Current rendered inspection uses this checkout on `http://127.0.0.1:4173`, development mock services and synthetic local browser sessions. It does not establish production feature availability. Correct-language Home and Matches captures at 390×844 and 1440×1000 are in `/tmp/botolago-screens/verified`; the remaining route/state baseline is being captured before interface edits. Initial dependency-error overlays and French first-paint frames under Arabic filenames were rejected and are not evidence. Screens requiring staff MFA, valid callbacks/tokens or unavailable records will be reported as blocked or source-only.

## Acceptance criteria

- Every discovered route has a coverage row that distinguishes rendered content, rendered gate/empty/error, redirect, development fixture and source-only/unreachable states. Screenshots and evidence limitations are explicit.
- The before/after audit links changed key pairs to source consumers, identifies KEEP/REWRITE/SHORTEN/REMOVE/REPOSITION, and records the reason. Removed text has no empty paragraph or orphaned spacing.
- Compare affected views using the same fixture, language, viewport and theme. Check mobile and desktop in French and Arabic/RTL, plus narrow-phone spot checks. Inspect rendered element/text bounds as well as screenshots; root scroll width alone cannot detect clipping.
- No new text overlap, hidden instructions, clipped controls or loss of meaningful accessibility descriptions. Do not claim full contrast/accessibility compliance from screenshots alone.
- Run TypeScript, relevant existing component/route/localization/UI tests, localization gate and targeted lint/format checks. Preserve semantic assertions; update tests that explicitly pin the superseded copy.
- An independent reviewer critiques the final diff and actual comparisons; address valid findings and record unresolved limits.
- Deliver the coverage report, bilingual before/after audit, accepted comparisons, validation results and reviewer verdict in a draft pull request. Do not merge or deploy.
