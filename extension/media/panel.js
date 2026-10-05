const vscode = acquireVsCodeApi();
const byId = id => document.getElementById(id);
for (const id of ['connect', 'prompt', 'pause', 'clear', 'reveal']) {
    byId(id).addEventListener('click', () => vscode.postMessage({ type: id }));
}
byId('settings').setAttribute('aria-expanded', 'false');
byId('settings').addEventListener('click', () => {
    const settings = byId('settings-panel');
    settings.hidden = !settings.hidden;
    byId('settings').setAttribute('aria-expanded', String(!settings.hidden));
});
byId('theme').addEventListener('change', event => vscode.postMessage({ type: 'theme', value: event.target.value }));
byId('automatic').addEventListener('change', event => vscode.postMessage({ type: 'automatic', value: event.target.checked }));
byId('reports').addEventListener('change', event => vscode.postMessage({ type: 'select', id: event.target.value }));
function element(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) {
        node.className = className;
    }
    return node;
}
function drawEdges() {
    const graph = byId('graph');
    const rect = graph.getBoundingClientRect();
    const svg = byId('edges');
    svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    svg.replaceChildren();
    const point = (node, bottom) => {
        const bounds = node.getBoundingClientRect();
        return {
            x: bounds.left - rect.left + bounds.width / 2,
            y: (bottom ? bounds.bottom : bounds.top) - rect.top,
        };
    };
    const link = (a, b, status) => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const middle = (a.y + b.y) / 2;
        path.setAttribute('d', `M ${a.x} ${a.y} C ${a.x} ${middle}, ${b.x} ${middle}, ${b.x} ${b.y}`);
        path.setAttribute('class', status);
        svg.append(path);
        const port = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        port.setAttribute('cx', b.x);
        port.setAttribute('cy', b.y);
        port.setAttribute('r', '3');
        svg.append(port);
    };
    for (const card of byId('approaches').children) {
        if (!card.classList.contains('approach')) {
            continue;
        }
        const chosen = card.classList.contains('chosen');
        link(point(byId('goal-node'), true), point(card, false), chosen ? 'chosen' : 'rejected');
        if (chosen) {
            link(point(card, true), point(byId('outcome-node'), false), 'chosen');
        }
    }
}
new ResizeObserver(drawEdges).observe(byId('graph'));
let previousContent = '';
window.addEventListener('message', ({ data }) => {
    document.body.dataset.theme = ['light', 'dark'].includes(data.theme) ? data.theme : 'auto';
    byId('theme').value = data.theme || 'auto';
    byId('automatic').checked = !!data.automaticReporting;
    byId('status').textContent = data.paused ? 'View paused. Collection continues.' : data.status;
    byId('connect').textContent = data.connected ? 'Disconnect traces' : 'Connect traces';
    byId('pause').textContent = data.paused ? 'Resume' : 'Pause';
    byId('path').textContent = data.path || 'No active capture file.';
    byId('reveal').disabled = !data.path;
    byId('retention').textContent = `${data.observed} recent spans · ${data.discarded} evicted · ${data.skipped} malformed lines. Totals may be partial. Latest 50 reports / 500 spans kept in memory; reload clears reports.`;
    const usage = data.usage;
    const count = value => value.total === undefined ? 'not reported' : value.total.toLocaleString();
    byId('usage').textContent = usage ? `Trace ${data.traceId.slice(0, 8)} · ${usage.calls} model calls · ${usage.duration}\nInput ${count(usage.input)} (${usage.input.reported}/${usage.calls} calls) · Output ${count(usage.output)} (${usage.output.reported}/${usage.calls} calls) · ${usage.errors} errors` : data.connected ? 'Waiting for a trace linked to this decision.' : 'Connect traces in Settings for recorded activity.';
    byId('tools').replaceChildren(...data.tools.map(tool => element('li', `${tool.failed ? 'Failed · ' : ''}${tool.name} · ${tool.duration}`)));
    const content = JSON.stringify([data.report, data.reports]);
    if (content === previousContent) {
        return;
    }
    previousContent = content;
    const select = byId('reports');
    select.replaceChildren(...data.reports.map(report => {
        const option = element('option', report.goal.slice(0, 90));
        option.value = report.id;
        return option;
    }));
    if (!data.reports.length) {
        select.append(element('option', 'No decisions yet'));
    }
    select.disabled = !data.reports.length;
    select.value = data.selected || '';
    byId('goal').textContent = data.report?.goal || 'Waiting for a decision';
    byId('outcome').textContent = data.report?.outcome || 'The chosen approach leads here.';
    const approaches = data.report?.approaches || [];
    byId('graph').style.minWidth = `${Math.max(240, approaches.length * 174 - 24)}px`;
    byId('approaches').replaceChildren(...approaches.map(approach => {
        const card = element('article', '', `node approach ${approach.status}`);
        const details = element('details', '');
        details.append(element('summary', approach.title), element('p', approach.reason));
        details.addEventListener('toggle', drawEdges);
        card.append(element('span', approach.status === 'chosen' ? 'Chosen' : 'Not chosen', 'badge'), details);
        return card;
    }));
    if (!approaches.length) {
        byId('approaches').append(element('p', 'Use Copilot Agent chat with recordDecision enabled.', 'empty'));
    }
    requestAnimationFrame(drawEdges);
});
vscode.postMessage({ type: 'ready' });
