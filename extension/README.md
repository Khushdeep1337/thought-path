# ThoughtPath

Live decision maps for Copilot Agent chat: a distilled request, approaches considered, the chosen direction, and its outcome. The panel opens beside your editor so it can sit next to Chat.

## Run locally

1. Open this extension folder in VS Code. Run npm ci once, then press F5.
2. In the Extension Development Host, run **ThoughtPath: Open Decision Map**.
3. Open **Settings**, click **Connect traces**, review the local content-capture notice, and reload when prompted.
4. Open Copilot **Agent** chat. Ensure **recordDecision** is enabled in the tool picker.
5. Send your task. While the panel is open, bundled Copilot instructions request decision reports automatically.

Reports arrive when Copilot calls the tool. Tools and token counts arrive as Copilot exports completed spans, usually after a short batch delay. Automatic reporting is enabled by default while the panel is open in this window. Settings can disable it, or provide a manual reporting prompt. Instructions apply to relevant future chat requests; they do not rewrite past messages or force the model to invoke a disabled tool.

The panel is an editor tab, not an injected part of Copilot's interface. Resize or move its editor group to place it beside Chat. The decision selector shows recent reports; ThoughtPath does not know which chat has focus.

## Graph and appearance

Each decision has 1–4 reported approaches, not a fixed pair. The request branches to every approach; only the chosen branch connects to the outcome. Expand a node to read its justification. Wider graphs scroll horizontally inside the graph region.

Settings offers Follow VS Code (default), Light, and Dark. The automatic mode uses the editor theme colors. Both appearance and automatic reporting are also available in VS Code settings under ThoughtPath. Panel changes are saved for the workspace when one is open, otherwise for the user. Automatic instruction inclusion is gated by this window’s open panel, using the supported chatInstructions contribution.

## What is measured

- Approach cards contain explicit model-reported summaries, not hidden reasoning. A single approach is allowed when no alternatives were reported.
- Each report returns a unique ID. A captured tool result carrying that ID links it to a trace. Until that evidence arrives, tools and usage remain unavailable rather than being assigned from another chat.
- Usage sums reported chat-span tokens, excluding parent totals. Coverage is shown for each total. Missing values remain unknown. A trace is not necessarily an entire conversation.
- Trace collection makes no AI calls. Reporting adds tool-call tokens; its marginal overhead is not measured separately. No claim of negligible overhead is made.

## Capture and retention

Connecting changes four profile-level Copilot settings: otel.enabled, otel.exporterType, otel.outfile, and otel.captureContent. Previous explicit values are saved before changes. Disconnect restores each value only if it still equals the value ThoughtPath applied, preserving subsequent user changes. If another window has changed the output path, its exporter settings are left alone. Reload after disconnect to stop the exporter.

Content capture can include prompts, responses, code and tool data from other chats in the same profile. Data is written to a timestamped JSONL file in the extension's global storage folder, outside this repository. **Show capture file** reveals it. Files are not automatically rotated or deleted; disconnect and reload when finished, then delete captures you no longer need. Existing telemetry environment variables or organization policy can override the requested settings.

The view keeps the latest 50 reports and at most 500 spans / approximately 10 MiB of span JSON in memory. Older spans are evicted; totals may be partial. Clear view clears memory, not the file. Reload clears reports. The reader uses bounded chunks and skips malformed or oversized lines. It recovers from observed file truncation and replacement.

Local desktop windows are supported; Remote/WSL and other agent harnesses are not validated. Decision reporting uses the stable VS Code tool API. Trace capture requires Copilot's local OpenTelemetry file exporter; the installed VS Code 1.140 / Copilot 0.68 settings and SDK serialization were inspected during implementation. Unsupported versions show an explanatory error.

See Microsoft's [OpenTelemetry guide](https://code.visualstudio.com/docs/agents/guides/monitoring-agents) and [language model tools guide](https://code.visualstudio.com/api/extension-guides/ai/tools).

## Development

- npm run compile — type-check and build.
- npm run lint — extension and webview JavaScript lint.
- npm run test:unit — decision validation, stream handling, correlation, and metrics.
- npm test — isolated VS Code tool-registration and invocation test. Set VSCODE_EXECUTABLE_PATH to use an installed Code.exe instead of downloading a test build.

No runtime dependencies or collector server. The synthetic OTLP file remains a parser test fixture; there is no demo command in the product.

Automated tests verify the local file transport and tool invocation. A signed-in Copilot conversation still needs end-to-end verification; the test profile has no account.

## Rights

Copyright © 2026 Khushdeep Brar. See the repository README for the portfolio-use notice. No open-source license is granted by this project.
