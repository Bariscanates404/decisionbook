// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
const { CONFIG, refOf } = require('../contracts/shapes.cjs');
const { WORDS } = require('../contracts/codes.cjs');
const { writeTarget, guardOf, guardWay } = require('./host.cjs');
const { globCovers } = require('../base/glob.cjs');
const { isAnswered } = require('../base/text.cjs');
const { gateVerdict, isGuarded, reasonOf } = require('../core/gate.cjs');
const { bothReasons, takesOutWhy, cameFromWhy } = require('../core/text/gate.cjs');
const { GUARDS, protectPolicy, afterEdit, addsOnly, removed } = require('../core/policy.cjs');
const { contractVerdict } = require('./promise.cjs');
const { phase } = require('./phase.cjs');
const { worksOn, personOf } = require('./here.cjs');
const { reopened } = require('./closing.cjs');
const store = require('./store.cjs');
const { openItems } = require('./touch.cjs');
const trust = require('./trust.cjs');

// person-only: a policy write taking a glob or a risk area out, any write of an existing file of a declared guarded folder, a new one not
// adds-only
function personOnly(event, io, file, text) {
  const input = event.tool_input || {};
  const { dir, lowering, why } = guardOf(io) || {};
  const held = dir && globCovers(`${dir}/**`, file) && (io.fs.exists(file) || !addsOnly(afterEdit(null, event.tool_name, input), lowering));
  if (file !== CONFIG) return held ? { code: 'guarded-person', why: [why, guardWay(io)].filter(Boolean).join('; ') } : null;
  const gone = removed(protectPolicy(text), protectPolicy(afterEdit(text, event.tool_name, input)), GUARDS);
  return gone.length ? { code: 'policy-narrowed', why: takesOutWhy(gone) } : null;
}

// every write meets the promise: one the plan allows is asked once on a test file importing outside it; one the plan refuses names it in
// the same reason, so the plan's round fixes the import too (said apart, the same import would come back as a second refusal)
async function promised(event, io, plan) {
  const said = await contractVerdict(event, io, plan.out.file);
  const n = { ...plan.n, ...said.n };
  if (!said.verdict) return { ...plan, n };
  if (plan.out.verdict === 'allow') return { out: { verdict: said.verdict, code: said.code, file: plan.out.file, reason: said.reason }, code: said.code, n };
  return { ...plan, out: { ...plan.out, reason: bothReasons(plan.out.reason, said.reason) }, n };
}

async function untrusted(event, io, { out, web }) {
  const view = web.views.find((v) => v.id === out.plan);
  if (out.verdict === 'ask' && event.session_id) trust.noteAsked(io, event, { view, file: out.file, code: out.code }); // a host's event; a dry reading (gateRead) writes nothing
  const author = await io.git.author(store.pathOf(view.id));
  return { out: { ...out, reason: reasonOf(out, cameFromWhy(author)) }, code: out.code };
}

/** The plans a guarded write is judged under: a plan closed with no commit holding the record yet is the work in progress still, so
 * an edit passes under it as under a READY one (steps/closing). */
async function plansUnder(io, config) {
  const branch = await io.git.branch();
  const web = await reopened(io, store.readWeb(io, { config }), branch);
  return { branch, web, items: await openItems(io, web) };
}

/** `dry`: a reading that writes nothing (gateRead, a folder a shell command writes): no file joins the plan, no phase is kept. */
async function preEdit(event, io, { dry = false } = {}) {
  const file = await writeTarget(event, io);
  if (!file) return { out: { verdict: 'allow', code: 'gate-not-write-tool', file: null }, code: 'gate-not-write-tool' };
  const { config = { protect: [], danger: [] }, text, unreadable } = store.readPolicy(io);
  const person = unreadable ? { code: 'policy-unreadable', why: unreadable } : personOnly(event, io, file, text);
  const plans = isGuarded(config, file) ? await plansUnder(io, config) : {};
  const asked = { ...config, file, mode: event.permission_mode, person, trusted: (view) => trust.isTrusted(io, view),
    ours: (view) => worksOn(io, event.session_id, view) };
  const out = gateVerdict({ ...asked, ...plans });
  const said = await promised(event, io, await broughtBy(event, io, { out, web: plans.web, dry }));
  if (!dry) firstWrite(io, event, said, out.plan);
  return out.code === 'plan-draft-here' ? draftAsks(said, plans.web.views.find((view) => view.id === out.plan)) : said;
}

/** What a verdict brings: an untrusted plan's ask noted with who brought it; an ask of a file outside the frozen plan, so a yes adds it. */
async function broughtBy(event, io, { out, web, dry }) {
  if (out.code === 'plan-not-here') return untrusted(event, io, { out, web });
  if (out.code === 'plan-outside' && out.verdict === 'ask' && event.session_id && !dry) {
    trust.noteAsked(io, event, { view: web.views.find((v) => v.id === out.plan), file: out.file, code: out.code });
  }
  return { out, code: out.code };
}
const firstWrite = (io, event, said, plan) => said.out.verdict === 'allow' && plan && phase(io, event, plan, 'first-write');

/** A denial under the branch's draft names what to ask the person: counted, and coded where a blocking question waits for them. */
function draftAsks(said, draft) {
  const asks = draft.questions.filter((q) => q.blocking && !isAnswered(draft, q)).length;
  return asks ? { ...said, n: { ...said.n, asks }, codes: { 'gate-question': 1 } } : said;
}

// the write the gate asked about ran, so the person said yes: a file outside the frozen plan joins it, an unpromised import passes
async function postEdit(event, io) {
  const file = await writeTarget(event, io);
  const ask = file && (await contractVerdict(event, io, file, true), trust.answered(io, event, file));
  // the host asked a person and they said yes, whoever git names here: a hook refuses nothing, so an unnamed person is said as that
  const by = (await personOf(io)) ?? WORDS.unnamedPerson;
  if (ask && ask.code === 'plan-outside') store.put(io, ask.id, { t: 'link', rel: 'plans', to: refOf('file', file), by, source: WORDS.joinedOnYes });
  else if (ask) trust.keepAsked(io, ask);
  return { out: { code: ask ? 'trust-kept' : 'trust-none', ...(ask ? { plan: ask.id } : {}) }, code: ask ? 'trust-kept' : 'trust-none' };
}

module.exports = { preEdit, postEdit };
