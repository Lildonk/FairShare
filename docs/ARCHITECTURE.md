# Architecture

FairShare is one Next.js 15 application: React pages and REST route handlers in the same deployment, backed by PostgreSQL through Prisma. The money logic lives in pure TypeScript modules with no I/O, so the same code runs in the browser (live previews), in the API (server-side checks), and in the tests.

## System overview

```mermaid
flowchart LR
  subgraph Browser
    UI["React pages<br/>/login · /register · /groups<br/>/groups/[groupId] · /admin"]
  end

  subgraph Vercel["Vercel (Next.js 15)"]
    MW["middleware.ts<br/>session check for pages"]
    Pages["Server components<br/>load data per request"]
    API["Route handlers /api/v1/*<br/>auth · groups · expenses<br/>settlements · ledger · admin<br/>public calculators"]
    Docs["/api/docs<br/>Swagger UI + OpenAPI 3.0"]
    subgraph Lib["src/lib"]
      Auth["auth/<br/>JWT (jose) · bcrypt · Google OIDC<br/>requireUser · requireGroupMember · requireAdmin"]
      Finance["finance/ (pure)<br/>splits · balances · simplifyDebts"]
      Audit["audit/ (pure)<br/>CSV/JSON export"]
      DB["db/<br/>shared Prisma client<br/>integer-cents guard · recordAuditEvent"]
    end
  end

  Neon[("Neon PostgreSQL 17<br/>main = production<br/>preview/pr-N = previews")]
  Google["Google OpenID Connect"]

  UI -->|"HttpOnly session cookie"| MW --> Pages
  UI -->|"fetch JSON"| API
  Pages --> Auth & DB & Finance
  API --> Auth & Finance & Audit & DB
  Auth -->|"sign-in"| Google
  DB -->|"Prisma"| Neon
```

**Request path for a change** (for example, adding an expense):

1. The add-expense dialog computes the shares with `src/lib/finance` and shows the live preview.
2. The dialog posts the expense to `POST /api/v1/groups/:groupId/expenses`.
3. `requireGroupMember(..., { write: true })` checks the session cookie, the membership (a non-member gets 404), and that the group isn't archived (409).
4. `validateExpenseInput` re-runs the same finance engines. A client's shares that don't match are refused.
5. One `prisma.$transaction` writes the expense, its splits, and an append-only `AuditEvent`.
6. The page refetches with `router.refresh()`, and the settlement board recomputes balances and transfers.

## Layers and rules

| Layer | Folder | May depend on | Notes |
| --- | --- | --- | --- |
| Pages and components | `src/app/**/page.tsx`, `src/components/` | lib, API over HTTP | Server components load data, and `'use client'` only where users interact |
| Route handlers | `src/app/api/v1/` | `lib/auth`, `lib/api`, `lib/db`, `lib/finance` | Thin: guard, then validate, then one transaction |
| Input validation | `src/lib/api/` | `lib/finance` | Pure; turns untrusted JSON into typed input or field errors |
| Authorization | `src/lib/auth/` | `lib/db` | Every private handler starts with a guard; roles are read from the database |
| Money logic | `src/lib/finance/` | nothing | Integer cents, deterministic ordinal tie-breaks, 100% test coverage enforced in CI |
| Persistence | `src/lib/db/` | Prisma | Only the shared client, which rejects non-integer amounts Prisma would silently truncate |

The detailed rules are in [AGENTS.md](../AGENTS.md); the product decisions behind them are in the [product spec](FAIRSHARE_PRODUCT_SPEC.md).

## Security model

- **Sessions:** HS256 JWT in an HttpOnly, SameSite=Lax cookie, with issuer and audience checks. Passwords use bcrypt.
- **Google sign-in:** verified server-side with `openid-client`. It never merges into an existing password account by email.
- **Authorization:** membership is checked on every group route. Non-members get the same 404 as an unknown ID, so group IDs can't be probed.
  - Admin is a platform-wide role, read from the database on every request.
  - Archived groups refuse every write with 409.
- **Input:** every body is validated at the boundary and capped at 512 KiB (413). All database access goes through Prisma, with no raw SQL in app code.
- **History:** `AuditEvent` rows are append-only, enforced by a database trigger. User references from expenses, splits, and settlements use `onDelete: Restrict`.
- **Output:** CSV exports neutralize spreadsheet formulas. `/api/docs` has a strict Content-Security-Policy, and its CDN files carry SRI hashes.
- **Pipeline:**
  - CodeQL, `npm audit` (fails on critical), and dependency review run on every PR.
  - Third-party deploy actions that receive secrets are pinned by commit.

## Delivery pipeline

```mermaid
flowchart TB
  PR["Pull request<br/>(branch per issue)"] --> CI
  subgraph CI["CI workflow (every PR and push to main)"]
    direction LR
    S1["1. Install, lint,<br/>typecheck"] --> S2["2. Unit tests<br/>+ coverage gate"] --> S3["3. Migrate, seed,<br/>integration tests"] --> S4["4. Production<br/>build"] --> S5["5. Playwright<br/>E2E"]
  end
  PR --> SEC["Security workflow<br/>CodeQL · npm audit · dependency review"]
  PR --> PREV["Deploy: preview<br/>Neon branch preview/pr-N (migrated + seeded)<br/>→ Vercel preview URL commented on the PR"]
  PR -->|"partner review + approval"| MERGE["Merge to main"]
  MERGE --> CI2["CI on main"]
  CI2 -->|"success"| PROD["Deploy: production<br/>prisma migrate deploy → Vercel --prod"]
  CLOSE["PR closed"] --> DEL["Delete Neon branch"]
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for environments, secrets, and rollback, and the README's CI/CD section for each stage.
