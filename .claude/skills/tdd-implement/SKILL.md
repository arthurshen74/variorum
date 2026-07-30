---
name: tdd-implement
description: Implementation half of Variorum's TDD workflow. Takes an implementation manifest produced by /tdd-plan-tests (design/plans/<feature>.md) and ONE group id; discusses the approach with the human, implements in a git worktree until the group's tests are green with no regressions, then delivers an implementation report and a PROPOSED commit message. It never commits, merges, or pushes. Use when the human invokes /tdd-implement or asks to implement a group from a manifest. One group per run; the human orchestrates.
---

# TDD workflow — implement one group

Input: a manifest path under `design/plans/` and a group id. If either is
missing, list the available manifests and their non-GREEN groups, and
ask. Exactly ONE group per run — if asked to do several, do the first and
tell the human to start a fresh run for the next.

Read `CLAUDE.md`, the manifest, and the DESIGN.md section it references
before anything else. Invariants and conventions in CLAUDE.md override
everything here. Tests are LOCKED (see the amendment protocol in Step 3).

## Step 1 — Intake

Verify the starting position; if any check fails, stop, report, and
wait:

- Every group this group depends on is `Status: GREEN` in the manifest.
- This group's own tests are RED (run its filters from the manifest).
- The rest of the suite is green: full gate minus this group's tests.
  A previously-GREEN group that is now red means the baseline is broken —
  that is the human's problem to resolve, not yours to fix silently.

## Step 2 — Implementation plan

Discuss the approach with the human: how you intend to satisfy this
group's tests within its write scope, and any decision the tests leave
open (the tests define WHAT; this conversation settles HOW). Then
produce a task list with the task tools.

STOP GATE — the human approves the plan. Wait.

## Step 3 — Worktree and implementation

Set up an isolated worktree:

- `git worktree add ../<repo-dir-name>-<feature>-<group> -b <feature>/<group>`
  from current HEAD. All work happens inside it.
- `npm ci` there (worktrees share no `node_modules`).
- Run all test commands with `CI=1` so Playwright starts its own dev
  server and refuses to reuse one from another checkout — silently
  testing the wrong working tree is the failure this prevents.

Work the task list under these rules:

- Touch ONLY files in the group's write scope, plus filling in stub
  bodies the manifest lists for this group. Needing a file outside the
  scope means the manifest is wrong — stop and tell the human; the human
  amends the manifest, not you.
- The ratchet: this group's filters green, then the FULL gate green
  (`CI=1 npm run typecheck && CI=1 npx vitest run && CI=1 npx playwright
  test`). No previously green test may go red.
- Tests are locked. Amendment protocol: if a test appears wrong or the
  spec ambiguous, STOP; name the test and explain why the SPEC is wrong
  or unclear; wait for the human's ruling. On approval: spec delta
  first, then the test, then append the amendment (date, test, change,
  why) to the manifest's Amendments section.
- No new dependencies without asking (CLAUDE.md).

## Step 4 — Report and hand back

When the full gate is green:

- Flip this group's `Status` to `GREEN (<date>)` in the manifest (inside
  the worktree — it merges with the change).
- Deliver the implementation report in chat (not a file): files changed
  and why, decisions made in Step 2 and any made mid-flight, amendments
  if any, gate output summary, and anything the next group's run should
  know.
- Deliver a proposed commit message in a fenced block: imperative
  subject line, body explaining what and why.
- MESSAGE ONLY, per CLAUDE.md: never run `git add`, `git commit`,
  `git merge`, or `git push`. Leave the worktree intact and name its
  path and branch. The human reviews the diff, commits, merges, and
  removes the worktree.
