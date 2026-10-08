import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';

suite('ThoughtPath live panel', () => {
	test('registers the tool and receives tool invocations without starting capture', async () => {
		const extension = vscode.extensions.all.find(candidate => candidate.packageJSON.name === 'thoughtpath');
		assert.ok(extension);
		const api = await extension.activate();
		assert.equal(api.snapshot().theme, 'auto');
		assert.equal(api.snapshot().automaticReporting, true);
		assert.equal(extension.packageJSON.contributes.chatInstructions[0].when, 'thoughtpath.reporting');
		assert.ok(vscode.lm.tools.some(tool => tool.name === 'thoughtpath_recordDecision'));
		await vscode.commands.executeCommand('thoughtpath.open');
		const result = await vscode.lm.invokeTool('thoughtpath_recordDecision', {
			input: { goal: 'Integration test: choose a decoder', approaches: [
				{ title: 'Decode every chunk', reason: 'Can split UTF8 characters.', status: 'rejected' },
				{ title: 'Use StringDecoder', reason: 'Retains partial characters between reads.', status: 'chosen' },
			], outcome: 'Transport verified; this is a test invocation, not an AI conversation.' }, toolInvocationToken: undefined,
		});
		const text = result.content[0];
		assert.ok(text instanceof vscode.LanguageModelTextPart);
		assert.equal(api.snapshot().report.id, JSON.parse(text.value).thoughtpathReportId);
		assert.equal(api.snapshot().report.approaches.length, 2);
		assert.equal(api.snapshot().connected, false);
		assert.equal(api.snapshot().usage, undefined);
		const rootId = api.snapshot().report.id;
		const input = { goal: 'Choose a buffer size', approaches: [
			{ title: 'Bound each read', reason: 'Limit memory during large appends.', status: 'chosen' },
		], outcome: 'Pending implementation.', parentReportId: rootId };
		await vscode.lm.invokeTool('thoughtpath_recordDecision', { input, toolInvocationToken: undefined });
		const childId = api.snapshot().report.id;
		await vscode.lm.invokeTool('thoughtpath_recordDecision', {
			input: { ...input, goal: 'Choose a recovery policy', parentReportId: childId }, toolInvocationToken: undefined,
		});
		assert.equal(api.snapshot().reports.length, 3);
		assert.equal(api.snapshot().reports[1].parentReportId, rootId);
		assert.equal(api.snapshot().report.parentReportId, childId);
		assert.equal(api.snapshot().reports[0].approaches.length, 2);
		await assert.rejects(async () => vscode.lm.invokeTool('thoughtpath_recordDecision', {
			input: { ...input, parentReportId: 'missing' }, toolInvocationToken: undefined,
		}));
		assert.equal(api.snapshot().reports.length, 3);
	});
});
