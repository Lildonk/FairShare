# Sprint 1 Retrospective — Core Foundation

**Sprint dates:** planned to end 2026-11-04; the work actually finished on 2026-11-09.
**Participants:** Zichen Tian (@tianzach), Zheqi Lv (@Lildonk).
**Standups:** [standups.md](standups.md).

## Delivery

| Issue | Owner | Estimate | Result |
| --- | --- | --- | --- |
| #1 Next.js, Tailwind, Vitest, and CI scaffold | Zheqi | 3 | Done (#18) |
| #2 PostgreSQL schema, migrations, and seed | Zheqi | 5 | Done (#19, #23) |
| #3 JWT and Google sign-in, route protection | Zheqi | 5 | In final review (#26, approved) |
| #4 Debt simplification engine | Zichen | 5 | Done (#20) |
| #5 Expense modal: equal, exact, and percentage splits | Zichen | 5 | Done (#22) |
| #6 Itemized split with prorated tax and tip | Zichen | 5 | Done (#21) |

**Velocity:** 23 of 28 planned points merged. #3 (5 points) carries over and will merge at the start of Sprint 2. The estimates were proposed in the issues but never re-confirmed together at sprint planning.

## What went well

- **TDD was real, not retrofitted.** Every feature PR has a failing `test(...)` commit before its `feat(...)` commit, and the reviewers checked that the RED commits actually fail. The finance engines (`src/lib/finance/`) have 100% coverage.
- **Reviews caught real bugs.** For example:
  - A bypass in the integer-amount guard: `multiply` and `divide` on amount fields (#23).
  - An open redirect in `safeNextPath` (#26). Its fix also covered a `/.//` variant that the reviewer's suggestion missed.
  - Balance rules checked against the seed data (#25).
- **Shared rules kept the code consistent.** These rules from AGENTS.md (v2.1 → v2.2) were followed in every PR without reminders:
  - integer cents
  - basis points
  - ordinal tie-breaking
  - `onDelete: Restrict`
  - the shared Prisma client
- **The pure finance modules have clear interfaces**, such as `computeGroupBalances` and `simplifyDebts`. That let #7 build on #4 and #2 without changing either one.

## What didn't go well

- **We missed the sprint end date by five days.** The scaffold (#1) landed on 11-05, after the planned end of the sprint, and everything else was blocked behind it. Most reviews and merges ended up crammed into 11-09.
- **Standups were not posted as they happened.** The 11-04 and 11-06 standups took place in chat and were only written up on 11-09.
- **Stacked PRs ran without CI.** CI only ran on PRs into `main`, so #26 (based on the #2 branch) and similar PRs had no checks until they were retargeted.
- **AI tool limits interrupted the work.** Antigravity hit its usage quota in the middle of #4, so we switched models mid-issue and later moved the remaining work to Claude Code.
- **Some security findings are still open.** `npm audit` reports critical advisories in `next@14.2.35` that only a major upgrade fixes.

## Action items for Sprint 2

| Action | Owner | Tracking |
| --- | --- | --- |
| Run CI on every PR, whatever its base branch; add security scanning | Zichen | #24 / #27 |
| Post each standup on GitHub on the day it happens (Sprint 2 standup log) | Both | new Sprint 2 log issue |
| Re-confirm estimates and scope at Sprint 2 planning; move the Sprint 2 date if the P2 deadline allows | Both | Sprint 2 milestone |
| Review a requested PR within 24 hours so merges don't pile up on one day | Both | — |
| Choose the Next.js upgrade (15.5 + React 19, or 16) and do it in its own PR after #26 | Both decide, Zichen implements | #24 |
| Keep PRs targeted at `main` and small, instead of stacking them | Both | — |

## Individual notes

**Zichen Tian:** Used Claude Code to implement #4–#7 end to end with the RED stop point from AGENTS.md. The separate test commits made the reviews faster, because Zheqi could check each RED commit on its own.

**Zheqi Lv:** I used Claude Code for #1–#3 with the same RED stop point, and committing the failing tests on their own made each review quicker to check. Zichen's reviews caught two problems my tests had missed: a way around the integer-amount guard (#23) and an open redirect after sign-in (#26). Both got failing tests before the fix, and the #26 review also led us to return 404 for non-members. What I'd change: the scaffold (#1) only landed on 11-05, after the planned sprint end, and everything else waited on it. In Sprint 2 I'll keep PRs small and review requested ones within a day.
