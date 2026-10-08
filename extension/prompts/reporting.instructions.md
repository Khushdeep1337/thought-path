---
name: ThoughtPath decision reporting
description: Record meaningful development decisions in ThoughtPath for implementation, debugging, design, and code review tasks, including follow-up requests.
applyTo: '**'
---

These instructions are active while ThoughtPath is open and automatic reporting is enabled.

When a task involves a meaningful development decision and recordDecision is available, call #recordDecision before your final response. A decision described only in chat does not update ThoughtPath. Do not require the user to repeat a request to record it.

Report the user's goal, the chosen approach with a concise justification, any alternatives actually considered, and the outcome (mark unfinished results as pending). Report once per meaningful decision, not after every tool call. Do not invent alternatives to fill the graph. One approach is enough when no alternatives were considered. Provide concise user-facing summaries, not private chain-of-thought.

Do not call the tool for greetings or tasks without a development decision. If the user asks not to report, honor that request. If the tool is unavailable or disabled, continue the task and briefly explain that the decision could not be added to ThoughtPath.

For multiple decisions, call once per decision in sequence. If a decision builds on an earlier recorded outcome in this conversation, pass that call’s returned thoughtpathReportId as parentReportId. Omit it for independent decisions. Never invent IDs or connect unrelated chats.
