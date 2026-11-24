// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// A close no commit holds yet, and how a session is brought to it: until a commit holds the record the plan is work in progress (edits
// pass, the next close takes its place). A turn ending on work no close records is held once per state of the tree, each message told the
// commit that waits; what a turn was told stays in the person's home, as their sentences do until let go.
const { text: { lines: { filled } }, hash: { sha256 }, paths: { hereKey } } = require('@atlasbound/kit');
const { WORDS } = require('../contracts/codes.cjs');
const { closedOf, sinceHead, issuesOf } = require('../core/close.cjs');
const { commitWay } = require('../core/text/state.cjs');
const { closeName } = require('../base/here.cjs');
const { worksOn, hereValue, hereKeep, hereRows, sessionNames } = require('./here.cjs');
const { secondsBetween } = require('../base/text.cjs');
const { teammateOf } = require('./teammate.cjs');
const store = require('./store.cjs');

/** git's word on a plan's work now: HEAD's line since the plan's head, the files changed and not committed, those of them that are
 * the plan's work (`rides`), and these as the tree holds them in one digest: the state a close fits, or a turn's end was told of. */
async function workNow(io, view) {
  const commits = (await io.git.commits(sinceHead(view), { firstParent: true })) ?? [];
  const changed = (await io.git.statusZ()).map((row) => row.key).filter(Boolean);
  const rides = closedOf(view, commits, { head: null, changed, free: false }).rides ?? [];
  return { commits, changed, rides, tree: sha256(JSON.stringify(rides.map((file) => [file, io.fs.readText(file)]))) };
}
/** A close as this machine keeps it: the tree it `closed` on, which a turn's end was `told` of with it. */
const keepClosed = (io, id, tree) => hereKeep(io, closeName(id), { closed: tree, told: tree });

/** Whether no commit holds a closed plan's record yet: git's status names its file and blames the record's line on none. */
const isUnsealed = async (io, view, changed) => view.stage === 'closed' && changed.includes(store.pathOf(view.id))
  && !(await store.blameHeld(io, store.pathOf(view.id)))[view.closed.line - 1]?.sha;

/** `web` with the closed plans of `branch` no commit holds yet as READY again. Git is asked only where the branch holds a closed
 * plan and no READY one. */
async function reopened(io, web, branch) {
  const closed = web.views.filter((v) => v.branch === branch && v.state === 'closed');
  if (!closed.length || web.views.some((v) => v.branch === branch && v.state === 'ready')) return web;
  const { changed } = await workNow(io, closed[0]);
  const open = (await Promise.all(closed.map(async (v) => (await isUnsealed(io, v, changed)) && v.id))).filter(Boolean);
  return open.length ? { ...web, views: web.views.map((v) => (open.includes(v.id) ? { ...v, state: 'ready' } : v)) } : web;
}

/** The plan a session's turn works under: the branch's READY plan it works on (one closed with no commit holding the record is that
 * still), never a teammate's. null: none, or nothing is kept here. */
async function planUnder(io, session) {
  if (!io.home || !session || !store.keepsPlan(io)) return null;
  const branch = await io.git.branch();
  const web = await reopened(io, store.readWeb(io), branch);
  const view = web.views.find((v) => v.state === 'ready' && v.branch === branch && worksOn(io, session, v));
  return view && !(await teammateOf(io, view.id)) ? view : null;
}

/** What every message of the person is told of a plan's close (their ask: a context, said each time, never held as said before): the
 * one commit it left to make while it `fits`; else, with work in the tree (`rides`) or a close git moved past, to close first.
 * -> the text | null */
function closeTold(view, { fits, rides }) {
  const closed = view.stage === 'closed' ? view.closed : null;
  if (!fits) return closed || rides.length ? filled(WORDS.closeDue, { id: view.id }) : null;
  const commit = commitWay({ ...closed, id: view.id, title: view.title, issues: issuesOf(view) });
  return filled(WORDS.closeWaits, { id: view.id, commit });
}

const NO_PLAN = { rides: [], told: null };
/** Where a session's plan stands on its close. `rides`, `tree`: its work in the tree now; `kept`: what this machine keeps of its
 * close; `told`: what a message is told (closeTold). A close no commit holds fits while the commit it goes into is HEAD, or the tree is
 * as it closed on. */
async function closeStanding(io, session) {
  const view = await planUnder(io, session);
  if (!view) return NO_PLAN;
  const { rides, tree } = await workNow(io, view);
  const kept = hereValue(io, closeName(view.id)) ?? {};
  const { into } = view.stage === 'closed' ? view.closed : { into: false };
  const fits = view.stage === 'closed' && (into ? into === await io.git.head() : rides.length > 0 && tree === kept.closed);
  return { id: view.id, rides, tree, kept, told: closeTold(view, { fits, rides }) };
}

const KEPT_S = 30 * 86400; // the person's sentences are kept here 30 days at most
/** The person's sentences let go: each of a session that named plan `id` (it closed; null: none), every session untouched 30 days. */
const letGo = (io, id) => sessionNames(io).forEach((name) => {
  const rows = hereRows(io, name);
  const key = hereKey(io.root, 'decisionbook', name);
  if (!rows.length || secondsBetween(rows.at(-1).at, io.clock.now()) > KEPT_S) io.home.remove(key);
  else if (id && rows.some((row) => row.id === id)) io.home.writeAtomic(key, rows.map(({ said, ...row }) => `${JSON.stringify(row.t === 'prompt' ? row : { ...row, said })}\n`).join(''));
});

module.exports = { workNow, isUnsealed, keepClosed, reopened, closeStanding, letGo };
