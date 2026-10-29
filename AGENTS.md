# FairShare — Shared AI Development Rules (HW3 v2)

<!-- Shared by Zheqi Lv (@Lildonk) and Zichen Tian (@tianzach).
     Review/update via partner-reviewed PR when architecture or requirements change. -->

## Context first: what to read

FairShare is a multi-party expense sharing web app for groups, with debt simplification, four split modes, settlement tracking, an audit ledger, and an admin interface.

**Before modifying code:** (1) read the active GitHub Issue and its acceptance criteria; (2) read the relevant parts of [FairShare product/UX specification](docs/FAIRSHARE_PRODUCT_SPEC.md); (3) inspect existing implementation and tests; (4) review the [FairShare UI mockups](docs/mockups/README.md) and any later approved Figma/Claude prototype. If you cannot open the GitHub Issue, ask the user to paste its acceptance criteria before starting; do not silently substitute the spec. Do not fabricate missing mockups, endpoints, test results, or stakeholder decisions. The PDF blueprint is the source of this readable spec; it is not currently stored in the repo.

**Priority when requirements conflict:** course P2/HW3 grading requirements > confirmed product decisions and issue acceptance criteria > planning spec > inferred defaults. Flag conflicts and ask the two partners to decide; do not silently change intended behavior.

## Stack and dependencies

- **Frontend:** Next.js **14+ App Router**, React, TypeScript, TailwindCSS, Lucide React.
- **Backend:** Next.js Route Handlers with REST endpoints under `/api/v1`.
- **Persistence:** PostgreSQL, Prisma ORM and migrations.
- **Auth:** email/password with JWT + bcrypt, plus Google sign-in using OAuth 2.0 / OpenID Connect; server-side role and group membership checks. No other social-login providers are approved.
- **Client state:** Zustand + React Hooks for interactive previews and optimistic settlement updates.
- **Tests:** Vitest + React Testing Library (unit/component), integration tests, Playwright (E2E).
- **Docs/automation:** OpenAPI 3.0/Swagger at `/api/docs`, GitHub Actions, deploy previews.

**Version policy:** The blueprint specifies Next.js 14+ but not exact package versions, and the repo is not scaffolded yet. On Issue #1, select mutually compatible stable versions and pin them in `package.json` / lockfile. Use those actual versions afterward; never guess installed versions or silently upgrade major dependencies. Use npm and existing project scripts. Do not change `package.json`, `tsconfig.json`, or other tool configuration outside the issue's scope without asking first and explaining why.

## Architecture and naming

<!-- Target layout; adapt to the real scaffold once created and document deviations. -->

- `src/app/`: App Router pages/layouts; `src/app/api/v1/`: HTTP Route Handlers.
- `src/components/`: reusable accessible UI components.
- `src/lib/finance/`: pure debt/splitting calculations; no React, Prisma, or I/O.
- `src/lib/auth/`: JWT verification and authorization; `src/lib/db/`: Prisma access.
- `src/store/`: scoped client state; `src/types/`: shared types.
- `prisma/`: schema/migrations/seed; `tests/`: integration/E2E suites. Colocate small unit/component tests beside source where consistent.

Prefer server components for data loading; use `'use client'` only for interactive views. Keep route handlers thin, centralize validation/authorization, and keep domain logic out of JSX. Reuse shared types rather than duplicating request shapes.

Use strict TypeScript; no unjustified `any`; `PascalCase` components/types, `camelCase` functions/variables, clear kebab-case utility file names, and descriptive test names. Follow configured ESLint/formatter. Favor small modules, explicit interfaces, and minimal dependencies over clever abstractions.

## Financial correctness (non-negotiable)

- Money is **integer cents** throughout core calculation and persistence; validate safe integers, reject invalid/negative inputs where inappropriate. Never accumulate currency using binary floating point.
- For every expense: sum of allocated shares equals total expense cents exactly; deterministic handling of remainder cents.
- For debt simplification: each member's `netCents = paidCents - owedCents`; sum of net balances must equal zero; transfers preserve every member's net position; skip zero balances and handle empty/cyclic inputs.
- Implement the **greedy creditor/debtor matcher** described by the blueprint; it yields **at most N−1 transfers for N nonzero balances**. Do **not** call it a globally minimum-transfer solver.
- Deterministic means the output depends only on the balances, not on input order or locale: break ties by member ID using ordinal comparison (`a < b`), not `localeCompare`.
- EQUAL: remainder to payer if payer is included (clarify otherwise). EXACT: exact cent total. PERCENTAGE: validate 100% using the blueprint's 0.01% input tolerance, then distribute cents deterministically. ITEMIZED: prorate tax/tip and reconcile the last cent.
- No hidden rounding, dropped cents, or mutation of financial history. Fail safely with understandable validation errors.

## UI behavior and accessibility

Read the flows/UI guidance in the product spec. Expected surfaces: register/login; group list; expense modal with payer, participants, EQUAL/EXACT/PERCENTAGE/ITEMIZED modes and live allocation preview; settlement board with labeled owes/gets-back chips, transfer instructions and Record Payment; audit/dispute/export; protected admin view.

Use the [four proposed FairShare UI mockups](docs/mockups/README.md) as visual references; they were developed for HW3 from the product blueprint and need partner review. Confirm them with the pair before treating them as approved visual requirements. If visual details are unspecified, propose a default and label it as an assumption. Use responsive Tailwind layout, semantic HTML, explicit form labels, keyboard navigation, visible focus, accessible status/error messages, and text labels in addition to red/green color.

## Security and authorization

Validate external input at API boundaries. Use Prisma/parameterized DB operations; avoid unsafe raw SQL and unsanitized HTML. For email/password login, hash passwords with bcrypt and sign/verify JWTs using approved libraries. For Google sign-in, use a maintained OAuth/OIDC library; verify provider-issued identity and use secure session handling. Never trust a client-submitted Google email or token without server-side verification. For browser sessions, prefer secure HttpOnly/SameSite cookies over exposing tokens to JavaScript; document any Bearer-token API flow. Never trust client-supplied role or user identity.

Authenticate **and authorize** every private group query/mutation against membership; restrict admin endpoints on the server, not only the UI. The blueprint's global `User.role` versus “Group Admin” is unresolved: **ask before implementing cross-group admin powers**. Protect archived ledgers from writes, keep public calculator routes stateless and detached from private data, avoid exposing receipts/user information, and never commit `.env`, JWT secrets, or credentials. Use least-privilege configuration, safe error messages, and no secrets in logs.

Choose reputable dependencies and evaluate package risk. Run dependency/security scanning in CI; keep PR previews isolated from production credentials.

## Tests: genuine Red → Green → Refactor

**RED:** Translate each acceptance criterion into failing unit/component/integration tests first; execute them and record the expected failure; commit failing tests before implementation. **Stop point:** before creating any implementation file, show the failing test output and commit only the tests (`test(<scope>): ... (#N)`). If you cannot run the tests or Git, stop and ask; never write tests and implementation in one step.

**GREEN:** Implement the smallest correct change; rerun relevant tests; commit implementation separately.

**REFACTOR:** Improve names/structure while retaining behavior; rerun tests and commit where changed.

Use Vitest for core finance logic (the blueprint targets **100% coverage** for debt and tax/tip engines), React Testing Library for interactions, API integration tests for authorization/validation, and Playwright for the Register → Group → Expense → Settlement flow. Add negative/security tests and cents/rounding edge cases. **Never fabricate passing tests, coverage, browser screenshots, or Red commits.** Report actual commands, outputs, failures, and anything not run.

## Scrum, Git, and partner review

- Track work in [FairShare Issues](https://github.com/Lildonk/FairShare/issues), with the two sprint milestones and five statuses: Backlog → Sprint Todo → In Progress → In Review → Done.
- One focused branch per issue: `feature/<number>-description`, `fix/<number>-description`, `chore/<number>-description`, or `docs/<number>-description`. Use **actual GitHub issue numbers**.
- Conventional Commits with issue reference: `test(finance): add failing cyclic-debt tests (#4)`, `feat(finance): implement settlement matching (#4)`. Distinct test and implementation commits preserve TDD evidence.
- No direct push to `main`. Open small PRs; describe scope, acceptance criteria, tests and screenshots (if UI), and link the issue (`Refs #N` for partial work; `Closes #N` only when completely done).
- Request **partner review and approval plus a substantive code comment** before merge. Both students must make meaningful commits and each complete **at least five visible PR reviews** during P2.
- Document planning, estimates, **at least three standups per partner per sprint**, demos, retrospectives, and contributions. Coordinate shared interfaces before parallel changes.
- For P2 delivery, eventually require PR checks, security scanning, preview deployments, automated production deployment, and environment separation.

## How the AI should work

1. Summarize the issue/acceptance criteria and reference files; propose a concise file-by-file plan **before** edits.
2. Make the smallest issue-scoped changes. Do not overwrite unrelated work, bypass reviews, invent API shapes/mockup details, or add unapproved frameworks.
3. Apply genuine test-first commits for testable functionality (honor the RED stop point above) and review each diff for bugs/security/accessibility.
4. Run only available project scripts; give reproducible commands and accurately report test/lint/typecheck results.
5. Finish with changed files, a table mapping each acceptance criterion to the test(s) covering it (mark any criterion left uncovered), decisions/assumptions, and suggested commit/PR text. Human developers review, understand, and approve every AI-generated change.

**Maintain this file:** Keep it concise and updated through partner-reviewed PRs. Put detailed requirements in `docs/FAIRSHARE_PRODUCT_SPEC.md` and visual screen references in `docs/mockups/README.md`, rather than expanding every agent prompt.

## Revision history

- **v2** (2026-10-28, #4): Refined after the HW3 before/after experiment ([results](docs/hw3/comparison.md)). With v1 active, the AI applied the financial and architecture rules, but it made no TDD commits, changed `package.json` unprompted, worked without the issue text, used locale-dependent tie-breaking, and left one acceptance criterion untested. Added: a RED stop point, a config-change guard, a missing-issue fallback, a precise determinism rule, and an acceptance-criteria-to-test table.
- **v1** (2026-10-28, #1): Initial shared rules.
