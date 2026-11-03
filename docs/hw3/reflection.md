# HW3 Reflection — Context Engineering for FairShare

**Student:** Zheqi Lv (@Lildonk) · **Partner:** Zichen Tian (@tianzach)  
**Course project:** FairShare · **Experiment feature:** [Issue #4, Debt Simplification Engine](https://github.com/Lildonk/FairShare/issues/4)  
**Evidence:** [Comparison and raw results](comparison.md) · [Experiment PR #14](https://github.com/Lildonk/FairShare/pull/14) · [Rules refinement PR #15](https://github.com/Lildonk/FairShare/pull/15)

## From requirements to implementation

The most useful lesson from HW3 was that AI coding quality depends on what project context is available **before** implementation. FairShare's original blueprint describes debt settlement, integer-cent accuracy, four split modes, authorization, and a settlement dashboard. A short feature prompt alone does not communicate those constraints. We therefore used a root-level `AGENTS.md` to state our stack, architecture, naming rules, financial invariants, security and accessibility standards, testing expectations, and PR workflow. The separate [product specification](../FAIRSHARE_PRODUCT_SPEC.md) and [UI mockups](../mockups/README.md) give the agent detailed acceptance criteria and intended user flows without making the rules file excessively long.

These references translate design intent into code-level checks. For example, the rules require money in integer cents, exact zero-sum validation, deterministic output, and honest descriptions of the greedy settlement algorithm. The mockup documentation supplies a five-member settlement example. A pure calculation engine does not need to inspect each SVG screen, so visual-fidelity evidence for this particular experiment is limited.

## What our A/B experiment demonstrated

My teammate conducted the Issue #4 experiment in two clean worktrees from baseline commit `96a50c3`, using fresh Antigravity conversations and Claude Opus 4.6 (Thinking). Without rules, the implementation used floating-point dollars; with rules, it used integer cents and the planned `src/lib/finance/` architecture. We evaluated both using a **separate 14-case suite neither AI had seen**. The without-rules run passed **11/14** cases, while the with-rules run passed **14/14**. Branch coverage improved from **92.85% to 100%**, and TypeScript checking changed from failing to passing. The with-rules implementation also produced more thorough tests (23 rather than 15) and deterministic tie-breaking.

The experiment showed why passing an AI's own tests is not sufficient: both versions passed all of their self-generated tests, but the independent cases exposed fractional-cent handling, unsafe integers, and input-order sensitivity in the baseline. Still, this is a small comparison, **not proof that rules alone caused every improvement**. The with-rules prompt also explicitly referenced the issue and product documents. Both results should be understood as evidence that a more complete context-and-instructions workflow helped in this run.

## How Scrum supports our AI workflow

The GitHub Project board organizes work into **Backlog → Sprint Todo → In Progress → In Review → Done**. We created **11 issues** with acceptance criteria, owners, labels, and milestones: six in Sprint 1 and five in Sprint 2. Issue numbers and acceptance checklists make AI-generated changes reviewable: a small branch and PR can be checked against a specific objective rather than a vague request to “build FairShare.” Partner reviews also provide a human check on generated code and prevent the agent's suggestions from silently becoming project policy.

## What failed and what we changed

The with-rules run did **not** follow everything in version 1. Neither AI run made genuine Red → Green Git commits. The with-rules agent modified `package.json` outside the feature scope, could not read the GitHub issue directly, used locale-dependent `localeCompare`, and missed the issue's paid-minus-owed computation because the prompt supplied precomputed net balances. In [PR #15](https://github.com/Lildonk/FairShare/pull/15), the team refined `AGENTS.md` to add an explicit failing-test-and-commit stop point, a configuration-change approval rule, an issue-access fallback, ordinal tie-breaking, and an acceptance-criteria-to-test mapping. These are **documented refinements**, not claims that a second experiment has validated them yet.

## Changes for Sprint 2

For Sprint 2, I would keep context documents current as APIs and data models become real, pin actual package versions, and define group-scoped permissions before developing admin functions. We should add tests for authorization, archived ledgers, receipt rounding, and the full register-to-settlement journey, while preserving genuine Red/Green commits and partner review history. The major takeaway is that AI rules improve alignment and expose assumptions, but **independent tests, human review, and honest evidence remain essential**.
