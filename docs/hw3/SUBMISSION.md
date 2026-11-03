# HW3 Submission Index — FairShare

**Course:** CS6983 AI-Assisted Coding, HW3 Context Engineering — Rules & Process for Your P2 Project  
**Team:** Zheqi Lv (@Lildonk) and Zichen Tian (@tianzach)

## 1. GitHub and Scrum (10 points)

- [Repository](https://github.com/Lildonk/FairShare)
- [GitHub Projects listing](https://github.com/Lildonk?tab=projects): **FairShare — P2 Agile Development** (board with Backlog, Sprint Todo, In Progress, In Review, Done). **Before Canvas submission, verify that the instructor can access the board and paste its exact URL into the Canvas submission.**
- [All 11 Issues](https://github.com/Lildonk/FairShare/issues): acceptance-checklist issues with assignees, labels, and milestones.
- [Sprint 1 milestone](https://github.com/Lildonk/FairShare/milestone/1): six issues (#1–#6), 7-day sprint Oct 29–Nov 4, 2026.
- [Sprint 2 milestone](https://github.com/Lildonk/FairShare/milestone/2): five issues (#7–#11), 7-day sprint Nov 5–Nov 11, 2026.
- Board and milestone screenshots are included in the **Canvas submission packet**.

## 2. Rules, PRD, and mockups (14 points)

- [AGENTS.md](../../AGENTS.md): shared rules v2, with explicit revision history.
- [FairShare product specification](../FAIRSHARE_PRODUCT_SPEC.md): user stories, acceptance criteria, architectural contracts and flows.
- [FairShare UI mockups](../mockups/README.md): authentication, group dashboard, expense modal and settlement board; Google sign-in is a team-requested addition.
- [Initial rules PR #12](https://github.com/Lildonk/FairShare/pull/12) and [UI mockup PR #13](https://github.com/Lildonk/FairShare/pull/13).

## 3. Before/after experiment (10 points)

- [Before/after comparison](comparison.md): methodology, measured differences and caveats.
- [AI-generated implementations](generated/): both conditions, preserved as evidence.
- [Independent shared evaluation](evaluation/): 14-case suite and adapters.
- [Test logs](results/): test runs, coverage, type-check, and shared-suite output.
- [Antigravity screenshots](screenshots/): prompts, planning, implementation and referenced rules.
- [Experiment PR #14](https://github.com/Lildonk/FairShare/pull/14).

**Reported results:** independent cases 11/14 without rules vs 14/14 with rules; branch coverage 92.85% vs 100%; type-check fails vs passes. **Neither run produced Red → Green commits.** Prompts differed by an explicit context-reference sentence, so this is evidence of the rules-plus-context workflow, not an isolated causal estimate for the rules file alone.

## 4. Reflection and iteration (6 points)

- [HW3 reflection](reflection.md) — 1–2 page standalone reflection when formatted for submission.
- [Rules refinement PR #15](https://github.com/Lildonk/FairShare/pull/15): adds mandatory TDD stop point, safe configuration changes, issue-availability fallback, locale-independent tie-breaking and acceptance-criteria-to-test mapping.
- The v2 rules were merged. A subsequent repeat experiment verifying v2 was **not** reported and must not be claimed.

## Final review before upload

1. Confirm the Project board is viewable by the instructor (its earlier screenshot included a lock icon).
2. Ensure the reflection PR is reviewed/merged so the repository link resolves on `main`.
3. Upload the combined HW3 evidence PDF to Canvas (and optional editable reflection DOCX).
4. Do not claim either experiment produced actual TDD commits or that the mockups were generated in Claude Web/Figma.
