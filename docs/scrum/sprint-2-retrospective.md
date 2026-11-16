# Sprint 2 Retrospective — Full-Stack Integration

**Sprint dates:** 2026-11-09 to 2026-11-15. The milestone date was 2026-11-11, and we kept working to the P2 deadline (Sunday 2026-11-15).
**Participants:** Zichen Tian (@tianzach), Zheqi Lv (@Lildonk).
**Standups:** [#29](https://github.com/Lildonk/FairShare/issues/29).
**Status:** draft from Zichen, written 2026-11-13. Zheqi adds his notes, and we update the Delivery table at submission.

## Delivery

| Issue | Owner | Estimate | Result (as of 2026-11-13) |
| --- | --- | --- | --- |
| #3 Auth (carried over from Sprint 1) | Zheqi | 5 | Done (#26) |
| #7 Settlement board and group page | Zichen | 5 | Merged (#25, #33, #42, #53, #56). Confirm/Dispute for pending payments in review (#62) |
| #8 Audit ledger, graph, disputes, export | Zichen | 5 | Merged (#30, #31, #32, #43, #45, #54) |
| #9 Public API and Swagger | Zheqi | 5 | Done (#41, #47) |
| #10 Playwright E2E | Zheqi | 5 | Setup and sign-in flows merged (#52). Group-flow and access tests in final review (#60, #61) |
| #11 Admin portal and archiving | Zheqi | 5 | Done (#48) |
| #24 CI/CD, security scanning, deploys | Zichen | 5 | Merged (#27, #44, #46, #55), plus the production engine fix (#63) |
| #50 `/groups` page | Zheqi | 2 | Done (#51, #64, #65) |
| #57 Documentation package | Zichen | 2 | This PR |

**Velocity:** 32 of the 39 planned points were merged by submission day (2026-11-15): #3, #7, #8, #9, #11, #24, and #50. #10 had its setup and sign-in tests merged (#52) and its group-flow tests in final review (#60, #61); #57 is this PR.

## What went well

- **The API and the UI agree because they share code.**
  - The server re-runs the same finance engines as the add-expense dialog and refuses shares that don't match (#47).
  - The tests build their payloads with the dialog's own `buildExpenseDraft`.
- **Agreeing on interfaces in issues before coding** (#8: the `AuditEvent` model, `recordAuditEvent(tx, ...)`, and the route names; #7: who builds which page) let us work in parallel without rework.
- **Reviews kept finding real problems, and every fix got a failing test first.**
  - Payments double-counted after a refetch (#33, #42).
  - A missing request-body cap on the public endpoints (#41).
  - CI runs cancelled on `main` (#27).
- **Security work landed early:** CodeQL, `npm audit`, dependency review, the Next.js 15 upgrade that removed the critical advisories, 404 instead of 403 for non-members, and an append-only audit trail enforced by the database.

## What didn't go well

- **Reviews and merges piled up again.** Several PRs waited two or more days for review near the deadline, so the end-to-end flow could only be assembled at the very end. This is the same problem as Sprint 1, and its action item didn't hold.
- **We read the deadline from two places.** The GitHub spec said Nov 12, and Canvas says Nov 15. We should have checked Canvas, the submission system, at sprint planning.
- **Deployment came last.** Vercel and Neon needed account setup and repo-admin secrets, so previews weren't available for most Sprint 2 reviews.
- **Stacked PRs needed manual reordering.** #54 is based on #45, and the group page depends on four open PRs. Each merge in a different order forced another merge from `main`.
- **Local setup drifted.** The local npm 11 dropped an optional lockfile entry that CI's npm 10 requires. Stale `.next` type folders and a stopped Docker database also caused false failures until we found them.

## Action items (for the next project)

| Action | Owner |
| --- | --- |
| Set up deploy previews in the first sprint, so every review can click through the change | Both |
| Agree on review turnaround (within 24 hours) and track it on the board | Both |
| Prefer small PRs into `main` over stacks; merge the base PR first | Both |
| Pin the npm version CI uses (Node 20 / npm 10) in `package.json` `engines`, or align the local toolchain | Zichen |
| Take deadlines from Canvas at sprint planning | Both |

## Individual notes

**Zichen Tian:** I implemented #7, #8, and #24 with Claude Code, following the RED stop point in AGENTS.md for every feature PR. Agreeing on the audit-event interface with Zheqi on #8 before writing the migration paid off: #47's handlers only needed one call each. What I'd change is to set up the deployment pipeline in Sprint 1, so reviews could use preview URLs instead of reading diffs.

**Zheqi Lv:** I built the API layer (#9: the public calculators, OpenAPI and Swagger UI, then groups, expenses, and settlements), the admin portal (#11), the `/groups` page (#50), and the Playwright suite (#10), all with Claude Code and the RED stop point. Two things worked well: agreeing on the audit-event and route shapes with Zichen on #8 before either of us wrote code, and having the server recompute the dialog's splits with the same finance engines, which the browser test now checks end to end. What I'd change: I let reviews of Zichen's #53 and #54 sit for more than a day, and we deployed too late. The first automated deploy broke every database call (Prisma's engine didn't match Vercel's runtime, fixed in #63), and a smoke check after deploying would have caught it. Next time I'd review requested PRs first and set up hosting in the first sprint.
