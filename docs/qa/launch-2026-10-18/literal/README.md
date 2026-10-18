# Literal-language first-time user — final verdict

**PASS for the available public first-success journey in French and Arabic.** Both fresh Chromium sessions followed visible UI labels from the landing page through the closed Fantasy explanation to an actual public match score. No blocking language or RTL defect was observed on this journey.

## Verified journey

| Step | French | Arabic |
| --- | --- | --- |
| Choose language | Français → Continuer | العربية → متابعة |
| Follow primary action | Découvrir le jeu | اكتشف اللعبة |
| Understand closed entries | Les inscriptions sont fermées pour cette journée | التسجيل مغلق لهذه الجولة |
| Follow the offered alternative | Calendrier | المباريات |
| Open actual match row | Widad Témara vs Kawkab Marrakech | وداد تمارة ضد الكوكب المراكشي |
| First public success | Live score Widad Témara 0–1 Kawkab Marrakech, 59′ | Same live score and scorer, Arabic labels and mirrored layout |

The closed-state explanation says that team creation will become available with a future open gameweek and offers the player catalog and match calendar immediately. This is the actual backend state, not a simulated failure. No account or saved Fantasy team is claimed.

## Fix verification

The landing footer now exposes both legal links in each language:

- French: `Conditions d'utilisation` → `/terms`; `Politique de confidentialité` → `/privacy`.
- Arabic: `شروط الاستخدام` → `/terms`; `سياسة الخصوصية` → `/privacy`.

Verified their visible text, targets and appearance in the rendered landing screenshot. This persona did not separately open those documents; legal-content verification belongs to the skeptic journey.

Arabic document metadata changes to `lang="ar" dir="rtl"` after the real language choice and remains RTL on the Fantasy hub, calendar and match detail. Visually inspected the Arabic landing, closed-state screen and match detail, plus the French calendar and match detail. Navigation and the score's team association remain readable. Player proper names retain their supplied Latin spellings and do not block these steps.

## Evidence and scope

Authoritative final evidence is in `after/observations.json`, `after/08-match-detail.png`, `after/arabic/observations.json` and `after/arabic/08-match-detail.png`. Each phase contains full-page screenshots and exact UI text for all captured steps.

Sessions use a certificate exception needed by the execution environment. Earlier strict-TLS service errors are excluded from product-defect counts. The real backend supplied the final match data; no service mocks, signup submissions or database writes were used.
