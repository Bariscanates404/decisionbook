// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// One write of records to a plan, the same for `new` and `add`, in four plain steps: judge every record and name every
// problem in one reply; judge what the person's yes covers; write the batch once; answer with the state the plan is
// left in, so no show or ready call follows a write.
const { errors: { fail, isFail }, said: { takesAll } } = require('@atlasbound/kit');
const { bound, problemOf, recordProblems, shapeOf, nodeOf, isPlanLink } = require('../contracts/shapes.cjs');
const { anyOverlap, wordGlob } = require('../base/glob.cjs');
const { scopeOf } = require('../core/fold.cjs');
const { builtOnOf } = require('../core/web.cjs');
const { questionRefused, noForkRefused, readyAgain } = require('../core/ready.cjs');
const { yesCovers, whoseRecord, answersAreYes, PERSON } = require('../core/yes.cjs');
const { isAi, sameWords } = require('../base/text.cjs');
const { FORKS, isPointerTool } = require('../contracts/rubric.cjs');
const { shortOf } = require('../contracts/codes.cjs');
const { recordPlace, batchRefusal } = require('../core/text/refused.cjs');
const { trackedNow } = require('./changed.cjs');
const { sessionReads, actorOf, heardOf, shownOf } = require('./here.cjs');
const { asideRefused, goesOn } = require('./open.cjs');
const { planContracts } = require('./promise.cjs');
const { planRubric, unreadyState, missingAnswer, becomeReady } = require('./ready.cjs');
const { phase } = require('./phase.cjs');
const store = require('./store.cjs');
const trust = require('./trust.cjs');

/** The problem of a record whose `<file>:<line>` names no line here; a last newline ends a line, it starts none. A
 * source that is no ref is its shape's problem. */
function uncited(io, record) {
  const code = (record.t === 'research' && record.settles && 'research-uncited')
    || (shapeOf(record) === 'Gap' && record.source && 'gap-uncited');
  if (!code || bound.problems('ref', record.source).length) return null;
  const at = record.source.lastIndexOf(':');
  const text = io.fs.readText(record.source.slice(0, at));
  const cited = text !== null && text.replace(/\n$/, '').split('\n').length >= Number(record.source.slice(at + 1));
  return cited ? null : [code, `${record.source}: no such line here`];
}

/** What a confirm covers on the plan as the batch leaves it so far (core/yes), by who acts (kit's one answer): in an
 * AI session the person's last prompt, outside one their terminal. */
function yesFor(io, batch, view) {
  const actor = actorOf(io);
  const rows = actor.who === 'prompt' ? store.planRows(io, batch.id, batch).rows : [];
  return yesCovers({ actor, rows, view, danger: store.dangerOf(io) });
}

const DECIDED = ['decision', 'unlink']; // the records whose `by` the product sets (core/yes whoseRecord); a confirm's is the person's
/** `sent` with the `by` the product sets, by who acts (the person's standing decisions it supersedes, this plan's latest proposal of
 * that change), never the sender's words; or why it is refused. -> { value, refused? } */
function withDecider(io, batch, view, sent) {
  if (!DECIDED.includes(sent && sent.t) || typeof sent.by !== 'string') return { value: sent };
  const replaces = (sent.supersedes || []).length ? store.readWeb(io, { batch }).decisions
    .filter((d) => sent.supersedes.includes(d.ref) && !d.proposed && !isAi(d.by)) : [];
  const proposal = view.decisions.filter((d) => d.proposed && d.key === sent.key
    && replaces.every((r) => d.supersedes.includes(r.ref))).at(-1) ?? null;
  const said = { heard: heardOf(io), shown: shownOf(io) }; // the person's prompts, and what the AI's messages before them showed
  const { by, not, items, refused } = whoseRecord({ actor: actorOf(io), record: sent, view, replaces, proposal, ...said });
  return { value: by ? { ...sent, by } : sent, refused, not: not && { why: not, ...(items && { items }) } };
}

/** A tool's answer sent as research is stored as a pointer to what it pointed at (contracts/rubric isPointerTool). */
const pointerOf = ({ tool, asked, answer, source }) => ({ t: 'pointer', tool, asked, answer, ...(source !== undefined && { source }) });

/** A record as it is stored. A plan word in the protect verb's one reading (`src` is `src/**`, so the gate passes what
 * was typed); a confirm with what changed the plan after the person saw it (the verb's word, never the sender's); a
 * decision with the commit it was made on. */
async function storedForm(io, value, { tracked, yes }) {
  if (value.t === 'research' && isPointerTool(value.tool)) return pointerOf(value);
  const planned = isPlanLink(value) ? { to: `file:${wordGlob(nodeOf(value.to).value, tracked)}` } : {};
  const amended = yes ? { amended: yes.amended, by: PERSON } : {};
  const head = value.t === 'decision' ? { head: await io.git.head() } : {};
  return { ...value, ...planned, ...amended, ...head, ...(value.t === 'aside' && { by: PERSON }) }; // an aside kept is the person's
}

/** A decision its sender signed for a person and the product stored as the AI's: the reply names it with why (core/yes) and the one
 * thing that makes it the person's. -> [{ key, q, why }] | [] */
const signedNotTheirs = (value, not) => (value.t === 'decision' && not && not.why !== 'ai' ? [{ key: value.key, q: value.answers ?? null, ...not }] : []);

/** One record against the plan as the batch leaves it so far. Every reason it is refused, in one pass: its shape and
 * its type's checks (contracts/shapes), what the plan refuses of it, a yes no person gave, a cited line that is not
 * here. One that holds comes back as it will be stored, with the decisions that already stand on the files it names.
 * -> { problems } | { record, existing } */
async function judgeRecord(io, batch, sent, tracked) {
  const view = store.readPlan(io, batch.id, batch);
  const { value, refused: notTheirs, not } = withDecider(io, batch, view, sent);
  const shaped = recordProblems(value);
  const files = Array.isArray(value.files) ? value.files : [];
  const decisions = value.t === 'question' || files.length ? store.readWeb(io, { batch }).decisions : [];
  const yes = value.t === 'confirm' ? yesFor(io, batch, view) : null;
  const problems = [...shaped, notTheirs,
    value.t === 'question' && questionRefused(view, decisions, value),
    noForkRefused(view, value),
    !shaped.length && asideRefused(io, view, value),
    yes && yes.refused && ['confirm-not-asked', `${view.id}: ${yes.refused}`],
    problemOf(() => uncited(io, value))].filter(Boolean);
  if (problems.length) return { problems };
  const standing = decisions.filter((d) => d.state === 'active' && anyOverlap(d.files, files));
  const existing = standing.map((d) => ({ ref: d.ref, key: d.key, scope: d.scope, value: d.value }));
  return { record: await storedForm(io, value, { tracked, yes }), existing, asAi: signedNotTheirs(value, not) };
}

/** The yes the person's answers give (core/yes): where this write brought their answer to a blocking question and every blocking
 * question now has one, the product adds their yes itself, in their words; it is judged as any confirm (what a yes covers), so the plan
 * is READY in the turn they answered, with no second message of theirs. -> [the confirm to judge] | [] */
function answeredYes(io, batch, held) {
  const view = store.readPlan(io, batch.id, batch);
  const covered = view.confirm && view.confirm.after === scopeOf(view).length;
  const said = covered ? null : answersAreYes(view, held.map((one) => one.record));
  return said ? [{ t: 'confirm', by: PERSON, said }] : [];
}

/** In the product's own reading of a person's message: a decision the rules do not give the person, or a second reading of a
 * question this batch already holds an answer to, is not bound. */
const notBound = (held, record) => record.t === 'decision'
  && (record.by !== PERSON || held.some((one) => one.record.answers === record.answers));
/** What becomes of a judged record: refused, left out (that reading only), or held. */
function fateOf(judged, { theirs, held }) {
  if (judged.problems) return 'refused';
  return theirs && notBound(held, judged.record) ? 'left' : 'held';
}
/** What a batch refuses: that reading refuses only where it bound nothing, so nothing is written. */
function refusedOf(theirs, held, refused) {
  if (!theirs) return refused;
  return held.length ? [] : [{ place: '', problems: [['answers-none', shortOf('answers-none')]] }];
}

/** Steps 1 and 2: each record is judged as if the ones before it were written, and held when it passes; a refused one
 * is named with its place and the rest are still judged. A refusal thrown while one record is read (an unknown type,
 * git not answering) is that record's problem; a fault passes. After the last record sent, where none was refused, the yes the
 * person's answers give is judged the same way; one that does not cover the plan is left out. `theirs` (the product's own reading
 * of a person's message, steps/bind): a decision is held only where the rules give it to the person and its question has none of
 * this batch yet; any other is left out, never stored as the AI's, and none is refused. -> { held: [{ t, existing }], refused } */
async function judgeAll(io, batch, values, { tracked, besideHead, theirs }) {
  const held = [];
  const refused = [];
  const queue = [...values];
  for (let i = 0; i < queue.length; i += 1) {
    const judged = await judgeRecord(io, batch, queue[i], tracked).catch((err) => {
      if (!isFail(err)) throw err;
      return { problems: [[err.code, err.detail]] };
    });
    const fate = fateOf(judged, { theirs, held });
    if (fate === 'held') {
      store.hold(io, batch, judged.record);
      held.push({ t: judged.record.t, existing: judged.existing, asAi: judged.asAi, record: judged.record });
    } else if (fate === 'refused' && i < values.length) {
      refused.push({ place: recordPlace(i, values.length, besideHead), problems: judged.problems });
    }
    if (i === values.length - 1 && !refused.length) queue.push(...answeredYes(io, batch, held));
  }
  return { held, refused: refusedOf(theirs, held, refused) };
}

/** The links to the earlier plans this session read and these records use; no session or home: the reads are
 * unknown, said in n, never a 0. */
function builtOn(io, batch, values) {
  if (!io.session || !io.home) return { linked: [], n: { readsUnkept: 1 } };
  const view = store.readPlan(io, batch.id, batch);
  const links = builtOnOf(store.readWeb(io), view, values, sessionReads(io, io.session));
  links.forEach((link) => store.hold(io, batch, link));
  return { linked: links.map((l) => ({ id: l.to.slice('plan:'.length), why: l.why })), n: { linked: links.length } };
}

/** The rows a plan missed before a write, each as it was said (null: a new plan, nothing was said yet): the reply says only what
 * the write changed. */
const unmetBefore = (io, batch) => (batch.fresh ? null
  : Object.fromEntries(store.readWeb(io).views.find((view) => view.id === batch.id).unmet.map((row) => [row.id, JSON.stringify(row)])));

/** Step 4: the state the write left. A complete draft becomes READY; a READY plan is frozen, and stored again only on a yes given
 * again (core/ready); a parked, closed or replaced plan is only told, never made READY again. */
async function stateAfter(io, batch, before) {
  const left = await stateOf(io, batch.id, before);
  if (batch.fresh) phase(io, {}, batch.id, 'created');
  if (left.out.ready === true) phase(io, {}, batch.id, 'ready');
  return left;
}
async function stateOf(io, id, before) {
  const judged = await planRubric(io, id);
  const { view, n } = judged;
  if (view.state === 'aside') return { out: { ...unreadyState(view), state: view.state }, code: 'plan-set-aside', n };
  if (view.unmet.length) return missingAnswer(io, judged, before);
  if (readyAgain(view)) return becomeReady(io, judged);
  const told = { ...unreadyState(view), ready: view.state === 'ready', state: view.state, here: true };
  return { out: told, code: 'plan-ready', n };
}

/** `batch`: { id, lines, fresh } (steps/store), for a `new` already holding its plan record; `refusedHead`: that
 * record's own problems, named with the records'. Nothing is written unless every record holds. `batch.theirs`: the product's own
 * reading of a person's message (judgeAll); where the rules give the person none of it, that is its refusal and nothing is written. */
async function writeBatch(io, batch, values, refusedHead) {
  const tracked = values.some(isPlanLink) ? await trackedNow(io) : []; // git is asked only for a plan link
  const before = unmetBefore(io, batch);
  const { held, refused } = await judgeAll(io, batch, values, { tracked, besideHead: refusedHead.length > 0, theirs: batch.theirs });
  const allRefused = [...refusedHead, ...refused];
  if (allRefused.length) {
    const { code, detail } = batchRefusal(allRefused);
    throw Object.assign(fail(code, detail), { refused: allRefused });
  }
  // step 3: the links the batch brings (the plans it builds on, the promise that rides in the plan), then the one write
  const { linked, n: linkedN } = builtOn(io, batch, values);
  const contracts = values.some(isPlanLink) ? await planContracts(io, store.readPlan(io, batch.id, batch), batch) : [];
  contracts.forEach((link) => store.hold(io, batch, link));
  const wentOn = goesOn(io, batch);
  store.commit(io, batch);
  const pointers = held.filter(({ record }) => record.t === 'pointer').map(({ record }) => record.tool);
  pointers.forEach((tool) => io.trace.record({ run: io.run, step: 'research.pointer', ok: true, n: {}, codes: { 'research-pointer': 1 },
    ref: { plan: batch.id, tool } }));
  if (held.some((record) => record.t === 'confirm')) trust.keepConfirm(io, store.readPlan(io, batch.id));
  const { out: state, n: stateN } = await stateAfter(io, batch, before);
  const existing = [...new Map(held.flatMap((record) => record.existing).map((d) => [d.ref, d])).values()];
  const types = [...new Set(held.map((record) => record.t))].join(', ');
  const asAi = held.flatMap((record) => record.asAi);
  const recorded = { id: batch.id, code: 'plan-recorded', t: types, records: held.length, asAi };
  const out = { ...recorded, existing, linked, contracts, state, pointers };
  const contractN = contracts.length ? { contract: contracts.length } : {};
  const bound = held.filter(({ record }) => record.t === 'decision' && record.answers && record.by === PERSON).length;
  const asAiN = { ...(asAi.length ? { asAi: asAi.length } : {}), ...(bound ? { bound } : {}) };
  const n = { records: held.length, existing: existing.length, ...linkedN, ...stateN, ...contractN, ...asAiN };
  // the trace says each step by its code: an answer bound or stored as the AI's, READY, a later session going on, aside, no fork, a
  // question asked, a proposal the person took whole
  const count = (holds) => held.filter(({ record }) => holds(record)).length;
  const asked = store.readPlan(io, batch.id).questions;
  const tookWhole = (r) => r.t === 'decision' && r.by === PERSON && takesAll(r.said || '')
    && asked.some((q) => q.q === r.answers && q.proposal && sameWords(q.proposal, r.value));
  const steps = { 'answer-bound': bound, 'answer-unbound': asAi.length, 'plan-ready': Number(state.ready === true && held.length > 0),
    'plan-continued': Number(wentOn), 'plan-set-aside': count((r) => r.t === 'aside'),
    'no-fork-stated': count((r) => r.t === 'item' && r.kind === FORKS.NONE), 'question-asked': count((r) => r.t === 'question'),
    'proposals-taken': count(tookWhole) };
  return { out, code: 'plan-recorded', n, codes: Object.fromEntries(Object.entries(steps).filter(([, count]) => count)) };
}

module.exports = { writeBatch };
