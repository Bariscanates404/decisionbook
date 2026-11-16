// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// What needs a plan before an AI edits it: candidates are top folders of tracked source/test files (roles are data, no language named
// here).
const { errors: { fail }, repo: { fileRole }, text: { safe: { clip } } } = require('@atlasbound/kit');
const { WORDS } = require('../contracts/codes.cjs');
const { globCovers, wordGlob } = require('../base/glob.cjs');
const store = require('./store.cjs');
const { trackedNow } = require('./changed.cjs');

const ROLES = ['source', 'test'];

function candidatesOf(tracked) {
  const folders = new Map();
  tracked.filter((key) => key.includes('/')).map((key) => [key.split('/')[0], fileRole(key).role]).filter(([, role]) => ROLES.includes(role))
    .forEach(([top, role]) => {
      const row = folders.get(top) || { glob: `${top}/**`, files: 0, testFiles: 0 };
      folders.set(top, { ...row, files: row.files + 1, testFiles: row.testFiles + (role === 'test' ? 1 : 0) });
    });
  return [...folders.values()].sort((a, b) => a.glob.localeCompare(b.glob));
}

function chosenGlobs(words, tracked) {
  const pairs = words.split(',').map((word) => word.trim()).filter(Boolean).map((word) => [word, wordGlob(word, tracked)]);
  const whole = pairs.find(([, glob]) => globCovers(glob, 'a') && globCovers(glob, 'a/b/c.d'));
  if (whole) throw fail('protect-refused', `${whole[0]}: ${WORDS.protectWhole}`);
  const empty = pairs.find(([, glob]) => !tracked.some((key) => globCovers(glob, key)));
  if (empty) throw fail('protect-refused', `${empty[0]}: ${WORDS.protectEmpty}`);
  return pairs.map(([, glob]) => glob);
}

const GLOBS = { source: (candidates) => candidates.map((c) => c.glob), none: () => [],
  chosen: (_c, words, tracked) => chosenGlobs(words, tracked) };
const protectAnswer = (flags, rest) => ['source', 'none'].find((name) => flags[name]) || (rest[0] && 'chosen');
const shownAnswer = (config, candidates) => ({ code: 'protect-shown', answer: config.answer && config.answer.answer, current: config.protect.length ? config.protect : null, candidates });

// taking protection away is the person's grave act (the verb's row says so, and the cli lets no one else through): `ask` shows what
// goes and answers whether they typed the phrase that names the act (the cli's one question of it)
async function personSays(gone, { ask, door }) {
  if (!gone.length) return door;
  const typed = ask ? await ask(`${WORDS.protectTakes} ${clip(gone.join(', '), 300)}: ${WORDS.protectThen}`) : false;
  if (typed !== true) throw fail('protect-person', `${clip(gone.join(', '), 200)}: ${WORDS.protectNotSaid}`);
  return 'protect-terminal';
}

async function protect({ rest, flags, door = 'protect-command', ask = null }, io) {
  const config = store.bookConfig(io);
  const tracked = await trackedNow(io);
  const candidates = candidatesOf(tracked);
  const answer = protectAnswer(flags, rest);
  if (!answer) return { out: shownAnswer(config, candidates), code: 'protect-shown' };
  const globs = GLOBS[answer](candidates, rest[0] || '', tracked);
  if (answer === 'source' && !globs.length) throw fail('protect-refused', WORDS.protectNoSource);
  const guarded = answer === 'none' ? [] : [...new Set([...config.protect, ...globs])];
  const by = await personSays(config.protect.filter((glob) => !guarded.includes(glob)), { ask, door });
  store.writeConfig(io, { ...config, protect: guarded, answer: { answer, door: by, at: io.clock.now() } });
  return { out: { code: 'protect-answered', answer, current: guarded, candidates }, code: 'protect-answered', n: { protect: guarded.length } };
}

module.exports = { protect };
