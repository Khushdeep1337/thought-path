import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, appendFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureSettings, decisionInput, linkedTrace, liveEvent, LiveTail, restoreCapture } from '../live';
import { summarize } from '../trace';

const decision = { goal: 'Handle café input', approaches: [{ title: 'Built-in decoder', reason: 'Preserves partial characters.', status: 'chosen' }], outcome: 'Implemented and tested.' };
const span = (id = '123456789abcdef0') => ({
	_spanContext: { traceId: '0123456789abcdef0123456789abcdef', spanId: id },
	name: 'execute_tool thoughtpath_recordDecision', startTime: [1790000000, 123], endTime: [1790000000, 100000123],
	status: { code: 1 }, attributes: { 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': 'thoughtpath_recordDecision',
		'gen_ai.tool.call.result': '{"thoughtpathReportId":"report-1"}', 'test.text': 'café' },
});

test('disconnect restores owned settings and preserves another window or user changes', async () => {
	const current = captureSettings('owned.jsonl');
	const previous = { outfile: '', exporterType: 'console', enabled: false };
	const read = (key: string) => current[key];
	const write = async (key: string, value: unknown) => { current[key] = value; };
	current.exporterType = 'otlp-http';
	await restoreCapture('owned.jsonl', previous, read, write);
	assert.deepEqual(current, { enabled: false, exporterType: 'otlp-http', outfile: '', captureContent: undefined });
	Object.assign(current, captureSettings('another-window.jsonl'));
	await restoreCapture('owned.jsonl', previous, read, write);
	assert.deepEqual(current, captureSettings('another-window.jsonl'));
});

test('decision summaries require one chosen approach and bounded meaningful text', () => {
	assert.equal(decisionInput(decision).goal, 'Handle café input');
	const rejected = { title: 'Alternative', reason: 'Does not satisfy the constraints.', status: 'rejected' };
	const four = [...decision.approaches, rejected, rejected, rejected];
	assert.equal(decisionInput({ ...decision, approaches: four }).approaches.length, 4);
	assert.throws(() => decisionInput({ ...decision, approaches: [...four, rejected] }));
	assert.throws(() => decisionInput({ ...decision, approaches: [rejected] }));
	assert.throws(() => decisionInput({ ...decision, approaches: [] }));
	assert.throws(() => decisionInput({ ...decision, approaches: [...decision.approaches, ...decision.approaches] }));
	assert.throws(() => decisionInput({ ...decision, goal: 'x'.repeat(1001) }));
	assert.throws(() => decisionInput({ ...decision, outcome: ' ' }));
});

test('a failed settings restore retains ownership so disconnect can be retried', async () => {
	const current = captureSettings('owned.jsonl');
	const previous = { outfile: '', enabled: false, exporterType: 'console', captureContent: false };
	const read = (key: string) => current[key];
	await assert.rejects(restoreCapture('owned.jsonl', previous, read, async (key, value) => {
		if (key === 'captureContent') { throw new Error('Settings write failed'); }
		current[key] = value;
	}), /Settings write failed/);
	assert.equal(current.outfile, 'owned.jsonl');
	await restoreCapture('owned.jsonl', previous, read, async (key, value) => { current[key] = value; });
	assert.deepEqual(current, previous);
});

test('follow-up decisions link only to existing reports, with independent roots and arbitrary depth', () => {
	const root = { ...decisionInput(decision), id: 'root' };
	const child = { ...decisionInput({ ...decision, parentReportId: root.id }, [root]), id: 'child' };
	const next = decisionInput({ ...decision, parentReportId: child.id }, [root, child]);
	assert.equal(child.parentReportId, root.id);
	assert.equal(next.parentReportId, child.id);
	assert.equal(decisionInput(decision, [root, child]).parentReportId, undefined);
	assert.throws(() => decisionInput({ ...decision, parentReportId: 'missing' }, [root]), /no longer available/);
	assert.throws(() => decisionInput({ ...decision, parentReportId: root.id }, [child]), /no longer available/);
	for (const parentReportId of [null, 42, '', 'x'.repeat(101)]) {
		assert.throws(() => decisionInput({ ...decision, parentReportId }, [root]));
	}
});

test('SDK spans preserve timing, ignore metrics, and associate only an explicit tool result', () => {
	const event = liveEvent(JSON.stringify(span()))!;
	assert.equal(event.durationMs, 100);
	assert.equal(event.start, 1790000000000000123n);
	assert.equal(liveEvent('{"resourceMetrics":[]}'), undefined);
	const report = { ...decisionInput(decision), id: 'report-1' };
	assert.equal(linkedTrace(report, [event]), event.traceId);
	assert.equal(linkedTrace({ ...report, id: 'another-report' }, [event]), undefined);
	assert.equal(linkedTrace(report, [{ ...event, attributes: { ...event.attributes, 'gen_ai.tool.name': 'unrelated' } }]), undefined);
	assert.equal(summarize({ id: event.traceId, events: [event] }).input.total, undefined);
});

test('current Copilot exports with top-level IDs produce the same event as SDK spans', () => {
	const { _spanContext, ...fields } = span();
	const flattened = { ...fields, ..._spanContext };
	const event = liveEvent(JSON.stringify(flattened));
	assert.ok(event);
	assert.equal(event.traceId, _spanContext.traceId);
	assert.equal(event.id, _spanContext.spanId);
	assert.equal(event.durationMs, 100);
	assert.equal(linkedTrace({ ...decisionInput(decision), id: 'report-1' }, [event]), event.traceId);
});

test('live tail handles missing files, split UTF8, partial lines, append, corruption and truncation', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'thoughtpath-'));
	const path = join(directory, 'trace.jsonl');
	const tail = new LiveTail(path);
	try {
		assert.deepEqual(await tail.read(), []);
		const bytes = Buffer.from(JSON.stringify(span()) + '\n');
		const split = bytes.indexOf(Buffer.from('é')) + 1;
		await writeFile(path, bytes.subarray(0, split));
		assert.deepEqual(await tail.read(), []);
		await appendFile(path, bytes.subarray(split));
		const events = await tail.read();
		assert.equal(events.length, 1);
		assert.equal(events[0].attributes['test.text'], 'café');
		assert.deepEqual(await tail.read(), []);
		await appendFile(path, 'broken\n{"resourceMetrics":[]}\n' + JSON.stringify(span('123456789abcdef1')) + '\n');
		assert.equal((await tail.read())[0].id, '123456789abcdef1');
		assert.equal(tail.skipped, 1);
		await writeFile(path, '');
		assert.deepEqual(await tail.read(), []);
		await appendFile(path, bytes);
		assert.equal((await tail.read()).length, 1);
		await unlink(path);
		assert.deepEqual(await tail.read(), []);
		await writeFile(path, bytes);
		assert.equal((await tail.read()).length, 1);
	} finally { await unlink(path).catch(() => {}); await rmdir(directory); }
});

test('oversized records are skipped and the stream recovers on the next newline', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'thoughtpath-'));
	const path = join(directory, 'trace.jsonl');
	try {
		await writeFile(path, 'x'.repeat(3 * 1024 * 1024) + '\n' + JSON.stringify(span()) + '\n');
		const tail = new LiveTail(path);
		const events = [];
		for (let count = 0; count < 15; count++) { events.push(...await tail.read()); }
		assert.equal(events.length, 1);
		assert.equal(tail.skipped, 1);
	} finally { await unlink(path); await rmdir(directory); }
});
