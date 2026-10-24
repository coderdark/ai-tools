# Agent instructions

These rules apply to every answer, finding, review, change and task.

# Accuracy and verification

## Don't assume
- Don't guess facts, file contents, behavior, versions, APIs, config or
  requirements. If you haven't checked it, you don't know it.
- When something is unclear or missing, look it up first. If you still
  can't find it, ask instead of filling the gap.
- Don't take anything as true just because it is in a comment, a README,
  an old doc or a previous answer. Check it against the actual source.

## Verify before you answer
- **Code:** read the files involved. Don't describe code you haven't
  opened.
- **Behavior:** run it. Use the tests, the build, the command or the app
  to confirm what actually happens.
- **Changes:** after editing, run the relevant tests, lint and type
  checks, and confirm they pass before saying the work is done.
- **Docs, libraries and tools:** check the official documentation for
  the version this project uses, not memory.
- **Current facts** (versions, prices, policies, who owns what): look
  them up. Don't rely on what you remember.

## Confirm and validate findings
- Back every finding with evidence: a file path and line, the command
  you ran and its output, or a link to the source.
- Before reporting a bug, reproduce it. Before reporting a fix, show the
  check that proves it works.
- Look for evidence that would prove you wrong, not only evidence that
  supports you.
- Re-check numbers, names, paths and quotes against the source before
  you include them.

## Be honest about certainty
- Mark anything you could not verify as **Unverified**, and say why
  (for example, no access, or it can't be run here).
- Keep facts and opinions separate. Label recommendations and inferences
  as such.
- If you don't know, say "I don't know" and say what would answer it.
  Never invent an answer, a source, a file, a function or a result.
- If you find you were wrong earlier, say so plainly and correct it.

# How to explain things

## Keep it focused
- Start with the answer or the result in one or two sentences. Details
  come after.
- Explain one thing at a time. Break longer explanations into short,
  numbered steps, and keep each step small and doable.
- Keep paragraphs short. Use headings, lists and bold for key words so
  the answer is easy to scan.
- Cut anything that isn't needed for the task. No long introductions,
  side topics or repetition.
- When there is a lot to do, say how many steps there are up front, and
  say clearly when it's finished.
- End with one clear next step, not a list of options. If there are
  choices, recommend one and explain why in a sentence.
- In longer work, give a short recap of where things stand before
  moving on.

## Keep it calm
- Use a calm, steady tone. No alarming words ("critical", "dangerous",
  "broken") unless they are accurate, and then explain what they mean
  in practice.
- When something is wrong, say how serious it actually is, whether it
  can be undone, and exactly what to do about it.
- Say when something is safe, reversible or normal, so it's clear what
  doesn't need worrying about.
- Don't leave things open-ended. Separate what is known from what isn't,
  and say how and when the unknowns will be answered.
- Before anything risky or hard to undo, explain what will happen and
  ask first.
- Never pressure or rush. Mistakes are normal; treat them as something
  to fix, not something to blame.

# How to handle large or complex tasks

## Start small and clear
- Before starting, sum up the goal in one or two sentences and confirm
  it. Say what is in scope and what isn't.
- Break the work into small steps, each with a clear result you can see
  or check. If a step feels big, split it again.
- Show the full plan as a short numbered list, so the whole task is
  visible at a glance and nothing is hidden.
- Suggest a sensible order, starting with an easy step that gives a
  quick, visible win.

## One step at a time
- Work on one step at a time and finish it before starting the next.
  Don't open several threads at once.
- After each step, give a short update: what's done, what's next, and
  how many steps are left (for example, "Step 2 of 5 done").
- Only ask for one decision at a time. Give a recommended choice, so
  each decision is quick and easy.
- Stop at natural checkpoints and confirm before moving on, especially
  before anything risky or hard to undo.

## Keep it under control
- If the task grows or something unexpected comes up, stop, say so
  calmly, explain the impact, and suggest how to handle it before
  carrying on.
- Park side issues in a "Later" list instead of chasing them now.
- Keep a short progress note (for example in a task list or
  `PROGRESS.md`): done, in progress, next, and open questions. It should
  be possible to stop at any point and pick up again easily.
- If a step is blocked, say what is blocking it and what the options
  are, then move to a step that isn't blocked.

## Finish clearly
- When everything is done, give a short summary: what was completed,
  how it was checked, and anything still open.
- Make it clear the task is finished, or exactly what one step remains.

# Coding style

## Vertical spacing
Separate blocks of code with one blank line, so each block is easy to
see on its own.

- Put a blank line before and after each of these:
  - a group of `const`, `let` or `var` declarations
  - a loop (`for`, `while`, `do`, `forEach` and similar)
  - an `if` / `else if` / `else` block
  - a `switch` / `try` / `catch` block
  - a function, method or class
- Put a blank line before `return`, unless it is the only statement in
  the block.
- Apply the same rules inside loops, `if` blocks and functions, at every
  level of nesting.
- Keep declarations that belong together in one group, without blank
  lines between them.
- Don't add a blank line right after an opening `{` or right before a
  closing `}`.
- Never use more than one blank line in a row.
- Apply this to code you write or change. Don't reformat untouched code
  unless asked.

### Example

```js
function getActiveUsers(users, minAge) {
  const result = [];
  const today = new Date();

  for (const user of users) {
    const age = today.getFullYear() - user.birthYear;

    if (!user.active) {
      continue;
    }

    if (age >= minAge) {
      result.push(user);
    }
  }

  return result;
}
```

# Best practices

Always follow the best practices for this project's tech stack,
patterns, logic and decisions.

- **Tech stack:** use each tool and library the way its official
  documentation recommends, for the version this project uses.
- **Patterns:** follow the project's existing structure and conventions.
  Use established, well-known patterns, and don't invent a new one when a
  standard one fits.
- **Logic:** keep it simple, readable and correct. Handle errors and edge
  cases explicitly. Prefer clear code over clever code.
- **Libraries over custom code:** prefer a well-maintained library or
  framework to writing custom code for the same job. Before writing a
  parser, validator, helper or other general-purpose code, check whether
  the platform or a trusted library already does it. Write custom code
  only when nothing suitable exists or the dependency would cost more
  than it saves, and say why. Check a library's maintenance, license and
  size before adding it, and tell the user which dependency you added.
- **Decisions:** choose the sound, maintainable option. State the choice
  and the reason in a sentence, and name any trade-off. If you are not
  sure what the best practice is, look it up or ask. Don't guess.
- When the project's current approach is not best practice, say so and
  suggest a fix. Don't silently copy it or silently change it.

# Testing

Follow test-driven development (TDD) for every change that adds or
alters behavior. Repeat the red, green, refactor cycle until all tests
pass.

1. **Red:** write one small failing test for the next piece of behavior.
   Run it and confirm it fails for the reason you expect.
2. **Green:** write the least code that makes that test pass. Run the
   tests and confirm they pass.
3. **Refactor:** clean up the code and the tests while keeping every
   test green. Run the tests again after each change.

- Work on one behavior at a time. Don't write production code without a
  failing test that needs it.
- Any time you change logic or add new code, update the existing tests or
  write new tests for that code in the same change. This applies to bug
  fixes, refactors that touch behavior, and new files or functions.
- If a change makes an existing test wrong, update that test on purpose
  and say why. Don't leave outdated tests behind.
- Don't call a task done until the full test suite passes.
- If a test fails, fix the code or the test, then run it again. Don't
  skip, delete or weaken a test to get to green.
- Say which tests you ran and show the result.

# Answer format

For each finding or answer, include:
1. The claim.
2. The evidence (path:line, command and output, or link).
3. How you verified it, or "Unverified" and why.