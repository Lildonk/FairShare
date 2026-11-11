# Sprint Standup Log

Team: Zichen Tian ([@tianzach](https://github.com/tianzach)) and Zheqi Lv ([@Lildonk](https://github.com/Lildonk)).

Each standup answers three questions: what was done since the last one, what comes next, and what is blocking. The issue and PR numbers link the entries to the commit history. The 2026-11-04 and 2026-11-06 standups happened in our team chat and were written up here on 2026-11-09. The 2026-11-09 entries for Zichen were also posted as comments on #16.

## Wednesday 2026-11-04

**Zichen Tian**
- **Done:** Finished the HW3 before/after AI experiment for #4 (comparison doc #14) and refined AGENTS.md to v2 from the results (#15).
- **Next:** Start the finance engine issues (#4, #5, #6) once the project scaffold is ready.
- **Blockers:** Waiting on the Next.js scaffold and CI setup (#1).

**Zheqi Lv**
- **Done:** Wrote the HW3 final reflection and the rubric evidence index (#17), and added HW3 navigation to the README.
- **Next:** Scaffold the project for #1 (Next.js 14, TypeScript, Tailwind, Vitest, GitHub Actions CI).
- **Blockers:** None.

## Friday 2026-11-06

**Zichen Tian**
- **Done:** Reviewed and merged the scaffold PR #18. Implemented #4 debt simplification, #6 itemized split, and #5 expense modal with Red → Green → Refactor commits. Opened PRs #20, #21, #22.
- **Next:** Partner review of #20–#22, then start #7 settlement board.
- **Blockers:** #7 needs the database schema from #2.

**Zheqi Lv**
- **Done:** Scaffold PR #18 approved and merged; fixed the CI typecheck for archived docs. Added the original design blueprint and recorded the admin-scope and data-model decisions (#19). For #2: configured Prisma 6 and PostgreSQL 17, committed failing schema, constraint, seed, and integer-amount tests, then implemented the schema, initial migration, deterministic seed, and a CI database job.
- **Next:** Open the #2 PR, review Zichen's #20–#22, start #3 authentication.
- **Blockers:** None.

## Monday 2026-11-09 (midday)

**Zichen Tian**
- **Done:** #20–#22 approved by Zheqi and merged. Reviewed #23 (#2 schema). Implemented #7 group balances and settlement board with TDD (PR #25).
- **Next:** Review Zheqi's auth PR #26; start CI/CD work for #24.
- **Blockers:** None.

**Zheqi Lv**
- **Done:** Reviewed, approved, and merged #20, #21, #22. Closed #1. Opened #23 for #2; aligned the `UserRole` type with the schema and documented the shared Prisma client rule (AGENTS.md v2.2). Started #3 auth: added bcryptjs, jose, and openid-client, then failing tests for sign-up, sign-in, Google sign-in, and access control.
- **Next:** Finish #3 and open its PR; address review notes on #23.
- **Blockers:** None.

## Monday 2026-11-09 (evening)

**Zichen Tian**
- **Done:** #25 merged. Approved #26 with a request to fix an open redirect in `safeNextPath`. Opened #27 for #24: a four-stage CI pipeline, a 100% finance coverage gate, npm audit, CodeQL, dependency review, and Dependabot.
- **Next:** Merge #27, decide the Next.js upgrade (15.5 or 16), set up Vercel + Neon deployment, then start the #8 audit ledger.
- **Blockers:** The Dependency graph must be enabled by the repo admin; the Next.js upgrade decision is pending.

**Zheqi Lv**
- **Done:** Fixed Zichen's #23 review note (TDD: a failing test, then rejecting multiply/divide on amount fields) and merged #23. Reviewed and merged #25. Opened #26 for #3 (email/password and Google sign-in, route protection). Fixed the open redirect from the #26 review with 10 failing tests first, then URL-parsing validation; #26 was re-approved.
- **Next:** Merge #26, review #27 and enable the Dependency graph, start #9 REST API and OpenAPI docs.
- **Blockers:** The Next.js upgrade decision; deciding whose account hosts Vercel and Neon.

## Summary (as of 2026-11-09)

- **Sprint 1 delivered:** #1 scaffold and CI, #2 schema, migrations, and seed (Zheqi); #4 debt simplification, #5 expense modal, #6 itemized split (Zichen). #3 auth is in final review (#26).
- **Sprint 2 so far:** #7 settlement board merged (#25); #24 CI and security scanning in review (#27).
- **Reviews:** Zichen: #18, #19, #23, #26 (twice). Zheqi: #20, #21, #22, #25.
- **Open items:** Next.js security upgrade, deployment accounts (Vercel + Neon), #8 audit ledger, #9 API, #10 E2E tests, #11 admin portal.
