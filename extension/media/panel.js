const vscode = acquireVsCodeApi();
const byId = id => document.getElementById(id);
const canvas = byId('canvas');
const graphScrollStep = 32;
function handleCanvasKeydown(event) {
    const handledKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
    if (event.target !== canvas || !handledKeys.has(event.key)) {
        return;
    }
    event.preventDefault();
    switch (event.key) {
        case 'ArrowLeft': canvas.scrollBy({ left: -graphScrollStep, top: 0 }); break;
        case 'ArrowRight': canvas.scrollBy({ left: graphScrollStep, top: 0 }); break;
        case 'ArrowUp': canvas.scrollBy({ left: 0, top: -graphScrollStep }); break;
        case 'ArrowDown': canvas.scrollBy({ left: 0, top: graphScrollStep }); break;
        case 'Home': canvas.scrollTo({ left: 0, top: canvas.scrollTop }); break;
        case 'End': canvas.scrollTo({ left: canvas.scrollWidth, top: canvas.scrollTop }); break;
        case 'PageUp': canvas.scrollBy({ left: 0, top: -canvas.clientHeight }); break;
        case 'PageDown': canvas.scrollBy({ left: 0, top: canvas.clientHeight }); break;
    }
}
canvas.addEventListener('keydown', handleCanvasKeydown);
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
const decisionNodes = new Map();
let graphReports = [];
function drawEdges() {
    const rect = byId('graph').getBoundingClientRect();
    const svg = byId('edges');
    svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    svg.replaceChildren();
    const point = (node, bottom) => {
        const bounds = node.getBoundingClientRect();
        return { x: bounds.left - rect.left + bounds.width / 2,
            y: (bottom ? bounds.bottom : bounds.top) - rect.top };
    };
    const link = (from, to, status) => {
        const a = point(from, true);
        const b = point(to, false);
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
    for (const report of graphReports) {
        const nodes = decisionNodes.get(report.id);
        const parent = decisionNodes.get(report.parentReportId);
        if (parent) {
            link(parent.outcome, nodes.goal, 'follow-up');
        }
        for (const card of nodes.approaches.children) {
            const chosen = card.classList.contains('chosen');
            link(nodes.goal, card, chosen ? 'chosen' : 'rejected');
            if (chosen) {
                link(card, nodes.outcome, 'chosen');
            }
        }
    }
}
function renderGraph(reports) {
    graphReports = reports;
    decisionNodes.clear();
    const paths = byId('decision-paths');
    paths.replaceChildren();
    if (!reports.length) {
        paths.append(element('p', 'No decisions yet. Ask Copilot to use #recordDecision. Each call adds a decision to this map.', 'empty'));
        drawEdges();
        return;
    }
    const children = new Map();
    for (const report of reports) {
        const siblings = children.get(report.parentReportId) || [];
        siblings.push(report);
        children.set(report.parentReportId, siblings);
    }
    const render = report => {
        const number = reports.indexOf(report) + 1;
        const section = element('section', '', 'decision');
        section.setAttribute('aria-label', `Decision ${number}`);
        const goal = element('div', '', 'node goal');
        const select = element('button', `Decision ${number}`, 'decision-select');
        select.addEventListener('click', () => vscode.postMessage({ type: 'select', id: report.id }));
        goal.append(select, element('p', report.goal));
        if (report.parentReportId) {
            const parent = reports.findIndex(item => item.id === report.parentReportId);
            goal.append(element('span', parent < 0 ? 'Earlier decision is no longer retained' : `Follows decision ${parent + 1}`, 'badge'));
        }
        const approaches = element('div', '', 'branch-row');
        approaches.append(...report.approaches.map(approach => {
            const card = element('article', '', `node approach ${approach.status}`);
            const details = element('details', '');
            details.append(element('summary', approach.title), element('p', approach.reason));
            details.addEventListener('toggle', drawEdges);
            card.append(element('span', approach.status === 'chosen' ? 'Chosen' : 'Not chosen', 'badge'), details);
            return card;
        }));
        const outcome = element('div', '', 'node outcome');
        outcome.append(element('h2', 'Outcome'), element('p', report.outcome));
        section.append(goal, approaches, outcome);
        decisionNodes.set(report.id, { goal, approaches, outcome, select });
        const followUps = children.get(report.id) || [];
        if (followUps.length) {
            const row = element('div', '', 'follow-ups');
            row.append(...followUps.map(render));
            section.append(row);
        }
        return section;
    };
    const ids = new Set(reports.map(report => report.id));
    paths.append(...reports.filter(report => !ids.has(report.parentReportId)).map(render));
}
new ResizeObserver(drawEdges).observe(byId('graph'));
let previousContent = '';
let previousSelected;
let canvasWidth = 0;
new ResizeObserver(() => {
    if (canvas.clientWidth === canvasWidth) {
        return;
    }
    canvasWidth = canvas.clientWidth;
    const goal = decisionNodes.get(previousSelected)?.goal;
    if (goal) {
        const target = goal.getBoundingClientRect();
        canvas.scrollLeft += target.left - canvas.getBoundingClientRect().left - (canvasWidth - target.width) / 2;
    }
}).observe(canvas);
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
    const content = JSON.stringify(data.reports);
    if (content !== previousContent) {
        previousContent = content;
        const select = byId('reports');
        select.replaceChildren(...data.reports.map((report, index) => {
            const option = element('option', `${index + 1} / ${data.reports.length}`);
            option.value = report.id;
            return option;
        }));
        if (!data.reports.length) {
            select.append(element('option', 'None yet'));
        }
        select.disabled = !data.reports.length;
        renderGraph(data.reports);
    }
    byId('reports').value = data.selected || '';
    byId('selected-goal').textContent = data.report?.goal || 'Waiting for a decision';
    for (const [id, nodes] of decisionNodes) {
        const selected = id === data.selected;
        nodes.goal.classList.toggle('selected', selected);
        nodes.select.setAttribute('aria-pressed', String(selected));
    }
    if (previousSelected !== data.selected) {
        const goal = decisionNodes.get(data.selected)?.goal;
        if (goal) {
            const target = goal.getBoundingClientRect();
            const viewport = canvas.getBoundingClientRect();
            canvas.scrollTo({ top: canvas.scrollTop + target.top - viewport.top - 22,
                left: canvas.scrollLeft + target.left - viewport.left - (canvas.clientWidth - target.width) / 2 });
        }
        previousSelected = data.selected;
    }
    requestAnimationFrame(drawEdges);
});
vscode.postMessage({ type: 'ready' });
