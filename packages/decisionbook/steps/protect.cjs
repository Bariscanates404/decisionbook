// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// What needs a plan before an AI edits it: candidates are top folders of tracked source/test files (roles are data, no language named
// here; a web page counts as source) and an entry file at the root.
const { errors: { fail }, repo: { fileRole }, paths: { resolveFrom, repoRel, dirOf } } = require('@atlasbound/kit');
const { WORDS, SHOWN: { protect: shown } } = require('../contracts/codes.cjs');
const { globCovers, wordGlob } = require('../base/glob.cjs');
const store = require('./store.cjs');
const { trackedNow } = require('./changed.cjs');

const ROLES = ['source', 'test'];
// kit's roles leave a web page unclassified, yet a site's pages are its source; a root file is offered only as the one file a site or a
// program starts from, never every loose file at the top
const PAGE = /\.html?$/i;
const ENTRY = /^(?:index|main|app|server)\.[a-z0-9]+$/i;

function candidatesOf(tracked) {
  const folders = new Map();
  const roles = tracked.map((key) => [key, PAGE.test(key) ? 'source' : fileRole(key).role]);
  roles.filter(([key, role]) => key.includes('/') && ROLES.includes(role)).map(([key, role]) => [key.split('/')[0], role])
    .forEach(([top, role]) => {
      const row = folders.get(top) || { glob: `${top}/**`, files: 0, testFiles: 0 };
      folders.set(top, { ...row, files: row.files + 1, testFiles: row.testFiles + (role === 'test' ? 1 : 0) });
    });
  const entries = roles.filter(([key, role]) => !key.includes('/') && ENTRY.test(key) && role === 'source')
    .map(([key]) => ({ glob: key, files: 1, testFiles: 0 }));
  return [...folders.values(), ...entries].sort((a, b) => a.glob.localeCompare(b.glob));
}

// every word is a path (a shell hands an unquoted `src/*` as its files), a comma list too, read from the folder it was typed in as git does
const typedIn = (io, word, at = resolveFrom(io.start || io.root, word)) => (at === resolveFrom(io.root, '.') ? '.'
  : repoRel(io.root, at) ?? word);
const typedWords = (io, rest) => rest.flatMap((word) => word.split(',')).map((word) => word.trim()).filter(Boolean).map((word) => [word, typedIn(io, word)]);
// files of one folder each named alone: what a shell hands for an unquoted glob
const shellExpanded = (words, tracked) => words.length > 1 && words.every(([, w]) => tracked.includes(w))
  && new Set(words.map(([, w]) => dirOf(w))).size === 1;

function chosenGlobs(words, tracked) {
  const pairs = words.map(([word, path]) => [word, wordGlob(path, tracked)]);
  const whole = pairs.find(([, glob]) => globCovers(glob, 'a') && globCovers(glob, 'a/b/c.d'));
  if (whole) throw fail('protect-refused', `${whole[0]}: ${WORDS.protectWhole}`);
  const empty = pairs.find(([, glob]) => !tracked.some((key) => globCovers(glob, key)));
  if (empty) throw fail('protect-refused', `${empty[0]}: ${WORDS.protectEmpty}`);
  return pairs.map(([, glob]) => glob);
}

const GLOBS = { source: (candidates) => candidates.map((c) => c.glob), none: () => [],
  chosen: (_c, words, tracked) => chosenGlobs(words, tracked) };
const protectAnswer = (flags, rest) => ['source', 'none'].find((name) => flags[name]) || (rest.length && 'chosen');
const coveredAlready = (globs, config) => globs.map((glob) => [glob, config.protect.find((had) => had !== glob && globCovers(had, glob))])
  .filter(([, by]) => by); // a path a glob protected already holds is said, never added again
const shownAnswer = (config, candidates) => ({ code: 'protect-shown', answer: config.answer && config.answer.answer, current: config.protect.length ? config.protect : null, candidates });

// taking protection away is the person's grave act (the verb's row says so, and the cli lets no one else through): `ask` shows what
// goes and answers whether they typed the phrase that names the act (the cli's one question of it)
async function personSays(gone, { ask, door }) {
  if (!gone.length) return door;
  const typed = ask ? await ask(`${WORDS.protectTakes} ${shown.ask(gone.join(', '))}: ${WORDS.protectThen}`) : false;
  if (typed !== true) throw fail('protect-person', `${shown.refusal(gone.join(', '))}: ${WORDS.protectNotSaid}`);
  return 'protect-terminal';
}

async function protect({ rest, flags, door = 'protect-command', ask = null }, io) {
  const config = store.bookConfig(io);
  const tracked = await trackedNow(io);
  const candidates = candidatesOf(tracked);
  const answer = protectAnswer(flags, rest);
  if (!answer) return { out: shownAnswer(config, candidates), code: 'protect-shown' };
  const words = typedWords(io, rest);
  const typed = GLOBS[answer](candidates, words, tracked);
  if (answer === 'source' && !typed.length) throw fail('protect-refused', WORDS.protectNoSource);
  const held = coveredAlready(typed, config);
  const globs = typed.filter((glob) => !held.some(([had]) => had === glob));
  const guarded = answer === 'none' ? [] : [...new Set([...config.protect, ...globs])];
  const by = await personSays(config.protect.filter((glob) => !guarded.includes(glob)), { ask, door });
  store.writeConfig(io, { ...config, protect: guarded, answer: { answer, door: by } }); // no time: two teammates write the same bytes
  const said = { held, quote: answer === 'chosen' && shellExpanded(words, tracked) };
  return { out: { code: 'protect-answered', answer, current: guarded, candidates, ...said }, code: 'protect-answered', n: { protect: guarded.length } };
}

module.exports = { protect };
