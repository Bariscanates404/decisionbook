// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
const { errors: { fail }, text: { safe: { clip } } } = require('@atlasbound/kit');
const { nodeOf, fieldsAsked, bound, isTaskPrompt, promptAs } = require('../contracts/shapes.cjs');
const { guardOf } = require('./host.cjs');
const { WORDS } = require('../contracts/codes.cjs');
const { isAnswered } = require('../base/text.cjs');
const { sessionRead, sessionReads, contextEnds, keepPrompt } = require('./here.cjs');
const { quotedAtPrompt } = require('./open.cjs');
const { bindAnswers } = require('./bind.cjs');
const { openPlan } = require('../core/gate.cjs');
const { CONTRACT } = require('./promise.cjs');
const { linksOf, found } = require('../core/web.cjs');
const { scopeOf } = require('../core/fold.cjs');
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
  decisions: await markTouched(io, v.decisions), questions: v.questions.map((q) => ({ ...q, answered: isAnswered(v, q) })),
    assumptions: v.assumptions,
  confirm: v.confirm && { ...v.confirm, amended: v.amended }, links: links.filter((l) => l.rel !== CONTRACT), notes: v.notes,
    resumes: v.resumes, closed: v.closed });

async function showNode({ rest, flags = {} }, io) {
  if (!rest[0]) throw fail('plan-args', 'show <id> [field...] | show <type:value>');
  const ref = rest[0].includes(':') ? rest[0] : `plan:${rest[0]}`;
  const node = nodeOf(ref);
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

// what a session on this branch receives: the branch's open plan, a READY one as the frozen intake it builds from
async function resume(args, io) {
  const web = store.readWeb(io);
  const branch = await io.git.branch();
  const view = openPlan(web, branch) || null;
  if (view && view.state === 'ready') await markTouched(io, view.decisions);
  const code = view ? `session-${view.state}` : 'session-none';
  const text = startText(web, branch, { max: args.room });
  return { out: { branch, id: view ? view.id : null, code, text, refused: web.refused }, code };
}

// the files of a declared guarded folder that hold a protection (its `holds` key; `none`: no protection), each named by its file
function guardedRows(io, guard = guardOf(io)) {
  return (guard ? io.fs.list(guard.dir) || [] : []).filter((name) => name.endsWith('.json')).flatMap((name) => {
    const held = (bound.jsonOrNull(store.textAt(io, `${guard.dir}/${name}`) ?? '') || {})[guard.holds];
    return held && held !== 'none' ? [`${guard.what} ${name.slice(0, -'.json'.length)} (${guard.holds} ${clip(String(held), 40)})`] : [];
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
  const told = (guarded || said.code !== 'session-none') && said.text ? [startSaid(said.text)] : [];
  const say = [...(guarded ? [] : [{ key: 'decisionbook.protect', text: protectLine(config) }]), ...told];
  const out = { verdict: 'allow', code, ...(changed.length ? { context: changed.join('\n') } : {}), say };
  return { out, code, n: { changed: changed.length }, codes: draftShown(said.code, told.length) };
}
const draftShown = (code, told) => (told && code === 'session-draft' ? { 'draft-shown': 1 } : {}); // the trace's word for a draft said

// The person's message: its answers to the open plan's questions are bound by the product itself (steps/bind), said in one text.
// /resume-handoff adds DecisionBook's part after the person's handoff; a task prompt on a guarded branch is told to plan first where the
// branch holds no plan, or its open plan as the work in progress: the message's words decide nothing about that plan
async function planPrompt(event, io) {
  const text = String(event.prompt || '').trim();
  const as = promptAs(text);
  keepPrompt(io, event.session_id, { as, text, of: await quotedAtPrompt(io, text) });
  const bound = await bindAnswers(io.session ? io : { ...io, session: event.session_id }, text);
  if (bound) return boundSaid(bound, as === 'resume' ? sharedPart((await resume({}, io)).out.text) : null);
  if (as === 'resume') return { out: { code: 'prompt-resume', context: sharedPart((await resume({}, io)).out.text) }, code: 'prompt-resume' };
  const { draft, ...out } = (await promptLine(text, io)) || { code: 'prompt-passed' };
  return { out, code: out.code, ...(draft && { codes: { 'draft-shown': 1 } }) };
}
/** The prompt's answer where the product bound the person's answers: the one text of what it bound, and a /resume-handoff's shared part. */
function boundSaid(bound, context) {
  const out = { code: 'answers-bound', plan: bound.id, say: [{ key: `decisionbook.bound.${bound.id}`, text: bound.text }], ...(context && { context }) };
  return { out, code: out.code, n: bound.n, codes: bound.codes };
}

async function promptLine(text, io) { // a slash command or a short reply never is
  const { config } = store.readPolicy(io); // a policy that does not read guards everything, so it nudges
  if ((config && !(config.protect.length + config.danger.length)) || !isTaskPrompt(text)) return null;
  const branch = await io.git.branch();
  const web = store.readWeb(io);
  const open = openPlan(web, branch);
  if (!open) return { code: 'prompt-nudge', say: [{ key: 'decisionbook.nudge', text: WORDS.nudge }] };
  if (open.state === 'ready') return null; // frozen: the session's start gave it, the work goes on from it
  // the draft is said as the start says it (once per context by its key): never a nudge or a pack towards a new plan
  return { code: 'prompt-earlier', say: [startSaid(startText(web, branch))], draft: true };
}

module.exports = { showNode, findWords, resume, session, planPrompt };
