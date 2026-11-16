// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. One plan's records, in file order -> its view; nothing generated is stored, every reader folds the log again, so a view is never
// stale.
const { shapeOf, isPlanLink } = require('../contracts/shapes.cjs');

const HEADER = ['title', 'why', 'success', 'goal', 'kind', 'level', 'tags'];
// the records that change what will be done, by kind; written after the person last saw the plan, the yes keeps their kinds, never their
// words
const CHANGES = ['amend', 'check', 'task', 'step'];
const planChange = (r) => (isPlanLink(r) && 'plans') || CHANGES.find((kind) => kind === (r.t === 'item' ? r.kind : r.t)) || null;

const APPLY = {
  amend: (v, r) => Object.assign(v,
    Object.fromEntries(Object.entries(r).filter(([key, value]) => HEADER.includes(key) && value !== undefined))),
  research: (v, r) => v.research.push(
    { tool: r.tool, asked: r.asked, answer: r.answer, source: r.source ?? null, settles: r.settles ?? null }),
  pointer: (v, r) => v.pointers.push({ tool: r.tool, asked: r.asked, answer: r.answer, source: r.source ?? null }),
  // a run asked the machine; what it observed is its answer
  Probe: (v, r) => APPLY.research(v, { ...r, asked: r.command, answer: r.observed }),
  Step: (v, r) => {
    v.steps = [...v.steps.filter((s) => s.order !== r.order),
      { order: r.order, file: r.file, change: r.change, verify: r.verify, after: r.after ?? null }].sort((a, b) => a.order - b.order);
  },
  Gap: (v, r) => {
    v.gaps = [...v.gaps.filter((g) => g.gap !== r.gap),
      { gap: r.gap, status: r.status, text: r.text, source: r.source ?? null, run: r.run ?? null, q: r.q ?? null }];
  },
  // written again under its q (new words, or blocking no more), a question takes the place of the one before it; one parked with
  // someone else (`to`) never blocks
  question: (v, r) => {
    v.questions = [...v.questions.filter((q) => q.q !== r.q),
      { q: r.q, text: r.text, decides: r.decides ?? null, whyNotCode: r.whyNotCode ?? null, blocking: r.blocking !== false && !r.to,
        proposal: r.proposal ?? null, to: r.to ?? null, source: r.source ?? null, at: r.at ?? null }];
  },
  decision: (v, r) => v.decisions.push(
    { plan: v.id, key: r.key, value: r.value, why: r.why, by: r.by, source: r.source ?? null, answers: r.answers ?? null, at: r.at
    ?? null, said: r.said ?? null,
    scope: r.scope ?? null, supersedes: r.supersedes ?? [], proposed: r.proposed === true, files: r.files ?? [], head: r.head ?? null,
      effect: r.effect ?? [] }),
  assumption: (v, r) => v.assumptions.push({ text: r.text, why: r.why, q: r.q ?? null, at: r.at ?? null }),
  // a yes holds for the plan it saw: `after` counts the planned paths there were then (core/ready); `amended`: what changed the plan after
  // the person saw it
  confirm: (v, r) => {
    v.confirm = { by: r.by, said: r.said, at: r.at ?? null, after: v.links.filter((l) => l.rel === 'plans').length };
    v.amended = [...(r.amended ?? [])];
  },
  check: (v, r) => v.checks.push({ id: r.id, text: r.text, how: r.how ?? null, command: r.command ?? null }),
  item: (v, r) => v.items.push({ kind: r.kind, text: r.text, covers: r.covers ?? [], file: r.file ?? null }),
  link: (v, r) => v.links.push({ rel: r.rel, to: r.to, why: r.why ?? null, source: r.source ?? null }),
  waiver: (v, r) => {
    v.waiver = { reason: r.reason, by: r.by, at: r.at ?? null };
  },
  note: (v, r) => v.notes.push({ text: r.text, by: r.by ?? null, at: r.at ?? null }),
  // an older plan's note that a later session went on with it: history, the gate reads nothing of it (READY is the freeze)
  resume: (v, r) => v.resumes.push({ why: r.why, at: r.at ?? null }),
  // the person set it aside for other work: kept as history, it is no one's open plan (a later READY of it brings it back)
  aside: (v, r) => {
    v.aside = { by: r.by, said: r.said, at: r.at ?? null };
    v.stage = 'aside';
  },
  unlink: (v, r) => {
    v.links = v.links.filter((l) => !(l.rel === r.rel && l.to === r.to));
    v.unlinked.push(`${r.rel} ${r.to}`);
  }, // never written again
  ready: (v, r) => {
    v.ready = r;
    v.stage = 'ready';
  },
  closed: (v, r) => {
    v.closed = r;
    v.stage = 'closed';
  },
};

function foldPlan(records, refused = []) {
  const [head] = records;
  const view = { id: head.id, branch: head.branch ?? null, head: head.head ?? null, by: head.by ?? null, at: head.at ?? null, title: null,
    why: null, success: null, goal: null, kind: null,
    level: null, tags: [], research: [], pointers: [], questions: [], decisions: [], assumptions: [], confirm: null, amended: [],
    checks: [], items: [], receipts: { read: [], there: [] }, // read receipts: a plan read alone has none (steps/store hands them)
      steps: [], gaps: [], links: [], unlinked: [], notes: [],
    resumes: [], waiver: null, ready: null, closed: null, aside: null, stage: 'draft', refused };
  records.forEach((rec, i) => {
    const apply = APPLY[i ? shapeOf(rec) : 'amend']; // the plan record sets the fields an amend may change later
    if (apply) apply(view, rec);
    if (i && view.confirm && planChange(rec)) view.amended.push(planChange(rec)); // a change after the yes itself
  });
  return view;
}

const scopeOf = (view) => view.links.filter((l) => l.rel === 'plans').map((l) => l.to.slice('file:'.length)); // the plan's files and globs

module.exports = { foldPlan, scopeOf, planChange };
