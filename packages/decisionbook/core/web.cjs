// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. Validity is by scope and `supersedes`, never by date; two live decisions of one key and scope are a conflict, shown, never chosen.
const { text: { safe: { clip }, lines: { escapedRe } } } = require('@atlasbound/kit');
const { RELS, BUILT_ON, nodeOf } = require('../contracts/shapes.cjs');
const { byTime, mentions, decisionRef: refOf, decisionSlot: slotOf } = require('../base/text.cjs');
const { globCovers } = require('../base/glob.cjs');
const { planLevel } = require('./level.cjs');
const { unmet, levelAt, undecidedOf } = require('./ready.cjs');

const wordIn = (word, re = new RegExp(`(?<![\\p{L}\\p{N}])${escapedRe(word)}(?![\\p{L}\\p{N}])`, 'u')) => (text) => re.test(text); // `port` is not in report

function validity(views) {
  const stage = new Map(views.map((v) => [v.id, v.stage]));
  const all = views.flatMap((v) => v.decisions);
  const latest = new Map(all.map((d) => [`${refOf(d)}|${d.scope}`, d]));
  const replacedBy = new Map(all.filter((d) => !d.proposed && stage.get(d.plan) !== 'draft').flatMap((d) => d.supersedes.map((ref) => [ref, refOf(d)])));
  const stateOf = (d) => {
    if (d.proposed) return 'proposed';
    if (latest.get(`${refOf(d)}|${d.scope}`) !== d) return 'revised';
    return replacedBy.has(refOf(d)) ? 'superseded' : 'active';
  };
  const marked = all.map((d) => ({ ...d, ref: refOf(d), state: stateOf(d), supersededBy: replacedBy.get(refOf(d)) ?? null }));
  const live = new Map();
  marked.filter((d) => d.state === 'active').forEach((d) => live.set(slotOf(d), [...(live.get(slotOf(d)) || []), d.ref]));
  return marked.map((d) => ({ ...d, conflicts: d.state === 'active' ? live.get(slotOf(d)).filter((ref) => ref !== d.ref) : [] }));
}

// a draft's supersedes binds nothing; of the READY ones the newest of a branch is ready, the rest parked
function statesOf(views) {
  const replaced = new Set(views.filter((v) => v.stage !== 'draft').flatMap((v) => v.links.filter((l) => l.rel === 'supersedes')).map((l) => l.to.slice('plan:'.length)));
  const stageOf = (v) => (v.stage === 'closed' || !replaced.has(v.id) ? v.stage : 'superseded');
  const active = new Map(views.filter((v) => stageOf(v) === 'ready').sort((a, b) => byTime(a.ready, b.ready)).map((v) => [v.branch, v.id]));
  return (v) => (stageOf(v) === 'ready' && active.get(v.branch) !== v.id ? 'parked' : stageOf(v));
}

const heldOf = ({ views }, branch) => views.find((v) => v.branch === branch && v.state === 'ready') || views.findLast((v) => v.branch === branch && v.state === 'draft') || null; // the newest draft, as the gate names it

const fromGit = ({ files, own, tests }) => [...files.map((f) => ({ rel: 'changed', to: `file:${f}` })),
  ...own.map((c) => ({ rel: 'shipped-in', to: `commit:${c.sha}` })), ...tests.map((t) => ({ rel: 'tested-by', to: `test:${t}` }))];
const decides = (v) => [...new Set(v.decisions.map((d) => d.key))].map((key) => ({ rel: 'decides', to: `decision:${key}`, source: 'its decision records' }));
const derivedOf = (v) => [...decides(v), ...(v.closed ? fromGit(v.closed).map((l) => ({ ...l, source: 'git' })) : [])];

// asked: per plan id, the rows done two ways its new files fall in (null: not read), only where `ready` read them; receipts: per plan id,
// the files read in its sessions and the files it names that are here (steps/store)
function webOf(views, danger = [], asked = {}, receipts = {}) {
  const decisions = validity(views);
  const mine = new Map(views.map((v) => [v.id, []]));
  decisions.forEach((d) => mine.get(d.plan).push(d));
  const stateOf = statesOf(views);
  const levelOf = (v, judged = planLevel(v, danger)) => ({ ...judged, level: levelAt(v, judged.level, danger) });
  const marked = views.map((v) => ({ ...v, state: stateOf(v), level: levelOf(v), undecided: undecidedOf(asked[v.id], decisions),
    receipts: receipts[v.id] || v.receipts }))
    .map((v) => ({ ...v, unmet: unmet(v, v.level.level, danger), decisions: mine.get(v.id) }));
  const edges = marked.flatMap((v) => [...v.links, ...derivedOf(v)].map((l) => ({ from: `plan:${v.id}`, ...l })));
  return { views: marked, decisions, edges };
}

const reaches = (edge, { type, value }, ref) => edge.to === ref || (type === 'file' && edge.to.startsWith('file:') && globCovers(edge.to.slice(5), value));

function linksOf(web, ref) {
  const node = nodeOf(ref);
  const out = web.edges.filter((e) => e.from === ref);
  const back = web.edges.filter((e) => reaches(e, node, ref)).map((e) => ({ ...e, from: ref, rel: RELS[e.rel].back, to: e.from }));
  return [...out, ...back];
}

const searchFields = (v) => ({ title: v.title, why: v.why, goal: v.goal, tags: v.tags.join(' '), checks: v.checks.map((c) => c.text).join(' '),
  research: v.research.map((r) => `${r.asked} ${r.answer}`).join(' '), questions: v.questions.map((q) => q.text).join(' '),
  links: v.links.map((l) => l.to).join(' '), decisions: v.decisions.map((d) => `${d.key} ${d.value} ${d.why}`).join(' ') });

function found(web, words) {
  const wanted = words.map((w) => w.toLowerCase()).map((word) => ({ word, holds: wordIn(word) }));
  return web.views.map((v) => {
    const fields = Object.entries(searchFields(v)).map(([name, text]) => [name, String(text || '').toLowerCase()]);
    const hits = wanted.filter(({ holds }) => fields.some(([, text]) => holds(text)));
    const matched = fields.filter(([, text]) => hits.some(({ holds }) => holds(text))).map(([name]) => name);
    return { view: v, score: hits.length, words: hits.map(({ word }) => word), matched };
  }).filter((h) => h.score > 0).sort((a, b) => b.score - a.score || byTime(b.view, a.view));
}

// what a record uses of an earlier plan: a named active decision or its id, or a reused active key; a paraphrase names nothing
const decisionNamed = (text, id, keys) => keys.filter((k) => mentions(text, `decision:${k}`) || mentions(text, `${id}/${k}`)).map((k) => `decision ${k}`)[0];
const USES = {
  names: (r, text, id, keys) => decisionNamed(text, id, keys) || (mentions(text, id) ? 'its id' : null),
  reuses: (r, text, id, keys) => (r.t === 'decision' && keys.includes(r.key) ? `decision ${r.key}` : null),
};
const firstOf = (r) => [r.key, r.gap, r.order, r.q, r.id, r.asked, r.command, r.text].find((v) => v !== undefined) ?? '';
const labelOf = (r) => clip(`${r.t === 'item' ? r.kind : r.t} ${firstOf(r)}`, 80);

// one built-on link per earlier plan read this session and used by a record; never itself, one linked already, or one the person unlinked
function builtOnOf(web, view, records, read) {
  const slot = (id) => `${BUILT_ON.rel} plan:${id}`;
  const held = new Set([...view.links.filter((l) => l.rel === BUILT_ON.rel).map((l) => `${l.rel} ${l.to}`), ...view.unlinked, slot(view.id)]);
  const useOf = (r, id, keys) => BUILT_ON.use.map((use) => USES[use](r, Object.values(r).flat().join('\n'), id, keys)).find(Boolean);
  return records.filter((r) => BUILT_ON.records.includes(r.t)).flatMap((r) => read.flatMap(({ id, door }) => {
    const keys = web.decisions.filter((d) => d.plan === id && d.state === 'active').map((d) => d.key);
    const what = !held.has(slot(id)) && BUILT_ON.read.includes(door) && useOf(r, id, keys);
    if (!what) return [];
    held.add(slot(id));
    return [{ t: 'link', rel: BUILT_ON.rel, to: `plan:${id}`, why: clip(`${labelOf(r)} ← ${what}`, 160), source: `read: ${door}` }];
  }));
}

module.exports = { webOf, heldOf, linksOf, found, builtOnOf };
