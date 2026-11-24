// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. Closeout's attribution: a commit is the plan's own when its message names the plan id or one of its issues, else when it
// touches a planned file; any other commit is counted, never attributed. One commit holds the code and the plan: work not committed yet
// is the plan's own by its files (a planned file, or a test) and rides in the commit that carries the close record; work committed
// before its close rides too where its last commit can still take the record in (`into`: HEAD, the plan's own, made here, no other ref's).
const { repo: { fileRole } } = require('@atlasbound/kit');
const { isBookFile, refValue } = require('../contracts/shapes.cjs');
const { byTime, mentions } = require('../base/text.cjs');
const { globCovers } = require('../base/glob.cjs');
const { scopeOf } = require('./fold.cjs');

// the head a plan's own commits come after: its READY one, else the one it began on
const sinceHead = (view) => (view.ready ? view.ready.head : view.head);

const issuesOf = (view) => view.links.filter((l) => l.rel === 'for').map((l) => refValue(l.to));

// a commit is the plan's own by its words (it names the plan id or an issue of it: all its files are the work) or by a planned file it
// touches (then its files the plan plans, and tests, are the work; any other is a number); the store's files never count
function ownOf(view) {
  const scope = scopeOf(view);
  const words = [view.id, ...issuesOf(view)];
  const named = (c) => words.some((w) => mentions(`${c.subject}\n${c.body}`, w));
  const planned = (f) => scope.some((glob) => globCovers(glob, f));
  const ofWork = (f) => planned(f) || fileRole(f).role === 'test';
  const unkept = (files) => files.filter((f) => !isBookFile(f));
  const workOf = (c) => unkept(c.files).filter((f) => named(c) || ofWork(f));
  return { isOwn: (c) => named(c) || c.files.some(planned), ofWork, unkept, workOf };
}
// the work's last commit, where it takes the record in: nothing of the work is changed, and HEAD is the plan's own, with work, and free
const takesRecord = (now, [last], inTree, workOf) => now.free && !inTree.length && last?.sha === now.head && workOf(last).length && last;
const NOT_NOW = { head: null, changed: [], free: false }; // read with no work tree: an open plan's commits only

/** `now`: HEAD, the work tree's files not committed yet (`changed`), and whether HEAD may still be rewritten (`free`: kit git
 * amendable). The changed files of the work are `rides`, and beside riding work every other changed file is a number too. With nothing
 * of the work changed and HEAD its own, free commit, that commit is the one the record goes `into`: its work rides, and `head` is the
 * commit it came after. */
function closedOf(view, commits, now = NOT_NOW) {
  const { isOwn, ofWork, unkept, workOf } = ownOf(view);
  const every = commits.filter(isOwn);
  const inTree = unkept(now.changed).filter(ofWork).sort();
  const last = takesRecord(now, every, inTree, workOf);
  const [own, rides, head] = last ? [every.slice(1), workOf(last).sort(), commits[1]?.sha ?? sinceHead(view)] : [every, inTree, now.head];
  const touched = new Set([...every.flatMap((c) => unkept(c.files)), ...(inTree.length ? unkept(now.changed) : [])]).size;
  const files = [...new Set([...every.flatMap(workOf), ...inTree])].sort();
  return { head, own: own.map((c) => ({ sha: c.sha, subject: c.subject || null })), files, tests: files.filter((f) => fileRole(f).role === 'test'),
    ...(touched > files.length && { unplanned: touched - files.length }), other: commits.length - every.length,
    ...(rides.length && { rides }), ...(last && { into: last.sha }) };
}

function builtOf(web, view, commits) {
  const next = web.views.filter((v) => v.branch === view.branch && v.head && byTime(view, v) < 0).sort(byTime)[0];
  // began where this one did: nothing in between
  const end = next ? [...commits, { sha: sinceHead(view) }].findIndex((c) => c.sha === next.head) : 0;
  const { own, files: kept } = view.closed || closedOf(view, commits.slice(Math.max(end, 0)));
  const ownFiles = () => commits.filter((c) => own.some((o) => o.sha === c.sha)).flatMap((c) => c.files); // what an open plan built
  const files = view.closed ? kept : [...new Set(ownFiles())].sort();
  // its first planned glob's place; unplanned last
  const rank = (file) => [...scopeOf(view).map((glob) => globCovers(glob, file)), true].indexOf(true);
  return { own, files: files.filter((file) => !isBookFile(file)).sort((a, b) => rank(a) - rank(b)) };
}

module.exports = { closedOf, sinceHead, builtOf, issuesOf };
