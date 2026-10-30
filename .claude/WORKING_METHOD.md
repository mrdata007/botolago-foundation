# Working method

How every task runs in this repository. It sits on top of `AGENTS.md` and
`CLAUDE.md` and never overrides them: where a rule below touches a rule there
(database writes, production, migrations, evidence, screen work, deploying),
the rule there wins.

The idea: the agent does the work, proof decides when it is finished, and the
owner steps in only where a mistake cannot be undone.

## 1. Define "done" before writing code

- Write down what "done" means as checks that can **fail**: a test passes, a
  command exits clean, a page shows X, only certain files changed.
- **Bugs:** first write a test that reproduces the bug and watch it FAIL on
  the current code. Then fix. Then watch the same test PASS. A test that
  already passed before the fix proves nothing.
- Useful checks here: `bun test`, `bun run typecheck`, `bun run lint`,
  `bun run format:check`, `bun run backend:migrations:check`,
  `bun run test:e2e` (Playwright).
- If you cannot say what "done" looks like, stop and ask the owner. Writing
  the check is writing the spec.

## 2. Keep a progress file per task

- One file per task: `docs/progress/<short-task-name>.md`, copied from
  [`docs/progress/_TEMPLATE.md`](../docs/progress/_TEMPLATE.md). One file per
  task, not one shared file, because several lanes run at once here.
- Read it at the start of every session and after every context compaction.
- Update it after every attempt: what you tried, what happened, what you now
  know, the next step.
- Commit after each step that works, so there is always a last good point.
- Never retry anything listed under "Dead ends".

## 3. Never say "should work"

- Banned: "should pass now", "probably fixed", "looks good".
- When reporting done, show the exact command you ran and its real output.
  (`CLAUDE.md` → Evidence has the rules for what counts as measured.)
- Proof, strongest first:
  1. A test, build or script result
  2. What you actually ran, shown in full
  3. A review by a separate subagent that did not write the code
  4. Your own confidence. **This one never counts on its own.**

## 4. When something fails

Write this in the progress file before trying again:

```
FAILED     which check failed
EXPECTED   what should have happened
SAW        what actually happened (file:line if possible)
FENCE      the only files you will touch on the next try
DEAD ENDS  approaches already tried that did not work
```

- **If the same result comes back twice, stop and report.** More attempts will
  not help: something is missing, or the task was framed wrong.
- At most 3 attempts per problem, then stop and report what you found.

## 5. Big tasks: split them

- Break the work into pieces with one input and one result each.
- For every "do A, then B", ask: what breaks if B starts before A finishes?
  If nothing, run them side by side (separate subagents, each with a fresh
  context), within the one-writer rule in `AGENTS.md`.
- If a step should give the same answer every time (sorting, counting,
  merging, cleaning data), write a script for it.
- Check each piece as soon as it is finished, not all at the end.
- Once a piece passes its checks, **do not reopen it**. If another piece
  fails, redo only that one.

## 6. How careful to be depends on how hard it is to undo

| Undo cost                   | Examples                                                                                                                                         | What you do                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **Easy:** revert one commit | docs, tests, one small function, styling                                                                                                         | Go ahead once the checks pass                                               |
| **Messy:** clean up after   | shared code, database structure, auth, Fantasy scoring, payments                                                                                 | Checks pass, then a separate subagent reviews, then the owner sees the diff |
| **No undo**                 | any database write outside local, applying migrations, deploying Edge Functions, sending emails or pushes, publishing in Lovable, spending money | **Stop and ask the owner. Always.** Then follow `AGENTS.md` and `CLAUDE.md` |

You may say which group a change belongs to. What each group allows is fixed
here, and no confidence level changes it.

## 7. Learn from every mistake

When something goes wrong, add **one short rule** to the Lessons list below.
Write the rule, not the story.

- Missing a tool or access → tell the owner what is needed
- Repeated a dead approach → add it to "Dead ends" in the progress file
- Said "done" without proof → add a required check
- Work overlapped or ran in the wrong order → add a rule for how to split it

## Lessons (one line each, newest at the bottom)

-
