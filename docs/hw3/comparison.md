# HW3 Part 3 — Before/After AI Experiment (Issue #4)

Feature: [Issue #4 — Debt Simplification Engine](https://github.com/Lildonk/FairShare/issues/4), run on 2026-10-28.

**Result:** with `AGENTS.md` active, the AI produced an integer-cent, validated, deterministic engine in the project's architecture. It passed **14/14** shared cases with **100% branch coverage**. Without rules, it produced a floating-point dollar implementation. That version passed **11/14**, failed type-checking, and silently rounded money. Neither run made Git commits, so neither run showed Red → Green TDD evidence.

## Setup

Both experiments start from the same baseline commit, `96a50c3` on `chore/hw3-experiment-baseline` (TypeScript 7.0.2, Vitest 5.0.5, `@vitest/coverage-v8`; no Next.js app).

| | Experiment A — Without Rules | Experiment B — With Rules |
|---|---|---|
| Worktree / branch | `../FairShare-no-rules` / `experiment/4-no-rules` | `../FairShare-with-rules` / `experiment/4-with-rules` |
| Context | `AGENTS.md` and `docs/` removed (commit `e672564`) | `AGENTS.md`, product spec, and mockups present |
| Tool | Antigravity, fresh Agent conversation | Antigravity, fresh Agent conversation |
| Model / settings | Claude Opus 4.6 (Thinking) | Claude Opus 4.6 (Thinking) |

Prompt for A, verbatim:

> Implement a TypeScript function that simplifies group debts. Given each participant's net balance, generate a list of transfers showing who should pay whom. Include unit tests.

Prompt for B: the same text, plus *"This is GitHub Issue #4 (Debt Simplification Engine). Follow AGENTS.md and the referenced product spec and mockups."* HW3 requires the with-rules run to reference the PRD and mockups. This sentence is the only difference between the two prompts.

After B finished, it was asked which files it had used. It reported:
- `AGENTS.md` was loaded automatically as a rule.
- It read `docs/FAIRSHARE_PRODUCT_SPEC.md` (US-1) and `docs/mockups/README.md`.
- It inspected `package.json` and `tsconfig.json`.
- It skipped the SVG mockups as not relevant to a pure engine.
- It had no access to GitHub Issue #4.

Neither implementation was edited before the results below were recorded.

## Evaluation method

1. **Each AI's own tests:** `npm test`, `npm run test:coverage`, and `npx tsc --noEmit` in its worktree. Raw output is in [`results/no-rules-own-tests.txt`](results/no-rules-own-tests.txt) and [`results/with-rules-own-tests.txt`](results/with-rules-own-tests.txt).
2. **Shared suite:** [`evaluation/shared-cases.ts`](evaluation/shared-cases.ts), which neither AI saw. It was checked against a reference implementation first (14/14). Thin adapters map each API to `{ id, netCents }[] → { from, to, amountCents }[]`. For A, cent values are passed as plain numbers, because A is unit-agnostic. To run it: check out `chore/hw3-experiment-baseline`, run `npm ci` and `git checkout docs/4-hw3-comparison -- docs/hw3`, then `npx vitest run docs/hw3/evaluation`. Output is in [`results/shared-suite.txt`](results/shared-suite.txt).
   - The suite intentionally contains three failing no-rules cases. When the project's Vitest config is added (Issue #1), limit `include` to `src/**` and `tests/**` so that `docs/hw3/` is not run in CI.

## Results

| Metric | Without Rules | With Rules |
|---|---|---|
| AI's own tests passed | 15/15 | 23/23 |
| Shared cases passed | **11/14** | **14/14** |
| Coverage (stmts / branches / funcs / lines) | 100 / 92.85 / 100 / 100 | 100 / 100 / 100 / 100 |
| `tsc --noEmit` | **Fails** (5 errors: ESM syntax in a CommonJS package under `verbatimModuleSyntax`) | Passes |
| Money representation | Floating-point "amounts" with `1e-9` epsilon and `round2()` | Integer cents (`balanceCents`, `amountCents`) |
| Input validation | Sum ≈ 0 only | Safe integer, finite, unique IDs, exact zero sum |
| Determinism across input order | No | Yes (sorted by ID, ties broken by ID) |
| Algorithm claim | "minimal list of transfers… near-optimal" (overclaims) | "greedy heuristic… does not guarantee the globally minimum number" (matches `AGENTS.md`) |
| TDD commits (failing tests before implementation) | None, no commits made | **None**, no commits made, even though `AGENTS.md` requires them |

### Shared-case breakdown

| Case | Without Rules | With Rules |
|---|---|---|
| Empty input → no transfers | Pass | Pass |
| All-zero balances → no transfers | Pass | Pass |
| Zero-balance members ignored | Pass | Pass |
| Single debtor, several creditors | Pass | Pass |
| Several debtors and creditors, ≤ N−1 | Pass | Pass |
| Unbalanced input rejected | Pass | Pass |
| Even cycle → no transfers | Pass | Pass |
| Uneven cycle settled | Pass | Pass |
| Fractional cents rejected | **Fail** (accepted) | Pass |
| Unsafe integers rejected | **Fail** (accepted) | Pass |
| One-cent balances exact | Pass | Pass |
| Same input → same output | Pass | Pass |
| Input order does not change output | **Fail** (ties resolved by insertion order) | Pass |
| Input not mutated | Pass | Pass |

### Financial-correctness probes (Without Rules)

These show the practical effect of floating-point money:

| Input (A's dollar units) | Output | Problem |
|---|---|---|
| `{ A: -0.015, B: 0.015 }` | `A → B 0.02` | A owes 0.015 but is told to pay 0.02: rounding silently changes the money. |
| `{ A: -10, B: 10.0000000001 }` | `A → B 10` | Unbalanced input is accepted, and the leftover is dropped silently. |

## HW3 comparison dimensions

| Dimension | Without Rules | With Rules |
|---|---|---|
| Code quality and consistency with project patterns | Single file in `src/`; floats; its JSDoc claims optimality; does not type-check. | Pure module with no I/O; shared types in `src/types/finance.ts`; `readonly` input; descriptive errors; type-checks under strict settings. |
| Understanding of design/mockup intent | No access to the design. Generic `{ from, to, amount }` with names as IDs. | Used the five-member settlement scenario from [`mockups/README.md`](../mockups/README.md) as a test. Output is `{ fromMemberId, toMemberId, amountCents }`, which feeds the settlement board's transfer instructions directly. It did not open the SVGs. |
| Naming conventions and architecture | `src/simplifyDebts.ts` (camelCase file, outside the planned folders) | `src/lib/finance/simplify-debts.ts` (kebab-case, in the required `src/lib/finance/`); colocated test; added `vitest.config.ts` scoped to the finance engine |
| Quality of tests generated | 15 flat tests. Several assert float behavior, such as "handles fractional / decimal amounts". No validation tests beyond the zero sum. No determinism or order tests. | 23 tests grouped by validation, edge cases, two-party, multi-party, determinism, and output invariants. Covers NaN, Infinity, unsafe integers, duplicate IDs, cycles, mutual debt, N−1, no self-transfers, and no input mutation. |

## What improved (or didn't)

**Improved with rules:**
- **Workflow.** B followed the "context first" workflow in `AGENTS.md`. It said it would read the required context files, inspected the project and existing `src/`, and wrote an "Issue #4 — Debt Simplification Engine: Plan" before making any edits ([screenshot](screenshots/b-with-rules-context-first-plan.png)). A went straight to implementation ([screenshot](screenshots/a-no-rules-prompt-and-result.png)).
- The non-negotiable financial rules in `AGENTS.md` (integer cents, exact zero sum, greedy matcher, N−1 bound, no "global minimum" claim) were applied almost word for word.
- The architecture and naming sections placed the code correctly.
- The mockup README gave it a realistic test scenario.
- These differences show up as measurable results: +3 shared cases, +7.15 percentage points of branch coverage, and a passing type-check.

**Did not improve:**
- **TDD evidence.** `AGENTS.md` requires failing tests to be committed before implementation, but the AI made no commits. We cannot show Red → Green in Git history for either run.
- **Unrequested config change.** B changed `package.json` from `"type": "commonjs"` to `"module"` without asking. It was a reasonable fix for the type errors A left behind, but it is a project-wide change outside the issue's scope.
- **Issue access.** B could not read GitHub Issue #4. It relied on the spec's US-1, which matches most but not all of the issue. For example, the issue asks to compute net balance as paid minus owed; neither run implemented that, because the prompt starts from net balances.
- **Minor quality points.**
  - It uses `localeCompare` for tie-breaking, which depends on the locale, so the ordering can differ between machines.
  - It sorts by ID first and then re-sorts by amount, so the first sort is redundant.

## Suggested `AGENTS.md` improvements

1. **Make TDD commits an explicit stop-point.** For example: "Before writing implementation code, run the new tests, show the failing output, and commit them as `test(...): ... (#N)`. Then implement and commit separately. If you cannot run Git, stop and ask."
2. **Restrict config changes.** "Do not change `package.json`, `tsconfig.json`, or tool configs outside the issue's scope without asking; explain why a change is needed."
3. **Ask for the issue text when it is unavailable.** "If you cannot open the GitHub issue, ask the user to paste its acceptance criteria before starting."
4. **Define determinism precisely.** "Break ties with ordinal string comparison (`a < b`), not `localeCompare`; output must not depend on input order or locale."
5. **Map acceptance criteria to tests.** Ask the AI to list each acceptance criterion with the test that covers it in its final summary, so gaps like the paid − owed criterion surface immediately.

## Screenshots and generated code

- **Screenshots** (Antigravity; the model selector is visible in each):
  - [A: prompt and result](screenshots/a-no-rules-prompt-and-result.png)
  - [B: prompt and result](screenshots/b-with-rules-prompt-and-result.png), which also shows B's unrequested `package.json` `"type"` change
  - [B: which rules and documents it read](screenshots/b-with-rules-context-answer.png)
  - [B: reads context and proposes a plan before editing](screenshots/b-with-rules-context-first-plan.png)
  - Terminal results are kept as text logs in [`results/`](results/).
- **Generated code:** copied unmodified into [`generated/no-rules/`](generated/no-rules/) and [`generated/with-rules/`](generated/with-rules/). B's `package.json` change is in [`package.json.diff`](generated/with-rules/package.json.diff).
