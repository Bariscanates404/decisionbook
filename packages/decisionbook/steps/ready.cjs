// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// READY: a plan whose rubric holds at its level is recorded as READY; one that misses rows is answered with every
// missing row and the one add that fills them. The verb and every write (steps/batch) read the rubric and answer
// through here.
const { errors: { fail } } = require('@atlasbound/kit');
const { scopeOf } = require('../core/fold.cjs');
const { levelRows, readyAgain, readResearch, unreadPlanned } = require('../core/ready.cjs');
const { RUBRIC, RESEARCH_NOTE } = require('../contracts/rubric.cjs');
const { nextAdd } = require('../core/text/calls.cjs');
const { standardsAsked, standardsN } = require('./standards.cjs');
const { CONTRACT } = require('./promise.cjs');
const { phase } = require('./phase.cjs');
const store = require('./store.cjs');
const trust = require('./trust.cjs');

/** The plan with the standards its new files are asked, and its place among the branch's plans: { web, view, n }. */
async function planRubric(io, id) {
  const asked = await standardsAsked(io, store.readPlan(io, id));
  const web = store.readWeb(io, { asked: { [id]: asked } });
  const view = web.views.find((v) => v.id === id);
  researchJudged(io, view);
  return { web, view, n: { unmet: view.unmet.length, ...standardsN(asked, view.undecided) } };
}

/** The research a plan asks to be READY on (every other row holds), once per judgement: `ready.research` with the records that cite a
 * file read in its sessions, what the level asks, and the planned files here not read. */
function researchJudged(io, view) {
  const needs = RUBRIC.find((r) => r.id === 'research').floor[view.level.level] ?? RESEARCH_NOTE[view.level.level];
  if (view.state !== 'draft' || needs === undefined || view.unmet.some((u) => u.id !== 'research')) return;
  const met = readResearch(view).length;
  io.trace.record({ run: io.run, step: 'ready.research', ok: true, n: { met, asked: needs, notRead: unreadPlanned(view).length },
    codes: { [met >= needs ? 'research-met' : 'research-short']: 1 }, ref: { plan: view.id, session: io.session ?? null } });
}

/** The state every answer of a plan that is not made READY holds; `was`: the level its stored READY has; `rows`: how many of the
 * rows its level asks it holds. */
function unreadyState(view) {
  const was = view.ready ? view.ready.level : null;
  const asked = levelRows(view.level.level).length;
  return { id: view.id, ready: false, code: 'plan-not-ready', level: view.level, unmet: view.unmet, parked: null, was,
    rows: { met: asked - view.unmet.length, asked } };
}

/** Not READY. `before` (the rows a write found unmet, as they were said; none: a `new` or the `ready` verb): the reply says only
 * what the write changed; with none it says every row and the one add of everything the plan still lacks. */
function missingAnswer(io, { view, n }, before = null) {
  const said = before ? { before } : { next: nextAdd(view, store.dangerOf(io)) };
  return { out: { ...unreadyState(view), ...said }, code: 'plan-not-ready', n };
}

/** The rubric holds: READY is recorded. Made again, its work still begins where it did; another READY plan of the
 * branch is parked by it; one a commit brought (not confirmed on this machine) is asked once at the gate. */
async function becomeReady(io, { web, view, n }) {
  const parked = web.views.find((v) => v.state === 'ready' && v.branch === view.branch && v.id !== view.id);
  const head = view.ready ? view.ready.head : await io.git.head();
  store.put(io, view.id, { t: 'ready', head, scope: scopeOf(view), level: view.level.level });
  const here = trust.confirmedHere(io, view);
  if (here) trust.keepReady(io, store.readPlan(io, view.id), 'ready-here');
  const promised = view.links.filter((l) => l.rel === CONTRACT); // the READY reply repeats the plan's contract once
  const read = readResearch(view).length;
  const short = RESEARCH_NOTE[view.level.level] > read ? { read, needs: RESEARCH_NOTE[view.level.level] } : null;
  const out = { id: view.id, ready: true, code: 'plan-ready', level: view.level, unmet: [],
    parked: parked ? parked.id : null, here, promised, researchNote: short };
  return { out, code: 'plan-ready', n };
}

/** `ready <id>`: READY at the level code decides, else each missing row. */
async function ready({ rest: [id] }, io) {
  if (!id) throw fail('plan-args', 'ready <id>');
  const judged = await planRubric(io, id);
  const { view, n } = judged;
  if (view.unmet.length) return missingAnswer(io, judged);
  // frozen: a READY plan that holds is told, never stored again
  if (view.state === 'ready' && !readyAgain(view)) {
    return { out: { ...unreadyState(view), ready: true, code: 'plan-ready', here: trust.confirmedHere(io, view) }, code: 'plan-ready', n };
  }
  const made = await becomeReady(io, judged);
  phase(io, {}, id, 'ready');
  return made;
}

module.exports = { ready, planRubric, unreadyState, missingAnswer, becomeReady };
