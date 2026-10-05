import * as vscode from 'vscode';
import { durationLabel, summarize, Trace, TraceEvent, TraceImport } from './trace';

type TraceNode = { kind: 'trace'; trace: Trace } | { kind: 'event'; event: TraceEvent }
	| { kind: 'summary'; label: string };

export class TraceView implements vscode.TreeDataProvider<TraceNode>, vscode.Disposable {
	private readonly changed = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.changed.event;
	private traces: Trace[] = [];

	load(result: TraceImport): void { this.traces = result.traces; this.changed.fire(); }
	clear(): void { this.traces = []; this.changed.fire(); }
	dispose(): void { this.changed.dispose(); }

	getChildren(node?: TraceNode): TraceNode[] {
		if (!node) { return this.traces.map(trace => ({ kind: 'trace', trace })); }
		if (node.kind !== 'trace') { return []; }
		const summary = summarize(node.trace);
		const tokens = (usage: typeof summary.input) => usage.total === undefined ? 'unknown'
			: `${usage.total.toLocaleString()} (${usage.reported}/${summary.calls} calls reported)`;
		return [
			{ kind: 'summary', label: `${summary.calls} model calls · ${summary.tools} tools · ${summary.errors} errors` },
			{ kind: 'summary', label: `Input tokens: ${tokens(summary.input)}` },
			{ kind: 'summary', label: `Output tokens: ${tokens(summary.output)}` },
			...node.trace.events.map(event => ({ kind: 'event' as const, event })),
		];
	}

	getTreeItem(node: TraceNode): vscode.TreeItem {
		if (node.kind === 'trace') {
			const item = new vscode.TreeItem(`Trace ${node.trace.id.slice(0, 8)}`, vscode.TreeItemCollapsibleState.Expanded);
			item.id = node.trace.id;
			item.description = `${node.trace.events.length} events · ${durationLabel(summarize(node.trace).durationMs)}`;
			item.tooltip = `Trace ID: ${node.trace.id}\nEvents are ordered by start time. A trace is not necessarily an entire chat session.`;
			item.iconPath = new vscode.ThemeIcon('git-branch');
			return item;
		}
		if (node.kind === 'summary') {
			const item = new vscode.TreeItem(node.label);
			item.iconPath = new vscode.ThemeIcon('info');
			item.tooltip = 'Usage from chat spans only. Parent totals excluded. Missing usage is unknown; partial totals are not full-session usage.';
			return item;
		}
		const event = node.event;
		const item = new vscode.TreeItem(event.name);
		item.id = `${event.traceId}/${event.id}`;
		item.description = `${event.failed ? 'Error · ' : ''}${durationLabel(event.durationMs)}`;
		item.tooltip = `${event.name}\n${event.operation}\nSelect to inspect the recorded evidence.`;
		item.iconPath = new vscode.ThemeIcon(event.failed ? 'error' : event.operation === 'chat'
			? 'comment-discussion' : event.operation === 'execute_tool' ? 'tools' : 'circle-outline');
		item.command = { command: 'thoughtpath.inspectEvent', title: 'Inspect Event', arguments: [event] };
		return item;
	}
}
