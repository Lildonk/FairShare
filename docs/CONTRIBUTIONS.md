# Partner contribution log

FairShare is a pair project by **Zheqi Lv** ([@Lildonk](https://github.com/Lildonk)) and **Zichen Tian** ([@tianzach](https://github.com/tianzach)). Ownership followed the blueprint's split: Zheqi led the platform (scaffold, data, auth, API, admin, E2E), and Zichen led the money features (finance engines, expense dialog, settlement board, audit ledger) and CI/CD. Each partner reviewed the other's PRs before merge.

Counts are from GitHub and `git log --all --no-merges` on 2026-11-15, submission day. Zheqi's commits appear under two git identities ("Zheqi Lv" and "zlv"), so both count as his.

| | Zheqi Lv | Zichen Tian |
| --- | --- | --- |
| Commits (all branches, excluding merges) | 73 | 75 |
| PRs opened | 16 | 25 |
| Reviews of the partner's PRs | 20 PRs | 9 PRs (#18, #19, #23, #26, #41, #47, #48, #51, #52) |
| Sprint 1 standups | 4 | 4 |
| Sprint 2 standups (on #29) | 3 | 3 |

## Who did what

### Shared (both partners)

- Product blueprint and spec ([blueprint](blueprint/FAIRSHARE_BLUEPRINT.md), [spec](FAIRSHARE_PRODUCT_SPEC.md)), user stories, and issue acceptance criteria for #1–#11.
- [AGENTS.md](../AGENTS.md), the shared AI rules file:
  - Zheqi wrote v1 (#12) and the UI mockups (#13).
  - Zichen refined v2 from the HW3 experiment (#14, #15).
  - Zheqi kept it current afterwards: v2.1–v2.2 for #2, v2.3 for #3, and v2.4 for #9.
- Sprint planning, standups ([Sprint 1](scrum/standups.md), [Sprint 2 #29](https://github.com/Lildonk/FairShare/issues/29)), and retrospectives ([Sprint 1](scrum/sprint-1-retrospective.md), [Sprint 2](scrum/sprint-2-retrospective.md)).

### Zheqi Lv

| Issue | Work | PRs |
| --- | --- | --- |
| #1 | Next.js, Tailwind, Vitest, and the first CI workflow | #18 |
| #2 | PostgreSQL schema, migrations, CHECK constraints, deterministic seed, integer-cents client guard | #19, #23 |
| #3 | Email/password and Google sign-in, sessions, route protection, open-redirect and 404-for-non-members fixes | #26 |
| #9 | Public calculators, OpenAPI document and Swagger UI; group, expense, and settlement API with server-side share checks | #41, #47 |
| #11 | Admin portal, group archiving, access-denied page | #48 |
| #50 | `/groups` page: list, create, and join; links and Sign out on every signed-in page | #51, #64, #65 |
| #10 | Playwright setup, sign-in flows, CI stage 5; group-flow and access tests | #52, #60 |
| #24 | Production fix after the first automated deploy: Prisma's engine for Vercel's runtime | #63 |

### Zichen Tian

| Issue | Work | PRs |
| --- | --- | --- |
| #4 | Debt simplification engine (greedy creditor/debtor matcher) | #20 |
| #6 | Itemized split with prorated tax and tip | #21 |
| #5 | Add-expense dialog with EQUAL, EXACT, and PERCENTAGE splits and a live preview | #22 |
| #7 | Settlement board with balance chips and optimistic Record Payment; the `/groups/[groupId]` page | #25, #33, #42, #53, #56 |
| #8 | Ledger export with a formula guard, transaction graph, activity ledger, append-only `AuditEvent`, dispute and export endpoints | #30, #31, #32, #43, #45, #54 |
| #24 | Staged CI, CodeQL, audit, Dependabot; Next.js 15 + React 19 upgrade; Vercel and Neon deploys with a preview per PR | #27, #44, #46, #55 |
| #16, #57 | Sprint 1 standup log and retro; this documentation package | #28, this PR |
| HW3 | Before/after AI rules experiment | #14, #15 |

## Reviews that changed the code

A sample of review findings that led to fixes, each with a failing test first:

- **Zichen → Zheqi:**
  - #23: `multiply`/`divide` bypassed the integer-cents guard.
  - #26: open redirect via `/\t/evil.example`, and a 403-vs-404 leak of group IDs.
  - #41: no request-body size cap, and invalid IDs reported as duplicates.
  - #48: focus lost after archiving.
- **Zheqi → Zichen:**
  - #22 and #25: the dialog had no focus trap, and records that don't add up crashed the board.
  - #33: a payment was counted twice after a refetch.
  - #27: CI concurrency cancelled `main` runs.
  - #42: saved payments were dropped by an early refetch.
  - #30: test values couldn't catch float or `localeCompare` regressions.
