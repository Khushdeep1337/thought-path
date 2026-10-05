import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { maxTraceBytes, parseTrace, summarize } from '../trace';

const demo = readFileSync(join(__dirname, '../..', 'samples/demo-trace.json'), 'utf8');
const traceId = '0123456789abcdef0123456789abcdef';
const span = (id: number, extra = {}) => ({ traceId, spanId: id.toString(16).padStart(16, '0'), name: 'event', ...extra });
const envelope = (spans: unknown[]) => ({ resourceSpans: [{ scopeSpans: [{ spans }] }] });
const attrs = (input: unknown, output: unknown = undefined) => [
	{ key: 'gen_ai.operation.name', value: { stringValue: 'chat' } },
	{ key: 'gen_ai.usage.input_tokens', value: { intValue: input } },
	{ key: 'gen_ai.usage.output_tokens', value: { intValue: output } },
];

test('demo totals exclude parent rollups and overlapping durations', () => {
	const result = parseTrace(demo);
	assert.equal(result.traces[0].events.length, 5);
	assert.deepEqual(summarize(result.traces[0]), {
		calls: 2, tools: 2, errors: 1, durationMs: 10000,
		input: { total: 1400, reported: 2 }, output: { total: 180, reported: 2 },
	});
});

test('missing, zero, invalid, and partially reported tokens stay distinct', () => {
	const result = parseTrace(JSON.stringify(envelope([
		span(1, { attributes: attrs('0') }), span(2, { attributes: attrs('-1', '12') }),
		span(3, { attributes: attrs('9007199254740992') }),
	])));
	const summary = summarize(result.traces[0]);
	assert.deepEqual(summary.input, { total: 0, reported: 1 });
	assert.deepEqual(summary.output, { total: 12, reported: 1 });
	assert.equal(summary.calls, 3);
	assert.equal(summarize(parseTrace(JSON.stringify(envelope([span(1)]))).traces[0]).input.total, undefined);
});

test('nanosecond strings preserve sub-millisecond differences and sort chronologically', () => {
	const result = parseTrace(JSON.stringify(envelope([
		span(2, { startTimeUnixNano: '1790964000000000100', endTimeUnixNano: '1790964000000000200' }),
		span(1, { startTimeUnixNano: '1790964000000000000', endTimeUnixNano: '1790964000000000100' }),
		span(3, { startTimeUnixNano: '200', endTimeUnixNano: '100' }),
	])));
	assert.equal(result.traces[0].events.find(event => event.id.endsWith('2'))?.durationMs, 0.0001);
	assert.equal(result.traces[0].events.find(event => event.id.endsWith('3'))?.durationMs, undefined);
	assert.equal(result.traces[0].events[1].id, '0000000000000001');
});

test('JSONL merges envelopes, groups traces, and deduplicates by trace plus span ID', () => {
	const first = envelope([span(1), span(2)]);
	const second = envelope([span(1, { name: 'updated' }), span(1, { traceId: 'abcdef0123456789abcdef0123456789' })]);
	const result = parseTrace(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);
	assert.equal(result.traces.length, 2);
	assert.equal(result.traces[0].events.length, 2);
	assert.equal(result.traces[0].events[0].name, 'updated');
	assert.equal(result.duplicates, 1);
});

test('invalid spans are disclosed; malformed documents and unsupported formats fail', () => {
	const result = parseTrace(JSON.stringify(envelope([span(1), null, span(2, { spanId: 'invalid' })])));
	assert.equal(result.skipped, 2);
	for (const invalid of ['', '{broken', '{}', '[]', '{"resourceSpans":[{}]}', JSON.stringify(envelope([]))]) {
		assert.throws(() => parseTrace(invalid));
	}
	assert.throws(() => parseTrace(JSON.stringify(envelope([span(1)])) + '\n{broken'));
});

test('oversized inputs fail rather than silently truncating data', () => {
	assert.throws(() => parseTrace(' '.repeat(maxTraceBytes + 1)), /10 MiB/);
	assert.throws(() => parseTrace(JSON.stringify(envelope(Array.from({ length: 10001 }, (_, i) => span(i + 1))))), /10,000/);
});

test('BOM exports and attributes with prototype-like keys are safe data', () => {
	const result = parseTrace('\uFEFF' + JSON.stringify(envelope([span(1, {
		attributes: [{ key: '__proto__', value: { stringValue: 'plain text' } }],
	})])));
	assert.equal(result.traces[0].events[0].attributes['__proto__'], 'plain text');
	assert.equal(Object.getPrototypeOf(result.traces[0].events[0].attributes), Object.prototype);
});
