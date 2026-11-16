// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. `show` and `find`: a plan with the nodes asked for, one node with what links to it, the plans a search
// found; each within its byte budget.
const { text: { safe: { clip }, lines: { filled } } } = require('@atlasbound/kit');
const { WORDS } = require('../../contracts/codes.cjs');
const { unrevised } = require('../../base/text.cjs');
const { boundedLines } = require('./budget.cjs');
const { showCall } = require('./calls.cjs');
const { decisionLine, stepLine, gapLine, linkLine, confirmLines, assumptionLine, shippedCounts, planContractLine,
  levelLine } = require('./records.cjs');

const SHOW_BYTES = 6144;
const FOUND_SHOWN = 20;

function researchLine(r) {
  const source = r.source ? ` (${clip(r.source, 80)})` : '';
  return `research ${clip(r.tool, 40)}: ${clip(r.asked, 80)} -> ${clip(r.answer, 120)}${source}`;
}
function criterionLine(c) {
  const command = c.command ? ` [${clip(c.command, 80)}]` : '';
  return `check ${clip(c.id, 40)}: ${clip(c.text, 100)}${command}`;
}
function planItemLine(i) {
  const covers = i.covers.length ? ` (covers ${clip(i.covers.join(', '), 120)})` : '';
  return `${i.kind}: ${clip(i.text, 100)}${covers}`;
}
const questionLine = (q) => `- ${clip(q.q, 40)} ${q.answered ? 'answered' : 'OPEN'}: ${clip(q.text, 100)}`;
const closedLine = (closed) => `closed: ${shippedCounts(closed)}, ${closed.other} not attributed`;
const plansFirst = (a, b) => b.to.startsWith('plan:') - a.to.startsWith('plan:');

// the lines of each node `show` may hold, in the order they are said
const SECTIONS = {
  why: (o) => [`why: ${clip(String(o.why), 400)}`],
  goal: (o) => (o.goal ? [`goal: ${clip(o.goal, 300)}`] : []),
  plan: (o) => [`plan: ${clip(o.plan.join(', '), 600) || 'none'}`],
  contract: (o) => o.contract.map(planContractLine),
  steps: (o) => o.steps.map(stepLine),
  gaps: (o) => o.gaps.map(gapLine),
  research: (o) => o.research.map(researchLine),
  pointers: (o) => SECTIONS.research({ research: o.pointers }).map((line) => line.replace(/^research/, 'pointer')),
  checks: (o) => o.checks.map(criterionLine),
  items: (o) => o.items.map(planItemLine),
  decisions: (o) => unrevised(o.decisions).map(decisionLine),
  questions: (o) => o.questions.map(questionLine),
  assumptions: (o) => (o.assumptions.length ? [WORDS.assumed, ...o.assumptions.map(assumptionLine)] : []),
  confirm: (o) => confirmLines(o.confirm, o.confirm?.amended),
  links: (o) => [...o.links].sort(plansFirst).map(linkLine), // links to plans first: never the ones cut
  notes: (o) => o.notes.map((n) => `note: ${clip(n.text, 200)}`),
  resumes: (o) => o.resumes.map((r) => `resumed ${clip(String(r.at), 40)}: ${clip(r.why, 200)}`),
  closed: (o) => (o.closed ? [closedLine(o.closed)] : []),
};

/** A plan: its head, the rubric rows a draft still misses, the nodes asked for, the lines its file refused, its
 * node map. A bare show the session already had in full answers the head and the node map only. */
function showText(out) {
  const missing = out.state === 'draft' && out.unmet ? out.unmet : [];
  const head = [`${out.id} ${out.state} on ${out.branch}: ${clip(out.title, 100)}`, levelLine(out.level),
    ...missing.map((row) => `not READY, ${row.id}: ${row.text}`)];
  const nodes = Object.entries(out.nodes || {}).map(([name, count]) => `${name} ${count}`).join(', ');
  const map = filled(WORDS.nodeMap, { id: out.id, nodes });
  if (out.seen) return [...head, WORDS.readOnce, map].join('\n');
  const list = Object.keys(SECTIONS).filter((field) => field in out).flatMap((field) => SECTIONS[field](out));
  const refusedLines = (out.refused || []).map((r) => r.line);
  const refused = refusedLines.length ? [`refused lines: ${refusedLines.join(', ')}`] : [];
  const more = `${showCall(out.id, '<node>')} --json`;
  return boundedLines({ head, list, tail: [...refused, map], max: SHOW_BYTES, more }).join('\n');
}

/** One node (`type:value`): the decisions of that key with their plans, then every link to or from it. */
function nodeText(ref, links, decisions) {
  const list = [...decisions.map((d) => `${decisionLine(d)} in ${d.plan}`), ...links.map(linkLine)];
  return boundedLines({ head: [ref], list, tail: [], max: SHOW_BYTES, more: `${showCall(ref)} --json` }).join('\n');
}

function foundLine(hit) {
  const plan = clip(hit.plan.join(', '), 80) || 'none';
  return `${hit.id} ${hit.state} (${hit.matched.join(', ')}): ${clip(hit.title, 100)}; plan ${plan}`;
}
/** The plans a search found, then each plan file it could not read. */
function foundText(hits, refused = []) {
  const found = hits.length ? hits.slice(0, FOUND_SHOWN).map(foundLine) : ['nothing found'];
  return [...found, ...refused.map((r) => `not read: ${r.id} (${r.code})`)].join('\n');
}

module.exports = { showText, nodeText, foundText };
