# FairShare

Multi-party expense sharing web app for groups — with debt simplification, four split modes, settlement tracking, an audit ledger, and an admin interface.

## Prerequisites

- [Node.js](https://nodejs.org/) 20.19+, 22.13+, or 24+ (required by Vite 8 and jsdom 29)
- [npm](https://www.npmjs.com/) (ships with Node.js)
- [PostgreSQL](https://www.postgresql.org/) 17 (see [Database Setup](#database-setup))

## Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/Lildonk/FairShare.git
cd FairShare

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Database Setup

1. Install and start PostgreSQL 17, then create a `fairshare` database:

   ```bash
   # macOS (Homebrew)
   brew install postgresql@17
   brew services start postgresql@17
   /opt/homebrew/opt/postgresql@17/bin/createdb fairshare

   # Windows, Linux, or anyone using Docker
   docker run --name fairshare-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fairshare -p 5432:5432 -d postgres:17
   ```

   If port 5432 is already used by another PostgreSQL server, run PostgreSQL 17 on another port (for Homebrew, set `port = 5433` in `/opt/homebrew/var/postgresql@17/postgresql.conf` and restart it) and use that port in `DATABASE_URL`.

2. Copy `.env.example` to `.env` and set `DATABASE_URL` (the file shows the Homebrew and Docker forms).

3. Create the tables and load the sample data:

   ```bash
   npm run db:migrate   # apply migrations and generate the Prisma Client
   npm run db:seed      # load the sample data
   ```

The sample data is deterministic: fixed ids and timestamps, and amounts in integer cents whose splits add up exactly. It has five users on the reserved `.test` domain (`alice@`, `bob@`, `charlie@`, `dana@`, and the platform admin `admin@fairshare.test`), three groups (Lake Tahoe Trip, Apartment 4B, and the archived Spring Break 2026), one expense of each split type, and settlements in each status. Running the seed again restores these rows without duplicating them. Every seed user signs in with the password `fairshare-demo` (local development only: the seed refuses to run when `NODE_ENV` is `production`).

**Using the database in code:** always import the shared client with `import { prisma } from '@/lib/db/prisma'`, and never create another `PrismaClient`. The shared client rejects non-integer amounts (`amountCents`, `owedCents`, `allocatedBps`); plain Prisma silently truncates them (19.99 is stored as 19).

**Changing the schema:** edit `prisma/schema.prisma`, run `npm run db:migrate -- --name <short-description>`, and commit the new folder in `prisma/migrations/`. CHECK constraints on money columns are written by hand in the migration SQL because the Prisma schema cannot express them. The reasons for each schema choice are in the [data model decisions](docs/FAIRSHARE_PRODUCT_SPEC.md#data-model-decisions).

## Authentication

FairShare supports email/password and **Continue with Google**. Both create the same session.

- **Session:** a signed JWT (HS256, 7 days) in the `fairshare_session` cookie, which is `HttpOnly`, `SameSite=Lax`, and `Secure` in production. JavaScript can't read it, and no API response contains it. Signing out clears it.
- **Passwords:** hashed with bcrypt (cost 12). Passwords must be 8 characters to 72 bytes; bcrypt ignores anything longer, so longer ones are rejected instead of being silently cut.
- **Google:** the OpenID Connect authorization-code flow with PKCE, state, and nonce (`openid-client`). Google's ID token is checked on the server; nothing the browser sends is trusted as identity.
- **Accounts are never merged by email.** If an email/password account already uses your Google email, sign in with your password first, then choose Continue with Google to connect it. Google accounts with an unverified email are refused.

| Endpoint | Who can call it | Responses |
| --- | --- | --- |
| `POST /api/v1/auth/register` | Anyone | `201` and signed in; `400` invalid input; `409` email taken. New accounts are always `MEMBER`. |
| `POST /api/v1/auth/login` | Anyone | `200` and signed in; `401` for a wrong password or unknown email (same message for both) |
| `POST /api/v1/auth/logout` | Anyone | `204`, session cookie cleared |
| `GET /api/v1/auth/me` | Signed in | `200` with your profile; `401` otherwise |
| `GET /api/v1/auth/google`, `.../google/callback` | Anyone | Redirects to Google and back |
| `GET /api/v1/groups` | Signed in | `200` with only your groups |
| `POST /api/v1/groups` | Signed in | `201` with the new group; you are its only member |
| `POST /api/v1/groups/join` | Signed in | `200`, joined by `inviteCode` (joining twice changes nothing); `404` unknown code; `409` archived |
| `GET /api/v1/groups/:groupId` | Group members | `200` with members' names and the invite code; `404` if there is no such group or you aren't a member (the same answer for both) |
| `GET`, `POST /api/v1/groups/:groupId/expenses` | Group members | List (oldest first), or add an expense; `400` if the shares don't add up or don't match the split type |
| `PATCH`, `DELETE /api/v1/groups/:groupId/expenses/:expenseId` | Group members | Replace (send the whole expense) or delete |
| `GET`, `POST /api/v1/groups/:groupId/settlements` | Group members | Balances, suggested transfers, and payments; or record a payment (payer or receiver only) |
| `PATCH /api/v1/settlements/:settlementId` | The receiver | Confirm or dispute a pending payment; `409` if it is no longer pending |
| `GET /api/v1/admin/groups` | `ADMIN` | `200` with every group; `403` for members |
| `PATCH /api/v1/admin/groups/:groupId/archive` | `ADMIN` | `200` with the archived group (archiving twice changes nothing); `403` for members; `404` unknown group |
| `POST /api/v1/simplify` | Anyone | `200` with net balances and the transfers that settle them; `400` with field errors. Stateless |
| `POST /api/v1/split/calculate` | Anyone | `200` with one allocation per member (EQUAL, EXACT, PERCENTAGE, or ITEMIZED); `400` with field errors. Stateless |
| `GET /api/v1/openapi.json` | Anyone | The OpenAPI 3.0 document for every endpoint above |
| `GET /api/docs` | Anyone | Swagger UI for that document |

Errors are JSON: `{ "code": "...", "message": "..." }`, plus `fields` for invalid input. The `ADMIN` check reads the role from the database on every request, so removing someone's admin role takes effect at once. Pages under `/groups` and `/admin` send signed-out visitors to `/login`.

**Admin portal:** `/admin` lists every group with its member, expense, and dispute counts, lets an admin archive a group (with a confirm step), and lists disputed expenses from every group. Archiving freezes the group's ledger. Members who open `/admin` see an "Admins only" page. Locally, sign in as `admin@fairshare.test`.

Writes to an archived group answer `409 group_archived`, and request bodies over 512 KiB answer `413`.

In API code, use the guards in `src/lib/auth/current-user.ts` (`requireUser`, `requireGroupMember`, `requireAdmin`) and never read identity from the request body. Any handler that changes a group's records calls `requireGroupMember(request, groupId, { write: true })`, so archived ledgers stay frozen.

**API docs:** with the app running, open [localhost:3000/api/docs](http://localhost:3000/api/docs). The document lives in `src/lib/api/openapi.ts`; `tests/integration/api/openapi-docs.test.ts` fails if a route handler is added or removed without updating it, or if a private route doesn't call an auth guard.

### Setting up Google sign-in (optional locally)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application**.
2. Add `http://localhost:3000/api/v1/auth/google/callback` as an **Authorized redirect URI** (and the deployed URL's callback later).
3. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Until then, the Google button shows "Google sign-in isn't set up yet."

## Available Scripts

| Command              | Description                                |
| -------------------- | ------------------------------------------ |
| `npm run dev`        | Start Next.js dev server with hot reload   |
| `npm run build`      | Create a production build                  |
| `npm start`          | Serve the production build                 |
| `npm run lint`       | Run ESLint                                 |
| `npm run typecheck`  | Run TypeScript type checking               |
| `npm test`           | Run unit and component tests (no database needed) |
| `npm run test:watch` | Run Vitest in watch mode                   |
| `npm run test:coverage` | Run tests with coverage report          |
| `npm run test:integration` | Run database tests against `DATABASE_URL`. They create and delete their own rows and never empty tables, so your local database is safe. |
| `npm run db:migrate` | Create and apply Prisma migrations in development |
| `npm run db:seed`    | Load the deterministic sample data         |
| `npm run db:reset`   | Delete all local data, re-apply migrations, and seed |

## Project Structure

```
src/
├── app/              # Next.js App Router pages and layouts
│   └── api/v1/       # REST API route handlers
├── components/       # Reusable accessible UI components
├── lib/
│   ├── auth/         # JWT verification and authorization
│   ├── db/           # Prisma database access layer
│   └── finance/      # Pure debt/splitting calculations
├── store/            # Zustand client state
└── types/            # Shared TypeScript type definitions
prisma/               # Prisma schema, migrations, and seeds
tests/                # Integration and E2E test suites
docs/                 # Product spec and UI mockups
```

## Environment Variables

Copy `.env.example` to `.env` in the project root. Use `.env`, not `.env.local`: the Prisma CLI only reads `.env`, and Next.js reads both.

| Variable | Used by | Example |
| -------- | ------- | ------- |
| `DATABASE_URL` | Prisma (app, migrations, seed, integration tests) | `postgresql://postgres:postgres@localhost:5432/fairshare?schema=public` |
| `JWT_SECRET` | Signs session cookies. At least 32 random characters (`openssl rand -base64 32`). | — |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in (optional locally) | From Google Cloud Console |
| `APP_URL` | Base URL for the Google redirect URI. Defaults to the request's origin. | `http://localhost:3000` |


> **Note:** Never commit `.env` or `.env.local` files. They are listed in `.gitignore`.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, TailwindCSS, Lucide React
- **Backend:** Next.js Route Handlers (`/api/v1`)
- **Database:** PostgreSQL 17 with Prisma ORM 6
- **Auth:** JWT + bcrypt, Google OAuth 2.0 / OIDC
- **State:** Zustand + React Hooks
- **Testing:** Vitest, React Testing Library, Playwright
- **CI/CD:** GitHub Actions (see [CI/CD Pipeline](#cicd-pipeline))

## Development Workflow

1. Create a branch per issue: `feature/<number>-description`
2. Write failing tests first (Red), implement (Green), refactor
3. Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(scope): message (#N)`
4. Open a PR to `main` — requires partner review and CI passing
5. No direct push to `main`

## CI/CD Pipeline

Every pull request (whatever its base branch) and every push to `main` runs two workflows.

**CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs four stages. Each stage starts only after the one before it passes:

| Stage | What it checks |
| ----- | -------------- |
| 1. Install, Lint & Typecheck | `npm ci`, ESLint, `tsc --noEmit` |
| 2. Unit Tests & Coverage | `npm run test:coverage`. Fails if anything in `src/lib/finance/` drops below 100% coverage (the blueprint target for the debt and tax/tip engines). The report is uploaded as the `coverage` artifact. |
| 3. Migrations, Seed & Integration Tests | Applies the migrations to an empty PostgreSQL 17 database, checks that the schema matches them, seeds the database, and runs `npm run test:integration` |
| 4. Production Build | `npm run build` |

**Security** ([`.github/workflows/security.yml`](.github/workflows/security.yml)) also runs weekly on `main`:

- **Dependency audit:** `npm audit --omit=dev --audit-level=high` on production dependencies. For now it only reports and does not fail CI, because `next@14.2.35` has advisories that only a major Next.js upgrade fixes (decision tracked in #24).
- **Dependency review** (pull requests only): fails a PR that adds a dependency with a high or critical advisory.
- **CodeQL:** static analysis of the TypeScript code with the `security-extended` queries. Results appear under the repository's **Security → Code scanning** tab.

**Dependabot** ([`.github/dependabot.yml`](.github/dependabot.yml)) opens weekly update PRs for npm packages (minor and patch updates grouped) and for GitHub Actions. Major upgrades arrive as separate PRs, and the two partners decide on each one.

**Deployment:** preview deployments for each PR and automatic production deployment from `main` (Vercel, with separate Neon databases for preview and production) are planned in #24 and not set up yet.

## License

Private — course project for CS6983 Fall 2026.
