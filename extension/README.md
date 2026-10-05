# ThoughtPath

A local trace explorer for understanding AI-assisted development. This first base imports recorded evidence; it does not intercept Copilot chats or claim to reveal a model's private reasoning.

## Try it

1. Open this `extension/` folder in VS Code 1.124 or later.
2. Run `npm ci`, then `npm run compile`.
3. Press F5 to launch the Extension Development Host.
4. Run **ThoughtPath: Load Demo Trace** from the Command Palette.
5. Expand a trace in the ThoughtPath sidebar. Select an event to inspect its original data in a read-only JSON tab.

The bundled demo is synthetic and clearly labeled. It includes two model calls, two tools, and a failed tool result. Expected totals: 1,400 input tokens, 180 output tokens, and a 10-second recorded time range.

## Import your own trace

Run **ThoughtPath: Import Trace**. Supported inputs:

- OTLP JSON with `resourceSpans[].scopeSpans[].spans[]`.
- An array of those envelopes, or JSONL with one envelope per line.

In supported VS Code/Copilot versions, open **Developer: Open Agent Debug Logs**, select a session, and use its Export control to save an OTLP JSON file. Feature availability and export shape vary by version; this base still needs validation against your own real export. It does not support arbitrary chat transcripts, SQLite exports, or every telemetry file-exporter format.

See the official [debug/export guide](https://code.visualstudio.com/docs/agents/agent-troubleshooting/chat-debug-view) and [Copilot telemetry reference](https://code.visualstudio.com/docs/agents/guides/monitoring-agents).

## Reading the evidence

- Events are grouped by trace ID and ordered by start time. A trace is not necessarily an entire chat session. Parent IDs remain available in event details; this base uses a flat event list within each trace.
- Timing is the earliest-to-latest valid span range, not the sum of overlapping durations. Missing or invalid timing is marked unknown.
- Tokens are reported values from `gen_ai.operation.name = chat` spans. Agent-level rollups are excluded to prevent double counting.
- Usage includes coverage, such as `1/2 calls reported`. Partial totals are not full-session totals. Missing values are unknown, not zero. These figures are not a billing calculation.
- Invalid spans are counted and skipped. Duplicate trace/span IDs use the last record and are counted. Invalid document structure rejects the import without replacing the current snapshot.
- Explanations in captured outputs are model-reported statements, not verified internal reasoning.

## Local data

ThoughtPath makes no network requests or model calls and adds no prompt instructions. It reads only the trace you select or the bundled demo. Imported data is held in memory until replaced, cleared, or the window closes. Open detail tabs keep their snapshots until closed and can be saved manually. Original files are never modified.

Traces may contain source code, prompts, paths, or secrets. Details are not automatically redacted. Keep real exports outside Git; `.thoughtpath/` is ignored as a suggested local export folder. The limits are 10 MiB and 10,000 spans per import to bound work in the extension host.

## Development

- `npm run compile` — type-check and build.
- `npm run lint` — check TypeScript style.
- `npm run test:unit` — parser and metrics tests using Node's built-in test runner.
- `npm test` — extension-host integration tests (downloads a VS Code test build if needed).

Code map:

- `src/extension.ts`: commands, file selection, view registration, and read-only detail documents.
- `src/trace.ts`: OTLP parsing, validation, ordering, and metrics.
- `src/traceView.ts`: native sidebar items.

No runtime dependencies, backend, database, or custom webview. Live collection, linked code diffs, and decision annotations remain future work.

## Rights

Copyright © 2026 Khushdeep Brar. See the repository README for the portfolio-use notice. No open-source license is granted by this project.
