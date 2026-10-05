// Independent of VS Code so trace handling can be tested without an editor.
export const maxTraceBytes = 10 * 1024 * 1024;
type RecordValue = Record<string, unknown>;

export interface TraceEvent {
	id: string;
	traceId: string;
	name: string;
	operation: string;
	start?: bigint;
	end?: bigint;
	durationMs?: number;
	failed: boolean;
	attributes: RecordValue;
	raw: RecordValue;
	resource: unknown;
}
export interface Trace { id: string; events: TraceEvent[]; }
export interface TraceImport { traces: Trace[]; skipped: number; duplicates: number; }

function record(value: unknown): RecordValue | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? value as RecordValue : undefined;
}

function timestamp(value: unknown): bigint | undefined {
	// Decimal strings preserve nanoseconds; unsafe JSON numbers have lost precision.
	if (typeof value === 'string' && /^\d{1,20}$/.test(value)) { return BigInt(value); }
	if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) { return BigInt(value); }
	return undefined;
}

function attributes(value: unknown): RecordValue {
	const entries: [string, unknown][] = [];
	if (Array.isArray(value)) {
		for (const entry of value) {
			const item = record(entry);
			const typed = record(item?.value);
			if (typeof item?.key === 'string' && typed) {
				entries.push([item.key, typed.stringValue ?? typed.intValue ?? typed.doubleValue ?? typed.boolValue ?? typed]);
			}
		}
	}
	return Object.fromEntries(entries);
}

export function parseEvent(value: unknown, resource: unknown): TraceEvent | undefined {
	const span = record(value);
	if (!span || typeof span.traceId !== 'string' || !/^[a-f\d]{32}$/i.test(span.traceId)
		|| /^0+$/.test(span.traceId) || typeof span.spanId !== 'string'
		|| !/^[a-f\d]{16}$/i.test(span.spanId) || /^0+$/.test(span.spanId)
		|| typeof span.name !== 'string' || !span.name.trim()) { return undefined; }
	const attrs = attributes(span.attributes);
	const start = timestamp(span.startTimeUnixNano);
	const end = timestamp(span.endTimeUnixNano);
	const status = record(span.status);
	return {
		id: span.spanId.toLowerCase(), traceId: span.traceId.toLowerCase(), name: span.name,
		operation: typeof attrs['gen_ai.operation.name'] === 'string' ? attrs['gen_ai.operation.name'] : 'event',
		start, end,
		durationMs: start !== undefined && end !== undefined && end >= start ? Number(end - start) / 1e6 : undefined,
		failed: status?.code === 2 || status?.code === 'STATUS_CODE_ERROR',
		attributes: attrs, raw: span, resource,
	};
}

export function parseTrace(text: string): TraceImport {
	if (Buffer.byteLength(text, 'utf8') > maxTraceBytes) {
		throw new Error('Trace files must be 10 MiB or smaller. Export a shorter session.');
	}
	const content = text.replace(/^\uFEFF/, '').trim();
	let documents: unknown[];
	try {
		const parsed: unknown = JSON.parse(content);
		documents = Array.isArray(parsed) ? parsed : [parsed];
	} catch {
		try { documents = content.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)); }
		catch { throw new Error('Invalid JSON. Choose an OTLP JSON export or JSONL containing OTLP envelopes.'); }
	}
	const events = new Map<string, TraceEvent>();
	let skipped = 0;
	let duplicates = 0;
	let count = 0;
	for (const document of documents) {
		const resources = record(document)?.resourceSpans;
		if (!Array.isArray(resources)) { throw new Error('Unsupported trace format: expected resourceSpans in an OTLP JSON export.'); }
		for (const resource of resources) {
			const resourceRecord = record(resource);
			const scopes = resourceRecord?.scopeSpans;
			if (!Array.isArray(scopes)) { throw new Error('Invalid OTLP resource: expected scopeSpans.'); }
			for (const scope of scopes) {
				const spans = record(scope)?.spans;
				if (!Array.isArray(spans)) { throw new Error('Invalid OTLP scope: expected spans.'); }
				for (const span of spans) {
					if (++count > 10_000) { throw new Error('Trace contains more than 10,000 spans. Export a shorter session.'); }
					const event = parseEvent(span, resourceRecord?.resource);
					if (!event) { skipped++; continue; }
					const key = `${event.traceId}/${event.id}`;
					if (events.has(key)) { duplicates++; }
					events.set(key, event);
				}
			}
		}
	}
	if (!events.size) { throw new Error('No valid spans found. Expected OTLP traces, not chat transcripts or metric-only exports.'); }
	const grouped = new Map<string, Trace>();
	for (const event of events.values()) {
		let trace = grouped.get(event.traceId);
		if (!trace) { trace = { id: event.traceId, events: [] }; grouped.set(trace.id, trace); }
		trace.events.push(event);
	}
	for (const trace of grouped.values()) {
		trace.events.sort((a, b) => {
			if (a.start === b.start) { return 0; }
			if (a.start === undefined) { return 1; }
			if (b.start === undefined) { return -1; }
			return a.start < b.start ? -1 : 1;
		});
	}
	return { traces: [...grouped.values()], skipped, duplicates };
}

function tokenCount(value: unknown): number | undefined {
	if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) { return undefined; }
	const number = Number(value);
	return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

export function summarize(trace: Trace) {
	const calls = trace.events.filter(event => event.operation === 'chat');
	const usage = (key: string) => {
		const counts = calls.map(event => tokenCount(event.attributes[key])).filter(value => value !== undefined);
		const total = counts.reduce((sum, count) => sum + count, 0);
		return { total: counts.length && Number.isSafeInteger(total) ? total : undefined, reported: counts.length };
	};
	const timed = trace.events.filter(event => event.durationMs !== undefined);
	const starts = timed.map(event => event.start!);
	const ends = timed.map(event => event.end!);
	return {
		calls: calls.length,
		tools: trace.events.filter(event => event.operation === 'execute_tool').length,
		errors: trace.events.filter(event => event.failed).length,
		input: usage('gen_ai.usage.input_tokens'), output: usage('gen_ai.usage.output_tokens'),
		// Elapsed range, not sum of overlapping parent/child spans.
		durationMs: timed.length ? Number(ends.reduce((a, b) => a > b ? a : b)
			- starts.reduce((a, b) => a < b ? a : b)) / 1e6 : undefined,
	};
}

export function durationLabel(milliseconds: number | undefined): string {
	if (milliseconds === undefined) { return 'duration unknown'; }
	return milliseconds < 1000 ? `${Math.round(milliseconds)} ms` : `${(milliseconds / 1000).toFixed(2)} s`;
}
