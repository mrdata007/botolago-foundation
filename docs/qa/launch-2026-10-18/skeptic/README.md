# Skeptic first-time user

Browser: real Chromium 151.0.7922.173 via Playwright, desktop 1280×900. Root executes browser scripts centrally because per-agent additional-network commands did not receive approval. This agent authored the journey and inspected screenshots; no backend mutations or mock responses.

## Valid baseline

`baseline.json` records the second baseline after correcting the test's language-gate selector. Earlier 01-landing/02-pricing-not-found/03-terms-not-found/04-privacy-not-found images came from an invalid run blocked by the language dialog; they are excluded from findings. Valid screenshots are 01-language-choice, 02-landing-french, 03-pricing-not-found, 04-terms-not-found, 05-privacy-not-found, 06-pre-signup and 07-first-cta.

1. Open `/`, choose Français, press Continuer.
2. Read pricing: hero explicitly says `FANTASY BOTOLA PRO · GRATUIT`; CTA note says `Un compte gratuit est demandé seulement pour l’enregistrer.` No separate pricing page required. The screenshot label `pricing-not-found` describes the automation search, not a product defect.
3. Search the whole landing page and bottom section for terms and privacy links. None are present. Only Fantasy game rules and help links appear.
4. Click `Créer mon équipe`; arrive at `/fantasy/create`, which shows `Sélection de l’effectif` and `Chargement…` after 1.5 seconds. This sample alone does not prove a persistent loading failure.

## Confirmed issue

**Legal disclosures cannot be discovered directly from landing.** The skeptic must enter the login/signup flow to find terms/privacy links; both are clearly present on the signup page before account creation. This is discoverability friction, not a complete pre-signup blocker. Reproduce from a fresh French visit by scrolling to the bottom; the page ends with the team creation CTA and account note. Screenshot `04-terms-not-found.png` inspected at full page, and `05-privacy-not-found.png`; complete link inventory in `baseline.json`. Suggested correction: footer links to existing terms/privacy routes, with clear literal labels. Count: 1 persona, skeptic.

## Limits

Authenticated account creation and saving a Fantasy team are not proven. No signup submission was performed because root prohibits writes to the shared backend. Auth/policy follow-up and post-fix rerun are tracked separately.

## Auth continuation

`auth-baseline.json` and inspected `09-signup.png` confirm terms/privacy are clearly linked next to consent and in the auth footer. Their documents contain substantive French terms and privacy information. The original policy screenshots opened isolated contexts and re-triggered the language dialog; a same-tab detour run is required to prove actual reading and form retention. No account was created.

## Same-tab legal detour baseline

`detour-baseline.json` confirms this first-time skeptic could read both policy documents in the current French tab. Terms disclose free play, 18+ eligibility, independent ownership, rules and disputes; Privacy describes collected data, vendors, retention and rights. No language dialog blocked this valid reading.

**Confirmed shared issue: signup draft lost after reading terms.** Filled `Nom complet` = `QA Skeptic`, `Nom d'utilisateur` = `qa_skeptic_local`, `Adresse e-mail` = `qa-skeptic@example.invalid`. Clicked the visible Terms link, read the document, pressed browser Back. All three values became empty (`14-before-terms.png` versus `16-after-terms-back.png`, inspected). Passwords were never entered and no account was submitted. Privacy was then read successfully. Breaker independently observed the same draft-loss issue through Back/Forward; merge as one issue affecting 2 personas rather than separate form issues.

Earlier transient Fantasy loading and sandbox TLS failures are excluded from product findings. A public match score is the suitable first meaningful success while Fantasy entry is closed; saving an authenticated team remains unproven.


## Post-fix independent verdict: PASS for the exercised public journey

Root executed `scripts/qa/launch-personas/skeptic.cjs` against the local production build with the real public backend. I inspected `after/rerun.json` plus the landing, retained signup and actual score screenshots.

- **Legal discoverability fixed.** `after/01-landing-legal.png` shows `Conditions d’utilisation` and `Politique de confidentialité` below the final CTA. Each link opens its readable French document; browser Back returns to the landing page, allowing the skeptic to read both before entering auth.
- **Draft loss fixed.** The name `QA Skeptic`, username `qa_skeptic_local` and email `qa-skeptic@example.invalid` remain populated after Terms → Back and Privacy → Back. JSON assertions passed; `after/18-after-privacy-back.png` visually confirms retained fields. Consent stays unchecked and both password fields stay empty.
- **First public success reached.** After returning through visible navigation, the user read the actual score `Widad Témara 0, Kawkab Marrakech 1` and opened its match detail at `/matches/e3ee8a8a-f568-4cf2-ae9a-a21c409be5f5`. `after/21-actual-score-detail.png` shows 0–1 live at 60 minutes with scorer and lineups. This is a real public-data result, not a fixture or mocked response.

No unresolved issue from this persona’s audited scope. Real signup, email confirmation and saved Fantasy team remain outside this proof: no shared-backend mutations were made, and Fantasy entries were closed at the time. The browser used `--ignore-certificate-errors` for the sandbox’s proxy CA; this is an execution-environment accommodation, not a product fix.
