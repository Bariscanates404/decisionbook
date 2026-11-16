// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
const { CONFIG } = require('../contracts/shapes.cjs');
const { writeTarget, guardOf, guardWay } = require('./host.cjs');
const { globCovers } = require('../base/glob.cjs');
const { isAnswered } = require('../base/text.cjs');
const { gateVerdict, isGuarded, reasonOf } = require('../core/gate.cjs');
const { bothReasons, takesOutWhy, cameFromWhy, grownLine } = require('../core/text/gate.cjs');
const { protectPolicy, afterEdit, addsOnly, removed } = require('../core/policy.cjs');
const { contractVerdict } = require('./promise.cjs');
const { phase } = require('./phase.cjs');
const store = require('./store.cjs');
const trust = require('./trust.cjs');

// person-only: a policy write taking a glob out, any write of an existing file of a declared guarded folder, a new one not adds-only
function personOnly(event, io, file, text) {
  const input = event.tool_input || {};
  const { dir, lowering, why } = guardOf(io) || {};
  const held = dir && globCovers(`${dir}/**`, file) && (io.fs.exists(file) || !addsOnly(afterEdit(null, event.tool_name, input), lowering));
  if (file !== CONFIG) return held ? { code: 'guarded-person', why: [why, guardWay(io)].filter(Boolean).join('; ') } : null;
  const gone = removed(protectPolicy(text), protectPolicy(afterEdit(text, event.tool_name, input)));
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
  if (out.verdict === 'ask' && event.session_id) trust.noteAsked(io, event, { view, file: out.file }); // a host's event; a dry reading (gateRead) writes nothing
  const author = await io.git.author(store.pathOf(view.id));
  return { out: { ...out, reason: reasonOf(out, cameFromWhy(author)) }, code: out.code };
}

/** A file written outside the frozen plan joins it: the product adds its path to the plan and says so in one line. */
function grown(io, out) {
  store.put(io, out.plan, { t: 'link', rel: 'plans', to: `file:${out.file}`, source: 'the gate: written under the READY plan' });
  return { out: { ...out, context: grownLine(out.plan, out.file) }, code: out.code };
}

/** `dry`: a reading that writes nothing (gateRead, a folder a shell command writes): no file joins the plan, no phase is kept. */
async function preEdit(event, io, { dry = false } = {}) {
  const file = await writeTarget(event, io);
  if (!file) return { out: { verdict: 'allow', code: 'gate-not-write-tool', file: null }, code: 'gate-not-write-tool' };
  const { config = { protect: [], danger: [] }, text, unreadable } = store.readPolicy(io);
  const person = unreadable ? { code: 'policy-unreadable', why: unreadable } : personOnly(event, io, file, text);
  const web = isGuarded(config, file) ? store.readWeb(io, { danger: config.danger }) : null;
  const asked = { ...config, file, mode: event.permission_mode, person, trusted: (view) => trust.isTrusted(io, view) };
  const out = gateVerdict({ ...asked, ...(web ? { branch: await io.git.branch(), web } : {}) });
  const said = await promised(event, io, await broughtBy(event, io, { out, web, dry }));
  if (!dry) firstWrite(io, event, said, out.plan);
  return out.code === 'plan-draft-here' ? draftAsks(said, web.views.find((view) => view.id === out.plan)) : said;
}

/** What the plan's verdict brings with it: an untrusted plan's ask is noted with who brought the plan; a file outside the frozen
 * plan joins it. */
async function broughtBy(event, io, { out, web, dry }) {
  if (out.code === 'plan-not-here') return untrusted(event, io, { out, web });
  return out.code === 'plan-grown' && !dry ? grown(io, out) : { out, code: out.code };
}
const firstWrite = (io, event, said, plan) => said.out.verdict === 'allow' && plan && phase(io, event, plan, 'first-write');

/** A denial under the branch's draft names what to ask the person: counted, and coded where a blocking question waits for them. */
function draftAsks(said, draft) {
  const asks = draft.questions.filter((q) => q.blocking && !isAnswered(draft, q)).length;
  return asks ? { ...said, n: { ...said.n, asks }, codes: { 'gate-question': 1 } } : said;
}

async function postEdit(event, io) {
  const file = await writeTarget(event, io);
  const ask = file && trust.answered(io, event, file);
  return { out: { code: ask ? 'trust-kept' : 'trust-none', ...(ask ? { plan: ask.id } : {}) }, code: ask ? 'trust-kept' : 'trust-none' };
}

module.exports = { preEdit, postEdit };
