// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. DecisionBook's one reading of a path or glob over kit's matcher (`**` any depth, `*` one name, `?` one character); braces and
// brackets still end a glob's literal start, for a shell expands them.
const { glob: { globsOf }, paths: { dirOf } } = require('@atlasbound/kit');

const WILD = /[*?{}[\]]/;
const stemOf = (glob) => glob.split(WILD)[0];
const isWild = (path) => WILD.test(path);

// a plain word is itself and all under it, never beside it (src/auth holds src/auth/a, not src/author.js); `<folder>/**` holds the folder's
// own name too
const matcherOf = (glob, own = glob.endsWith('/**') && glob.slice(0, -3), test = isWild(glob) && globsOf([glob]).test) => (test
  ? (file) => file === own || test(file) : (file) => `${file}/`.startsWith(`${glob.replace(/\/+$/, '')}/`));
const MATCHERS = new Map(); // one matcher per glob, made once: the gate, Stop and close test every file against every glob
const covering = (glob) => MATCHERS.get(glob) || MATCHERS.set(glob, matcherOf(glob)).get(glob);
const globCovers = (glob, file) => covering(glob)(file);
const folderOf = (glob) => dirOf(stemOf(glob));

const liesUnder = (x, y) => isWild(y) && stemOf(x).startsWith(stemOf(y));
const globsOverlap = (a, b) => globCovers(a, b) || globCovers(b, a) || liesUnder(a, b) || liesUnder(b, a);
const anyOverlap = (as, bs) => as.some((a) => bs.some((b) => globsOverlap(a, b)));
// two plans' decisions of one key meet where the key names its area (`auth.session-ttl`) or what they are about (`as`, `bs`: the plan's
// files and the decision's own) overlaps; a side naming no file cannot tell, so it meets: a bare `layout` in plans of other files is two
const filesMeet = (as, bs) => !as.length || !bs.length || anyOverlap(as, bs);
const keyMeets = (key, as, bs) => key.includes('.') || filesMeet(as, bs);

const tooBroad = (glob) => isWild(glob) && stemOf(glob).split('/').filter(Boolean).length < 2; // fewer than two literal segments before its first wildcard
const isGlob = (path) => isWild(path) || path.endsWith('/');

const bareWord = (word) => String(word).trim().replace(/^(\.\/)+/, ''); // `./src` names `src`

// a typed word -> the one glob it means: a tracked folder, a word ending in `/`, or a top name that is no tracked file is `<folder>/**`,
// for the width rule
function wordGlob(word, tracked) {
  const path = bareWord(word).replace(/^\.$/, ''); // `.` and `./` name the repository itself: `**`
  const holds = !path.includes('/') || tracked.some((key) => key.startsWith(`${path}/`));
  const folder = !path || path.endsWith('/') || (!isWild(path) && !tracked.includes(path) && holds);
  return folder ? [path.replace(/\/+$/, ''), '**'].filter(Boolean).join('/') : path;
}

module.exports = { globCovers, covering, folderOf, globsOverlap, anyOverlap, keyMeets, tooBroad, isGlob, bareWord, wordGlob };
