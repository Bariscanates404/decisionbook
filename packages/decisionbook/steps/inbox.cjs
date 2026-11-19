// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// `inbox`: what waits for the person, read from the plans the repository holds and written nowhere: a draft's open questions (one parked
// with someone else waits for them), a READY plan not closed, a plan set aside; on this branch, then those pulled from other branches, each
// with who committed it.
const { isAnswered } = require('../base/text.cjs');
const store = require('./store.cjs');

const WAITS = ['question', 'ready', 'aside']; // the order the rows are said in

/** A plan's rows that wait for a person, each { id, branch, title, waits } and what it waits on; an open plan's key whose person
 * decisions none replaces another (core/web `rivals`) is a question for them: which holds. */
function waitingOf(v) {
  const row = { id: v.id, branch: v.branch, title: v.title };
  const rivals = ['draft', 'ready', 'parked'].includes(v.state) ? v.decisions.filter((d) => d.rivals.length)
    .map((d) => ({ ...row, waits: 'question', q: d.key, rival: d })) : [];
  if (v.state === 'draft') {
    return [...rivals, ...v.questions.filter((q) => !q.to && !isAnswered(v, q))
      .map((q) => ({ ...row, waits: 'question', q: q.q, text: q.text, proposal: q.proposal }))];
  }
  // parked: an older READY of its branch; held: a conflict holds it (core/ready changedOf), so it covers no edit
  if (['ready', 'parked'].includes(v.state)) return [...rivals, { ...row, waits: 'ready', held: v.changed.length > 0 }];
  return v.state === 'aside' ? [{ ...row, waits: 'aside', said: v.aside.said, asideBy: v.aside.by }] : [];
}

async function inbox(_args, io) {
  const web = store.readWeb(io);
  const branch = await io.git.branch();
  const all = web.views.flatMap(waitingOf);
  const rows = WAITS.flatMap((waits) => all.filter((r) => r.waits === waits));
  const others = rows.filter((r) => r.branch !== branch);
  const ids = [...new Set(others.map((r) => r.id))];
  const by = new Map(await Promise.all(ids.map(async (id) => [id, await io.git.author(store.pathOf(id))]))); // null: no commit holds it
  const pulled = others.map((r) => ({ ...r, by: by.get(r.id) }));
  const out = { branch, here: rows.filter((r) => r.branch === branch), pulled, refused: web.refused };
  return { out, code: 'plan-shown', n: { here: out.here.length, pulled: out.pulled.length } };
}

module.exports = { inbox };
