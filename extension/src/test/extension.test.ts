import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import { parseTrace } from '../trace';
import { TraceView } from '../traceView';

suite('ThoughtPath', () => {
	test('activates, loads the demo, opens evidence, and clears the view', async () => {
		const extension = vscode.extensions.all.find(candidate => candidate.packageJSON.name === 'thought-path');
		assert.ok(extension, 'ThoughtPath should be installed in the development host');
		await extension.activate();
		const commands = await vscode.commands.getCommands(true);
		for (const command of ['thoughtpath.importTrace', 'thoughtpath.loadDemo', 'thoughtpath.clearTrace']) {
			assert.ok(commands.includes(command), `${command} is registered`);
		}
		await vscode.commands.executeCommand('thoughtpath.loadDemo');
		const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extension.extensionUri, 'samples', 'demo-trace.json'));
		const parsed = parseTrace(Buffer.from(bytes).toString('utf8'));
		const provider = new TraceView();
		try {
			provider.load(parsed);
			const roots = provider.getChildren();
			assert.equal(roots.length, 1);
			assert.equal(provider.getChildren(roots[0]).length, 8);
			await vscode.commands.executeCommand('thoughtpath.inspectEvent', parsed.traces[0].events[0]);
			const detail = vscode.workspace.textDocuments.find(document => document.uri.scheme === 'thoughtpath');
			assert.ok(detail);
			assert.match(detail.getText(), /Synthetic demo/);
			assert.equal(JSON.parse(detail.getText()).span.spanId, parsed.traces[0].events[0].id);
			await vscode.commands.executeCommand('thoughtpath.clearTrace');
			provider.clear();
			assert.equal(provider.getChildren().length, 0);
		} finally { provider.dispose(); }
	});
});
