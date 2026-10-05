import { open } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { parseEvent, TraceEvent } from './trace';

export interface Decision {
	id: string;
	goal: string;
	approaches: { title: string; reason: string; status: 'chosen' | 'rejected' }[];
	outcome: string;
}

export function decisionInput(input: unknown): Omit<Decision, 'id'> {
	if (!input || typeof input !== 'object') { throw new Error('Expected a decision object.'); }
	const value = input as Record<string, unknown>;
	const text = (item: unknown, limit: number) => {
		if (typeof item !== 'string' || !item.trim() || item.length > limit) { throw new Error(`Expected text of 1–${limit} characters.`); }
		return item.trim();
	};
	if (!Array.isArray(value.approaches) || value.approaches.length < 1 || value.approaches.length > 4) {
		throw new Error('Report 1–4 approaches actually considered.');
	}
	const approaches = value.approaches.map(item => {
		if (!item || (item.status !== 'chosen' && item.status !== 'rejected')) { throw new Error('Invalid approach status.'); }
		return { title: text(item.title, 160), reason: text(item.reason, 800), status: item.status as 'chosen' | 'rejected' };
	});
	if (approaches.filter(item => item.status === 'chosen').length !== 1) { throw new Error('Exactly one approach must be chosen.'); }
	return { goal: text(value.goal, 1000), approaches, outcome: text(value.outcome, 1200) };
}

// Copilot's file exporter serializes SDK ReadableSpan objects, not OTLP envelopes.
export function liveEvent(line: string): TraceEvent | undefined {
	const span = JSON.parse(line);
	if (!span || typeof span !== 'object' || !span._spanContext) { return undefined; }
	const nano = (time: unknown) => Array.isArray(time) && time.length === 2
		&& time.every(Number.isSafeInteger) && time[0] >= 0 && time[1] >= 0 && time[1] < 1e9
		? (BigInt(time[0]) * 1_000_000_000n + BigInt(time[1])).toString() : undefined;
	return parseEvent({
		...span._spanContext, name: span.name, status: span.status,
		startTimeUnixNano: nano(span.startTime), endTimeUnixNano: nano(span.endTime),
		attributes: Object.entries(span.attributes ?? {}).map(([key, value]) => ({ key, value: { stringValue: value } })),
	}, undefined);
}

// Bounded reads; incomplete lines and multibyte characters survive between polls.
export class LiveTail {
	private offset = 0;
	private identity = '';
	private pending = '';
	private decoder = new StringDecoder('utf8');
	private dropping = false;
	skipped = 0;
	constructor(readonly path: string) {}
	async read(): Promise<TraceEvent[]> {
		let file;
		try { file = await open(this.path, 'r'); }
		catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return []; } throw error; }
		try {
			const stat = await file.stat();
			const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
			if (identity !== this.identity || stat.size < this.offset) {
				this.offset = 0; this.pending = ''; this.decoder = new StringDecoder('utf8'); this.dropping = false;
				this.identity = identity;
			}
			const buffer = Buffer.alloc(Math.min(256 * 1024, Math.max(0, stat.size - this.offset)));
			const { bytesRead } = await file.read(buffer, 0, buffer.length, this.offset);
			this.offset += bytesRead;
			const lines = (this.pending + this.decoder.write(buffer.subarray(0, bytesRead))).split('\n');
			this.pending = lines.pop()!;
			const events: TraceEvent[] = [];
			for (const line of lines) {
				if (this.dropping) { this.dropping = false; continue; }
				if (!line.trim()) { continue; }
				try { const event = liveEvent(line); if (event) { events.push(event); } }
				catch { this.skipped++; }
			}
			if (this.pending.length > 2 * 1024 * 1024) { this.pending = ''; this.dropping = true; this.skipped++; }
			return events;
		} finally { await file.close(); }
	}
}
