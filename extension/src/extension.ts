import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { captureSettings, Decision, decisionInput, linkedTrace, LiveTail, restoreCapture } from './live';
import { summarize, TraceEvent, durationLabel } from './trace';

const stateKey = 'liveConnection';
const reportingPrompt = 'Use #recordDecision for this conversation. After each meaningful implementation decision, report a concise goal, the approach chosen and a brief justification, any alternatives you actually considered, and the outcome (or pending result). Do not invent alternatives or provide private chain-of-thought. One report per meaningful decision, not per tool call. For a follow-up decision, set parentReportId to the thoughtpathReportId returned by its parent call in this conversation. Omit it for unrelated decisions.';
interface Connection { path: string; previous: Record<string, unknown>; }

export function activate(context: vscode.ExtensionContext) {
	let panel: vscode.WebviewPanel | undefined;
	let connection = context.globalState.get<Connection>(stateKey);
	let tail = connection ? new LiveTail(connection.path) : undefined;
	let status = connection ? 'Waiting for completed Copilot operations…' : 'Decision reporting ready. Connect traces for tools and token counts.';
	let busy = false;
	let polling = false;
	let paused = false;
	let disposed = false;
	let selected = '';
	let discarded = 0;
	const reports: Decision[] = [];
	const events = new Map<string, TraceEvent>();
	const config = () => vscode.workspace.getConfiguration('github.copilot.chat.otel');
	const safe = async (action: () => Promise<unknown>) => {
		try { await action(); } catch (error) {
			status = error instanceof Error ? error.message : String(error);
			void vscode.window.showErrorMessage(`ThoughtPath: ${status}`); update();
		}
	};
	const snapshot = () => {
		const report = reports.find(item => item.id === selected) ?? reports.at(-1);
		const all = [...events.values()];
		// Correlate using the returned ID, never guess a conversation from focus or timing.
		const traceId = linkedTrace(report, all);
		const traceEvents = traceId ? all.filter(event => event.traceId === traceId).sort((a, b) => {
			if (a.start === b.start) { return 0; }
			if (a.start === undefined) { return 1; }
			if (b.start === undefined) { return -1; }
			return a.start < b.start ? -1 : 1;
		}) : [];
		const summary = summarize({ id: traceId ?? '', events: traceEvents });
		return {
			theme: vscode.workspace.getConfiguration('thoughtpath').get<string>('theme', 'auto'),
			automaticReporting: vscode.workspace.getConfiguration('thoughtpath').get<boolean>('automaticReporting', true),
			connected: !!connection, paused, status, discarded, skipped: tail?.skipped ?? 0,
			reports, selected: report?.id, report,
			traceId, observed: all.length, path: connection?.path,
			usage: traceId ? { input: summary.input, output: summary.output, calls: summary.calls,
				duration: durationLabel(summary.durationMs), errors: summary.errors } : undefined,
			tools: traceEvents.filter(event => event.operation === 'execute_tool').map(event => ({
				name: event.name.slice(0, 200), failed: event.failed, duration: durationLabel(event.durationMs),
			})),
		};
	};
	const update = (force = false) => { if (!disposed && (!paused || force)) { void panel?.webview.postMessage(snapshot()); } };
	const show = () => {
		if (panel) { panel.reveal(panel.viewColumn, true); return; }
		panel = vscode.window.createWebviewPanel('thoughtpath', 'ThoughtPath', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
			enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
		});
		const nonce = randomUUID();
		const media = (file: string) => panel!.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', file));
		panel.webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
		<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';">
		<link rel="stylesheet" href="${media('panel.css')}"><title>ThoughtPath</title></head><body>

		<header><div class="title-row"><h1>ThoughtPath</h1><button id="settings" title="Panel settings">Settings</button></div><p id="status" role="status"></p></header>
		<section id="settings-panel" hidden aria-label="Panel settings"><label for="theme">Appearance</label><select id="theme"><option value="auto">Follow VS Code</option><option value="light">Light</option><option value="dark">Dark</option></select><label class="check"><input type="checkbox" id="automatic">Automatic reporting while open</label><p class="hint">Copilot receives reporting instructions for relevant requests while this panel is open. Enable recordDecision in Chat customizations → Tools. Automatic invocation depends on Copilot; use #recordDecision to request a report explicitly.</p><button id="prompt">Copy prompt instead</button><button id="connect">Connect traces</button><button id="clear">Clear view</button><details><summary>Local capture &amp; overhead</summary><p>Capture writes prompts, responses and tool data from this profile locally. Disconnect and reload to stop export. Files remain on disk. Reporting adds tool-call tokens; overhead is not measured separately.</p><p id="path"></p><button id="reveal">Show capture file</button></details><p id="retention" class="hint"></p></section>
		<div class="navigation"><label for="reports">Decision</label><select id="reports" aria-describedby="selected-goal"><option>No reports yet</option></select><button id="pause">Pause</button></div><p id="selected-goal"></p>
		<main><div id="canvas" tabindex="0" role="region" aria-label="Decision graph. Scroll to explore decisions and branches."><div id="graph"><svg id="edges" aria-hidden="true"></svg><div id="decision-paths"></div></div></div><p class="graph-caption">All retained decisions · links show reported follow-ups · select a decision for its tools and usage</p></main>
		<footer><details open><summary>Tools &amp; usage</summary><p id="usage">Connect traces in Settings for recorded activity.</p><ul id="tools"></ul></details></footer>
		<script nonce="${nonce}" src="${media('panel.js')}"></script></body></html>`;
		void vscode.commands.executeCommand('setContext', 'thoughtpath.reporting', vscode.workspace.getConfiguration('thoughtpath').get('automaticReporting', true));
		panel.onDidDispose(() => { panel = undefined; void vscode.commands.executeCommand('setContext', 'thoughtpath.reporting', false); });
		panel.webview.onDidReceiveMessage(message => {
			if (!message || typeof message.type !== 'string') { return; }
			void safe(async () => {
				switch (message.type) {
					case 'ready': update(true); break;
					case 'theme':
						if (['auto', 'light', 'dark'].includes(message.value)) { await vscode.workspace.getConfiguration('thoughtpath').update('theme', message.value, vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global); } break;
					case 'automatic':
						if (typeof message.value === 'boolean') { await vscode.workspace.getConfiguration('thoughtpath').update('automaticReporting', message.value, vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global); } break;
					case 'connect': await toggleConnection(); break;
					case 'prompt': await vscode.env.clipboard.writeText(reportingPrompt); void vscode.window.showInformationMessage('Paste into Copilot Agent chat, then send it with your task.'); break;
					case 'pause': paused = !paused; void panel?.webview.postMessage(snapshot()); break;
					case 'clear': reports.length = 0; events.clear(); selected = ''; discarded = 0; update(true); break;
					case 'select': if (typeof message.id === 'string' && reports.some(item => item.id === message.id)) { selected = message.id; update(true); } break;
					case 'reveal': if (connection) { await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(connection.path)); } break;
				}
			});
		});
	};
	const restore = async (saved: Connection) => {
		await restoreCapture(saved.path, saved.previous, key => config().inspect(key)?.globalValue,
			(key, value) => config().update(key, value, vscode.ConfigurationTarget.Global));
	};
	const toggleConnection = async () => {
		if (busy) { return; } busy = true;
		try {
			if (connection) {
				await restore(connection);
				await context.globalState.update(stateKey, undefined);
				connection = undefined; tail = undefined;
				status = 'Disconnected. Reload to stop Copilot export. Existing capture files remain on disk.';
			} else {
				if (vscode.env.remoteName) { throw new Error('Local VS Code windows are supported for now. Open the project locally.'); }
				if (!config().inspect('outfile')) { throw new Error('This Copilot version does not expose local OpenTelemetry export. Update VS Code/Copilot first.'); }
				const answer = await vscode.window.showInformationMessage('Enable local Copilot content capture?', { modal: true,
					detail: 'This changes Copilot telemetry settings for this VS Code profile. Prompts, responses, code and tool data will be written locally, including from other chats. Disconnect restores the previous settings. Reload is required. Captures are not automatically deleted or rotated.',
				}, 'Enable local capture');
				if (answer !== 'Enable local capture') { return; }
				await vscode.workspace.fs.createDirectory(context.globalStorageUri);
				const path = vscode.Uri.joinPath(context.globalStorageUri, `copilot-${Date.now()}.jsonl`).fsPath;
				const previous = Object.fromEntries(Object.keys(captureSettings(path)).map(key => [key, config().inspect(key)?.globalValue]));
				const saved = { path, previous };
				// Save recovery state before changing any profile settings.
				await context.globalState.update(stateKey, saved); connection = saved;
				try {
					for (const [key, value] of Object.entries(captureSettings(path))) { await config().update(key, value, vscode.ConfigurationTarget.Global); }
				} catch (error) {
					await restore(saved);
					await context.globalState.update(stateKey, undefined); connection = undefined;
					throw error;
				}
				tail = new LiveTail(path);
				status = 'Capture configured. Reload to start receiving Copilot traces.';
			}
			update();
			if (await vscode.window.showInformationMessage(status, 'Reload window') === 'Reload window') {
				await vscode.commands.executeCommand('workbench.action.reloadWindow');
			}
		} finally { busy = false; update(); }
	};
	const poll = async () => {
		if (!tail || polling || disposed) { return; } polling = true;
		const current = tail;
		try {
			const batch = await current.read();
			if (current !== tail || disposed) { return; }
			if (!batch.length) { update(); return; }
			for (const event of batch) { events.set(`${event.traceId}/${event.id}`, event); }
			let bytes = [...events.values()].reduce((sum, event) => sum + JSON.stringify(event.raw).length, 0);
			while (events.size > 500 || bytes > 10 * 1024 * 1024) {
				const key = events.keys().next().value!;
				bytes -= JSON.stringify(events.get(key)!.raw).length; events.delete(key); discarded++;
			}
			if (batch.length) { status = `Receiving Copilot traces · updated ${new Date().toLocaleTimeString()}`; }
			update();
		} catch (error) { status = `Trace read failed: ${error instanceof Error ? error.message : String(error)}`; update(); }
		finally { polling = false; }
	};
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('thoughtpath')) {
				void vscode.commands.executeCommand('setContext', 'thoughtpath.reporting', !!panel && vscode.workspace.getConfiguration('thoughtpath').get('automaticReporting', true)); update(true);
			}
		}),
		vscode.commands.registerCommand('thoughtpath.open', show),
		vscode.commands.registerCommand('thoughtpath.connect', () => { show(); return safe(toggleConnection); }),
		vscode.lm.registerTool('thoughtpath_recordDecision', {
			invoke(options: vscode.LanguageModelToolInvocationOptions<unknown>) {
				const report = { ...decisionInput(options.input, reports), id: randomUUID() };
				reports.push(report); if (reports.length > 50) { reports.shift(); }
				selected = report.id; show(); update();
				return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify({ thoughtpathReportId: report.id, recorded: true }))]);
			},
		}),
		{ dispose: () => { disposed = true; clearInterval(timer); panel?.dispose(); } },
	);
	const timer = setInterval(() => { void poll(); }, 1000);
	if (connection) { show(); void poll(); }
	return { snapshot };
}
