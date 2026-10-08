# WP6a screen-work brief: account path, Pépites back pill, deletion line

AGENTS.md "Screen work" rule 3, for the five surfaces this package touches. Written 2026-10-08, before any
interface change, after inspecting each screen in a development server (mock modes, port 4186) at 390 × 844
and 1440 × 900 in French and Arabic. The section brief and plan are
[`../../MANAGER_CARD_SECTION_BRIEF.md`](../../MANAGER_CARD_SECTION_BRIEF.md) and
[`../../MANAGER_CARD_SECTION_PLAN.md`](../../MANAGER_CARD_SECTION_PLAN.md) (section 8.8, M1c, section 4's
deletion row, section 3.4).

## What must be preserved

- **Switch off means identical.** With `useManagerCardLive()` false, `/auth/register`, `/auth/profile-setup`,
  `/profile` (its deletion dialog included), `/pepites` and the Pépites page titles render the same
  markup as before: no new element, request, storage key or console message, and every existing test passes
  unchanged.
- **Register.** The fields, their order, their reserved error line (nothing moves when an error appears),
  the consent row, the buttons, the footer.
- **Profile setup.** The three steps, `canNext`, « Passer », the club rows (crest, city, 4 px club edge),
  the club list's own scroll, the save path (`completeProfile`), the language step.
- **Profile.** The danger zone, the deletion request and its confirmation, the sensitive-action (MFA)
  handling, « ce qui est conservé » and its link, the acknowledgement checkbox.
- **Pépites.** Every `/pepites/*` address, the title band, the chips, the reveal and share buttons, the other
  pages' back pills to `/pepites`.
- **Business rules and identity.** No rating computed in the browser; no count; no « 0 »; « vous »; Arabic
  MSA with isolated digits and no letter-spacing; the 44 px floor; kit tokens only; Changa ≤ 800.

## The specific improvements (live only)

1. **Register** says, under « Nom complet », what the name is for: it is the name shown on the card and in the
   rankings, editable on the next step (`card.onboarding.m1.register.hint`). The hint sits right under the
   field box, before the reserved error line, so the error line does not move.
2. **Profile setup**, when the guest comes from the Fantasy builder (`next` is `/fantasy/create`), steps 1 and
   2 show the card being formed: a 64 px token at the start of a slim row under the step bar, labelled
   « Votre carte », with the name as it is typed. The name field carries the nickname hint
   (`m1.setup.name_hint`) as its own description.
3. **Club colour, only once the server resolves the club** (owner decision 5): the club hint and the
   recolour of the token on a tapped club appear only when the account's own card read already carries a
   club. Otherwise the token keeps its own material and nothing promises a colour. Step 2's « Suivant »
   stays above the 844 px fold.
4. **Profile** adds one line to the deletion request when a manager card exists: the card is deleted with the
   account, and its number (when it has one) is never reissued (`state.deletion` / `state.deletion_noserial`).
5. **Pépites home** gets a « Fantasy » back pill above the « PÉPITES » label, in both title bands the home
   has (a published edition, and last season's ranking before the first edition), because Pépites lives in
   Fantasy while Gradins is live.

## Acceptance criteria

**Visual** (390 × 844 and 1440 × 900, French and Arabic including right to left, light and dark)

- Before/after captures of each surface, `docs/product/manager-card-section/wp6/`.
- Nothing escapes the viewport by element rectangle; the token row and every control ≥ 44 px; text contrast
  ≥ 4.5:1 read from rasterised pixels; the Arabic mirror (token at the right, back pill at the right).
- Profile setup step 2, French and Arabic, live with the row: « Suivant » bottom edge ≤ 844.

**Functional**

- Off: existing tests of the five files unchanged and passing; a render comparison against the base commit
  shows the same markup.
- Live: the hint, the row, the line and the pill render as above; no heading carries a name; the serial
  sentence appears only for a non-null serial and the serial never breaks across lines; the club hint is
  absent without a resolved club.
- No console error or failed request on any capture.
