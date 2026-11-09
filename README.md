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

The sample data is deterministic: fixed ids and timestamps, and amounts in integer cents whose splits add up exactly. It has five users on the reserved `.test` domain (`alice@`, `bob@`, `charlie@`, `dana@`, and the platform admin `admin@fairshare.test`), three groups (Lake Tahoe Trip, Apartment 4B, and the archived Spring Break 2026), one expense of each split type, and settlements in each status. Running the seed again restores these rows without duplicating them. Seed users have no passwords until sign-in is added in #3.

**Using the database in code:** always import the shared client with `import { prisma } from '@/lib/db/prisma'`, and never create another `PrismaClient`. The shared client rejects non-integer amounts (`amountCents`, `owedCents`, `allocatedBps`); plain Prisma silently truncates them (19.99 is stored as 19).

**Changing the schema:** edit `prisma/schema.prisma`, run `npm run db:migrate -- --name <short-description>`, and commit the new folder in `prisma/migrations/`. CHECK constraints on money columns are written by hand in the migration SQL because the Prisma schema cannot express them. The reasons for each schema choice are in the [data model decisions](docs/FAIRSHARE_PRODUCT_SPEC.md#data-model-decisions).

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

Authentication variables (such as `JWT_SECRET`) arrive with #3.

> **Note:** Never commit `.env` or `.env.local` files. They are listed in `.gitignore`.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, TailwindCSS, Lucide React
- **Backend:** Next.js Route Handlers (`/api/v1`)
- **Database:** PostgreSQL 17 with Prisma ORM 6
- **Auth:** JWT + bcrypt, Google OAuth 2.0 / OIDC
- **State:** Zustand + React Hooks
- **Testing:** Vitest, React Testing Library, Playwright
- **CI/CD:** GitHub Actions

## Development Workflow

1. Create a branch per issue: `feature/<number>-description`
2. Write failing tests first (Red), implement (Green), refactor
3. Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(scope): message (#N)`
4. Open a PR to `main` — requires partner review and CI passing
5. No direct push to `main`

## License

Private — course project for CS6983 Fall 2026.
