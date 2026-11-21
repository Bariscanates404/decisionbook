// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// `close <id>`: record what shipped, the plan's own commits with their files and tests, and who closed it. A plan is closed on its own
// branch, as it was when the work was done: only there is HEAD's line its own work. A teammate's plan is closed by a person, never by
// an AI session: closing it ends their open work.
const { errors: { fail }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS } = require('../contracts/codes.cjs');
const { closedOf, sinceHead } = require('../core/close.cjs');
const { closeElsewhere, closeHeld, theirPlan } = require('../core/text/refused.cjs');
const { openLines } = require('../core/text/open.cjs');
const { PERSON, AI } = require('../core/yes.cjs');
const { actorOf } = require('./here.cjs');
const { teammateOf } = require('./teammate.cjs');
const store = require('./store.cjs');
const { openItems } = require('./touch.cjs');

async function close({ rest }, io) {
  if (!rest[0]) throw fail('plan-args', 'close <id>');
  const view = store.readPlan(io, rest[0]);
  const byPerson = actorOf(io).who === 'terminal';
  const teammate = byPerson ? null : await teammateOf(io, view.id);
  if (teammate) throw fail(...theirPlan('plan-close-theirs', view.id, teammate));
  const here = await io.git.branch();
  const head = await io.git.head();
  if (here !== view.branch) throw fail('plan-close-off-branch', closeElsewhere(view, here));
  const shared = await io.git.shared(sinceHead(view), here);
  if (!shared) throw fail('git-failed', filled(WORDS.closeNoHead, { id: view.id }));
  if (shared[0]) {
    // git cannot tell how another branch came to hold this line, so every route is a condition the person checks
    const { detail, routes } = closeHeld(view, shared[0], head);
    throw Object.assign(fail('plan-close-merged', detail), { routes });
  }
  const commits = await io.git.commits(sinceHead(view), { firstParent: true });
  const closed = closedOf(view, commits, head);
  const n = { commits: commits.length, own: closed.own.length };
  // nothing of its own yet: no record is written, so a later close works
  if (!closed.own.length) return { out: { id: view.id, code: 'plan-close-empty' }, code: 'plan-close-empty', n };
  store.put(io, view.id, { t: 'closed', ...closed, by: byPerson ? PERSON : AI });
  const open = openLines(await openItems(io, store.readWeb(io)), [view.id]); // closing it clears no open item of it
  return { out: { id: view.id, code: 'plan-closed', ...closed, open }, code: 'plan-closed', n };
}

module.exports = { close };
