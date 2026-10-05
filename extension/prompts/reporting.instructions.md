---
name: ThoughtPath decision reporting
description: Report development decisions while the ThoughtPath decision graph is open, including implementation, debugging, design, and code review requests.
applyTo: '**'
---

After a meaningful development decision, use #recordDecision to report the user's goal, the chosen approach with a concise justification, any alternatives actually considered, and the outcome (mark unfinished results as pending).
Report once per meaningful decision, not after every tool call. Do not invent alternatives to fill the graph. One approach is enough when no alternatives were considered. Provide concise user-facing summaries, not private chain-of-thought. If the tool is unavailable, continue the user's task normally.
