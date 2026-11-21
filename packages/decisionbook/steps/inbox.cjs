// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// `inbox`: what waits for the person, read from the plans the repository holds and written nowhere: the open items (steps/touch), each
// conflict once, a draft's open questions (one parked with someone else waits for them), a READY plan not closed, a plan set aside; on
// this branch, then those pulled from other branches, each with who committed it.
const { isAnswered, conflictsIn, lineIn } = require('../base/text.cjs');
const { openLines } = require('../core/text/open.cjs');
const { planHeldBy } = require('../core/gate.cjs');
const store = require('./store.cjs');
const { openItems } = require('./touch.cjs');

const WAITS = ['merge', 'unread', 'lost', 'question', 'ready', 'aside']; // the order the rows are said in

/** A plan's rows that wait for a person, each { id, branch, title, waits } and what it waits on. */
function waitingOf(v) {
  const row = { id: v.id, branch: v.branch, title: v.title };
  if (v.state === 'draft') {
    return v.questions.filter((q) => !q.to && !isAnswered(v, q)).map((q) => ({ ...row, waits: 'question', q: q.q, text: q.text, proposal: q.proposal }));
  }
  // parked: an older READY of its branch; held: it covers no edit, and by what (core/gate planHeldBy: the gate's code)
  if (['ready', 'parked'].includes(v.state)) return [{ ...row, waits: 'ready', held: Boolean(planHeldBy(v)), heldBy: planHeldBy(v) }];
  return v.state === 'aside' ? [{ ...row, waits: 'aside', said: v.aside.said, asideBy: v.aside.by }] : [];
}

/** Each conflict an open plan's line is in (core/validity), once however many plans it runs through: one question for the person,
 * which holds. Its row stands with the first of its open plans, one of `branch` where there is one. */
function conflictRows(views, branch) {
  const open = views.filter((v) => ['draft', 'ready', 'parked'].includes(v.state));
  return conflictsIn(open.flatMap((v) => v.decisions)).map((conflict) => {
    const holders = open.filter((v) => conflict.plans.includes(v.id));
    const v = holders.find((holder) => holder.branch === branch) ?? holders[0];
    return { id: v.id, branch: v.branch, title: v.title, waits: 'question', q: lineIn(conflict, v.id).key, conflict };
  });
}

/** The open items as rows, each with the one line every reader says: an unfinished merge is here (the branch of its plan cannot be
 * read), and so are the plan files not read (one row names them all); a lost plan's row stands for the plan. */
function itemRows(web, items, branch) {
  const lines = openLines(items);
  const branchOf = (id) => web.views.find((v) => v.id === id).branch;
  return [...items.merge.map((m) => ({ id: m.id, branch, waits: 'merge' })),
    ...(items.unread.length ? [{ id: null, branch, waits: 'unread', files: items.unread.map((r) => r.file) }] : []),
    ...items.lost.map((l) => ({ id: l.plan, branch: branchOf(l.plan), waits: 'lost' }))].map((row, i) => ({ ...row, line: lines[i] }));
}

async function inbox(_args, io) {
  const web = store.readWeb(io);
  const branch = await io.git.branch();
  const items = await openItems(io, web);
  // a lost plan: its item's row stands for it, and where the person set it aside that row too (aside clears no item)
  const seen = web.views.filter((v) => v.state === 'aside' || !items.lost.some((l) => l.plan === v.id));
  const all = [...itemRows(web, items, branch), ...conflictRows(seen, branch), ...seen.flatMap(waitingOf)];
  const rows = WAITS.flatMap((waits) => all.filter((r) => r.waits === waits));
  const others = rows.filter((r) => r.branch !== branch);
  const ids = [...new Set(others.map((r) => r.id))];
  const by = new Map(await Promise.all(ids.map(async (id) => [id, await io.git.author(store.pathOf(id))]))); // null: no commit holds it
  const pulled = others.map((r) => ({ ...r, by: by.get(r.id) }));
  const out = { branch, here: rows.filter((r) => r.branch === branch), pulled, refused: web.refused };
  return { out, code: 'plan-shown', n: { here: out.here.length, pulled: out.pulled.length } };
}

module.exports = { inbox };
