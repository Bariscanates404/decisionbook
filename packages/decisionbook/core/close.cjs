// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. Closeout's attribution: a commit is the plan's own when its message names the plan id or one of its issues, else when it
// touches a planned file; any other commit is counted, never attributed.
const { repo: { fileRole } } = require('@atlasbound/kit');
const { DIR } = require('../contracts/shapes.cjs');
const { byTime, mentions } = require('../base/text.cjs');
const { globCovers } = require('../base/glob.cjs');
const { scopeOf } = require('./fold.cjs');

// the head a plan's own commits come after: its READY one, else the one it began on
const sinceHead = (view) => (view.ready ? view.ready.head : view.head);

function closedOf(view, commits, head) {
  const scope = scopeOf(view);
  const words = [view.id, ...view.links.filter((l) => l.rel === 'for').map((l) => l.to.slice('issue:'.length))];
  const isOwn = (c) => words.some((w) => mentions(`${c.subject}\n${c.body}`, w)) || c.files.some((f) => scope.some((glob) => globCovers(glob, f)));
  const own = commits.filter(isOwn);
  const files = [...new Set(own.flatMap((c) => c.files))].sort();
  const tests = files.filter((f) => fileRole(f).role === 'test');
  return { head, own: own.map((c) => ({ sha: c.sha, subject: c.subject || null })), files, tests, other: commits.length - own.length };
}

function builtOf(web, view, commits) {
  const next = web.views.filter((v) => v.branch === view.branch && v.head && byTime(view, v) < 0).sort(byTime)[0];
  // began where this one did: nothing in between
  const end = next ? [...commits, { sha: sinceHead(view) }].findIndex((c) => c.sha === next.head) : 0;
  const { own, files } = view.closed || closedOf(view, commits.slice(Math.max(end, 0)), null);
  // its first planned glob's place; unplanned last
  const rank = (file) => [...scopeOf(view).map((glob) => globCovers(glob, file)), true].indexOf(true);
  return { own, files: files.filter((file) => !file.startsWith(`${DIR}/`)).sort((a, b) => rank(a) - rank(b)) };
}

module.exports = { closedOf, sinceHead, builtOf };
