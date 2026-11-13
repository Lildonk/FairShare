# Sprint 2 Retrospective — Full-Stack Integration

**Sprint dates:** 2026-11-09 to 2026-11-15. The milestone date was 2026-11-11, and we kept working to the P2 deadline (Sunday 2026-11-15).
**Participants:** Zichen Tian (@tianzach), Zheqi Lv (@Lildonk).
**Standups:** [#29](https://github.com/Lildonk/FairShare/issues/29).
**Status:** draft from Zichen, written 2026-11-13. Zheqi adds his notes, and we update the Delivery table at submission.

## Delivery

| Issue | Owner | Estimate | Result (as of 2026-11-13) |
| --- | --- | --- | --- |
| #3 Auth (carried over from Sprint 1) | Zheqi | 5 | Done (#26) |
| #7 Settlement board and group page | Zichen | 5 | Board and follow-ups merged (#25, #33, #42). #53 and the group page #56 in review |
| #8 Audit ledger, graph, disputes, export | Zichen | 5 | UI merged (#30, #31, #32, #43). AuditEvent #45 approved; endpoints #54 in review |
| #9 Public API and Swagger | Zheqi | 5 | Done (#41, #47) |
| #10 Playwright E2E | Zheqi | 5 | Setup and sign-in flows in review (#52). Full group flow to follow |
| #11 Admin portal and archiving | Zheqi | 5 | In review (#48) |
| #24 CI/CD, security scanning, deploys | Zichen | 5 | Pipeline, scanning, and the Next 15 upgrade merged (#27, #44, #46). Deploys in review (#55) |
| #50 `/groups` page | Zheqi | 2 | In review (#51) |
| #57 Documentation package | Zichen | 2 | This PR |

**Velocity:** 10 of the 39 planned points (#3 and #9, including #3's 5 carried over) were fully merged by 2026-11-13. Most of the rest was merged in part or in review. Final numbers go here at submission.

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

**Zheqi Lv:** _(to be added by Zheqi)_
