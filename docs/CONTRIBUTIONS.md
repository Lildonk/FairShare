# Partner contribution log

FairShare is a pair project by **Zheqi Lv** ([@Lildonk](https://github.com/Lildonk)) and **Zichen Tian** ([@tianzach](https://github.com/tianzach)). Ownership followed the blueprint's split: Zheqi led the platform (scaffold, data, auth, API, admin, E2E), and Zichen led the money features (finance engines, expense dialog, settlement board, audit ledger) and CI/CD. Each partner reviewed the other's PRs before merge.

Counts are from GitHub and `git log --all --no-merges` on 2026-11-13, and will be refreshed at submission. Zheqi's commits appear under two git identities ("Zheqi Lv" and "zlv"), so both count as his.

| | Zheqi Lv | Zichen Tian |
| --- | --- | --- |
| Commits (all branches, excluding merges) | 67 | 68 |
| PRs opened | 12 | 21 |
| Reviews of the partner's PRs | 15 PRs | 6 PRs (#18, #19, #23, #26, #41, #47), plus #48, #51, #52 in progress |
| Sprint 1 standups | 4 | 4 |
| Sprint 2 standups (on #29) | 1 so far | 3 |

## Who did what

### Shared (both partners)

- Product blueprint and spec ([blueprint](blueprint/FAIRSHARE_BLUEPRINT.md), [spec](FAIRSHARE_PRODUCT_SPEC.md)), user stories, and issue acceptance criteria for #1–#11.
- [AGENTS.md](../AGENTS.md), the shared AI rules file:
  - Zheqi wrote v1 (#12) and the UI mockups (#13).
  - Zichen refined v2 from the HW3 experiment (#14, #15).
  - Both updated it in later PRs: v2.1–v2.2 for #2, v2.3 for #3, and v2.4 for #9.
- Sprint planning, standups ([Sprint 1](scrum/standups.md), [Sprint 2 #29](https://github.com/Lildonk/FairShare/issues/29)), and retrospectives ([Sprint 1](scrum/sprint-1-retrospective.md), [Sprint 2](scrum/sprint-2-retrospective.md)).

### Zheqi Lv

| Issue | Work | PRs |
| --- | --- | --- |
| #1 | Next.js, Tailwind, Vitest, and the first CI workflow | #18 |
| #2 | PostgreSQL schema, migrations, CHECK constraints, deterministic seed, integer-cents client guard | #19, #23 |
| #3 | Email/password and Google sign-in, sessions, route protection, open-redirect and 404-for-non-members fixes | #26 |
| #9 | Public calculators, OpenAPI document and Swagger UI; group, expense, and settlement API with server-side share checks | #41, #47 |
| #11 | Admin portal, group archiving, access-denied page | #48 |
| #50 | `/groups` page: list, create, and join | #51 |
| #10 | Playwright setup, sign-in flows, CI stage 5 | #52 |

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
