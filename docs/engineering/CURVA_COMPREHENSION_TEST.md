# Curva comprehension test (facilitator script)

Written 2026-10-15 for audit roadmap item D4 (finding PRO-06). Not run: no
supporter has taken this test yet.

## Purpose

Find out whether supporters understand how Curva relates to the Fantasy game,
before anything is added to it. The audit hypothesis is that a manager may read
the Curva (card) ranking as the Fantasy standings. Nothing measured shows that
yet, and nothing shows it harms play or retention. The test checks three things,
each without hints:

- **(a)** Fantasy points and rank (the competition) against the Manager Card
  rating and the Curva rank (a separate reading of how someone manages).
- **(b)** What a missing or unrated card value means.
- **(c)** What the next action is and its deadline.

Screens involved: `/fantasy` (rank and next deadline), `/curva` (card, "Ce que dit
votre carte", "Cette journée"), `/curva/classement` (views "Ma ligue" and "Tous";
groups "Managers classés" and "Pas encore de note"), `/curva/les-votres`.
Related briefs: `docs/engineering/briefs/MANAGER_CARD_CLARITY_BRIEF.md` and
`CURVA_RANKING_BRIEF.md`.

## Steps

### Before the sessions

1. **Who.** 5 to 8 French-speaking and 5 to 8 Arabic-speaking Botola supporters,
   tested in **separate sessions per language**, never pooled. Include some with no
   Fantasy team and some who play. Nobody who has seen Curva explained before.
2. **Who runs it.** A facilitator fluent in the session's language, plus a note-taker.
   The facilitator never plays the game with the participant and never hints.
3. **What to show.** A build where Curva is live (Curva appears in the bottom bar only
   when it is). Prepare test accounts in these states: no team; a team with 2 of 4 card
   statistics and no rating; a team with a rating and at least one friend in a league.
   Do not change scoring data to get a state. A development server's sample pages
   (`/dev/manager-card-sample`, `/dev/curva-ranking-sample`, invented data, development
   only) may fill a missing state, and the sheet says so.
4. **Setup.** Phone, the participant's own if possible. Write down the build, date,
   language and which account state was shown. Ask consent; record no names or emails,
   only a participant code. Do not show `/curva/plus`.
5. The Arabic prompts below need a native Arabic reader's check before use.

### During each session

Read the prompt, then stay silent. Allow thinking aloud. Never use the screen's own
words first, never confirm or correct, never point. If asked "is that right?", answer
"what do you think?". A hint of any kind makes the task "hinted", which is not a pass.
Do not explain anything until all tasks are done.
Text in square brackets is a note for the facilitator, not read aloud.

| Task                  | French prompt                                                                                                                                      | Arabic prompt                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| T1 (a) the two ranks  | "Montrez-moi le chiffre qui décide de votre place dans la compétition. Puis un autre chiffre qui parle de vous. Que représente-t-il ?"             | "أرني الرقم الذي يحدد مكانك في المنافسة. ثم رقماً آخر يخصّك. ماذا يمثّل؟"           |
| T2 (a) the Curva list | [On the Curva ranking] "Que classe cette liste ? Si quelqu'un est devant vous ici, l'est-il aussi dans le jeu ?"                                   | "ماذا تُرتّب هذه القائمة؟ إذا كان شخص أمامك هنا، فهل هو أمامك في اللعبة أيضاً؟"     |
| T3 (b) missing value  | [Card with 2 of 4 filled] "Cette carte n'a pas de note. Pourquoi ? Que faudrait-il ? Que veulent dire les petits signes à la place des chiffres ?" | "هذه البطاقة بلا تقييم. لماذا؟ ماذا يلزم؟ ماذا تعني العلامات الصغيرة مكان الأرقام؟" |
| T4 (c) next action    | [Ask once from Fantasy, once from Curva] "Que devez-vous faire ensuite, et jusqu'à quand ?"                                                        | "ماذا عليك أن تفعل بعد ذلك، وإلى متى؟"                                              |
| T5 access             | "Allez à votre équipe Fantasy, puis à votre profil."                                                                                               | "اذهب إلى فريقك في فانتازي، ثم إلى ملفك الشخصي."                                    |

Closing question, once: "Y a-t-il quelque chose que vous n'avez pas compris ?"
("هل هناك شيء لم تفهمه؟"). Ask nothing about prices, subscriptions or payment. If a
participant raises a lock, an offer or payment unprompted, write the words down and
move on.

### Success criteria per task (from the audit register, PRO-06)

- **T1** Names Fantasy points and rank as what decides the competition and leagues, and
  the card rating as a separate figure about how the team is managed. Does not say the
  Curva rank sets Fantasy standings or prizes.
- **T2** Says the list orders managers by card rating, and that this is not the Fantasy
  order. In "Tous", understands it covers the leaders of the overall board (the first 100).
- **T3** Says the rating appears when 3 of 4 statistics are filled, and that a missing
  value is "not yet counted", not zero. Does not read "Pas encore de note" as last place.
- **T4** Finds the next deadline as shown, names the action (squad, captain or
  transfers) and the right date and time. Checked against the page by the note-taker.
- **T5** Reaches Fantasy and the profile alone.

## Recording sheet (one per participant)

| Field         | Entry                                                            |
| ------------- | ---------------------------------------------------------------- |
| Code, date    | P-FR-01 or P-AR-01; build; account state shown                   |
| Background    | Fantasy: none / some / regular; device                           |
| T1 to T5      | Pass / Partial / Fail / Hinted, each with the exact words used   |
| Wrong reading | The participant's own wrong explanation, verbatim, if any        |
| Where stuck   | Screen and element, and what they tried first                    |
| Unprompted    | Remarks about prices, locks or prizes, verbatim, not followed up |

## Decision rules

- Tally each language alone. A language with no confusion is not evidence for the other.
- Before the first session the owner fixes the bar for a "pattern". Suggested: the same
  wrong explanation from at least two participants of one language. A single wrong
  answer is a note, not a finding.
- **Only refine where task evidence shows confusion.** Refine the existing explanation
  (labels, reasons, the panel wording) in place. Do not add panels, currencies,
  auctions, paid tiers or progression mechanics. Fantasy points, rules and scoring stay
  as they are.
- Confusion in one language only: look at the wording first, then the structure.
- A failed T5 is a navigation finding. Handle it apart from the explanation work.
- Any change follows `AGENTS.md` "Screen work": written brief, feature branch, French and
  Arabic checks, draft pull request, owner approval.
- No confusion found: change nothing and report "no confusion observed in n sessions".

## What counts as evidence

Completed recording sheets, per-language tallies, the participants' verbatim words, and
screenshots of the screen state shown with the build and date.

## What we will NOT claim

- That supporters in general understand, or misunderstand, Curva: 5 to 8 people per
  language support a qualitative finding only.
- Any effect on retention, conversion or Fantasy play.
- That an absence of confusion proves the screens are clear.
- Any demand for a paid tier or checkout from remarks about locks or offers. Free play
  stays the rule: no purchase, price or paid tier is inferred or added.
- Anything about the card's accuracy; the calculation is not tested here.
