// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// `why <file>[:<line>]`: git blame names the commit that last changed the line (with no line, each commit of the file); the closed plan
// whose `closed` record lists that commit says why, with its decisions in the person's words and what replaced each since. A commit no
// closed plan lists, a line not committed yet, a file git does not hold: each is said so, never guessed. Reads only.
const { errors: { fail }, paths: { join } } = require('@atlasbound/kit');
const { isShown } = require('../base/text.cjs');
const { openLines } = require('../core/text/open.cjs');
const store = require('./store.cjs');
const { openItems } = require('./touch.cjs');
const { WORDS } = require('../contracts/codes.cjs');

/** Each decision of a plan, with the decisions that replaced it since, in order (`then`). */
function replacedChain(web, id) {
  const byRef = new Map(web.decisions.map((d) => [d.ref, d])); // a revised one gives way to its last writing
  return web.decisions.filter((d) => d.plan === id && isShown(d)).map((d) => {
    const then = [];
    for (let next = byRef.get(d.supersededBy); next && !then.includes(next); next = byRef.get(next.supersededBy)) then.push(next);
    return { ...d, then };
  });
}

/** `<file>[:<line>]` -> { file, line }; no word is plan-args. */
function whyPlace(word = '') {
  const [, at, number] = /^(.+?)(?::(\d+))?$/.exec(word) || [];
  const file = at && join('', at);
  if (file == null) throw fail('plan-args', WORDS.usage.why); // no word, or a path that leaves the repository
  return { file, line: number ? Number(number) : null };
}

/** The closed plans whose `closed` record lists `sha`, each with its decisions and its open items; none for a line not committed. */
const shippedBy = (web, items, sha) => web.views.filter((v) => sha && v.closed && v.closed.own.some((c) => c.sha === sha))
  .map((v) => ({ id: v.id, title: v.title, state: v.state, open: openLines(items, [v.id]), decisions: replacedChain(web, v.id) }));

async function why({ rest }, io) {
  const { file, line } = whyPlace(rest[0]);
  const text = (await io.git.tracked([file])).includes(file) ? io.fs.readText(file) : null;
  if (text === null) return { out: { file, line, held: false, commits: [] }, code: 'plan-shown', n: { commits: 0 } };
  const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  if (line !== null && (line < 1 || line > lines)) throw fail('plan-args', `${file} has ${lines} lines: ${WORDS.usage.why}`);
  const web = store.readWeb(io);
  const items = await openItems(io, web);
  const blamed = new Map((await io.git.blame(file, line)).map((c) => [c.sha, c])); // each commit once
  const commits = [...blamed.values()].map((c) => ({ ...c, plans: shippedBy(web, items, c.sha) }));
  const n = { commits: commits.length, plans: commits.flatMap((c) => c.plans).length };
  return { out: { file, line, held: true, commits }, code: 'plan-shown', n };
}

module.exports = { why };
