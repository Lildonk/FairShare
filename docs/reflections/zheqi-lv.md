# Individual reflection — Zheqi Lv

I built FairShare's foundation and integration layer: the project setup and CI (#1), the database schema (#2), sign-in with email and Google (#3), the REST API with Swagger docs (#9), the admin portal (#11), the groups page (#50), and the Playwright browser tests (#10). I worked with Claude Code under our shared [AGENTS.md](../../AGENTS.md), where the AI had to commit failing tests before writing any code.

My role shifted from typing code to deciding what "done" means, reviewing every diff, and checking claims against reality. That checking mattered. Reviews caught an open redirect in sign-in, a way around our whole-cents rule, and a deploy setting that would have printed a database password in public logs. Once, my own tests were wrong: a default parameter meant my "signed-out" tests were actually signed in. The biggest lesson came last. Our first automated deploy passed every check yet broke the live site, because the database engine didn't match Vercel's servers. Green CI isn't the same as a working product, so I now verify the deployed app itself.

Next time I'd set up hosting in the first sprint, review my partner's PRs faster, and write standups on the day they happen.
