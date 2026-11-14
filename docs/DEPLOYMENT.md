# Deployment guide

FairShare runs on **Vercel** (the Next.js app) with **Neon** (serverless PostgreSQL 17). Deployments are driven by GitHub Actions ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)), so every step shows up in the pipeline next to CI (#24).

## Environments

| Environment | App | Database | Data | How it updates |
| --- | --- | --- | --- | --- |
| Local | `npm run dev` | PostgreSQL 17 on your machine (`DATABASE_URL` in `.env`) | `npm run db:seed` demo data | By hand |
| CI | `next start` in GitHub Actions | PostgreSQL 17 service container, created per run | Seeded per run | Every PR and push to `main` |
| **Preview** | A Vercel preview URL per PR | A branch per PR, `preview/pr-<number>`, in a **separate** Neon project (`fairshare-preview`) | Migrated and seeded with the demo data | Every push to the PR; the branch is deleted when the PR closes |
| **Production** | The Vercel production URL | The `main` branch of the Neon project `fairshare` | Real accounts only, never seeded | Automatically, after CI passes on `main` |

Each environment has its own database and its own `JWT_SECRET`. Previews live in a different Neon project, with its own roles and passwords, so a preview database starts empty (never a copy of production), and its credentials can't open the production database. A preview can't accept a production session either.

Preview connection strings never appear in the Actions logs: the workflow fetches them from the Neon API inside the step that uses them and masks them with `::add-mask::` first. Production's direct URL is a repository secret, which GitHub masks automatically.

## How a change reaches production

1. A PR opens: CI runs its stages, and the **Deploy** workflow creates `preview/pr-<n>` in the preview Neon project, applies the migrations, seeds it, deploys a Vercel preview, and comments the URL on the PR.
2. The partner reviews the code and the preview, then merges.
3. CI runs again on `main`. Only if it passes, **Deploy** builds that exact commit, applies the migrations to the production database (`prisma migrate deploy`), and deploys the prebuilt output to Vercel production. Building first means a failed build never leaves production migrated under the old code. Production deploys run one at a time, in merge order.
4. Closing the PR deletes its Neon branch.

The production database is migrated, never reset or seeded. The seed script also refuses to run when `NODE_ENV=production`.

## One-time setup

Do this once per project. It needs a Neon account, a Vercel account, and the GitHub repository's **owner** (on a personal-account repository, collaborators can't manage Actions secrets).

### 1. Neon

1. Sign in at [console.neon.tech](https://console.neon.tech) with GitHub and create a project named `fairshare`: PostgreSQL 17, region **AWS US East 1 (N. Virginia)**, next to Vercel's default function region `iad1`, so every query stays short.
2. On the project dashboard, open **Connect** for the `main` branch and copy two connection strings:
   - the **pooled** one (host contains `-pooler`): the app's runtime `DATABASE_URL`;
   - the **direct** one (pooling switched off): used only to run migrations.
3. Create a **second** project named `fairshare-preview` (same version and region). Previews branch from its empty `main`, never from production. On its **Settings → General**, copy the **Project ID**.
4. **Account settings → API keys**: create a key named `fairshare-github-actions`. It is shown once.

### 2. Vercel

1. Sign in at [vercel.com](https://vercel.com) with GitHub.
2. In this repository on your machine, link a new project (it creates the git-ignored `.vercel/project.json`):

   ```bash
   npx vercel@65.4.0 login
   npx vercel@65.4.0 link --yes --project fairshare
   cat .vercel/project.json   # orgId and projectId
   ```

   Don't connect the Git repository in the Vercel dashboard: GitHub Actions deploys, and a Git connection would deploy every commit twice.
3. Add the runtime variables (each command asks for the value, so it never lands in your shell history):

   ```bash
   npx vercel@65.4.0 env add DATABASE_URL production   # Neon pooled URL for main
   npx vercel@65.4.0 env add JWT_SECRET production      # openssl rand -base64 32
   npx vercel@65.4.0 env add JWT_SECRET preview         # a different random value
   ```

   Previews get their `DATABASE_URL` per deployment from the workflow, pointing at the PR's own Neon branch.
4. [vercel.com/account/tokens](https://vercel.com/account/tokens): create a dedicated token named `fairshare-github-actions`, scoped only to the team that owns the project, with a short expiration (for example 30 days). Renew it before it expires.
5. Optional: **Settings → Deployment Protection** is on by default, so only members of your Vercel team can open preview URLs. On the Hobby plan that is only the account owner; to let your partner open previews, turn protection off for previews or use a shareable link.

### 3. GitHub (repository owner)

```bash
R=Lildonk/FairShare
gh secret set VERCEL_TOKEN --repo $R                      # Vercel token
gh secret set VERCEL_ORG_ID --repo $R                     # orgId from .vercel/project.json
gh secret set VERCEL_PROJECT_ID --repo $R                 # projectId from .vercel/project.json
gh secret set PRODUCTION_DATABASE_URL_UNPOOLED --repo $R  # Neon direct URL for main
gh secret set NEON_API_KEY --repo $R                      # Neon API key (previews only)
gh variable set NEON_PREVIEW_PROJECT_ID --repo $R         # ID of fairshare-preview, never the production project
```

`gh secret set` asks for each value without echoing it. Until these exist, the deploy jobs skip without failing (Dependabot PRs never receive secrets, so they skip too).

### 4. First deployment

Re-run the latest **CI** run on `main` (or merge any PR). When it passes, **Deploy → Production deployment** prints the production URL in its summary.

### 5. An admin account in production

Production has no seed accounts. Register normally, then promote yourself in the Neon **SQL Editor** on the `main` branch:

```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@example.com';
```

The role is read from the database on every admin request, so it takes effect at once.

## Optional: Google sign-in

Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_URL` (the production URL) to the Vercel **Production** environment, and register `<APP_URL>/api/v1/auth/google/callback` as a redirect URI in Google Cloud Console. Without them, the Google button shows a friendly "not configured" error and email sign-in keeps working.

## Rolling back

In the Vercel dashboard, open **Deployments**, pick the last good production deployment, and choose **Promote to Production** (or run `npx vercel@65.4.0 rollback`). Migrations are additive, so the previous app version keeps working against the newer schema; if a migration itself must be undone, write a new migration that reverses it.
