// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. `show` and `find`: a plan with the nodes asked for, one node with what links to it, the plans a search
// found; each within its byte budget.
const { text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS, SHOWN: { show: shown }, branchWord } = require('../../contracts/codes.cjs');
const { DIR, refIs } = require('../../contracts/shapes.cjs');
const { isShown } = require('../../base/text.cjs');
const { boundedLines } = require('./budget.cjs');
const { jsonCall } = require('./calls.cjs');
const { decisionLine, stepLine, gapLine, linkLine, confirmLines, assumptionLine, shippedCounts, planContractLine,
  levelLine, deciderOf } = require('./records.cjs');

const SHOW_BYTES = 6144;
const FOUND_SHOWN = 20;

function researchLine(r) {
  const source = r.source ? ` (${shown.source(r.source)})` : '';
  return `research ${shown.tool(r.tool)}: ${shown.asked(r.asked)} -> ${shown.answer(r.answer)}${source}`;
}
function criterionLine(c) {
  const command = c.command ? ` [${shown.command(c.command)}]` : '';
  return `check ${shown.id(c.id)}: ${shown.text(c.text)}${command}`;
}
function planItemLine(i) {
  const covers = i.covers.length ? ` (covers ${shown.covers(i.covers.join(', '))})` : '';
  return `${i.kind}: ${shown.text(i.text)}${covers}`;
}
const questionLine = (q) => `- ${shown.q(q.q)} ${q.answered ? 'answered' : 'OPEN'}: ${shown.text(q.text)}`;
// an older record names no one who closed it
const closedLine = (closed) => filled(WORDS.closedCounts, { by: closed.by ? ` by ${deciderOf(closed.by)}` : '', counts: shippedCounts(closed),
  other: closed.other });
const plansFirst = (a, b) => refIs('plan', b.to) - refIs('plan', a.to);

// the lines of each node `show` may hold, in the order they are said
const SECTIONS = {
  why: (o) => [`why: ${shown.why(String(o.why))}`],
  goal: (o) => (o.goal ? [`goal: ${shown.goal(o.goal)}`] : []),
  plan: (o) => [`plan: ${shown.plan(o.plan.join(', ')) || 'none'}`],
  contract: (o) => o.contract.map(planContractLine),
  steps: (o) => o.steps.map(stepLine),
  gaps: (o) => o.gaps.map(gapLine),
  research: (o) => o.research.map(researchLine),
  pointers: (o) => SECTIONS.research({ research: o.pointers }).map((line) => line.replace(/^research/, 'pointer')),
  checks: (o) => o.checks.map(criterionLine),
  items: (o) => o.items.map(planItemLine),
  decisions: (o) => o.decisions.filter(isShown).flatMap((d) => [decisionLine(d),
    ...(d.proposedThen && !d.conflict ? [`  ${filled(WORDS.proposedThen, { proposal: shown.proposedThen(d.proposedThen) })}`] : [])]),
  questions: (o) => o.questions.map(questionLine),
  assumptions: (o) => (o.assumptions.length ? [WORDS.assumed, ...o.assumptions.map(assumptionLine)] : []),
  confirm: (o) => confirmLines(o.confirm, o.confirm?.amended),
  links: (o) => [...o.links].sort(plansFirst).map(linkLine), // links to plans first: never the ones cut
  notes: (o) => o.notes.map((n) => `note: ${shown.note(n.text)}`),
  resumes: (o) => o.resumes.map((r) => `resumed ${shown.at(String(r.at))}: ${shown.resumedWhy(r.why)}`),
  closed: (o) => (o.closed ? [closedLine(o.closed)] : []),
};

/** A plan: its head, the rubric rows a draft still misses, the nodes asked for, the lines its file refused, its
 * node map. A bare show the session already had in full answers the head and the node map only. */
function showText(out) {
  const missing = out.state === 'draft' && out.unmet ? out.unmet : [];
  const head = [`${out.id} ${out.state} on ${branchWord(out.branch)}: ${shown.title(out.title)}`, levelLine(out.level), ...out.open,
    ...missing.map((row) => `not READY, ${row.id}: ${row.text}`)];
  const nodes = Object.entries(out.nodes || {}).map(([name, count]) => `${name} ${count}`).join(', ');
  const map = filled(WORDS.nodeMap, { id: out.id, nodes });
  if (out.seen) return [...head, WORDS.readOnce, map].join('\n');
  const list = Object.keys(SECTIONS).filter((field) => field in out).flatMap((field) => SECTIONS[field](out));
  const refused = (out.refused || []).map((r) => filled(WORDS.lineTorn, { file: `${DIR}/${out.id}.jsonl`, line: r.line, code: r.code }));
  const more = jsonCall('show', out.id, '<node>');
  return boundedLines({ head, list, tail: [...refused, map], max: SHOW_BYTES, more }).join('\n');
}

/** One node (`type:value`): the decisions of that key with their plans, then every link to or from it, then their plans' open items. */
function nodeText(ref, links, decisions, open) {
  // a conflict is said once, by its first line here; every other line of it is in that text
  const once = decisions.filter((d, i) => !d.conflict || decisions.findIndex((o) => o.conflict === d.conflict) === i);
  const list = [...once.map((d) => `${decisionLine(d)} in ${d.plan}`), ...links.map(linkLine)];
  return boundedLines({ head: [ref], list, tail: open, max: SHOW_BYTES, more: jsonCall('show', ref) }).join('\n');
}

function foundLine(hit) {
  const plan = shown.foundPlan(hit.plan.join(', ')) || 'none';
  return `${hit.id} ${hit.state} (${hit.matched.join(', ')}): ${shown.title(hit.title)}; plan ${plan}`;
}
/** The plans a search found, then each plan file it could not read and the open items of the plans found. */
function foundText({ hits, refused, open }) {
  const found = hits.length ? hits.slice(0, FOUND_SHOWN).map(foundLine) : ['nothing found'];
  return [...found, ...refused.map((r) => `not read: ${r.id} (${r.code})`), ...open].join('\n');
}

module.exports = { showText, nodeText, foundText };
