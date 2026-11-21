// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// How many commits touched a decision's files since it was decided, one git read per head; unmeasurable stays absent, never 0. And THE
// open items of the repository's plans, read once per verb and said by every reader in one text (core/text/open).
const { anyOverlap } = require('../base/glob.cjs');
const { conflictsIn } = require('../base/text.cjs');
const { lostAfterBuilt } = require('../core/lost.cjs');
const { unreadPlans } = require('./store.cjs');
const { teammateOf, markTeammates } = require('./teammate.cjs');

const MERGING = 'plan-unmerged';

async function markTouched(io, decisions) {
  const measured = decisions.filter((d) => d.head && d.files.length);
  const heads = [...new Set(measured.map((d) => d.head))];
  const since = new Map(await Promise.all(heads.map(async (head) => [head, await io.git.commits(head)])));
  measured.filter((d) => since.get(d.head)).forEach((d) => {
    d.touched = since.get(d.head).filter((c) => anyOverlap(c.files, d.files)).length;
  });
  return decisions;
}

/** -> { merge, unread, lost }: the plan files an unfinished merge left unread ([{ id, code, why }]: no plan is read whole until then),
 * the other plan files not read whole ([{ file, code }]: a file that does not read, a line of one that does not), and each built plan
 * whose decision lost a conflict after it edited its files (core/lost; closed: the files it shipped; READY: a commit since its READY
 * on them; a git that cannot say counts as edited, so the item is shown). The product never changes the code. */
async function openItems(io, web) {
  const lost = lostAfterBuilt(web);
  const edited = await Promise.all(lost.map(async (l) => (l.closedFiles ? l.closedFiles.length > 0
    : (await io.git.commits(l.head))?.some((c) => anyOverlap(c.files, l.files)) ?? true)));
  await markTeammates(io, conflictsIn(web.decisions).flatMap((conflict) => conflict.lines)); // a conflict names whose each line is
  const theirs = await Promise.all(lost.map((l) => teammateOf(io, l.plan))); // a teammate's plan's item is theirs to clear
  return { merge: web.refused.filter((r) => r.code === MERGING), unread: unreadPlans(web).filter((r) => r.code !== MERGING),
    lost: lost.map((l, i) => ({ ...l, author: theirs[i] })).filter((_, i) => edited[i]) };
}

module.exports = { markTouched, openItems };
