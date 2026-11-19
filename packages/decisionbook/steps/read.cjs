// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
const { errors: { fail }, paths: { join } } = require('@atlasbound/kit');
const { nodeOf, fieldsAsked, bound, isTaskPrompt, promptAs } = require('../contracts/shapes.cjs');
const { guardOf } = require('./host.cjs');
const { WORDS, SHOWN: { read: shown } } = require('../contracts/codes.cjs');
const { isAnswered } = require('../base/text.cjs');
const { sessionRead, sessionReads, contextEnds, keepPrompt } = require('./here.cjs');
const { openFor } = require('./open.cjs');
const { CONTRACT } = require('./promise.cjs');
const { linksOf, found } = require('../core/web.cjs');
const { scopeOf, withProposed } = require('../core/fold.cjs');
const { picked, nodeCounts } = require('../core/nodes.cjs');
const { bytes } = require('../core/text/budget.cjs');
const { protectLine } = require('../core/text/protect.cjs');
const { START_BYTES, startText, startSaid, sharedPart, changedLine, unreadableLine } = require('../core/text/start.cjs');
const { policyChange } = require('../core/policy.cjs');
const { markTouched } = require('./touch.cjs');
const store = require('./store.cjs');
const trust = require('./trust.cjs');

const allFields = async (io, v, links) => ({
  why: v.why, goal: v.goal, plan: scopeOf(v), contract: v.links.filter((l) => l.rel === CONTRACT), steps: v.steps, gaps: v.gaps,
    research: v.research, pointers: v.pointers, checks: v.checks, items: v.items,
  decisions: withProposed(v, await markTouched(io, v.decisions)),
    questions: v.questions.map((q) => ({ ...q, answered: isAnswered(v, q) })), assumptions: v.assumptions,
  // here: whether a receipt of this yes is kept on this machine (a hand-added line, or another machine's, has none)
  confirm: v.confirm && { ...v.confirm, amended: v.amended, here: trust.confirmedHere(io, v) },
    links: links.filter((l) => l.rel !== CONTRACT), notes: v.notes,
    resumes: v.resumes, closed: v.closed });

// the node a show names: a bare id is a plan, `src\a.js` and `./src/a.js` are the file src/a.js
const shownNode = (word, node = word.includes(':') ? nodeOf(word) : { type: 'plan', value: word }) => (node.type === 'file'
  ? { type: 'file', value: join('', node.value) } : node);

async function showNode({ rest, flags = {} }, io) {
  if (!rest[0]) throw fail('plan-args', WORDS.usage.show);
  const node = shownNode(rest[0]);
  const ref = `${node.type}:${node.value}`;
  if (node.type === 'plan') store.readPlan(io, node.value);
  const web = store.readWeb(io);
  const links = linksOf(web, ref);
  const v = web.views.find((one) => node.type === 'plan' && one.id === node.value);
  if (!v) {
    const decisions = await markTouched(io, web.decisions.filter((d) => node.type === 'decision' && d.key === node.value));
    sessionRead(io, io.session, decisions.map((d) => d.plan), 'show'); // a decision's plans were read
    return { out: { node: ref, decisions, links }, code: 'plan-shown', n: { links: links.length } };
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
    nodes: nodeCounts(all), seen, ...Object.fromEntries(chosen) };
  return { out, code: 'plan-shown', n: { links: links.length, fields: chosen.length, ...(seen ? { seen: 1 } : {}) } };
}

async function findWords({ rest }, io) {
  if (!rest.length) throw fail('plan-args', 'find <words>');
  const web = store.readWeb(io);
  const hits = found(web, rest).map(({ view, score, matched }) => ({ id: view.id, title: view.title, state: view.state, plan: scopeOf(view),
    matched, score, source: store.pathOf(view.id) }));
  return { out: { hits, refused: web.refused }, code: 'plan-shown', n: { hits: hits.length } }; // what it could not read is named
}

// what a session on this branch receives: the branch's open plan, a READY one as the frozen intake it builds from; `task`, the
// person's message where one is read (steps/open openFor: a draft an earlier session left is said whole once a message is on it)
async function resume(args, io) {
  const web = store.readWeb(io);
  const branch = await io.git.branch();
  const { open: view, whose } = await openFor(io, web, branch, args.task);
  if (view && view.state === 'ready') await markTouched(io, view.decisions);
  const code = view ? `session-${view.state}` : 'session-none';
  const text = startText(view, branch, { max: args.room, whose });
  const out = { branch, id: view ? view.id : null, code, text, refused: web.refused, ...(whose !== 'mine' && { whose }) };
  return { out, code };
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
  const said = store.keepsPlan(io) ? (await resume({ room }, io)).out : { code: 'session-none', text: '' };
  const guarded = config.protect.length + config.danger.length;
  const code = guarded ? said.code : 'session-unprotected';
  const told = (guarded || said.code !== 'session-none') && said.text ? [startSaid(said.text, said.whose)] : [];
  const say = [...(guarded ? [] : [{ key: 'decisionbook.protect', text: protectLine(config) }]), ...told];
  const out = { verdict: 'allow', code, ...(changed.length ? { context: changed.join('\n') } : {}), say };
  return { out, code, n: { changed: changed.length }, codes: draftShown(said, told.length) };
}
const draftShown = ({ code, whose }, told) => (told && code === 'session-draft' && !whose ? { 'draft-shown': 1 } : {}); // said as the work in progress

// The person's message is kept as its row (its clauses sealed), so a record made as theirs can quote it; what it answers is their AI's
// to record. /resume-handoff adds DecisionBook's part after the person's handoff; a task prompt on a guarded branch is told to plan
// first where the branch holds no plan, or its open plan as the work in progress: the message's words decide nothing about that plan
async function planPrompt(event, io) {
  const text = String(event.prompt || '').trim();
  const as = promptAs(text);
  keepPrompt(io, event.session_id, { as, text });
  const context = as === 'resume' ? sharedPart((await resume({ task: text }, io)).out.text) : null;
  if (context) return { out: { code: 'prompt-resume', context }, code: 'prompt-resume' };
  const { draft, ...out } = (await promptLine(text, io)) || { code: 'prompt-passed' };
  return { out, code: out.code, ...(draft && { codes: { 'draft-shown': 1 } }) };
}

async function promptLine(text, io) { // a slash command or a short reply never is
  const { config } = store.readPolicy(io); // a policy that does not read guards everything, so it nudges
  if ((config && !(config.protect.length + config.danger.length)) || !isTaskPrompt(text)) return null;
  const branch = await io.git.branch();
  const web = store.readWeb(io);
  const { open, whose } = await openFor(io, web, branch, text); // a draft said in its one line: the task is planned as new work
  const line = whose !== 'mine' ? [startSaid(startText(open, branch, { whose }), whose)] : [];
  const nudge = whose === 'earlier' ? [] : [{ key: 'decisionbook.nudge', text: WORDS.nudge }]; // "there is none" is no draft's own words
  if (!open || line.length) return { code: 'prompt-nudge', say: [...nudge, ...line] };
  if (open.state === 'ready') return null; // frozen: the session's start gave it, the work goes on from it
  // the draft is said as the start says it (once per context by its key): never a nudge or a pack towards a new plan
  return { code: 'prompt-earlier', say: [startSaid(startText(open, branch))], draft: true };
}

module.exports = { showNode, findWords, resume, session, planPrompt };
