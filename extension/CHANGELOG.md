# Changelog

## 0.0.4

- Change the Marketplace package name to thoughtpath; the displayed name remains ThoughtPath.
- Include the new PNG extension icon.

## 0.0.3

- Remove the extra outline around the selected decision.

- Show all retained decisions, with explicit parent links for deeper paths and branching follow-ups.
- Replace clipped goal text in the selector with short decision numbers and a wrapping title.

## 0.0.2

- Align the tool description and automatic-reporting instructions; explicit user requests are no longer described as the only trigger.

- Read Copilot trace records with top-level trace and span IDs, alongside older SDK records.
- Clarify that the graph requires a recordDecision tool call, not just a chat explanation.

## 0.0.1 — Unreleased

- Replace the tutorial and trace tree with an editor-side decision map.
- Receive concise model-reported decisions through the recordDecision tool.
- Supply automatic reporting instructions while the panel is open.
- Draw branching decision graphs with expandable explanations and editor, light, and dark themes.
- Connect to Copilot's local trace exporter with reversible profile settings.
- Link recorded tool activity and token counts using report IDs.
- Test decision validation, file streaming, settings restoration and extension-host tool invocation.
