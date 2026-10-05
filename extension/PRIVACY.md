# ThoughtPath privacy notice

Last updated: October 5, 2026. Applies to ThoughtPath 0.0.1, published by Khushdeep Brar (KhushdeepBrar).

## What ThoughtPath processes

ThoughtPath displays model-reported development decisions and recorded tool activity. It processes decision summaries, approach descriptions, outcomes, trace identifiers, tool names, timing, errors, and reported token counts. When content capture is enabled, Copilot's export can also contain prompts, responses, source code, file paths, tool arguments and results, and personal or confidential information included in that content. ThoughtPath does not automatically redact this data.

The extension does not operate a publisher-controlled collection server or send usage analytics to its publisher. This does not mean all data stays on your device: Copilot, the selected model provider, and separately configured telemetry services may process data as described below.

## Copilot and model-provider processing

Automatic reporting is enabled by default while the ThoughtPath panel is open in a VS Code window. It supplies instructions asking Copilot to call recordDecision. The tool receives the model's summary and returns a report identifier and acknowledgement to Copilot. These instructions, tool calls, and results participate in the Copilot conversation and may be processed by GitHub/Microsoft and the selected model provider under your account, organization settings, and their applicable terms and privacy notices. ThoughtPath does not control their retention or training policies.

Disable automatic reporting in ThoughtPath Settings or close the panel to stop supplying these instructions for future requests. This does not remove existing chat history or prevent explicitly requested tool calls. Disable recordDecision in Copilot's tool picker if you do not want it called. Reporting can consume additional model tokens.

## Optional trace capture and destinations

Trace capture requires confirmation through Connect traces. ThoughtPath requests a local JSONL file exporter by changing four profile-level Copilot settings: github.copilot.chat.otel.enabled, exporterType, outfile, and captureContent. Capture may include other chats using that profile, not only the decision displayed in the panel.

The requested file is named copilot-<timestamp>.jsonl in ThoughtPath's VS Code global storage folder, outside the project. The extension saves the capture path and previous setting values in VS Code extension storage to support reconnection and restoration. Appearance and automatic-reporting preferences are saved in workspace or user settings, depending on whether a workspace is open.

Copilot environment variables and organization-managed settings can override user settings, including the requested exporter or destination. Other exporters may already be enabled. Data may therefore be sent to separately configured collectors or retained elsewhere. ThoughtPath does not disable those services or guarantee that export is exclusively local. Review your effective Copilot telemetry configuration before enabling content capture. See Microsoft's [OpenTelemetry documentation](https://code.visualstudio.com/docs/agents/guides/monitoring-agents).

## Retention and deletion

- Decision reports and displayed spans are held in memory: up to 50 reports and 500 spans, with an approximate 10 MiB span-data limit. Clear view clears this memory; collection can refill it while connected. Reload clears reports, but retained capture files can be read again when reconnected.
- Capture files have no automatic expiry, rotation, or deletion. Closing the panel, pausing the view, or uninstalling ThoughtPath is not a reliable way to stop Copilot's configured exporter or erase files.
- Before disconnecting, use Settings → Show capture file and note the containing folder. Select Disconnect traces, then reload VS Code. ThoughtPath restores settings it still owns; changes made by you or another window are preserved. Check the effective Copilot settings if another exporter or policy remains active.
- Delete unwanted copilot-*.jsonl files from that folder after export has stopped. Empty the recycle bin if appropriate, and manage any backup or synchronized copies separately. ThoughtPath does not provide secure erasure.
- Disconnect clears ThoughtPath's saved connection record after successful restoration. It does not delete your appearance preferences, existing files, Copilot chat history, or copies held by other services. Use the respective application's or provider's controls for those copies.

Local files remain subject to your operating system permissions, device security, backup tools, and organization policies. Avoid capturing secrets or confidential material you are not authorized to record.

## Questions

For general questions about this notice, use the [ThoughtPath issue tracker](https://github.com/Khushdeep1337/thought-path/issues). Issues are public: do not attach trace files, credentials, private code, or personal data. The publisher does not automatically receive your local captures and cannot delete copies held on your device or by your service providers.
