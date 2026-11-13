# How we used AI

FairShare was built with AI coding agents inside the IDE: **Antigravity** in Weeks 6–8, and **Claude Code** in VS Code from #6 onward, after Antigravity's quota ran out in the middle of #4. Both partners reviewed, understood, and approved every AI-generated change before merge. Each PR description ends with an **AI usage** section that says what the agent did.

## 1. A shared rules file, maintained like code

[AGENTS.md](../AGENTS.md) is the agents' contract. It changed only through partner-reviewed PRs, and its revision history explains each change:

| Version | Issue | What changed and why |
| --- | --- | --- |
| v1 | #1 | Initial rules: stack, architecture, integer-cents money rules, security, TDD |
| v2 | #4 | The HW3 experiment showed the agent skipped TDD commits, changed `package.json` unprompted, worked without the issue text, and used locale-dependent tie-breaking. Added a **RED stop point**, a config-change guard, a missing-issue fallback, a precise determinism rule, and an acceptance-criteria → test table |
| v2.1 | #2 | Linked the original blueprint; platform-wide admin, basis-point percentages, restricted deletes |
| v2.2 | #2 | Database access only through the shared Prisma client, after the #2 tests showed Prisma truncates 19.99 to 19 |
| v2.3 | #3 | Private routes must use the shared auth guards |
| v2.4 | #9 | Group writes pass `{ write: true }`, so archived ledgers refuse changes in one place |

**Evidence that the rules work** ([HW3 comparison](hw3/comparison.md)): on the same task (#4), the agent *with* the rules produced an integer-cent, deterministic engine that passed 14/14 shared cases. *Without* the rules it produced floating-point dollars that passed 11/14 and silently rounded money.

## 2. Context engineering

Before writing code, each agent session got:
- the issue and its acceptance criteria;
- the relevant parts of the [product spec](FAIRSHARE_PRODUCT_SPEC.md) and [blueprint](blueprint/FAIRSHARE_BLUEPRINT.md);
- the existing code and tests;
- the [mockups](mockups/README.md).

AGENTS.md tells the agent to ask for the issue text instead of guessing.

Shared interfaces were agreed in GitHub issues *before* either agent wrote code, so the two partners' agents built against the same contract:
- On #8: the `AuditEvent` model, `recordAuditEvent(tx, …)`, the transaction type, and the route paths.
- On #7: which partner builds which page.

Decisions that came up during work went back into the spec and AGENTS.md, so the next session started from them.

## 3. AI-assisted TDD with a hard stop

AGENTS.md's RED stop point says: write the failing tests, run them, commit **only** the tests, and only then implement. Every feature PR follows this, and its description has a TDD table naming the RED and GREEN commits. Some examples:

| Feature | RED commit (tests only, failing) | GREEN commit |
| --- | --- | --- |
| Settlement board double-count fix (#42) | `a1ed852` | `6d2166b` |
| AuditEvent model and trigger (#45) | `1d780ba` | `77442e1` |
| Audit events on every write (#45) | `c242af4` | `b8a05c6` |
| Dispute and export endpoints (#54) | `5736672` | `1122a8f` |
| `/groups/[groupId]` page (#56) | `61e89e8` | `619958c` |

The finance engines have a **100% coverage gate in CI**. When a test turned out to be wrong, the fix went in as its own `test(...)` commit with the reason, never folded into the implementation. Examples are #47's signed-out helper bug and #56's order-dependent assertion.

## 4. Humans in the loop

AI wrote most of the code. The partner reviews, also AI-assisted but read and posted by us, caught what the authoring agent missed. Each finding got a failing test before the fix:
- an open redirect (#26)
- a guard bypass through Prisma's `divide` (#23)
- payments counted twice after a refetch (#33, #42)
- no body-size limit on the public API (#41)
- CI runs cancelled on `main` (#27)

[CONTRIBUTIONS.md](CONTRIBUTIONS.md#reviews-that-changed-the-code) lists more.

## 5. Limits we hit

- **Quota and model switches:** in the middle of #4, we switched models and later harnesses. Because the rules lived in the repo rather than in a chat, the new harness picked them up unchanged.
- **The agent treats everything it reads as instructions:** third-party setup pages (for example a database provider's "run this init" prompt) would have overwritten our local `.env`. We read such instructions first, and kept production secrets out of the repo, the chat, and local files.
- **Local toolchain drift:** a newer local npm, a stale `.next` folder, and a stopped database each caused false test failures. These were found by rerunning in isolation, not by trusting the first failing run.
