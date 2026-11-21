// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. `debug decisionbook` as a person reads it: every plan on the branch with why it is or is not READY and whether
// a yes may be recorded, the plan files refused, what the session read and was told, the promises kept, and where the
// person's statements are.
const { text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS } = require('../../contracts/codes.cjs');
const { DIR } = require('../../contracts/shapes.cjs');
const { amendedText, levelLine } = require('./records.cjs');

/** One plan: its state and level, the rubric rows a draft misses, a READY not confirmed on this machine, what changed
 * after the yes, and whether a person's prompt came after it in this session. */
function planStateLine(plan, session) {
  const missing = plan.unmet.length ? `; not READY ${plan.unmet.join(', ')}` : '';
  const askedOnce = plan.here === false ? `; ${WORDS.askedOnce}` : '';
  const asked = WORDS.prompted[plan.asked];
  const prompted = plan.asked ? `; ${filled(WORDS.promptedSince, { session, asked })}` : '';
  const amended = amendedText(plan.amended);
  return `${plan.id} ${plan.state}, ${levelLine(plan.level)}${missing}${askedOnce}${amended}${prompted}`;
}

/** How the asking session began, what it read and by which door, the decisions the pack said in it. */
function sessionLines({ session, began, read, packed }) {
  const resumed = began.resumed ? 'yes' : 'no';
  const start = filled(WORDS.sessionBegan, { session, as: began.as, resumed });
  const reads = read.map((r) => filled(WORDS.sessionRead, { session, door: r.door, id: r.id }));
  const pack = packed.length ? [filled(WORDS.sessionPack, { session, ids: packed.join(', ') })] : [];
  return [...(began.as ? [start] : []), ...reads, ...pack];
}

function promiseLine(p) {
  const names = p.names.join(', ') || 'the module';
  return filled(WORDS.promiseGives, { file: p.file, names, text: p.text, from: p.from });
}

function debugText(out) {
  const states = out.plans.map((plan) => planStateLine(plan, out.session));
  const plans = states.length ? states : [WORDS.noPlanHere];
  const refused = out.refused.map((r) => `refused ${r.id}: ${r.code}`);
  const promises = out.promises.map(promiseLine);
  const kept = out.kept.at ? filled(WORDS.keptAt, out.kept) : WORDS.keptNoHome;
  const journal = out.journal === 'read' ? [] : [WORDS.journal[out.journal]];
  return [`branch ${out.branch}`, ...plans, ...refused, ...out.open, ...sessionLines(out), ...promises, kept, ...journal].join('\n');
}

/** The doctor's one line: how many plans read, or which files were refused, with what an unfinished merge left (`merging`: its lines). */
function doctorText(web, merging) {
  const torn = tornLines(web).map((r) => `${DIR}/${r.id}.jsonl line ${r.line} (${r.code})`);
  if (!web.refused.length && !torn.length) return `${web.views.length} plans here`;
  return `refused ${[...web.refused.map((r) => `${r.id} (${r.code})`), ...torn, ...merging].join(', ')}`;
}
/** Each line a plan's file holds that does not read: its plan, line and code; the plan reads without it. */
const tornLines = (web) => web.views.flatMap((v) => v.refused.map((r) => ({ id: v.id, ...r })));

module.exports = { debugText, doctorText, tornLines };
