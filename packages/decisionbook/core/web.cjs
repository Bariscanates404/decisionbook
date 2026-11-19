// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. Validity is by scope and `supersedes`, never by date; two live decisions of one key and scope are a conflict, shown, never chosen.
const { text: { lines: { escapedRe } } } = require('@atlasbound/kit');
const { RELS, BUILT_ON, nodeOf, refOf, refValue, refIs } = require('../contracts/shapes.cjs');
const { WORDS, SHOWN: { web: shown } } = require('../contracts/codes.cjs');
const { byTime, mentions, asciiFolded, isKeep, conflictLine, headsOf, replacedOf, isTheirs, personsOwn, decisionRef, decisionSlot: slotOf } = require('../base/text.cjs');
const { globCovers, keyMeets } = require('../base/glob.cjs');
const { scopeOf } = require('./fold.cjs');
const { planLevel } = require('./level.cjs');
const { unmet, levelAt, undecidedOf, changedOf } = require('./ready.cjs');

// a whole word (`port` is not in report); one of `n` letters or more also finds the words its first `n` begin (`dugmesinin`: `dugmesi`)
const wordStem = (word, n = 6) => ([...word].length < n ? escapedRe(word) : `${escapedRe([...word].slice(0, n).join(''))}[\\p{L}\\p{N}]*`);
const wordIn = (word, re = new RegExp(`(?<![\\p{L}\\p{N}])${wordStem(word)}(?![\\p{L}\\p{N}])`, 'u')) => (text) => re.test(text);

// `reach`: what a decision is about (its plan's files and its own)
function validity(views, reach) {
  const stage = new Map(views.map((v) => [v.id, v.stage]));
  const all = views.flatMap((v) => v.decisions);
  const slot = (d) => `${decisionRef(d)}|${d.scope}`;
  // per key and scope of a plan, the line that stands for it and its rivals: of the person's lines, those no other of theirs replaced
  // (headsOf), never the AI's beside them (only the person changes their decision); standing lines whose values differ byte for byte (the
  // same words are no agreement) are a conflict a merge kept, whatever their order: one names the others, none holds (core/text/records)
  const stands = new Map([...Map.groupBy(all, slot)].map(([at, lines]) => {
    const heads = headsOf(lines.filter(isTheirs));
    const one = heads.findLast((d) => !isKeep(d)) ?? heads.at(-1) ?? lines.at(-1);
    return [at, { one, rivals: personsOwn(one) ? heads.filter((o) => o !== one && o.value !== one.value) : [] }];
  }));
  const standing = (d) => stands.get(slot(d)).one === d;
  // what a key's lines replaced stays replaced, unless the line standing for that key now keeps it (the person took it back)
  const takenBack = (d, one = stands.get(slot(d)).one) => (isKeep(one) ? one.keeps : []);
  const binding = all.filter((d) => !d.proposed && stage.get(d.plan) !== 'draft');
  const replacedBy = new Map(binding.flatMap((d) => replacedOf(d).filter((ref) => !takenBack(d).includes(ref)).map((ref) => [ref, d])));
  const keptBy = new Map(binding.filter((d) => standing(d) && isKeep(d)).flatMap((d) => d.keeps.map((ref) => [ref, d])));
  // by which decision one was replaced (its ref), and who made that one, when, in which sentence of theirs; who keeps it now, when
  const replacer = (ref, by = replacedBy.get(ref), keep = keptBy.get(ref)) => ({ supersededBy: by ? decisionRef(by) : null,
    replaced: by ? { by: by.by, at: by.at, said: by.said } : null, kept: keep ? { by: keep.by, at: keep.at } : null });
  // a kept answer (one that keeps the decisions it names) is never live
  const stateOf = (d) => (d.proposed && 'proposed') || (!standing(d) && 'revised') || (isKeep(d) && 'kept')
    || (replacedBy.has(decisionRef(d)) ? 'superseded' : 'active');
  // a draft's decision that names one it replaces (on the person's yes) replaces it once its plan is READY: no conflict till then
  const pending = (d) => (!d.proposed && stage.get(d.plan) === 'draft' ? replacedOf(d) : []);
  const marked = all.map((d) => ({ ...d, ref: decisionRef(d), state: stateOf(d), replacing: pending(d), ...replacer(decisionRef(d)),
    rivals: stateOf(d) === 'active' ? stands.get(slot(d)).rivals.map(conflictLine) : [] }));
  const live = Map.groupBy(marked.filter((d) => d.state === 'active'), slotOf);
  const beside = (d, o) => [...d.replacing, ...d.keeps].includes(o.ref); // what a decision replaces or keeps is no rival of it
  const against = (d) => live.get(slotOf(d)).filter((o) => o.ref !== d.ref && !beside(d, o) && !beside(o, d)
    && keyMeets(d.key, reach(d), reach(o))).map((o) => o.ref);
  // another person line is a rival too, one CONFLICT text held the same way (core/text/records, core/gate): another plan's of the slot it
  // conflicts with, or one standing that replaces a decision this one replaces (neither replaced the other), whatever its key
  const heir = (d) => d.state === 'active' && personsOwn(d) && stage.get(d.plan) !== 'draft';
  const shares = (d, o) => heir(d) && heir(o) && replacedOf(o).some((ref) => replacedOf(d).includes(ref));
  const othersOf = (d, refs) => (personsOwn(d) ? marked.filter((o) => o.state === 'active' && o.ref !== d.ref && personsOwn(o)
    && ((refs.includes(o.ref) && slotOf(o) === slotOf(d)) || shares(d, o))).map(conflictLine) : []);
  const withConflicts = (d, conflicts) => ({ ...d, conflicts, rivals: [...d.rivals, ...othersOf(d, conflicts)] });
  return marked.map((d) => withConflicts(d, d.state === 'active' ? against(d) : []));
}

// a draft's supersedes binds nothing; of the READY ones the newest of a branch is ready, the rest parked
function statesOf(views) {
  const replaced = new Set(views.filter((v) => v.stage !== 'draft').flatMap((v) => v.links.filter((l) => l.rel === 'supersedes')).map((l) => refValue(l.to)));
  const stageOf = (v) => (v.stage === 'closed' || !replaced.has(v.id) ? v.stage : 'superseded');
  const active = new Map(views.filter((v) => stageOf(v) === 'ready').sort((a, b) => byTime(a.ready, b.ready)).map((v) => [v.branch, v.id]));
  return (v) => (stageOf(v) === 'ready' && active.get(v.branch) !== v.id ? 'parked' : stageOf(v));
}

const heldOf = ({ views }, branch) => views.find((v) => v.branch === branch && v.state === 'ready') || views.findLast((v) => v.branch === branch && v.state === 'draft') || null; // the newest draft, as the gate names it

// a built-on link a write stored for a reused key ("decision k ← decision k") stands where the two plans' decisions of k meet, as a
// write links one now (builtOnOf): an earlier build stored such links between plans of other files
const REUSED = /^decision (\S+) ← decision \1$/u;
function linkStands(views, v, link) {
  const key = link.rel === BUILT_ON.rel && REUSED.exec(link.why || '')?.[1];
  const other = key && views.find((o) => link.to === refOf('plan', o.id));
  const about = (p) => [...scopeOf(p), ...p.decisions.filter((d) => d.key === key).flatMap((d) => d.files)];
  return !other || keyMeets(key, about(v), about(other));
}

const fromGit = ({ files, own, tests }) => [...files.map((f) => ({ rel: 'changed', to: refOf('file', f) })),
  ...own.map((c) => ({ rel: 'shipped-in', to: refOf('commit', c.sha) })), ...tests.map((t) => ({ rel: 'tested-by', to: refOf('test', t) }))];
const decides = (v) => [...new Set(v.decisions.map((d) => d.key))].map((key) => ({ rel: 'decides', to: refOf('decision', key), source: WORDS.decidesSource }));
const derivedOf = (v) => [...decides(v), ...(v.closed ? fromGit(v.closed).map((l) => ({ ...l, source: 'git' })) : [])];

// asked: per plan id, the rows done two ways its new files fall in (null: not read), only where `ready` read them; receipts: per plan id,
// the files read in its sessions and the files it names that are here (steps/store)
function webOf(views, danger = [], asked = {}, receipts = {}) {
  const reach = (d) => [...scopeOf(views.find((v) => v.id === d.plan)), ...d.files];
  const decisions = validity(views, reach);
  const mine = new Map(views.map((v) => [v.id, []]));
  decisions.forEach((d) => mine.get(d.plan).push(d));
  const stateOf = statesOf(views);
  const built = new Set(views.filter((v) => ['ready', 'parked', 'closed'].includes(stateOf(v))).map((v) => v.id));
  // the files a decision governs (its own, else its plan's) once its plan stands
  const holdsOn = (d) => (!built.has(d.plan) ? [] : (d.files.length ? d.files : scopeOf(views.find((v) => v.id === d.plan))));
  const levelOf = (v, judged = planLevel(v, danger)) => ({ ...judged, level: levelAt(v, judged.level, danger) });
  const marked = views.map((v) => ({ ...v, state: stateOf(v), level: levelOf(v), undecided: undecidedOf(asked[v.id], decisions),
    receipts: receipts[v.id] || v.receipts, changed: changedOf(v, decisions, holdsOn) }))
    .map((v) => ({ ...v, unmet: unmet(v, v.level.level, danger), decisions: mine.get(v.id) }));
  const edges = marked.flatMap((v) => [...v.links.filter((l) => linkStands(views, v, l)), ...derivedOf(v)].map((l) => ({ from: refOf('plan', v.id), ...l })));
  return { views: marked, decisions, edges };
}

const reaches = (edge, { type, value }, ref) => edge.to === ref || (type === 'file' && refIs('file', edge.to) && globCovers(refValue(edge.to), value));

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
  const wanted = words.map((word) => ({ word: word.toLowerCase(), holds: wordIn(asciiFolded(word)) })); // `carpim` finds `Çarpım`, and back
  return web.views.map((v) => {
    const fields = Object.entries(searchFields(v)).map(([name, text]) => [name, asciiFolded(text || '')]);
    const hits = wanted.filter(({ holds }) => fields.some(([, text]) => holds(text)));
    const matched = fields.filter(([, text]) => hits.some(({ holds }) => holds(text))).map(([name]) => name);
    return { view: v, score: hits.length, words: hits.map(({ word }) => word), matched };
  }).filter((h) => h.score > 0).sort((a, b) => b.score - a.score || byTime(b.view, a.view));
}

// what a record uses of an earlier plan: a named active decision or its id, or a reused active key; a paraphrase names nothing
const decisionNamed = (text, id, keys) => keys.filter((k) => mentions(text, refOf('decision', k)) || mentions(text, `${id}/${k}`)).map((k) => `decision ${k}`)[0];
const USES = {
  names: (r, text, id, { keys }) => decisionNamed(text, id, keys) || (mentions(text, id) ? 'its id' : null),
  reuses: (r, text, id, { met }) => (met.includes(r.key) ? `decision ${r.key}` : null), // a reused key links where the two decisions meet
};
const firstOf = (r) => [r.key, r.gap, r.order, r.q, r.id, r.asked, r.command, r.text].find((v) => v !== undefined) ?? '';
const labelOf = (r) => shown.label(`${r.t === 'item' ? r.kind : r.t} ${firstOf(r)}`);

// one built-on link per earlier plan read this session and used by a record; never itself, one linked already, or one the person unlinked
function builtOnOf(web, view, records, read) {
  const slot = (id) => `${BUILT_ON.rel} plan:${id}`;
  const held = new Set([...view.links.filter((l) => l.rel === BUILT_ON.rel).map((l) => `${l.rel} ${l.to}`), ...view.unlinked, slot(view.id)]);
  const useOf = (r, id, of) => BUILT_ON.use.map((use) => USES[use](r, Object.values(r).flat().join('\n'), id, of)).find(Boolean);
  return records.filter((r) => BUILT_ON.records.includes(r.t)).flatMap((r) => read.flatMap(({ id, door }) => {
    const active = web.decisions.filter((d) => d.plan === id && d.state === 'active');
    const reach = (d) => [...scopeOf(web.views.find((v) => v.id === id)), ...d.files];
    const met = active.filter((d) => r.t === 'decision' && keyMeets(d.key, [...scopeOf(view), ...(r.files ?? [])], reach(d))).map((d) => d.key);
    const what = !held.has(slot(id)) && BUILT_ON.read.includes(door) && useOf(r, id, { keys: active.map((d) => d.key), met });
    if (!what) return [];
    held.add(slot(id));
    return [{ t: 'link', rel: BUILT_ON.rel, to: refOf('plan', id), why: shown.linkWhy(`${labelOf(r)} ← ${what}`), source: `read: ${door}` }];
  }));
}

module.exports = { webOf, heldOf, linksOf, found, builtOnOf };
