// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
const { errors: { fail }, paths: { join }, host: { personWords } } = require('@atlasbound/kit');
const { nodeOf, fieldsAsked, bound, isTaskPrompt, promptAs } = require('../contracts/shapes.cjs');
const { guardOf } = require('./host.cjs');
const { WORDS, SHOWN: { read: shown } } = require('../contracts/codes.cjs');
const { isAnswered, putOff } = require('../base/text.cjs');
const { sessionRead, sessionReads, contextEnds, keepPrompt } = require('./here.cjs');
const { openFor } = require('./open.cjs');
const { markTeammates, parkedWaiting } = require('./teammate.cjs');
const { CONTRACT } = require('./promise.cjs');
const { linksOf, found } = require('../core/web.cjs');
const { scopeOf, withProposed } = require('../core/fold.cjs');
const { picked, nodeCounts } = require('../core/nodes.cjs');
const { bytes } = require('../core/text/budget.cjs');
const { openLines } = require('../core/text/open.cjs');
const { protectLine } = require('../core/text/protect.cjs');
const { START_BYTES, startText, startSaid, sharedPart, changedLine, unreadableLine } = require('../core/text/start.cjs');
const { policyChange } = require('../core/policy.cjs');
const { staleFlow } = require('../core/flow.cjs');
const { markTouched, openItems } = require('./touch.cjs');
const { closeAsShipped } = require('./close.cjs');
const store = require('./store.cjs');
const trust = require('./trust.cjs');

const allFields = async (io, v, links) => ({
  why: v.why, goal: v.goal, plan: scopeOf(v), contract: v.links.filter((l) => l.rel === CONTRACT), steps: v.steps, gaps: v.gaps,
    research: v.research, pointers: v.pointers, checks: v.checks, items: v.items,
  decisions: withProposed(v, await markTeammates(io, await markTouched(io, v.decisions))),
    questions: v.questions.map((q) => ({ ...q, answered: isAnswered(v, q), later: putOff(v, q) })), assumptions: v.assumptions,
  // here: whether a receipt of this yes is kept on this machine (a hand-added line, or another machine's, has none)
  confirm: v.confirm && { ...v.confirm, amended: v.amended, here: trust.confirmedHere(io, v) },
    links: links.filter((l) => l.rel !== CONTRACT), notes: v.notes,
    resumes: v.resumes, closed: v.closed && await closeAsShipped(io, v) });

// the node a show names: a bare id is a plan, `src\a.js` and `./src/a.js` are the file src/a.js
const shownNode = (word, node = word.includes(':') ? nodeOf(word) : { type: 'plan', value: word }) => (node.type === 'file'
  ? { type: 'file', value: join('', node.value) } : node);

async function showNode({ rest, flags = {} }, io) {
  if (!rest[0]) throw fail('plan-args', WORDS.usage.show);
  const node = shownNode(rest[0]);
  const ref = `${node.type}:${node.value}`;
  if (node.type === 'plan') store.readPlan(io, node.value);
  const web = store.readWeb(io);
  const items = await openItems(io, web);
  const links = linksOf(web, ref);
  const v = web.views.find((one) => node.type === 'plan' && one.id === node.value);
  if (!v) {
    const decisions = await markTeammates(io, await markTouched(io, web.decisions.filter((d) => node.type === 'decision' && d.key === node.value)));
    const plans = decisions.map((d) => d.plan);
    sessionRead(io, io.session, plans, 'show'); // a decision's plans were read
    return { out: { node: ref, decisions, links, open: openLines(items, plans) }, code: 'plan-shown', n: { links: links.length } };
  }
  const asked = fieldsAsked(rest.slice(1));
  // read once, then walk: a bare show this session already gave in full answers its head and node map only
  const seen = sessionReads(io, io.session).some((r) => r.id === v.id && r.door === 'show') && !asked.length && !flags.full;
  sessionRead(io, io.session, [v.id], 'show');
  const all = await allFields(io, v, links);
  const chosen = seen ? [] : Object.entries(all).flatMap(([field, value]) => {
    const hit = asked.filter((a) => a.field === field || (field === 'steps' && a.field === 'plan' && !a.pick));
    return !asked.length || hit.length
      ? [[field, hit.some((a) => a.pick === null) || !hit.length ? value : hit.flatMap((a) => picked(value, a.pick))]] : [];
  });
  const out = { id: v.id, title: v.title, state: v.state, level: v.level, branch: v.branch, unmet: v.unmet, refused: v.refused,
    open: openLines(items, [v.id]), nodes: nodeCounts(all), seen, ...Object.fromEntries(chosen) };
  return { out, code: 'plan-shown', n: { links: links.length, fields: chosen.length, ...(seen ? { seen: 1 } : {}) } };
}

async function findWords({ rest }, io) {
  if (!rest.length) throw fail('plan-args', 'find <words>');
  const web = store.readWeb(io);
  const hits = found(web, rest).map(({ view, score, matched }) => ({ id: view.id, title: view.title, state: view.state, plan: scopeOf(view),
    matched, score, source: store.pathOf(view.id) }));
  const open = openLines(await openItems(io, web), hits.map((hit) => hit.id));
  return { out: { hits, refused: web.refused, open }, code: 'plan-shown', n: { hits: hits.length } }; // what it could not read is named
}

// what a session on this branch receives: the branch's open plan, a READY one as the frozen intake it builds from; `task`, the
// person's message where one is read (steps/open openFor: a draft an earlier session left is said whole once a message is on it)
async function resume(args, io) {
  const web = store.readWeb(io);
  const branch = await io.git.branch();
  const items = await openItems(io, web);
  const { open: view, whose } = await openFor(io, { web, items, branch }, args.task);
  if (view && view.state === 'ready') await markTeammates(io, await markTouched(io, view.decisions)); // whose each settled line is
  const code = view ? `session-${view.state}` : 'session-none';
  const idle = args.guarded === false ? [] : [WORDS.none]; // nothing guarded: no plan is asked for, what waits is still said
  const text = startText(view, branch, { max: args.room, whose, items, parked: await parkedWaiting(io, web.views), idle });
  const out = { branch, id: view ? view.id : null, code, text, refused: web.refused, ...(whose !== 'mine' && { whose }) };
  return { out, code, n: staleFlow(web.views, io.clock.now()) };
}

// the files of a declared guarded folder that hold a protection (its `holds` key; `none`: no protection), each named by its file
function guardedRows(io, guard = guardOf(io)) {
  return (guard ? io.fs.list(guard.dir) || [] : []).filter((name) => name.endsWith('.json')).flatMap((name) => {
    const held = (bound.jsonOrNull(store.textAt(io, `${guard.dir}/${name}`) ?? '') || {})[guard.holds];
    return held && held !== 'none' ? [`${guard.what} ${name.slice(0, -'.json'.length)} (${guard.holds} ${shown.held(String(held))})`] : [];
  });
}

function policyNow(io, { config }) {
  const now = config ? { protect: config.protect, danger: config.danger, guarded: guardedRows(io) } : null;
  const change = policyChange(trust.policySeen(io), now);
  trust.see(io, now);
  return change ? [changedLine(change)] : [];
}

// an unreadable policy is told to the person with why, and nothing more is read (every write asks)
async function session(event, io) {
  contextEnds(io, event); // a compaction or clear ends the context that held the pack
  const policy = store.readPolicy(io);
  const changed = policyNow(io, policy);
  if (policy.unreadable) {
    const context = [...changed, unreadableLine(policy.unreadable)].join('\n');
    return { out: { verdict: 'allow', code: 'policy-unreadable', context }, code: 'policy-unreadable', n: { changed: changed.length } };
  }
  const { config } = policy;
  const room = START_BYTES - bytes([...changed, '']); // each changed line with its newline
  const guarded = config.protect.length + config.danger.length;
  const { out: said, n: stale } = store.keepsPlan(io) ? await resume({ room, guarded: guarded > 0 }, io) : { out: { code: 'session-none', text: '' }, n: {} };
  const code = guarded ? said.code : 'session-unprotected';
  const told = said.text ? [startSaid(said.text, said.whose)] : []; // with nothing guarded and no plan: only what waits, if anything
  const say = [...(guarded ? [] : [{ key: 'decisionbook.protect', text: protectLine(config) }]), ...told];
  const out = { verdict: 'allow', code, ...(changed.length ? { context: changed.join('\n') } : {}), say };
  return { out, code, n: { changed: changed.length, ...stale }, codes: draftShown(said, told.length) };
}
const draftShown = ({ code, whose }, told) => (told && code === 'session-draft' && !whose ? { 'draft-shown': 1 } : {}); // said as the work in progress

// The person's message is kept as its row (its sentences), so a record made as theirs can quote it; what it answers is their AI's
// to record. /resume-handoff adds DecisionBook's part after the person's handoff; a task prompt on a guarded branch is told to plan
// first where the branch holds no plan, or its open plan as the work in progress: the message's words decide nothing about that plan.
// `rule`: the say item of whose words a decision holds, where this message may carry one (the caller says it after its own)
async function planPrompt(event, io) {
  const text = String(event.prompt || '').trim();
  const as = promptAs(text);
  await keepPrompt(io, event.session_id, { as, text: personWords(text, io.fs.list) });
  const context = as === 'resume' ? sharedPart((await resume({ task: text }, io)).out.text) : null;
  if (context) return { out: { code: 'prompt-resume', context }, code: 'prompt-resume' };
  const { draft, ...out } = (await promptLine(text, io)) || { code: 'prompt-passed' };
  return { out, code: out.code, ...(draft && { codes: { 'draft-shown': 1 } }), rule: await whoseSaid(io, out.code === 'prompt-nudge') };
}
/** The one rule of whose words a decision holds, said with every message of the person that may carry one: a task message told to
 * plan (`planned`: a plan opens from it), any message while the branch's plan is a draft, and the answers (an open plan of the
 * branch holds a question no human answered yet). Said by its key once per context before the answers and once with them, so the
 * rule is in sight where the words are recorded, whatever the state of the questions. -> [say item] | [] */
async function whoseSaid(io, planned) {
  if (!store.keepsPlan(io)) return [];
  const branch = await io.git.branch();
  const open = store.readWeb(io).views.filter((v) => v.branch === branch && OPEN.includes(v.state));
  const awaited = open.some((v) => v.questions.some((q) => !isAnswered(v, q)));
  const may = awaited || planned || open.some((v) => v.state === 'draft');
  return may ? [{ key: awaited ? 'decisionbook.answers' : 'decisionbook.whose', text: WORDS.whoseGuide, short: WORDS.whoseShort }] : [];
}
const OPEN = ['draft', 'ready']; // the plans a message of the person may still decide for

async function promptLine(text, io) { // a slash command or a short reply never is
  const { config } = store.readPolicy(io); // a policy that does not read guards everything, so it nudges
  if ((config && !(config.protect.length + config.danger.length)) || !isTaskPrompt(text)) return null;
  const branch = await io.git.branch();
  const web = store.readWeb(io);
  const { open, whose } = await openFor(io, { web, items: await openItems(io, web), branch }, text); // a draft said in its one line
  const line = whose !== 'mine' ? [startSaid(startText(open, branch, { whose, parked: await parkedWaiting(io, web.views) }), whose)] : [];
  const nudge = whose === 'earlier' ? [] : [{ key: 'decisionbook.nudge', text: WORDS.nudge }]; // "there is none" is no draft's own words
  // with no plan at all the one way to it is said with every such message (context): the pack is said once, the person's later
  // message may be the one that parks a question or leaves the work to a teammate
  if (!open || line.length) return { code: 'prompt-nudge', say: [...nudge, ...line], ...(!open && { context: WORDS.unplanned }) };
  if (open.state === 'ready') return null; // frozen: the session's start gave it, the work goes on from it
  // the draft is said as the start says it (once per context by its key): never a nudge or a pack towards a new plan
  return { code: 'prompt-earlier', say: [startSaid(startText(open, branch))], draft: true };
}

module.exports = { showNode, findWords, resume, session, planPrompt };
