# FairShare — Product and Design Specification (HW3 Baseline)

> **Status:** Project planning baseline, derived from the pair's 13-page *Project 2 Architecture & Specification Blueprint (FairShare)* by Zichen Tian and Zheqi Lv ([Markdown](blueprint/FAIRSHARE_BLUEPRINT.md), [PDF](blueprint/FairShare_Blueprint.pdf)). This is a readable implementation reference, **not** a replacement for a missing screen mockup or evidence of an implemented feature. Confirm design choices with both partners before coding.

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

- EQUAL: split whole cents deterministically; follow the blueprint's rule assigning leftover cents to the payer **when the payer participates**. If the payer is not splitting, leftover cents go one each to participants in member ID ordinal order (decided in #5).
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
- **Decision (#2):** the audit-event table is not part of the #2 schema. #8 adds an append-only audit-event model in its own migration. Until then, the #2 schema blocks deleting users who have financial history (see [Data model decisions](#data-model-decisions)).

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
- **Decision (#2): admin authority is platform-wide.** `User.role = ADMIN` unlocks the protected `/admin` portal and `/api/v1/admin/*` endpoints (cross-group overview, disputes, archiving, member rosters). There are no per-group roles: every member has the same rights inside their own groups, and admins get no extra powers outside the admin endpoints. Registration always creates `MEMBER`; `ADMIN` is granted only server-side (seed data or the database), never from client input. This replaces the blueprint's “Group Admin” wording.

## 3. Architecture / contracts

Planned stack: Next.js 14+ App Router, React, TypeScript, TailwindCSS, Lucide React; Next.js Route Handlers; PostgreSQL and Prisma; JWT and bcrypt with Google OAuth/OIDC sign-in; Zustand/React Hooks; Vitest + React Testing Library + Playwright; GitHub Actions; OpenAPI 3.0 / Swagger. **The repo has not yet been scaffolded; exact package versions must be pinned in package.json and the lockfile after setup.**

Draft relational entities: `User`, `Group`, `GroupMember`, `Expense`, `ExpenseSplit`, `Settlement`. Core money fields are integer cents. The draft model definitions are in [blueprint Section 5](blueprint/FAIRSHARE_BLUEPRINT.md#5-relational-database-schema-design-prisma); the #2 schema follows them with the changes below.

### Data model decisions

Decided in #2 (2026-11-06):

| Blueprint Section 5 | Decision | Why |
| --- | --- | --- |
| `User.passwordHash String` | Optional (`String?`) | Google sign-in accounts have no password. Google account linking is added in #3 with its OIDC library. |
| `User.role` described as “Group Admin” | Platform-wide role (see US-6) | One server-side role check; no per-group roles. |
| `Settlement.fromUserId` / `toUserId` without relations | Relations to `User` | The database rejects settlements for unknown users. |
| `onDelete: Cascade` from users to expenses and splits | `onDelete: Restrict` on every user reference from expenses, splits, and settlements | Deleting a user must not silently erase other members' balances. Deleting a whole group still cascades; archiving is the normal path. |
| No uniqueness on `ExpenseSplit` | `@@unique([expenseId, userId])` | One share per person per expense. |
| `allocatedPct Float?` | `allocatedBps Int?` (basis points: 3333 = 33.33%) | Integer math for percentage splits; 1 basis point equals the 0.01% input tolerance. |
| No CHECK constraints | Expense and settlement amounts > 0; shares ≥ 0; basis points 0–10000; settlement payer ≠ payee | The database rejects invalid money rows, not only API validation. |
| Indexes only from unique keys | Indexes on foreign keys and common lookups | PostgreSQL does not index foreign keys automatically. |
| `Settlement` without `updatedAt` | Adds `updatedAt` | Status changes (PENDING → CONFIRMED/DISPUTED) are timestamped. |
| No audit table | Deferred to #8 (see US-4) | #8 owns the audit trail and adds it in its own migration. |

**Environments:** local development uses PostgreSQL 17 (Homebrew on macOS; Docker or the official installer elsewhere), configured only through `DATABASE_URL` in an untracked `.env`. CI uses a PostgreSQL 17 service container. Deployed environments (later issues) use hosted PostgreSQL such as Neon, as the blueprint plans, with separate preview and production databases.

**Shared database client:** Prisma 6 silently truncates fractional numbers written to `Int` columns (19.99 is stored as 19), and the database cannot detect it. App code therefore uses only the shared client in `src/lib/db/prisma.ts`, which rejects non-integer `amountCents`, `owedCents`, and `allocatedBps` with a Prisma validation error. Never create another `PrismaClient`.

**ORM version:** Prisma 6.19.3, pinned. It runs the blueprint's schema syntax unchanged and is the standard pairing with Next.js 14. Prisma 7 uses a different setup (new generator and output folder, connection URL in a separate config file), and npm's `latest` tag currently points to a Prisma 8 release candidate. Upgrading Prisma is a separate chore.

Planned endpoint inventory from the blueprint (verify request/response schemas before implementation):

| Method | Path | Access |
| --- | --- | --- |
| POST | /api/v1/auth/register | Public |
| POST | /api/v1/auth/login | Public |
| POST | /api/v1/auth/logout | Public (added in #3) |
| GET | /api/v1/auth/me | Authenticated (added in #3) |
| GET | /api/v1/auth/google, /api/v1/auth/google/callback | Public: Google sign-in redirects (added in #3) |
| POST | /api/v1/simplify | Public stateless utility |
| POST | /api/v1/split/calculate | Public stateless utility |
| GET, POST | /api/v1/groups | Authenticated |
| GET | /api/v1/groups/:id | Authenticated group member (added in #3) |
| POST | /api/v1/groups/:id/expenses | Authenticated group member |
| GET | /api/v1/groups/:id/settlements | Authenticated group member |
| PATCH | /api/v1/settlements/:id | Authorized group member |
| GET | /api/v1/admin/groups | Authorized admin |
| PATCH | /api/v1/admin/groups/:id/archive | Authorized admin |

### Authentication and authorization decisions

Decided in #3 (2026-11-09):

- **Session in an HttpOnly cookie, never in a response body.** The issue requires that tokens not appear in responses, and AGENTS.md prefers cookies over tokens readable by JavaScript. The blueprint's "return signed JWT token" is met by the signed JWT in the cookie. A Bearer-token flow for external API clients is not implemented; add it in #9 if it's needed.
- **Accounts are never merged by email.** Password accounts don't verify their email, so someone could register a victim's address first. An existing account must be signed in before Google can be connected. Unverified Google emails are refused, and a Google account can belong to only one FairShare account.
- **Status codes:** 401 when not signed in (or the session is invalid or expired), 403 for a non-admin, 404 for an unknown group or one you aren't a member of, 409 for a taken email. Login answers an unknown email and a wrong password the same way. A group you aren't in gets the same 404 as one that doesn't exist, so group IDs can't be probed (agreed in the #26 review).
- **Admin checks read the role from the database**, not the token, so a demoted admin loses access at once. Since #11, the page middleware only checks that a session exists. The `/admin` page reads the role itself and shows members an "Admins only" page instead of redirecting them.

### Admin portal decisions

Proposed in #11 (2026-11-10), for partner review. This is the scope of ADMIN within the platform-wide decision (US-6):

- **What an admin can do:** see every group with its member, expense, and dispute counts; see disputed expenses from every group; and archive any group, without being a member (`PATCH /api/v1/admin/groups/:groupId/archive`).
- **What an admin can't do:** read or change a group's expenses and payments through the member endpoints unless they are a member, unarchive a group, or resolve disputes. Unarchiving and dispute resolution can follow if the partners want them.
- **Archiving is one-way and idempotent.** It freezes the ledger: expense, payment, and join requests answer 409, while members can still read everything. The archive check runs after the role check, so members never learn whether a group ID exists.
- **Not in scope for #3:** email verification, password reset, rate limiting of login attempts, and session revocation before the 7-day expiry.

### API decisions

Agreed in the #41 review (2026-11-10):

- **Calculator request shapes.** The blueprint names the public endpoints but not their bodies. `POST /api/v1/simplify` takes raw debts (`fromMemberId` owes `toMemberId` `amountCents`) and returns net balances plus transfers. `POST /api/v1/split/calculate` takes a `splitType` and that mode's inputs (percentages as basis points), covering all four split modes rather than only ITEMIZED. Member IDs are free-form labels, so the endpoints never touch real accounts.
- **Limits on public input:** at most 1000 debts, 100 members per split, and 200 receipt items, with member IDs up to 100 characters.
- **Swagger UI from a CDN, not npm.** `/api/docs` loads `swagger-ui-dist` 5.34.0 from jsDelivr with integrity hashes checked against the npm tarball, under a Content-Security-Policy that allows only those files. This adds no dependency, and keeps working through the planned React 19 upgrade.
- **Request bodies are capped at 512 KiB** (413 above it) for every route, checked while reading so an oversized body is never buffered whole. Calculator member IDs are trimmed. Both came from the #41 review.

Proposed in #9 part 2 (2026-11-10), for partner review:

- **Settlement confirmation authority** (an open question below). Only the payer or the receiver may record a payment. When the receiver records it, it is confirmed at once; when the payer does, it stays PENDING until the receiver confirms or disputes it, once. PENDING and DISPUTED payments don't count toward balances. Resolving disputes is left to the admin portal (#11).
- **The server recomputes shares.** The add-expense dialog sends its computed shares; the API rejects them unless they add up to the amount exactly and, for EQUAL and PERCENTAGE, equal what the same finance engines compute. EXACT and ITEMIZED shares are taken as given. No item breakdown is stored for ITEMIZED.
- **Every member may change any expense** in their group (US-5: no per-group roles). PATCH replaces the whole expense and its splits; a missing `category` keeps the current one. DELETE removes the expense; the #8 audit event keeps its history.
- **Archived groups are read-only:** expense, payment, and join requests answer 409 `group_archived`, while reads still work.
- **Invite codes** are the group's existing UUID, shown to members in the group detail. They don't expire yet (invite-token expiration stays an open question).

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

Open questions: partner approval of the proposed UI mockups and whether an earlier Claude/Figma prototype exists; invite-token expiration; settlement confirmation authority (proposed in [API decisions](#api-decisions), pending partner review). Resolve and update this spec and `AGENTS.md` as decisions are made. Resolved: admin scope (US-6), audit-event persistence (US-4), and the [data model decisions](#data-model-decisions) in #2; equal split when the payer is excluded (US-2) in #5.

### Course references

- [CS6983 Fall 2026 course](https://johnguerra.co/classes/aiCoding_fall_2026/)
- [Week 6 — IDE-Centric AI Coding](https://johnguerra.co/lectures/aiCoding_fall2026/06_IDE_AI_Coding/)
- [Week 7 — Agile/Scrum + Pair Workflow](https://johnguerra.co/lectures/aiCoding_fall2026/07_Advanced_IDE_Agile/)
