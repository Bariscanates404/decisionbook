// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The level ratchet: the AI proposes, code decides. A hard path makes the work critical, never waived; a soft signal unless waived;
// a micro fix past MICRO_FILES, a glob or any signal runs as normal, unless it writes only tests, fixtures or docs (QUIET_ROLES). No level
// proposed = critical.
// each signal is the reason in the gate's words (WORDS.levelWhy) with what holds it, so a reply says why the level rose.
const { repo: { fileRole }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { LEVELS, HARD_PATHS, SOFT_PATHS, MICRO_PATHS, RISK_WORDS, FANOUT_MIN, MICRO_FILES, GROWN_FACTOR, GROWN_FLOOR, QUIET_ROLES } = require('../contracts/rubric.cjs');
const { WORDS } = require('../contracts/codes.cjs');
const { globsOverlap, globCovers, isGlob } = require('../base/glob.cjs');
const { ofKind } = require('../base/text.cjs');
const { scopeOf } = require('./fold.cjs');

const OUTCOMES = [[(s) => s.below && (s.hard || (s.soft && !s.waived)), 'level-raised'], [(s) => s.below && s.soft, 'level-waived'], [(s) => s.rejected, 'level-micro-rejected']];
const WHAT = Object.fromEntries(Object.entries(WORDS.levelWhy)
  .map(([kind, words]) => [kind, filled(words, { max: MICRO_FILES, fanout: FANOUT_MIN })]));
/** What can raise a plan above a small fix, in the gate's words and order (the pack names them when the prompt names no file). */
const RAISERS = Object.values(WHAT);
const COUNTS = ['files', 'fanout']; // a signal that holds a count is one signal however high

function signalsOf(view, danger) {
  const files = scopeOf(view);
  const text = [view.title, view.why, view.success].join(' ').toLowerCase();
  const zone = files.filter((f) => danger.some((z) => globsOverlap(f, z)));
  const word = RISK_WORDS.find((w) => new RegExp(`\\b${w}\\b`).test(text));
  const consumers = ofKind(view, 'consumer').filter((c) => !files.some((glob) => globCovers(glob, c.text))).length; // its own plan is no shared caller
  const counted = files.every((f) => QUIET_ROLES.includes(fileRole(f).role)) ? [] : files; // a glob is judged by its path's role
  const held = { danger: zone, hard: files.filter((f) => !zone.includes(f) && HARD_PATHS.some((re) => re.test(f))),
    soft: files.filter((f) => SOFT_PATHS.some((re) => re.test(f))),
    word: word ? [word] : [], fanout: consumers >= FANOUT_MIN ? [consumers] : [], files: counted.length > MICRO_FILES ? [counted.length]
      : [],
    glob: counted.filter(isGlob), micro: files.filter((f) => MICRO_PATHS.some((re) => re.test(f))) };
  const said = (kinds) => kinds.flatMap((kind) => held[kind].map((h) => `${WHAT[kind]} (${h})`));
  const hard = said(['danger', 'hard']);
  const soft = said(['soft', 'word', 'fanout']);
  const big = said(['files', 'glob', 'micro']);
  const names = Object.keys(held).flatMap((kind) => held[kind].map((h) => [COUNTS.includes(kind) ? kind : `${kind} ${h}`, `${WHAT[kind]} (${h})`]));
  return { hard, soft, small: !big.length && !soft.length && !hard.length, big, names };
}

function planLevel(view, danger) {
  const { hard, soft, small, big, names } = signalsOf(view, danger);
  const proposed = view.level || 'critical';
  const asked = proposed === 'micro' && !small ? 'normal' : proposed;
  const said = { below: asked !== 'critical', hard: hard.length > 0, soft: soft.length > 0, waived: Boolean(view.waiver), rejected: asked !== proposed };
  const outcome = OUTCOMES.find(([holds]) => holds(said));
  const code = outcome ? outcome[1] : null;
  return { proposed, level: code === 'level-raised' ? 'critical' : asked, code, signals: code === 'level-micro-rejected' ? big : [...hard, ...soft], names };
}

/** `now` past `seen`: a higher level, added files past the cap, a new raising signal (the file count only as a level's why). */
function grownSince(seen, now, danger) {
  const was = planLevel(seen, danger);
  const is = planLevel(now, danger);
  const had = scopeOf(seen);
  const rose = LEVELS.indexOf(is.level) > LEVELS.indexOf(was.level)
    ? [filled(WORDS.grewLevel, { level: WORDS.levels[is.level], was: WORDS.levels[was.level] })] : [];
  const added = scopeOf(now).filter((file) => !had.includes(file)).length;
  const many = added > Math.max(GROWN_FACTOR * had.length, GROWN_FLOOR) ? [filled(WORDS.grewFiles, { added, held: had.length })] : [];
  return [...rose, ...many, ...is.names.filter(([name]) => (name !== 'files' || rose.length) && !was.names.some(([held]) => held === name)).map(([, text]) => text)];
}

module.exports = { planLevel, grownSince, RAISERS };
