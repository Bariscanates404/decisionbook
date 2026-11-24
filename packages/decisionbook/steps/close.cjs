// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// `close <id>`: record what shipped and who closed it, and print the one commit that holds the code and the plan (its changed files ride
// in it; work committed first takes the record into its last commit while that may be rewritten). Only a READY plan, on its own branch
// (only there is HEAD's line its work); a teammate's by a person, never an AI session; one no commit holds yet gives way to the next.
const { errors: { fail }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS, shortOf } = require('../contracts/codes.cjs');
const { isAnswered } = require('../base/text.cjs');
const { closedOf, sinceHead, issuesOf } = require('../core/close.cjs');
const { closedFlow } = require('../core/flow.cjs');
const { closeElsewhere, closeHeld, theirPlan } = require('../core/text/refused.cjs');
const { openLines } = require('../core/text/open.cjs');
const { AI } = require('../core/whose.cjs');
const { actorOf, personOf, promptedSince } = require('./here.cjs');
const { workNow, isUnsealed, keepClosed, letGo } = require('./closing.cjs');
const { teammateOf } = require('./teammate.cjs');
const { flowRow } = require('./phase.cjs');
const store = require('./store.cjs');
const { openItems } = require('./touch.cjs');

/** Who a close is signed by: the person by name, at their terminal or in a session they prompted since the plan began (no one named
 * here: refused with the one way to give the name); any other session is the AI. */
async function closerOf(io, view) {
  if (promptedSince(io, view.at) !== 'yes') return AI;
  const person = await personOf(io);
  if (!person) throw fail('person-unnamed', shortOf('person-unnamed'));
  return person;
}

/** HEAD, on the plan's own branch with no commit since the plan's head that another branch holds; else why nothing is recorded. */
async function ownLine(io, view) {
  const here = await io.git.branch();
  const head = await io.git.head();
  if (here !== view.branch) throw fail('plan-close-off-branch', closeElsewhere(view, here));
  const shared = await io.git.shared(sinceHead(view), here);
  if (!shared) throw fail('git-failed', filled(WORDS.closeNoHead, { id: view.id }));
  if (!shared[0]) return head;
  // git cannot tell how another branch came to hold this line, so every route is a condition the person checks
  const { detail, routes } = closeHeld(view, shared[0], head);
  throw Object.assign(fail('plan-close-merged', detail), { routes });
}

/** The commit's subject as the closer words it (`--subject`), one line; none given: the plan's title stands, unless a question of
 * the plan is still unanswered: then the title may name a part that was left out, and the closer says what shipped. */
function closeSubject(view, flags) {
  if (!view.ready) throw fail('plan-not-ready', `${view.id}: ${WORDS.closeDraft}`); // a plan never READY shipped nothing
  const said = typeof flags.subject === 'string' ? flags.subject.split(/[\r\n]/)[0].replace(/\s+/g, ' ').trim() : ''; // one line, plain spaces
  const open = view.questions.filter((q) => !isAnswered(view, q)).map((q) => q.q);
  if (!said && open.length) throw fail('plan-close-subject', `${view.id}: ${open.join(', ')}: ${shortOf('plan-close-subject')}`);
  return said ? { subject: said } : {};
}

async function close({ rest, flags = {} }, io) {
  if (!rest[0]) throw fail('plan-args', 'close <id> [--subject "<what shipped, one line>"]');
  const view = store.readPlan(io, rest[0]);
  const subject = closeSubject(view, flags);
  const teammate = actorOf(io).who === 'terminal' ? null : await teammateOf(io, view.id);
  if (teammate) throw fail(...theirPlan('plan-close-theirs', view.id, teammate));
  const head = await ownLine(io, view);
  const { commits, changed, tree } = await workNow(io, view);
  const closed = closedOf(view, commits, { head, changed, free: commits[0]?.sha === head && await io.git.amendable() });
  const by = await closerOf(io, view);
  if (await isUnsealed(io, view, changed)) store.dropLine(io, view.id, view.closed.line); // no commit holds it: this close takes its place
  const n = { commits: commits.length, own: closed.own.length };
  // nothing of its own yet, committed or changed: no record is written, so a later close works
  if (!closed.own.length && !closed.rides) return { out: { id: view.id, code: 'plan-close-empty' }, code: 'plan-close-empty', n };
  store.put(io, view.id, { t: 'closed', ...closed, by, ...subject });
  keepClosed(io, view.id, tree);
  letGo(io, view.id);
  flowRow(io, view.id, 'closed', closedFlow(view, io.clock.now()));
  const open = openLines(await openItems(io, store.readWeb(io)), [view.id]); // closing it clears no open item of it
  return { out: { id: view.id, code: 'plan-closed', ...closed, ...subject, title: view.title, issues: issuesOf(view), open }, code: 'plan-closed', n };
}

/** The commits that carry a close's riding work, newest first: the one that holds the record's line (the one commit the close
 * printed) for the riding files it changes; for a file committed apart from the record, the first commit after the close's head to
 * change it. History is walked only for such a file; where it finds none (that head is no longer under HEAD: a rebase, a squash) the
 * record's commit stands for all of the work. */
async function carriedBy(io, view) {
  const { closed } = view;
  const line = (await store.blameHeld(io, store.pathOf(view.id)))[closed.line - 1];
  const record = line?.sha ? { ...line, files: await io.git.filesOf(line.sha) } : { files: [] };
  const apart = closed.rides.filter((file) => !record.files.includes(file));
  const since = apart.length && closed.head && await io.git.under(closed.head) ? (await io.git.commits(closed.head)).reverse() : [];
  const first = [...new Set(apart.map((file) => since.find((c) => c.files.includes(file))).filter(Boolean))].reverse();
  const carriers = record.sha && (apart.length < closed.rides.length || !first.length) ? [record, ...first] : first;
  return carriers.map(({ sha, subject }) => ({ sha, subject: subject || null }));
}

/** A closed plan's record as its readers take it: the commits that carry its riding work are its own too, read from git, never
 * stored; until one does, `waits` says so. */
async function closeAsShipped(io, view) {
  const { closed } = view;
  if (!closed.rides) return closed;
  const carried = await carriedBy(io, view);
  return carried.length ? { ...closed, own: [...carried, ...closed.own] } : { ...closed, waits: true };
}

module.exports = { close, closeAsShipped };
