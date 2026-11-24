// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// One write of records to a plan, the same for `new` and `add`, in four plain steps: judge every record and name every problem in one
// reply; judge what the person's yes covers; write the batch once; answer with the state the plan is left in (no show or ready after).
const { errors: { fail, isFail } } = require('@atlasbound/kit');
const { bound, problemOf, recordProblems, shapesTold, shapeOf, nodeOf, isPlanLink, refOf, refValue } = require('../contracts/shapes.cjs');
const { anyOverlap, wordGlob } = require('../base/glob.cjs');
const { scopeOf } = require('../core/fold.cjs');
const { builtOnOf } = require('../core/web.cjs');
const { questionRefused, noForkRefused, oneAnswer } = require('../core/ready.cjs');
const { yesCovers, answersAreYes, NOT_ASKED } = require('../core/yes.cjs');
const { whoseRecord, claimed, theirWords, unsaid, NOT_THEIRS, NO_WHOSE } = require('../core/whose.cjs');
const { isAi, personSigned, isAfter, isKeep, wordCut, asList, isLive, holdsAlone, saidOf } = require('../base/text.cjs');
const { FORKS, HEARD, isPointerTool } = require('../contracts/rubric.cjs');
const { recordPlace, batchRefusal, noSuchLine, theirPlan } = require('../core/text/refused.cjs');
const { WORDS, shortOf } = require('../contracts/codes.cjs');
const { trackedNow } = require('./changed.cjs');
const { sessionReads, sessionRead, actorOf, promptsOf, personOf, startedFrom } = require('./here.cjs');
const { ownRefused, goesOn } = require('./open.cjs');
const { teammateOf, standingLinesOf, teammatesLineRefused } = require('./teammate.cjs');
const { planContracts } = require('./promise.cjs');
const { planRubric, stateLadder } = require('./ready.cjs');
const { phase, allowedNow } = require('./phase.cjs');
const { sourceRead } = require('./source.cjs');
const store = require('./store.cjs');
const trust = require('./trust.cjs');

/** The problem of a record whose `<file>:<line>` names no line here (a last newline starts none); a source no ref is its shape's. */
function uncited(io, record) {
  const code = (record.t === 'research' && record.settles && 'research-uncited')
    || (shapeOf(record) === 'Gap' && record.source && 'gap-uncited');
  if (!code || bound.problems('ref', record.source).length) return null;
  const at = record.source.lastIndexOf(':');
  const text = io.fs.readText(record.source.slice(0, at));
  const cited = text !== null && text.replace(/\n$/, '').split('\n').length >= Number(record.source.slice(at + 1));
  return cited ? null : [code, noSuchLine(record.source)];
}

/** What a confirm covers on the plan as the batch leaves it (core/yes): one an AI sends holds the person's words since the plan's `new`,
 * and its newest keep unless it quotes the keep's own message (never a yes from a keep itself). -> { amended, said? } | { refused } */
function yesFor(io, batch, view, { said, own }) {
  const actor = actorOf(io);
  const rows = actor.who === 'prompt' ? store.planRows(io, batch.id, batch).rows : [];
  const yes = yesCovers({ actor, rows, view, ...store.zonesOf(io) });
  if (yes.refused) return { refused: [NOT_ASKED, `${view.id}: ${yes.refused}`] };
  if (actor.who === 'terminal' || own) return yes;
  const kept = view.decisions.filter(isKeep).reduce((last, d) => (!last || isAfter(d.at, last.at) ? d : last), null);
  const heard = promptsOf(io);
  const since = kept && !oneAnswer(kept, theirWords(heard, said) ?? said) ? kept.at : view.at;
  const whole = theirWords(heard, said, since);
  return whole === null ? { refused: unsaid(NOT_THEIRS, heard) } : { ...yes, said: whole };
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
  return theirs ? null : unsaid(NOT_THEIRS, heard);
}

const NO_VALUE = 'answer-no-value'; // an answer that leaves its value to a question that proposed nothing
const noValue = (q) => `${q}: ${shortOf(NO_VALUE)}`;
const DECIDED = ['decision', 'unlink', 'waiver']; // the records whose `by` core/yes whoseRecord sets: the person's name, or the AI
const THEIRS = ['aside', 'later', 'confirm']; // the person's alone: signed with their name here, judged theirs after (ownRefused, yesFor)
const personSigns = (value) => THEIRS.includes(value?.t) || value?.rel === 'compared' || (DECIDED.includes(value?.t) && !isAi(value.by));
/** `raw` signed as the product signs it by who acts (`person`: who works here, by name): a confirm or an aside with their name; a
 * decision, a waiver or an unlink as core/whose judges it (decidedAs). The `value` is what is stored. -> { value, refused?, fresh? } */
async function withDecider(io, batch, raw, { view, person, beside }) {
  const { t, by } = Object(raw);
  const named = person ?? by; // no one named here: judged as claimed, and refused for the name (unnamedRefused)
  if (THEIRS.includes(t)) return { value: isAi(by) ? raw : { ...raw, by: named } };
  return DECIDED.includes(t) ? decidedAs(io, batch, raw, { view, named, beside }) : { value: raw };
}
/** A decision, a waiver or an unlink with whose it is (core/whose: as claimed, the `said` as stored, whose answer it relays, the web read
 * where it names refs), or why it is refused, judged as claimed (the person's), so no refusal names an empty `by`. */
async function decidedAs(io, batch, raw, { view, named, beside }) {
  const sent = raw.t === 'decision' ? claimed(raw, named, view) : raw;
  if (sent === null) return { value: { ...raw, by: named ?? '' }, refused: [NO_WHOSE, shortOf(NO_WHOSE)] };
  if (typeof sent.by !== 'string') return { value: raw };
  if (sent.value === undefined && view.questions.some((q) => q.q === sent.answers)) return { value: { ...sent, by: named ?? '' }, refused: [NO_VALUE, noValue(sent.answers)] };
  const decisions = namesLines(sent) ? store.readWeb(io, { batch }).decisions : [];
  const ask = { actor: actorOf(io), record: sent, view, decisions, heard: promptsOf(io), person: named, beside,
    read: await readFor(io, sent), shown: batch.allowed };
  const { refused, fresh, ...signed } = whoseRecord(ask);
  return { value: { ...sent, by: named, saidBy: undefined, ...signed }, refused, fresh };
}
/** What the product reads itself at the source of a record given as someone else's answer; undefined where it names none. */
const readFor = (io, sent) => (sent.saidBy && typeof sent.source === 'string' ? sourceRead(io, sent.source) : undefined);
const namesLines = (sent) => sent.t === 'decision' || asList(sent.keeps).length > 0; // a record judged against the web's decisions
/** A record the person signs where no one is named as the person here: refused with the one way to give the name. */
const unnamedRefused = (value, person) => (personSigns(value) && !person ? ['person-unnamed', shortOf('person-unnamed')] : null);

/** The `at` of each standing person line of `d`'s key in `view` (standingLinesOf), the product's stamp, never the sender's, so lines
 * written apart meet in a conflict (core/validity). -> [at] | undefined */
const revisedAt = (view, d, standing = standingLinesOf(view, d)) => (standing.length ? standing.map((o) => o.at) : undefined);

/** A tool's answer sent as research is stored as a pointer to what it pointed at (contracts/rubric isPointerTool). */
const pointerOf = ({ tool, asked, answer, source }) => ({ t: 'pointer', tool, asked, answer, ...(source !== undefined && { source }) });

/** A record as it is stored: a plan word in the protect verb's reading (`src` is `src/**`); a confirm with what changed since the person
 * saw the plan, an aside and a compared link with their words, each signed with their name; a decision with its commit. */
async function storedForm(io, value, { tracked, yes, view, person }) {
  if (value.t === 'research' && isPointerTool(value.tool)) return pointerOf(value);
  const planned = isPlanLink(value) ? { to: refOf('file', wordGlob(nodeOf(value.to).value, tracked)), by: undefined } : {}; // by: the gate's
  const amended = yes ? { amended: yes.amended, by: person, ...(yes.said !== undefined && { said: yes.said }) } : {};
  const head = value.t === 'decision' ? { head: await io.git.head(), revises: revisedAt(view, value) } : {};
  const said = theirWords(promptsOf(io), saidOf(value)) ?? wordCut(saidOf(value), HEARD.said); // judged theirs: their whole sentences
  const theirs = (['aside', 'later'].includes(value.t) || value.rel === 'compared') && { said, by: person };
  return { ...value, ...planned, ...amended, ...theirs, ...head };
}

/** A human's decision as the reply says it: whose, its words, where they are, what it replaces or keeps. -> [row] | [] */
const theirsOf = ({ t, key, by, said, saidBy, source, supersedes: replaces, keeps }) => (t === 'decision' && typeof said === 'string'
  && (saidBy || !isAi(by)) ? [{ key, by, said, ...(saidBy && { saidBy, source }), ...(replaces?.length && { replaces }),
    ...(keeps?.length && { keeps }) }] : []);

/** A record's shape problems; none for an answer already refused for the value it lacks: that is named once, by what to add. */
const shapeProblems = (value, refused) => (refused && refused[0] === NO_VALUE ? [] : recordProblems(value));

/** One record against the plan as the batch leaves it so far: every reason it is refused, in one pass (its shape and checks, what the
 * plan refuses of it, a yes no person gave, a cited line not here); one that holds comes back as stored, with the decisions already on the
 * files it names (a key in a conflict as that conflict). -> { problems } | { record, existing } */
async function judgeRecord(io, batch, sent, { tracked, own, person, beside }) {
  const view = store.readPlan(io, batch.id, batch);
  const { value, refused: refusedAs, fresh } = await withDecider(io, batch, sent, { view, person, beside });
  const shaped = shapeProblems(value, refusedAs);
  const files = Array.isArray(value.files) ? value.files : [];
  const decisions = value.t === 'question' || files.length ? store.readWeb(io, { batch }).decisions : [];
  const yes = value.t === 'confirm' ? yesFor(io, batch, view, { said: value.said, own }) : null;
  const problems = [unnamedRefused(value, person), ...shaped, refusedAs, // no name first: a `by` left empty is its shape's problem too
    value.t === 'question' && questionRefused(view, decisions, value),
    noForkRefused(view, value),
    !shaped.length && ownRefused(io, view, value),
    !shaped.length && await comparedRefused(io, batch, value),
    await teammatesLineRefused(io, batch, value),
    yes && yes.refused,
    problemOf(() => uncited(io, value))].filter(Boolean);
  if (problems.length) return { problems };
  const existing = decisions.filter((d) => isLive(d) && anyOverlap(d.files, files))
    .map((d) => (holdsAlone(d) ? { ref: d.ref, key: d.key, scope: d.scope, value: d.value } : { ref: d.ref, conflict: d.conflict }));
  return { record: await storedForm(io, value, { tracked, yes, view, person }), existing, fresh };
}

/** The yes the person's answers give (core/yes): where this write brought their answer to a blocking question and every blocking
 * question now has one, the product adds their yes itself, in their words; it is judged as any confirm (what a yes covers), so the plan
 * is READY in the turn they answered, with no second message of theirs. -> [the confirm to judge] | [] */
function answeredYes(io, batch, held, person) {
  const view = store.readPlan(io, batch.id, batch);
  const covered = view.confirm && view.confirm.after === scopeOf(view).length;
  const said = covered ? null : answersAreYes(view, held.filter((one) => one.fresh !== false).map((one) => one.record));
  return said ? [{ t: 'confirm', by: person, said }] : [];
}

/** Steps 1 and 2: each record judged as if the ones before it were written, held when it passes; a refused one named with its place,
 * the rest still judged; a refusal thrown while one is read is its problem, a fault passes. After the last, where none was refused, the
 * yes the person's answers give is judged the same way, and left out where it does not cover the plan. -> { held, refused } */
async function judgeAll(io, batch, values, { tracked, besideHead }) {
  const held = [];
  const refused = [];
  const isYes = (value) => value?.t === 'confirm'; // a yes covers the plan as the write leaves it: judged and stamped after the rest
  const queue = [...values.filter((value) => !isYes(value)), ...values.filter(isYes)];
  const person = await personOf(io);
  for (let i = 0; i < queue.length; i += 1) {
    const beside = queue.filter((one, at) => at !== i && one?.t === 'decision'); // the batch's other decisions
    const judged = await judgeRecord(io, batch, queue[i], { tracked, own: i >= values.length, person, beside }).catch((err) => {
      if (!isFail(err)) throw err;
      return { problems: [[err.code, err.detail]] };
    });
    if (!judged.problems) {
      store.hold(io, batch, judged.record);
      held.push({ t: judged.record.t, existing: judged.existing, record: judged.record, fresh: judged.fresh });
    } else if (i < values.length) {
      refused.push({ place: recordPlace(values.indexOf(queue[i]), values.length, besideHead), problems: judged.problems });
    }
    if (i === values.length - 1 && !refused.length) queue.push(...answeredYes(io, batch, held, person));
  }
  return { held, refused };
}

/** Links to the earlier plans this session read and these records use; no session or home: reads unknown (n), never a 0. */
function builtOn(io, batch, values) {
  if (!io.session || !io.home) return { linked: [], n: { readsUnkept: 1 } };
  const view = store.readPlan(io, batch.id, batch);
  const links = builtOnOf(store.readWeb(io), view, values, sessionReads(io, io.session));
  links.forEach((link) => store.hold(io, batch, link));
  return { linked: links.map((l) => ({ id: refValue(l.to), why: l.why })), n: { linked: links.length } };
}

/** A new plan is linked to the issue its work starts from (steps/here startedFrom), unless the batch links one itself: the product's
 * own link, with where the issue was named. -> [the link held] | [] */
function issueLink(io, batch, values) {
  const view = store.readPlan(io, batch.id, batch);
  const from = batch.fresh && !values.some((value) => value?.rel === 'for') ? startedFrom(io, view.branch) : null;
  const link = from && { t: 'link', rel: 'for', to: refOf('issue', `#${from.issue}`), source: WORDS.startedFrom[from.from] };
  if (link) store.hold(io, batch, link);
  return link ? [link] : [];
}

/** The rows a plan missed before a write, as said (null: a new plan): the reply says only what the write changed. */
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
/** `batch`: { id, lines, fresh } (steps/store), for a `new` holding its plan record; `refusedHead`: that record's problems. Nothing is
 * written unless every record holds. -> null where another process made a new's file meanwhile: nothing was written. */
async function writeBatch(io, batch, values, refusedHead) {
  const judged = await judgedBatch(io, batch, values, refusedHead);
  return store.commit(io, batch) === false ? null : writtenState(io, batch, judged);
}

/** Steps 1 to 3 short of the write: every record judged and held, or the batch's one refusal thrown. */
async function judgedBatch(io, batch, values, refusedHead) {
  const tracked = values.some(isPlanLink) ? await trackedNow(io) : []; // git is asked only for a plan link
  const before = unmetBefore(io, batch);
  batch.allowed = allowedNow(io, io.session); // the person's Allow of this call's prompt, and earlier ones
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
  return { before, held, linked, linkedN, contracts, issues: issueLink(io, batch, values), wentOn: goesOn(io, batch) };
}

/** After the write: the pointers traced, a confirm kept, and step 4's answer. */
async function writtenState(io, batch, { before, held, linked, linkedN, contracts, issues, wentOn }) {
  const pointers = held.filter(({ record }) => record.t === 'pointer').map(({ record }) => record.tool);
  pointers.forEach((tool) => io.trace.record({ run: io.run, step: 'research.pointer', ok: true, n: {}, codes: { 'research-pointer': 1 },
    ref: { plan: batch.id, tool } }));
  if (held.some((record) => record.t === 'confirm')) trust.keepConfirm(io, store.readPlan(io, batch.id));
  const { out: state, n: stateN } = await stateAfter(io, batch, before);
  const existing = [...new Map(held.flatMap((record) => record.existing).map((d) => [d.ref, d])).values()];
  const types = [...new Set(held.map((record) => record.t))].join(', ');
  const theirs = held.flatMap(({ record }) => theirsOf(record));
  const recorded = { id: batch.id, code: 'plan-recorded', t: types, records: held.length, theirs };
  const out = { ...recorded, existing, linked, contracts, issues, state, pointers };
  const contractN = contracts.length ? { contract: contracts.length } : {};
  const bound = held.filter(({ record }) => record.t === 'decision' && record.answers && personSigned(record)).length;
  const n = { records: held.length, existing: existing.length, ...linkedN, ...stateN, ...contractN, ...(bound ? { bound } : {}),
    ...(issues.length ? { issues: issues.length } : {}) };
  // the trace says each step by its code: an answer recorded as the person's, READY, a later session going on, aside, no fork, a
  // question asked
  const count = (holds) => held.filter(({ record }) => holds(record)).length;
  const steps = { 'answer-bound': bound, 'plan-ready': Number(state.ready === true && held.length > 0),
    'plan-continued': Number(wentOn), 'plan-set-aside': count((r) => r.t === 'aside'),
    'no-fork-stated': count((r) => r.t === 'item' && r.kind === FORKS.NONE), 'question-asked': count((r) => r.t === 'question') };
  return { out, code: 'plan-recorded', n, codes: Object.fromEntries(Object.entries(steps).filter(([, count]) => count)) };
}

module.exports = { writeBatch };
