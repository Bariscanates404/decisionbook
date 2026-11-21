// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// One write of records to a plan, the same for `new` and `add`, in four plain steps: judge every record and name every
// problem in one reply; judge what the person's yes covers; write the batch once; answer with the state the plan is
// left in, so no show or ready call follows a write.
const { errors: { fail, isFail } } = require('@atlasbound/kit');
const { bound, problemOf, recordProblems, shapesTold, shapeOf, nodeOf, isPlanLink, refOf, refValue } = require('../contracts/shapes.cjs');
const { anyOverlap, wordGlob } = require('../base/glob.cjs');
const { scopeOf } = require('../core/fold.cjs');
const { builtOnOf } = require('../core/web.cjs');
const { questionRefused, noForkRefused, oneAnswer } = require('../core/ready.cjs');
const { yesCovers, whoseRecord, theirWords, whyNotTheirs, unsaid, answersAreYes, PERSON, NOT_ASKED, NOT_THEIRS } = require('../core/yes.cjs');
const { isAi, isAfter, isKeep, wordCut, asList, isLive, holdsAlone, saidOf } = require('../base/text.cjs');
const { FORKS, HEARD, isPointerTool } = require('../contracts/rubric.cjs');
const { recordPlace, batchRefusal, noSuchLine, theirPlan } = require('../core/text/refused.cjs');
const { trackedNow } = require('./changed.cjs');
const { sessionReads, sessionRead, actorOf, promptsOf } = require('./here.cjs');
const { asideRefused, goesOn } = require('./open.cjs');
const { teammateOf, standingLinesOf, teammatesLineRefused } = require('./teammate.cjs');
const { planContracts } = require('./promise.cjs');
const { planRubric, stateLadder } = require('./ready.cjs');
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
  return cited ? null : [code, noSuchLine(record.source)];
}

/** What a confirm covers on the plan as the batch leaves it (core/yes), by who acts: one an AI sends holds the person's words since the
 * plan's `new`, and since its newest keep unless it quotes the keep's own message (the AI read a go-on there: the product reads no
 * meaning, and never writes a yes from a keep itself). -> { amended, said? } | { refused } */
function yesFor(io, batch, view, { said, own }) {
  const actor = actorOf(io);
  const rows = actor.who === 'prompt' ? store.planRows(io, batch.id, batch).rows : [];
  const yes = yesCovers({ actor, rows, view, danger: store.dangerOf(io) });
  if (yes.refused) return { refused: [NOT_ASKED, `${view.id}: ${yes.refused}`] };
  if (actor.who === 'terminal' || own) return yes;
  const kept = view.decisions.filter(isKeep).reduce((last, d) => (!last || isAfter(d.at, last.at) ? d : last), null);
  const since = kept && !oneAnswer(kept, said) ? kept.at : view.at;
  const heard = promptsOf(io);
  const theirs = theirWords(heard, said, since);
  return theirs === null ? { refused: unsaid(NOT_THEIRS, heard, whyNotTheirs(heard, said, since)) } : { ...yes, said: theirs };
}

/** A `compared` link is the person's answer to the lost item it names (core/lost), on a plan of this clone's own (a teammate clears
 * theirs): at their terminal their words as typed, else words of a message they typed after the line it names (its `@<at>`) was
 * written, so the item was before them. -> [code, detail] | null */
async function comparedRefused(io, batch, value) {
  if (value.rel !== 'compared') return null;
  const teammate = await teammateOf(io, batch.id);
  if (teammate) return theirPlan('compared-theirs', batch.id, teammate);
  const heard = promptsOf(io);
  const since = value.to.includes('@') ? value.to.slice(value.to.lastIndexOf('@') + 1) : null;
  const theirs = actorOf(io).who === 'terminal' ? saidOf(value) !== '' : theirWords(heard, saidOf(value), since) !== null;
  return theirs ? null : unsaid(NOT_THEIRS, heard, whyNotTheirs(heard, saidOf(value), since));
}

const personsBy = (sent) => (['aside', 'confirm'].includes(sent?.t) && !isAi(sent.by) ? { ...sent, by: PERSON } : sent); // judged after
const DECIDED = ['decision', 'unlink', 'waiver']; // the records whose `by` the product sets (core/yes whoseRecord); a confirm's is the person's
/** `sent` with the `by` the product sets by who acts and the person's `said` as stored, the web read where it names refs; or why it is
 * refused, judged as claimed (the person's), so no refusal names an empty `by`. The `value` is the sender's. -> { value, refused? } */
function withDecider(io, batch, view, sent) {
  if (!DECIDED.includes(sent && sent.t) || typeof sent.by !== 'string') return { value: sent };
  const decisions = sent.t === 'decision' || asList(sent.keeps).length ? store.readWeb(io, { batch }).decisions : [];
  const { by, said, fresh, refused } = whoseRecord({ actor: actorOf(io), record: sent, view, decisions, heard: promptsOf(io) });
  return { value: { ...sent, by: by ?? PERSON, ...(said !== undefined && { said }) }, refused, fresh };
}

/** The `at` of each standing person line of `d`'s key in `view` (steps/teammate standingLinesOf): the lines a person's line replaces, the
 * product's own stamp, never the sender's, so two lines written apart from each other meet in a conflict (core/validity).
 * -> [at] | undefined */
const revisedAt = (view, d, standing = standingLinesOf(view, d)) => (standing.length ? standing.map((o) => o.at) : undefined);

/** A tool's answer sent as research is stored as a pointer to what it pointed at (contracts/rubric isPointerTool). */
const pointerOf = ({ tool, asked, answer, source }) => ({ t: 'pointer', tool, asked, answer, ...(source !== undefined && { source }) });

/** A record as it is stored. A plan word in the protect verb's one reading (`src` is `src/**`, so the gate passes what was typed); a
 * confirm with what changed the plan after the person saw it (the verb's word, never the sender's), an aside and a compared link, with
 * their words as stored; a decision with the commit it was made on, and `saidBy` (who said an answer the person relayed) only on theirs. */
async function storedForm(io, value, { tracked, yes, view }) {
  if (value.t === 'research' && isPointerTool(value.tool)) return pointerOf(value);
  const planned = isPlanLink(value) ? { to: refOf('file', wordGlob(nodeOf(value.to).value, tracked)), by: undefined } : {}; // by: the gate's
  const amended = yes ? { amended: yes.amended, by: PERSON, ...(yes.said !== undefined && { said: yes.said }) } : {};
  const head = value.t === 'decision' ? { head: await io.git.head(), saidBy: value.by === PERSON ? value.saidBy : undefined,
    revises: revisedAt(view, value) } : {};
  const theirs = (value.t === 'aside' || value.rel === 'compared') && { said: wordCut(value.said, HEARD.said), by: PERSON }; // judged theirs
  return { ...value, ...planned, ...amended, ...theirs, ...head };
}

/** A decision recorded as the person's on their words, as the reply says it: its words, what it replaces or keeps. -> [row] | [] */
const theirsOf = (record) => (record.t === 'decision' && record.by === PERSON && typeof record.said === 'string' ? [{ key: record.key, said: record.said,
  ...(record.supersedes?.length && { replaces: record.supersedes }), ...(record.keeps?.length && { keeps: record.keeps }) }] : []);

/** One record against the plan as the batch leaves it so far. Every reason it is refused, in one pass: its shape and its type's checks
 * (contracts/shapes), what the plan refuses of it, a yes no person gave, a cited line that is not here. One that holds comes back as it
 * will be stored, with the decisions that already stand on the files it names (a key in a conflict as that conflict: no line holds).
 * -> { problems } | { record, existing } */
async function judgeRecord(io, batch, sent, { tracked, own }) {
  const view = store.readPlan(io, batch.id, batch);
  const { value, refused: refusedAs, fresh } = withDecider(io, batch, view, personsBy(sent));
  const shaped = recordProblems(value);
  const files = Array.isArray(value.files) ? value.files : [];
  const decisions = value.t === 'question' || files.length ? store.readWeb(io, { batch }).decisions : [];
  const yes = value.t === 'confirm' ? yesFor(io, batch, view, { said: value.said, own }) : null;
  const problems = [...shaped, refusedAs,
    value.t === 'question' && questionRefused(view, decisions, value),
    noForkRefused(view, value),
    !shaped.length && asideRefused(io, view, value),
    !shaped.length && await comparedRefused(io, batch, value),
    await teammatesLineRefused(io, batch, value),
    yes && yes.refused,
    problemOf(() => uncited(io, value))].filter(Boolean);
  if (problems.length) return { problems };
  const existing = decisions.filter((d) => isLive(d) && anyOverlap(d.files, files))
    .map((d) => (holdsAlone(d) ? { ref: d.ref, key: d.key, scope: d.scope, value: d.value } : { ref: d.ref, conflict: d.conflict }));
  return { record: await storedForm(io, value, { tracked, yes, view }), existing, fresh };
}

/** The yes the person's answers give (core/yes): where this write brought their answer to a blocking question and every blocking
 * question now has one, the product adds their yes itself, in their words; it is judged as any confirm (what a yes covers), so the plan
 * is READY in the turn they answered, with no second message of theirs. -> [the confirm to judge] | [] */
function answeredYes(io, batch, held) {
  const view = store.readPlan(io, batch.id, batch);
  const covered = view.confirm && view.confirm.after === scopeOf(view).length;
  const said = covered ? null : answersAreYes(view, held.filter((one) => one.fresh !== false).map((one) => one.record));
  return said ? [{ t: 'confirm', by: PERSON, said }] : [];
}

/** Steps 1 and 2: each record is judged as if the ones before it were written, and held when it passes; a refused one
 * is named with its place and the rest are still judged. A refusal thrown while one record is read (an unknown type,
 * git not answering) is that record's problem; a fault passes. After the last record sent, where none was refused, the yes the
 * person's answers give is judged the same way; one that does not cover the plan is left out. -> { held: [{ t, existing }], refused } */
async function judgeAll(io, batch, values, { tracked, besideHead }) {
  const held = [];
  const refused = [];
  const isYes = (value) => value?.t === 'confirm'; // a yes covers the plan as the write leaves it: judged and stamped after the rest
  const queue = [...values.filter((value) => !isYes(value)), ...values.filter(isYes)];
  for (let i = 0; i < queue.length; i += 1) {
    const judged = await judgeRecord(io, batch, queue[i], { tracked, own: i >= values.length }).catch((err) => {
      if (!isFail(err)) throw err;
      return { problems: [[err.code, err.detail]] };
    });
    if (!judged.problems) {
      store.hold(io, batch, judged.record);
      held.push({ t: judged.record.t, existing: judged.existing, record: judged.record, fresh: judged.fresh });
    } else if (i < values.length) {
      refused.push({ place: recordPlace(values.indexOf(queue[i]), values.length, besideHead), problems: judged.problems });
    }
    if (i === values.length - 1 && !refused.length) queue.push(...answeredYes(io, batch, held));
  }
  return { held, refused };
}

/** The links to the earlier plans this session read and these records use; no session or home: the reads are
 * unknown, said in n, never a 0. */
function builtOn(io, batch, values) {
  if (!io.session || !io.home) return { linked: [], n: { readsUnkept: 1 } };
  const view = store.readPlan(io, batch.id, batch);
  const links = builtOnOf(store.readWeb(io), view, values, sessionReads(io, io.session));
  links.forEach((link) => store.hold(io, batch, link));
  return { linked: links.map((l) => ({ id: refValue(l.to), why: l.why })), n: { linked: links.length } };
}

/** The rows a plan missed before a write, each as it was said (null: a new plan, nothing was said yet): the reply says only what
 * the write changed. */
const unmetBefore = (io, batch) => (batch.fresh ? null
  : Object.fromEntries(store.readWeb(io).views.find((view) => view.id === batch.id).unmet.map((row) => [row.id, JSON.stringify(row)])));

/** Step 4: the state the write left (steps/ready stateLadder). A complete draft becomes READY; a READY plan is frozen, and stored
 * again only on a yes given again (core/ready); a parked, closed or replaced plan is only told, never made READY again. */
async function stateAfter(io, batch, before) {
  const left = await stateLadder(io, await planRubric(io, batch.id), { before, asked: false });
  sessionRead(io, io.session, [batch.id], 'write'); // this session works on the plan now (steps/here worksOn)
  if (batch.fresh) phase(io, {}, batch.id, 'created');
  if (left.out.ready === true) phase(io, {}, batch.id, 'ready');
  return left;
}
/** `batch`: { id, lines, fresh } (steps/store), for a `new` already holding its plan record; `refusedHead`: that
 * record's own problems, named with the records'. Nothing is written unless every record holds.
 * -> null where a new's file was made by another process meanwhile (steps/store commit): nothing was written. */
async function writeBatch(io, batch, values, refusedHead) {
  const judged = await judgedBatch(io, batch, values, refusedHead);
  return store.commit(io, batch) === false ? null : writtenState(io, batch, judged);
}

/** Steps 1 to 3 short of the write: every record judged and held, or the batch's one refusal thrown. */
async function judgedBatch(io, batch, values, refusedHead) {
  const tracked = values.some(isPlanLink) ? await trackedNow(io) : []; // git is asked only for a plan link
  const before = unmetBefore(io, batch);
  const { held, refused } = await judgeAll(io, batch, values, { tracked, besideHead: refusedHead.length > 0 });
  const allRefused = [...refusedHead, ...refused];
  if (allRefused.length) {
    const { code, detail } = batchRefusal(allRefused);
    const lacked = allRefused.some((one) => one.problems.some(([why]) => why === 'research-first')) ? [{ t: 'research' }] : [];
    throw Object.assign(fail(code, detail), { refused: allRefused, ...shapesTold([...values, ...lacked]) }); // a kind sent wrong or lacked
  }
  // step 3: the links the batch brings (the plans it builds on, the promise that rides in the plan), then the one write
  const { linked, n: linkedN } = builtOn(io, batch, values);
  const contracts = values.some(isPlanLink) ? await planContracts(io, store.readPlan(io, batch.id, batch), batch) : [];
  contracts.forEach((link) => store.hold(io, batch, link));
  return { before, held, linked, linkedN, contracts, wentOn: goesOn(io, batch) };
}

/** After the write: the pointers traced, a confirm kept, and step 4's answer. */
async function writtenState(io, batch, { before, held, linked, linkedN, contracts, wentOn }) {
  const pointers = held.filter(({ record }) => record.t === 'pointer').map(({ record }) => record.tool);
  pointers.forEach((tool) => io.trace.record({ run: io.run, step: 'research.pointer', ok: true, n: {}, codes: { 'research-pointer': 1 },
    ref: { plan: batch.id, tool } }));
  if (held.some((record) => record.t === 'confirm')) trust.keepConfirm(io, store.readPlan(io, batch.id));
  const { out: state, n: stateN } = await stateAfter(io, batch, before);
  const existing = [...new Map(held.flatMap((record) => record.existing).map((d) => [d.ref, d])).values()];
  const types = [...new Set(held.map((record) => record.t))].join(', ');
  const theirs = held.flatMap(({ record }) => theirsOf(record));
  const recorded = { id: batch.id, code: 'plan-recorded', t: types, records: held.length, theirs };
  const out = { ...recorded, existing, linked, contracts, state, pointers };
  const contractN = contracts.length ? { contract: contracts.length } : {};
  const bound = held.filter(({ record }) => record.t === 'decision' && record.answers && record.by === PERSON).length;
  const n = { records: held.length, existing: existing.length, ...linkedN, ...stateN, ...contractN, ...(bound ? { bound } : {}) };
  // the trace says each step by its code: an answer recorded as the person's, READY, a later session going on, aside, no fork, a
  // question asked
  const count = (holds) => held.filter(({ record }) => holds(record)).length;
  const steps = { 'answer-bound': bound, 'plan-ready': Number(state.ready === true && held.length > 0),
    'plan-continued': Number(wentOn), 'plan-set-aside': count((r) => r.t === 'aside'),
    'no-fork-stated': count((r) => r.t === 'item' && r.kind === FORKS.NONE), 'question-asked': count((r) => r.t === 'question') };
  return { out, code: 'plan-recorded', n, codes: Object.fromEntries(Object.entries(steps).filter(([, count]) => count)) };
}

module.exports = { writeBatch };
