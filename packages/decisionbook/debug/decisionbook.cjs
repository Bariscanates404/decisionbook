// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// `debug decisionbook`: every plan on this branch, its state, the level code chose, what the rubric misses, the files refused. It only
// looks.
const { readWeb } = require('../steps/store.cjs');
const { isTrusted } = require('../steps/trust.cjs');
const { isAi, isAnswered, unrevised } = require('../base/text.cjs');
const { sessionReads, keptRows, keptAt, begunOf, promptedSince, saidByPack } = require('../steps/here.cjs');
const { debugText, doctorText } = require('../core/text/debug.cjs');
const { tracedStep } = require('../run/verbs.cjs');
const { promisesHere, journalHere } = require('../steps/surface.cjs');

/** This branch's plans as the view counts them; also the answer Handoff's note asks at every message (no walk, no trace row). */
async function plansHere(io, web = readWeb(io)) {
  const branch = await io.git.branch();
  return web.views.filter((v) => v.branch === branch).map((v) => ({
    id: v.id,
    state: v.state,
    level: v.level,
    unmet: v.state === 'draft' ? v.unmet.map((u) => u.code) : [],
    here: v.ready ? isTrusted(io, v) : null, // no yes here: asked once at the gate
    asked: io.session ? promptedSince(io, v.at) : null, // may a confirm be the person's yes in this session
    amended: v.amended, // what changed the plan after that yes
    // for Handoff's note: the person's standing decisions with their sentence, and the blocking questions still asked of them
    decided: unrevised(v.decisions).filter((d) => !d.proposed && !isAi(d.by))
      .map((d) => ({ key: d.key, value: d.value, ...(d.said ? { said: d.said } : {}) })),
    open: v.questions.filter((q) => q.blocking && !isAnswered(v, q)).map((q) => `${q.q}: ${q.text}`),
  }));
}

async function look(_args, io) {
  const web = readWeb(io);
  const branch = await io.git.branch();
  const plans = await plansHere(io, web);
  // the contract a test is held to
  const promises = (await promisesHere(io)).map(({ file, names, text, from }) => ({ file, names, text, from }));
  // no journal handed is an empty source, said, never an error; why, as the root says it (off by choice or not installed)
  const journal = (await journalHere(io)) !== null ? 'read' : io.absent('heard');
  const kept = { at: keptAt(io), rows: keptRows(io).length }; // where the person's kept statements are
  const packed = [...saidByPack(io, io.session)].map((ref) => ref.slice(ref.indexOf('/') + 1)); // the keys the pack said
  // of the session: flags, never a prompt's words
  const session = { session: io.session || null, began: begunOf(io, io.session), read: sessionReads(io, io.session) };
  const head = { schema: 'ab-debug/1', verb: 'decisionbook', branch, plans, refused: web.refused };
  const out = { ...head, ...session, promises, journal, kept, packed };
  return { out, code: 'plan-shown', n: { promises: promises.length } };
}

async function decisionbook(io, args) {
  const { out } = await tracedStep({ io, step: 'decisionbook.debug', fn: look })(args);
  return { out, text: `${debugText(out)}\n` };
}

async function bookDoctor(io) {
  const web = readWeb(io);
  return { ok: !web.refused.length, says: doctorText(web) };
}

module.exports = { decisionbook, bookDoctor, plansHere };
