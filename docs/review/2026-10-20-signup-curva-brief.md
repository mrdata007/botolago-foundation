# Signup: preferred-team colours and leaving Curva

## Preserve

Keep the three-step profile setup, account verification, saved favourite club,
safe auth return targets, optional Fantasy creation, and Curva's feature gates.
Preserve the shield shape, typography, earned tier metals, paid editions,
ratings, scoring and business rules. Club try-on remains a temporary preview.

## Inspect and improve

Inspected profile setup, its card row, the active shield renderer, Curva's
no-team screen and signup return routing. Two independent test agents confirmed:

- The setup preview requires an existing server card with a club, although a new
  account has no card query. Selecting a favourite cannot colour its preview.
- The shield token ignores club colours; a base shield's face stays graphite
  even when its full-size crest changes. Apply the selected club's colour to
  the base face consistently in the token, full card and share art. Unselected
  cards retain graphite; earned tiers and paid finishes retain their materials.
- Signup from Curva returns to the no-team screen. Its only action creates a
  Fantasy team and disappears when creation is unavailable. Add an unconditional
  “Continuer vers l’accueil” / “المتابعة إلى الرئيسية” action to `/`, and mark
  the currently worn preferred club in the try-on row.

This request supersedes the old setup-preview gate recorded as owner decision 5.

## Acceptance

- A newly verified account with no Fantasy team can select, change and clear its
  preferred club; the setup token immediately follows its colour without a card
  read. Finishing setup persists the preference and Curva uses it after reload.
- Base shield faces visibly change between clubs. Labels remain readable;
  invalid colours remain neutral. Tiers and paid editions keep existing styling.
- A clear home action works after trying a club, including when registration is
  closed, creation is unavailable, or the creation action is loading. The
  existing create-team action retains its conditional behaviour.
- Test French and Arabic RTL at phone and desktop sizes, capture before/after
  screenshots, measure rendered boxes and action targets, and run relevant tests
  plus typechecking. Use local mock services; no shared database writes.
- Open a draft pull request for review; do not merge or deploy.
