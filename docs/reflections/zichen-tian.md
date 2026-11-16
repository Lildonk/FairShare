# Individual Reflection — Zichen Tian

**Project:** FairShare (Project 2) · **Partner:** Zheqi Lv · **GitHub:** [@tianzach](https://github.com/tianzach)

I owned FairShare's money features and its delivery pipeline: the debt-simplification and itemized-split engines (#4, #6), the add-expense dialog (#5), the settlement board and group page (#7), the audit ledger, disputes, and export (#8), and CI/CD with Vercel and Neon deployments (#24). AI agents wrote almost all of this code, first Antigravity and then Claude Code. The most useful thing I learned is that an agent's output is only as good as the context and constraints it gets.

The HW3 experiment made this concrete. On the same debt-simplification task, the agent without our rules file used floating-point dollars and passed 11 of 14 shared cases. With AGENTS.md, it used integer cents and passed all 14. After that, I treated AGENTS.md like code: every rule change went through a reviewed PR, with the reason recorded in its revision history. When our Antigravity quota ran out in the middle of an issue and we switched to Claude Code, the rules came along unchanged, because they lived in the repository rather than in a chat.

The rule that mattered most was the RED stop point: commit failing tests before any implementation. It made me read and agree with the tests before the agent wrote code, so I reviewed intent instead of skimming large diffs.

AI did not replace human review. Zheqi's reviews caught a payment that was counted twice after a refetch and a dialog without a focus trap. My reviews caught an open redirect and a bypass of the integer-cents guard. Each fix started with a failing test.

What I would change: I set up deployment last, so most reviews happened without preview URLs, and our review queue piled up near the deadline. Next time, I would ship a deploy preview in the first sprint and agree on a 24-hour review turnaround from day one.
