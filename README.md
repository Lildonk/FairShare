# FairShare

Multi-party expense sharing web app for groups — with debt simplification, four split modes, settlement tracking, an audit ledger, and an admin interface.

## Prerequisites

- [Node.js](https://nodejs.org/) v20+ (LTS recommended)
- [npm](https://www.npmjs.com/) (ships with Node.js)
- [PostgreSQL](https://www.postgresql.org/) 15+ (required for later issues; not needed for initial scaffold)

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

## Available Scripts

| Command              | Description                                |
| -------------------- | ------------------------------------------ |
| `npm run dev`        | Start Next.js dev server with hot reload   |
| `npm run build`      | Create a production build                  |
| `npm start`          | Serve the production build                 |
| `npm run lint`       | Run ESLint                                 |
| `npm run typecheck`  | Run TypeScript type checking               |
| `npm test`           | Run Vitest test suite                      |
| `npm run test:watch` | Run Vitest in watch mode                   |
| `npm run test:coverage` | Run tests with coverage report          |

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

Create a `.env.local` file in the project root (will be needed for database and auth in later issues):

```env
# Database (PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/fairshare"

# Authentication
JWT_SECRET="your-secret-key"
```

> **Note:** Never commit `.env` or `.env.local` files. They are listed in `.gitignore`.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, TailwindCSS, Lucide React
- **Backend:** Next.js Route Handlers (`/api/v1`)
- **Database:** PostgreSQL with Prisma ORM
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
