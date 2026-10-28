# Brief: Fantasy FAQ on `/jouer` (SEO brief 3.5, task 12)

## Page chosen

`/jouer`, the public Fantasy landing page. It already carries a five-question
FAQ section, a title naming "Fantasy Botola Pro", and is the page shared with
new visitors, so it is the natural target for "botola fantasy" and "fantasy
botola pro". `/fantasy/help` is an account help centre (sign-in, history,
chips) behind a Fantasy frame, with no crawl intent, and `/fantasy/rules` is the
rulebook: both stay as the places the FAQ links to.

## Preserved

- Hero, demonstration pitch, steps, reasons, prizes aside, final invitation.
- The existing FAQ markup (native `<details>`), its five questions and answers.
- Every rule and figure: the answers restate `fantasy.rules.*`,
  `fpl.help.a.*`, `prizes.*` and `SQUAD_RULES`; nothing is new.
- Fantasy rules, scoring, lifecycle and the brand are untouched.

## Improvements

- FAQ grows from 5 to 10 questions: what it is, how to create a team, budget
  and squad, transfers, prizes (only while `PRIZES_ENABLED`), added to free,
  points, deadline, late join and account.
- `FAQPage` JSON-LD in `head()`, built from the same French dictionary entries
  the page renders.
- `<title>` and description name "Botola Fantasy" and "Fantasy Botola Pro".

## Acceptance

- Server HTML of `/jouer` carries every question and answer (French) and one
  `FAQPage` script whose text equals the visible text.
- Arabic has every new key; RTL layout shows the FAQ with no overflow at 390 px
  and 1280 px.
- Title at most about 60 characters, description at most about 155.
- No "officiel", no AI notice.
- `tsc`, eslint, prettier and the landing, SSR and dictionary tests pass.
