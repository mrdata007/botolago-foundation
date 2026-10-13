# Owner decisions on the Fantasy scoring audit (2026-10-13)

These decisions answer the questions in `REPORT.md` §8 (P1–P6).

- **Recorded:** 2026-10-13, from the owner's reply in the audit session.
- **Status:** approved direction. Nothing is implemented, deployed or published yet.
- **Changes the published rules?** P6 is a new rule and must be published before it applies.
  P4 changes when a clean sheet is awarded. P1, P2, P3 and P5 change timing and display, not
  point values.

## P1. The next gameweek opens on schedule

**Decision:** open the next gameweek on its normal schedule. The previous gameweek stays
**"settling"** and its points keep updating independently.

**What this means in the system:**

- The next gameweek opens once the previous **deadline** has passed and its squad steps are
  done:
  - price changes, which come from transfers;
  - free-transfer rollover;
  - Free Hit squad restore.
- It no longer waits for the previous week's points to be final. Today it does
  (`20261009091728_fantasy_durable_progression.sql:197-203`).
- The previous week's points, rankings, prizes and notifications finish on their own when it
  finalizes.
- Deadlines and lineup snapshots are unchanged.
- **Season ranking:** it includes the settling week's provisional points and is labelled
  provisional until that week is final.

**To confirm in code before building:** the free-transfer rollover and Free Hit restore must
not read points. Prices are already confirmed not to.

## P2. Confirmed points publish; only the uncertain item waits

**Decision:** publish confirmed points. Mark only the affected scoring item as pending, not
the player's other points and not the whole match.

**What this means:**

- **Pending is tracked per category.** The categories are appearance, goal, assist, clean
  sheet, goals conceded, saves, penalty save, penalty miss, yellow, red, second-yellow
  dismissal and own goal. The scorer already works this way
  (`src/backend/fantasy/adaptive-scoring.ts:36-83`).
- **A match is never held for one player.** The match is recorded, the doubtful fields are
  marked unknown for the players concerned, and everything else counts.
- **Two cases still widen, because the facts are shared:**
  - **A goal whose scorer cannot be identified.** That team's goal facts, and the other
    team's goals-conceded and clean-sheet facts, wait. Other categories still count.
  - **A player whose participation is unknown.** His appearance waits. In lineups that hold
    him:
    - no automatic substitution happens;
    - the vice-captain is not promoted.

    This matches today's protection
    (`fantasy-lifecycle-runner.ts:269-277`; `20260927140000:255-262`).

## P3. Main points shown as provisional before the 12-hour lock

**Decision:** show goals, cards, minutes and clean sheets as provisional before the lock, and
say clearly that they can change during that window. Unresolved items stay visibly pending.

**What this means:**

- The core categories publish as provisional right after the match.
- Assists, saves, penalty saves and penalty misses depend on the full/simple mode, so they
  stay pending until the lock.
- **The app shows:**
  - the label "provisoire — peut encore changer" / "مبدئية — قد تتغير";
  - pending items as "en attente" / "قيد الانتظار", **never 0**;
  - totals marked provisional.
- **Rankings** are marked provisional.
- The mode lock rule itself is unchanged.

## P4. Clean sheet when the minutes conflict

**Decision:** if contradictory minutes affect eligibility, leave the clean sheet pending.
Never award it on one conflicting field. If both versions establish eligibility, the
discrepancy does not block the award.

**The rule:**

1. Build the player's time on the pitch two ways:
   - from the substitution and sending-off times;
   - from SofaScore's `minutesPlayed`.
2. Work out clean-sheet eligibility under each version: at least 60 minutes and no goal
   conceded while he was on the pitch.
3. Compare the two results:

   | Both versions say | Result                     |
   | ----------------- | -------------------------- |
   | eligible          | award the clean sheet      |
   | not eligible      | no clean sheet (confirmed) |
   | they disagree     | clean sheet **pending**    |

**This fixes** the reproduced defect, where a player was replaced at 46', `minutesPlayed` said
70, and he got a clean sheet although his team conceded at 48'.

**Still open:** see question Q1.

## P5. Own goals and second yellows

**Decisions:**

- **Own goals:** use SofaScore's explicit own-goal events.
- **Second yellow:** handle it for the affected player only, without blocking anyone else.
- **Apply the published card deductions consistently, and never count the same sending-off
  twice.**

**What the published rule says** (`docs/backend/FANTASY_RULES_V1.md:47-49`):

| Card                               | Points |
| ---------------------------------- | ------ |
| Yellow                             | −1     |
| Direct red                         | −3     |
| Second-yellow dismissal, **total** | −3     |

**What this means:**

- **A player with a second-yellow sending-off is recorded as one second-yellow dismissal
  (−3 in total).** His earlier yellow is not counted again, whether or not SofaScore also
  lists it. The database already refuses a row carrying both
  (`20261003180000:130-132`, `adaptive_disciplinary_overlap_review_required`).
- **A yellow followed by a direct red stays −1 and −3**, as the published table implies.
- **Own goals:** the event `goal/ownGoal` is read as an own goal by the named player. It
  counts for the other team's score.
  - It is **−2** for the scorer (published table, `FANTASY_RULES_V1.md:50`).
  - It also counts as a goal conceded by his own team.
  - If the event names no player, or the goals still do not add up to the final score, only
    the affected goal facts wait (P2).
- **Contradictions wait, for that player's card items only.** For example: two plain yellows
  for one player and no sending-off event.

## P6. Fallback when evidence never arrives

**This is a new rule.** It must be approved in final wording and published to managers
(rules page, French and Arabic) before it applies to any gameweek.

**Owner's recommended rule:**

1. **At the 12-hour lock:** confirmed scoring items lock. Unresolved items are flagged for
   review.
2. **A published review deadline** applies to those items.
3. **If evidence has still not arrived by the deadline,** the item is finalized using
   verified evidence only. Nothing is invented: no bonus and no deduction.
4. **Every item not awarded is explained** to the managers it affects, for example
   "Clean sheet not awarded: playing time could not be verified."
5. **The rule states whether later corrections are allowed.**

**Needed to make this concrete:** see questions Q2–Q4.

## Open questions

**Q1. Do the 60-minute appearance points and the goals-conceded deduction follow the same
"both versions" rule as the clean sheet?**

- **Background:** the 2026-10-13 decision made `minutesPlayed` final for minutes.
- **Recommendation: yes,** for consistency.
  - If both versions are on the same side of 60, award the agreed appearance points. If they
    straddle 60, the appearance item waits.
  - The goals-conceded deduction is confirmed only when both versions give the same count.

**Q2. How long is the review deadline?**

- **Recommendation:** 72 hours after the 12-hour lock, and always before the gameweek's
  finalization run. This matches the existing 72-hour correction habit.

**Q3. What happens if a player's participation itself is still unknown at the deadline?**

- **Background:** "verified evidence only" would mean no verified appearance. Under the normal
  rules that triggers an automatic substitution or a vice-captain promotion, which changes
  other items of that manager's score.
- **Recommendation:** treat the player as not having a verified appearance, and apply the
  normal automatic-substitution and captaincy rules. This is the same as any player who did
  not play.
- **The explanation shown to the manager:** "Participation could not be verified."

**Q4. Are later corrections allowed?**

- **Recommendation:** yes, within the 72-hour correction window after finalization that is
  already published (`FANTASY_RULES_V1.md:93-94`). Corrections can raise or lower points.
- After that window closes, results are final.

## Answers to the open questions (owner, 2026-10-13)

- **Q1:** yes. The 60-minute appearance step and the goals-conceded deduction follow the same
  "both versions must agree" rule. When the two minute figures straddle 60, the player keeps
  the agreed appearance point and only the extra point waits.
- **Q2:** 72 hours after the 12-hour lock.
- **Q3:** a player whose participation is still unknown at the review deadline is treated as
  not having played. The normal automatic-substitution and captaincy rules apply, and managers
  are told "participation could not be verified".
- **Q4:** no answer was needed. The published 72-hour post-finalization correction window
  applies (`FANTASY_RULES_V1.md:93-94`).
- **Build order:** first, the set-based points save and per-item pending handling, on a new
  branch with a draft pull request. Nothing is deployed to production.
