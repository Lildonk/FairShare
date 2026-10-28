# FairShare — Product and Design Specification (HW3 Baseline)

> **Status:** Project planning baseline, derived from the pair's 13-page *Project 2 Architecture & Specification Blueprint (FairShare)* by Zichen Tian and Zheqi Lv. This is a readable implementation reference, **not** a replacement for a missing screen mockup or evidence of an implemented feature. Confirm design choices with both partners before coding.

## 1. Problem, users, and outcome

FairShare helps roommates, travelers, and event groups track shared expenses, allocate each receipt fairly, and turn messy bilateral balances into a small set of settlement instructions without losing cents. Users should not need to link bank accounts. Primary users are registered group members; administrators manage authorized ledgers and disputes; unauthenticated visitors may use stateless public calculation APIs.

## 2. User stories and acceptance criteria

### US-1 — Simplify group debts (GitHub #4)

As a member, I want consolidated settlement instructions so our group can pay each other with fewer transfers.

- Compute `netCents = totalPaidCents - totalOwedCents` per member.
- Accept only finite, safe integer-cent values; require the sum of net balances to equal zero.
- Generate deterministic debtor-to-creditor transfers whose amounts preserve all participants' net balances.
- A greedy algorithm matching the largest remaining debtor and creditor can generate **at most N−1 transfers for N nonzero participants**. **It does not always yield the globally minimal transfer count.** Do not promise mathematical optimality without implementing and testing a different algorithm.
- Handle empty inputs, all-zero balances, mutual debts, cycles, and a single debtor.
- Test the pure calculation engine with Vitest; the blueprint's target is 100% coverage.

### US-2 — Split a shared expense (GitHub #5, #6)

As a member, I want flexible expense allocations so every participant owes the correct portion.

- EQUAL: split whole cents deterministically; follow the blueprint's rule assigning leftover cents to the payer **when the payer participates**. Clarify an alternative if the payer is excluded.
- EXACT: user-entered shares must sum to the receipt amount in cents.
- PERCENTAGE: percentages must sum to 100%, allowing the blueprint's 0.01% input tolerance; convert to precise cent allocations with a deterministic remainder policy.
- ITEMIZED: assign shared line items and prorate tax, service charges, and tip by item subtotals; final shares must sum exactly to the receipt total.
- Reject negative or inconsistent values and report validation errors before saving.

### US-3 — Track and settle a group's expenses (GitHub #7)

As a member, I want a group dashboard so I can understand my balance and record payments.

- Display per-member balances with descriptive labels (gets back / owes), not color alone.
- List suggested transfers in a readable form (e.g., “Bob pays Alice $3.00”).
- Allow authorized users to record/confirm a payment.
- Update client state optimistically, with rollback or refetch on a failed request.
- Handle loading, empty, and error states.

### US-4 — Audit and dispute group activity (GitHub #8)

As a member or authorized auditor, I want a transparent activity history so we can resolve disagreements.

- Capture immutable, time-stamped expense creation, editing, and deletion events.
- Flag/unflag disputed expenses, keeping group-level authorization.
- Export permitted group ledger or settlement data in CSV and JSON.
- **Design gap:** the draft Prisma schema does not include a dedicated immutable audit-event table. Agree on a migration/schema change before implementing this feature.

### US-5 — Register, log in, and manage authorized groups (GitHub #2, #3)

As a member, I want an account and private group access so only authorized participants see our data.

- Support email/password registration and login with validated input, bcrypt password hashes, and JWT-based authentication.
- Also support **Google sign-in** via established OAuth 2.0 / OpenID Connect integration. Verify the provider identity server-side and handle sign-in/session issuance safely; do not add other third-party login providers.
- Protect every group-scoped API query with authentication **and** membership authorization.
- Allow creating groups and joining through a secure invitation mechanism; define token expiry and permissions before implementing invites.
- Keep private groups, receipts, settlements, and user data inaccessible from public utilities.

### US-6 — Administer completed ledgers and integrate via API (GitHub #9, #11)

As an authorized admin, I want to resolve disputes and archive ledgers; as a developer, I want documented APIs.

- Provide protected admin functions to inspect disputes and archive permitted groups.
- Archived ledgers must reject further mutations at the server boundary.
- Provide versioned REST endpoints under `/api/v1` and OpenAPI 3.0 / Swagger UI at `/api/docs`.
- Public, **stateless** utility endpoints: `POST /api/v1/simplify` and `POST /api/v1/split/calculate`.
- **Authorization decision to confirm:** the draft uses a global `User.role` but talks about “Group Admin.” Decide whether admin privileges are platform-wide or per-group before implementing /admin routes.

## 3. Architecture / contracts

Planned stack: Next.js 14+ App Router, React, TypeScript, TailwindCSS, Lucide React; Next.js Route Handlers; PostgreSQL and Prisma; JWT and bcrypt with Google OAuth/OIDC sign-in; Zustand/React Hooks; Vitest + React Testing Library + Playwright; GitHub Actions; OpenAPI 3.0 / Swagger. **The repo has not yet been scaffolded; exact package versions must be pinned in package.json and the lockfile after setup.**

Draft relational entities: `User`, `Group`, `GroupMember`, `Expense`, `ExpenseSplit`, `Settlement`. Core money fields are integer cents. The full draft model definitions are in the original FairShare blueprint, Section 5, and need review for missing audit records and admin scope.

Planned endpoint inventory from the blueprint (verify request/response schemas before implementation):

| Method | Path | Access |
| --- | --- | --- |
| POST | /api/v1/auth/register | Public |
| POST | /api/v1/auth/login | Public |
| POST | /api/v1/simplify | Public stateless utility |
| POST | /api/v1/split/calculate | Public stateless utility |
| GET, POST | /api/v1/groups | Authenticated |
| POST | /api/v1/groups/:id/expenses | Authenticated group member |
| GET | /api/v1/groups/:id/settlements | Authenticated group member |
| PATCH | /api/v1/settlements/:id | Authorized group member |
| GET | /api/v1/admin/groups | Authorized admin |
| PATCH | /api/v1/admin/groups/:id/archive | Authorized admin |

## 4. UI/UX design intent and user flows

The blueprint names features and behaviors but contained no screen mockups. Four new [FairShare UI mockups](mockups/README.md) were created for HW3: [Authentication](mockups/01-auth.svg), [Group Dashboard](mockups/02-group-dashboard.svg), [Add Expense](mockups/03-add-expense.svg), and [Settlement](mockups/04-settlements.svg). These are proposed designs derived from the blueprint, **not** screenshots from an existing Claude/Figma prototype. The login screen includes email/password and the newly selected Google sign-in option. Confirm them together before treating them as approved mockups.

Expected UI surfaces (design descriptions from the blueprint, not verified screenshots):

- **Auth:** accessible registration, email/password login, and Google sign-in with error states.
- **Groups:** list of authorized groups; create/join group flow.
- **Expense creation:** modal with payer, receipt amount, participant selection, split-mode controls, live allocation preview, validation, and clear submit state.
- **Settlement board:** labeled creditor/debtor balance chips, transfer instructions, one-click payment recording; optimistic feedback.
- **Audit/admin:** chronological ledger, dispute flagging, export controls, and restricted archive actions.

Critical flow: **Register/Login → Create/Join Group → Add Expense → Choose Split Mode → Validate Shares → View Balances → Simplify Debts → Record Payment**.

Use mobile-first layouts, keyboard-accessible controls, visible focus, semantic HTML, and sufficient contrast. Colors must supplement readable “owes/gets back” labels.

**Mockup reference:** [Proposed concept SVGs and implementation notes](mockups/README.md). If the team has an earlier real Claude Artifact or Figma prototype, add its URL separately, identifying its true source.

## 5. Process, evidence, and delivery

- GitHub issues #1–#6 belong to Sprint 1; #7–#11 belong to Sprint 2. Use their checklists as the current task-level acceptance criteria.
- Pair work: Zheqi Lv (@Lildonk) leads #1–#3 and #9–#11; Zichen Tian (@tianzach) leads #4–#8.
- Both partners should produce meaningful commits, branch per issue, and review each other's PRs.
- Record actual failing-tests-first TDD commits, unit/integration/E2E tests, and the final CI/CD evidence.
- P2 deliverables include production deployment, API docs, architecture/schema diagrams, documentation, **10-minute** demo, partner contribution log, and individual reflections.

## 6. Source hierarchy and open questions

1. Official HW3 and P2 assignment instructions define grading/delivery requirements.
2. This document summarizes the pair's FairShare blueprint for implementation.
3. Actual approved screen mockups and issue acceptance criteria refine behavior, when available.
4. Any contradiction or missing detail should be surfaced to the two partners, **not silently invented**.

Open questions: partner approval of the proposed UI mockups and whether an earlier Claude/Figma prototype exists; global versus per-group admin authority; audit event persistence; invite-token expiration; equal split when payer is excluded; settlement confirmation authority. Resolve and update this spec and `AGENTS.md` as decisions are made.

### Course references

- [CS6983 Fall 2026 course](https://johnguerra.co/classes/aiCoding_fall_2026/)
- [Week 6 — IDE-Centric AI Coding](https://johnguerra.co/lectures/aiCoding_fall2026/06_IDE_AI_Coding/)
- [Week 7 — Agile/Scrum + Pair Workflow](https://johnguerra.co/lectures/aiCoding_fall2026/07_Advanced_IDE_Agile/)
