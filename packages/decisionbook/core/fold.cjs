// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. One plan's records, in file order -> its view; nothing generated is stored, every reader folds the log again, so a view is never
// stale.
const { shapeOf, isPlanLink, plannedPath } = require('../contracts/shapes.cjs');
const { isDangerPath } = require('../contracts/rubric.cjs');
const { isTheirs } = require('../base/text.cjs');

const HEADER = ['title', 'why', 'success', 'goal', 'kind', 'level', 'tags'];
// the records that change what will be done, by kind; written after the person last saw the plan, the yes keeps their kinds, never their
// words
const CHANGES = ['amend', 'check', 'task', 'step'];
const planChange = (r) => (isPlanLink(r) && 'plans') || CHANGES.find((kind) => kind === (r.t === 'item' ? r.kind : r.t)) || null;

const relayed = (r) => (r.saidBy ? { saidBy: r.saidBy } : {}); // whose answer the person relayed (steps/batch)
// a decision's lists, empty where it holds none: what it replaces, what the person's answer keeps, the files it governs, its effect
const decisionLists = (r) => Object.fromEntries(['supersedes', 'keeps', 'files', 'effect'].map((field) => [field, r[field] ?? []]));
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
  // someone else (`to`) never blocks; `supersedes`: the standing decisions it asks the person to replace (their answer places each,
  // core/yes); written again in the same words, naming the same ones, it is the question that was asked then: the person's answer to it
  // stands; naming others, it is asked now, so only words typed after it answer it
  question: (v, r) => {
    const was = v.questions.find((q) => q.q === r.q && q.text === r.text && `${q.supersedes}` === `${r.supersedes ?? []}`);
    v.questions = [...v.questions.filter((q) => q.q !== r.q),
      { q: r.q, text: r.text, decides: r.decides ?? null, whyNotCode: r.whyNotCode ?? null, blocking: r.blocking !== false && !r.to,
        proposal: r.proposal ?? null, to: r.to ?? null, source: r.source ?? null, at: (was || r).at ?? null,
        supersedes: r.supersedes ?? [] }];
  },
  decision: (v, r, line) => v.decisions.push(
    { plan: v.id, key: r.key, value: r.value, why: r.why, by: r.by, source: r.source ?? null, answers: r.answers ?? null, at: r.at
    ?? null, said: r.said ?? null, ...relayed(r), scope: r.scope ?? null, ...decisionLists(r), proposed: r.proposed === true,
    head: r.head ?? null, revises: r.revises ?? null, line }),
  assumption: (v, r) => v.assumptions.push({ text: r.text, why: r.why, q: r.q ?? null, at: r.at ?? null }),
  // a yes holds for the plan it saw: `after` counts the planned paths there were then (core/ready); `amended`: what changed the plan after
  // the person saw it
  confirm: (v, r) => {
    v.confirm = { by: r.by, said: r.said, at: r.at ?? null, after: v.links.filter((l) => l.rel === 'plans').length };
    v.amended = [...(r.amended ?? [])];
  },
  check: (v, r) => v.checks.push({ id: r.id, text: r.text, how: r.how ?? null, command: r.command ?? null }),
  item: (v, r) => v.items.push({ kind: r.kind, text: r.text, covers: r.covers ?? [], file: r.file ?? null }),
  // by: the person's yes to the gate's ask added it (steps/gate)
  link: (v, r) => v.links.push({ rel: r.rel, to: r.to, why: r.why ?? null, source: r.source ?? null, by: r.by ?? null,
    said: r.said ?? null }),
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
    v.builtAt ??= r.at; // when it was first built: a READY stored again later never moves it (core/lost)
    v.stage = 'ready';
  },
  closed: (v, r) => {
    v.closed = r;
    v.stage = 'closed';
  },
};

// `lines`: each record's line in its file (steps/store), where a reader names one
function foldPlan(records, refused = [], lines = records.map((r, i) => i + 1)) {
  const [head] = records;
  const view = { id: head.id, branch: head.branch ?? null, head: head.head ?? null, by: head.by ?? null, at: head.at ?? null, title: null,
    why: null, success: null, goal: null, kind: null,
    level: null, tags: [], research: [], pointers: [], questions: [], decisions: [], assumptions: [], confirm: null, amended: [],
    checks: [], items: [], receipts: { read: [], there: [] }, // read receipts: a plan read alone has none (steps/store hands them)
      steps: [], gaps: [], links: [], unlinked: [], notes: [],
    resumes: [], waiver: null, ready: null, closed: null, aside: null, stage: 'draft', refused };
  records.forEach((rec, i) => {
    const apply = APPLY[i ? shapeOf(rec) : 'amend']; // the plan record sets the fields an amend may change later
    if (apply) apply(view, rec, lines[i]);
    if (i && view.confirm && planChange(rec)) view.amended.push(planChange(rec)); // a change after the yes itself
  });
  return view;
}

// what the person's yes covers: the paths planned when they said it, and each one their later yes to the gate's ask added (`by`, the
// product's); a path the AI linked after it is outside until then
function seenLinks(view) {
  const links = view.links.filter((l) => l.rel === 'plans');
  return view.confirm ? [...links.slice(0, view.confirm.after), ...links.slice(view.confirm.after).filter((l) => l.by)] : links;
}
const scopeOf = (view) => view.links.filter((l) => l.rel === 'plans').map(plannedPath); // the plan's files and globs
// the plan as the person's yes covers it, `more` links added: what a level or a scope is read over once the plan is frozen
const seenView = (view, more = []) => ({ ...view, links: [...view.links.filter((l) => l.rel !== 'plans'), ...seenLinks(view), ...more] });
/** The danger paths a plan took in after the person's yes (its `plans` links past the count the yes saw): a frozen plan's yes covers
 * every other file it grows by. */
const dangerSince = (view, danger) => scopeOf(view).slice(view.confirm.after).filter((file) => isDangerPath(danger, file));

/** Each decision, and on a person's whose value is not its question's proposal, that proposal (`proposedThen`): no new field kept. Whether
 * the person took it is their AI's reading (the value is its words): the product shows both and never says the proposal was refused. */
const withProposed = (view, decisions) => decisions.map((d) => {
  const q = isTheirs(d) && view.questions.find((one) => one.q === d.answers);
  return q && q.proposal && q.proposal.trim() !== String(d.value).trim() ? { ...d, proposedThen: q.proposal } : d;
});

module.exports = { foldPlan, scopeOf, seenLinks, seenView, dangerSince, planChange, withProposed };
