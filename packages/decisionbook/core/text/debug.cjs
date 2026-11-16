// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. `debug decisionbook` as a person reads it: every plan on the branch with why it is or is not READY and whether
// a yes may be recorded, the plan files refused, what the session read and was told, the promises kept, and where the
// person's statements are.
const { text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS } = require('../../contracts/codes.cjs');
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
  const start = `session ${session} began with a ${began.as} prompt; a person's /resume-handoff in it: ${resumed}`;
  const reads = read.map((r) => `read in session ${session} by ${r.door}: ${r.id}`);
  const pack = packed.length ? [`the pack said in session ${session}: ${packed.join(', ')}`] : [];
  return [...(began.as ? [start] : []), ...reads, ...pack];
}

function promiseLine(p) {
  const names = p.names.join(', ') || 'the module';
  return `promise ${p.file} gives ${names}: \`${p.text}\` (in ${p.from})`;
}

function debugText(out) {
  const states = out.plans.map((plan) => planStateLine(plan, out.session));
  const plans = states.length ? states : ['no plan on this branch'];
  const refused = out.refused.map((r) => `refused ${r.id}: ${r.code}`);
  const promises = out.promises.map(promiseLine);
  const kept = out.kept.at ? filled(WORDS.keptAt, out.kept) : WORDS.keptNoHome;
  const journal = out.journal === 'read' ? [] : [WORDS.journal[out.journal]];
  return [`branch ${out.branch}`, ...plans, ...refused, ...sessionLines(out), ...promises, kept, ...journal].join('\n');
}

/** The doctor's one line: how many plans read, or which files were refused. */
function doctorText(web) {
  if (!web.refused.length) return `${web.views.length} plans here`;
  const refused = web.refused.map((r) => `${r.id} (${r.code})`);
  return `refused ${refused.join(', ')}`;
}

module.exports = { debugText, doctorText };
