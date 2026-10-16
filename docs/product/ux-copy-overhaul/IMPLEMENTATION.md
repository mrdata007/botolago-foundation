# Implementation summary

The six specialist lanes investigated independently. The root implementation agent was the only repository writer. Initial proposals are preserved under `specialists/`; the final audit and diff supersede them.

## Final changes

- 216 translation-key decisions affect 364 language entries. 121 keys rewritten, 76 shortened and 19 retired; 3,042 inventoried pairs retained. The original inventory has 3,258 pairs and the final dictionaries have 3,239.
- Retired keys include redundant registration/setup/callback, notifications, saved-news, top-player, rules, landing and rated-card text. Sixteen had mounted consumers removed; three were already unused. Removed their spacing, the repeated rules heading, and the rated-card border where appropriate. Forming-card instructions remain.
- Corrected facts in payment receipt instructions, scoring publication, rating styles, season ad access, absence availability and account/device language. Existing deadlines, amounts, deductions, squad limits, thresholds, subscription terms, persistence and security consequences remain.
- Unified French football wording and Arabic singular voice, transfers/substitutions, recent form/availability, ratings/points and chip terminology. Arabic prose uses readable counts instead of mixed-direction fractions where appropriate.
- Applied 75 source-copy replacements in operational/admin presentation and other inline consumers. The staff code file under `src/backend/admin/` changes explanation strings only. Authorization logic, database policies and scoring are untouched.
- Localized the standalone rendering failure page in French and Arabic. Its independent CSS also receives a minimal mobile containment and recovery-target correction, with separate rendered evidence.
- Updated existing tests that intentionally pin replaced copy. The i18n unused-key baseline changes from 244 to 242 based on the actual gate result; it does not relax parity, placeholders or plural checks.

## Preserved and deferred

No database writes, real payment, account deletion, entitlement update, production content change, merge or deployment was performed. No dependency manifest or lockfile changed. No generated route tree changed.

The source audit is broader than the rendered verification. Protected staff operations, actual MFA/provider callbacks and unavailable production states remain source-only. Some long baseline pages were captured but only their top crops were inspected. Existing desktop Curva density, RTL date-rail position and briefing whitespace are recorded rather than claimed fixed. See [coverage](COVERAGE.md), [visual comparisons](VISUAL-COMPARISONS.md), [validation](VALIDATION.md) and [review](INDEPENDENT-REVIEW.md).

## Changed implementation and existing-test files

- [scripts/qa/i18n-gate.ts](../../../scripts/qa/i18n-gate.ts)
- [src/backend/admin/route-access.ts](../../../src/backend/admin/route-access.ts)
- [src/components/admin/player-mappings/PlayerMappingsView.ssr.test.tsx](../../../src/components/admin/player-mappings/PlayerMappingsView.ssr.test.tsx)
- [src/components/admin/player-mappings/copy.ts](../../../src/components/admin/player-mappings/copy.ts)
- [src/components/admin/plus/PlusAdminScreen.tsx](../../../src/components/admin/plus/PlusAdminScreen.tsx)
- [src/components/admin/plus/plus-presentation.ts](../../../src/components/admin/plus/plus-presentation.ts)
- [src/components/admin/sofascore-player-queue/copy.ts](../../../src/components/admin/sofascore-player-queue/copy.ts)
- [src/components/admin/users/user-presentation.test.ts](../../../src/components/admin/users/user-presentation.test.ts)
- [src/components/admin/users/user-presentation.ts](../../../src/components/admin/users/user-presentation.ts)
- [src/components/curva/CurvaCardPage.tsx](../../../src/components/curva/CurvaCardPage.tsx)
- [src/components/curva/TierLadder.tsx](../../../src/components/curva/TierLadder.tsx)
- [src/components/curva/curva.blocks.render.test.tsx](../../../src/components/curva/curva.blocks.render.test.tsx)
- [src/components/landing/LandingLive.test.tsx](../../../src/components/landing/LandingLive.test.tsx)
- [src/components/landing/LandingPage.tsx](../../../src/components/landing/LandingPage.tsx)
- [src/components/manager-card/copy.test.ts](../../../src/components/manager-card/copy.test.ts)
- [src/components/manager-card/copy.ts](../../../src/components/manager-card/copy.ts)
- [src/components/manager-card/moments/moment-text.test.tsx](../../../src/components/manager-card/moments/moment-text.test.tsx)
- [src/components/news/SavedArticlesView.tsx](../../../src/components/news/SavedArticlesView.tsx)
- [src/components/pepites/PepitesEditionPage.tsx](../../../src/components/pepites/PepitesEditionPage.tsx)
- [src/components/pepites/admin/PepitesAdminData.tsx](../../../src/components/pepites/admin/PepitesAdminData.tsx)
- [src/components/pepites/admin/PepitesAdminEditions.tsx](../../../src/components/pepites/admin/PepitesAdminEditions.tsx)
- [src/components/pepites/admin/admin-format.ts](../../../src/components/pepites/admin/admin-format.ts)
- [src/components/plus/plus-briefing.render.test.tsx](../../../src/components/plus/plus-briefing.render.test.tsx)
- [src/components/plus/plus.render.test.tsx](../../../src/components/plus/plus.render.test.tsx)
- [src/content/legal/documents.ts](../../../src/content/legal/documents.ts)
- [src/content/legal/prize-terms.ts](../../../src/content/legal/prize-terms.ts)
- [src/i18n/dictionary-ar.ts](../../../src/i18n/dictionary-ar.ts)
- [src/i18n/dictionary-fr.ts](../../../src/i18n/dictionary-fr.ts)
- [src/i18n/prospects-rename.test.ts](../../../src/i18n/prospects-rename.test.ts)
- [src/lib/delivery-promise.test.ts](../../../src/lib/delivery-promise.test.ts)
- [src/lib/error-page.ts](../../../src/lib/error-page.ts)
- [src/routes/[.]lovable.oauth.consent.tsx](../../../src/routes/[.]lovable.oauth.consent.tsx)
- [src/routes/admin.audit.tsx](../../../src/routes/admin.audit.tsx)
- [src/routes/admin.news.$articleEditionId.tsx](../../../src/routes/admin.news.$articleEditionId.tsx)
- [src/routes/admin.news.new.tsx](../../../src/routes/admin.news.new.tsx)
- [src/routes/admin.plus.tsx](../../../src/routes/admin.plus.tsx)
- [src/routes/admin.security.tsx](../../../src/routes/admin.security.tsx)
- [src/routes/admin.staff.$principalId.tsx](../../../src/routes/admin.staff.$principalId.tsx)
- [src/routes/admin.staff.tsx](../../../src/routes/admin.staff.tsx)
- [src/routes/auth.callback.tsx](../../../src/routes/auth.callback.tsx)
- [src/routes/auth.profile-setup.tsx](../../../src/routes/auth.profile-setup.tsx)
- [src/routes/auth.register.tsx](../../../src/routes/auth.register.tsx)
- [src/routes/auth.update-password.tsx](../../../src/routes/auth.update-password.tsx)
- [src/routes/fantasy.players.$playerId.tsx](../../../src/routes/fantasy.players.$playerId.tsx)
- [src/routes/fantasy.rules.tsx](../../../src/routes/fantasy.rules.tsx)
- [src/routes/fantasy.top-players.tsx](../../../src/routes/fantasy.top-players.tsx)
- [src/routes/news.tsx](../../../src/routes/news.tsx)
- [src/routes/notifications.tsx](../../../src/routes/notifications.tsx)
- [src/routes/pepites.index.tsx](../../../src/routes/pepites.index.tsx)
- [src/routes/profile-language-control.test.ts](../../../src/routes/profile-language-control.test.ts)
- [src/routes/profile.saved.test.ts](../../../src/routes/profile.saved.test.ts)
- [src/routes/profile.security.tsx](../../../src/routes/profile.security.tsx)
