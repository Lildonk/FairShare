# FairShare — Proposed UI Mockups (HW3)

These are **four newly drafted visual concepts**, based on the pair's FairShare architecture/feature blueprint. They are **not** screenshots of an already implemented app or of an earlier Claude/Figma Artifact. Review them together and use them as reference screens for Antigravity development.

**Privacy / demo data:** all people are labeled `Member A` through `Member E`, with avatar IDs `U1`–`U5`. No real personal names or user data are included. The trip, amounts, and dates are fictional examples.

## Screens

| Design | Preview | Behaviors required |
| --- | --- | --- |
| 01 — Authentication | [Open Auth SVG](01-auth.svg) | Sign in / create account, validation and error states. |
| 02 — Group Dashboard | [Open Dashboard SVG](02-group-dashboard.svg) | Recent expenses, total amount, signed per-member net balances, and grouped navigation. |
| 03 — Add Expense | [Open Expense Modal SVG](03-add-expense.svg) | Payer, description, receipt amount, date, participants, four split-mode selectors and live cent-preserving preview. |
| 04 — Settlement | [Open Settlement SVG](04-settlements.svg) | Readable transfer instructions, Record Payment, and signed member balances. |

The add-expense mockup demonstrates a **$120.01** EQUAL expense split among three members as **$40.01 + $40.00 + $40.00** with the payer receiving the remainder cent.

The settlement mockup uses five signed net balances:

| Person | Net |
| --- | ---: |
| Member A | +$32.18 |
| Member B | −$41.20 |
| Member C | −$12.50 |
| Member D | +$15.32 |
| Member E | +$6.20 |

Recommended transfers in the concept: B → A $32.18; B → D $9.02; C → D $6.30; C → E $6.20. These clear every balance (sum of net values = 0; total paid = $53.70) and are **a valid greedy settlement plan**, not a guaranteed global minimum-transfer solution.

## Implementation guidance

- Match layout hierarchy, screen purpose, color tokens, spacing, labels, and high-level flow—not exact pixel positions.
- Make responsive mobile versions, keyboard-accessible dialogs, visible focus, input validation, error/loading/empty states, and non-color balance labeling.
- Use real verified application data at runtime; mockup amounts are illustrative only.
- Do not blindly implement decorative UI such as fake charts, unsupported OAuth providers, or any unapproved backend behavior.
- Confirm the final design with both partners before treating these conceptual screens as approved design requirements.

## Sources

- FairShare project's pair-authored Architecture & Specification Blueprint, Sections 1–6.
- [FairShare product and UX specification](../FAIRSHARE_PRODUCT_SPEC.md).
- [Course page](https://johnguerra.co/classes/aiCoding_fall_2026/).

**Created as part of the HW3 context-engineering setup, on the PR branch `docs/1-hw3-context-rules`.**
