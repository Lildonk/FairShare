# HW3 Part 3 — Before/After AI Experiment (Issue #4)

Feature: [Issue #4 — Debt Simplification Engine](https://github.com/Lildonk/FairShare/issues/4).
Status: **setup complete; experiment runs not yet recorded.** Every `TBD` below must be filled from an actual run.

## Setup

Both experiments start from the same baseline commit on `chore/hw3-experiment-baseline` (TypeScript, Vitest, `@vitest/coverage-v8`; no Next.js app).

| | Experiment A — Without Rules | Experiment B — With Rules |
|---|---|---|
| Worktree | `../FairShare-no-rules` | `../FairShare-with-rules` |
| Branch | `experiment/4-no-rules` | `experiment/4-with-rules` |
| Context | `AGENTS.md` and `docs/` removed (commit `e672564`) | `AGENTS.md`, product spec, and mockups present |
| Tool / model / settings | TBD | TBD (must match A) |
| Conversation | Fresh | Fresh |

Prompt given to both, verbatim:

> Implement a TypeScript function that simplifies group debts. Given each participant's net balance, generate a list of transfers showing who should pay whom. Include unit tests.

Rules for the experiment: no manual fixes before recording initial results, and no TDD commits created on the AI's behalf.

## Evaluation method

1. Each AI's own tests: `npm test` and `npm run test:coverage` in its worktree.
2. A shared suite, [`evaluation/shared-cases.ts`](evaluation/shared-cases.ts), that neither AI saw. Each implementation is wrapped in a thin adapter (`evaluation/<experiment>.test.ts`) mapping its API to `{ id, netCents }[] → { from, to, amountCents }[]`. The suite covers empty/zero balances, multiple debtors/creditors, unbalanced input, cyclic debts, integer-cent precision, and determinism. It was checked against a reference implementation (14/14 passed) before use.

Run: `npx vitest run docs/hw3/evaluation`

## Results

Measurable results:

| Metric | Without Rules | With Rules |
|---|---|---|
| AI's own tests passed | TBD | TBD |
| Shared cases passed (of 14) | TBD | TBD |
| Edge cases handled | TBD | TBD |
| Test coverage (statements / branches) | TBD | TBD |
| Financial correctness (integer cents, zero-sum validation, ≤ N−1 transfers) | TBD | TBD |
| TDD followed (separate failing-test commit before implementation) | TBD | TBD |

HW3 comparison dimensions:

| Dimension | Without Rules | With Rules |
|---|---|---|
| Code quality and consistency with project patterns (pure module, strict types, no `any`) | TBD | TBD |
| Understanding of design/mockup intent (transfer output usable by the [settlement board mockup](../mockups/04-settlements.svg)) | TBD | TBD |
| Naming conventions and architecture (`src/lib/finance/`, kebab-case files, Conventional Commits with `(#4)`) | TBD | TBD |
| Quality of tests generated (edge cases, descriptive names, coverage) | TBD | TBD |

### Shared-case breakdown

| Case | Without Rules | With Rules |
|---|---|---|
| Empty input → no transfers | TBD | TBD |
| All-zero balances → no transfers | TBD | TBD |
| Zero-balance members ignored | TBD | TBD |
| Single debtor, several creditors | TBD | TBD |
| Several debtors and creditors, ≤ N−1 | TBD | TBD |
| Unbalanced input rejected | TBD | TBD |
| Even cycle → no transfers | TBD | TBD |
| Uneven cycle settled | TBD | TBD |
| Fractional cents rejected | TBD | TBD |
| Unsafe integers rejected | TBD | TBD |
| One-cent balances exact | TBD | TBD |
| Same input → same output | TBD | TBD |
| Input order does not change output | TBD | TBD |
| Input not mutated | TBD | TBD |

## Screenshots

Stored in [`screenshots/`](screenshots/): the prompt, the AI's final message, `npm test`, `npm run test:coverage`, and (for B) `git log`.

## Code differences

Generated code is copied unmodified into [`generated/no-rules/`](generated/) and [`generated/with-rules/`](generated/). TBD: key differences in API shape, money representation, validation, and file layout.

## What improved (or didn't)

TBD.

## Suggested `AGENTS.md` improvements

TBD, based on rules the with-rules run ignored or misread.
