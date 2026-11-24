// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The level ratchet: the AI proposes, code decides, from what the plan touches alone (its planned paths, the shared consumers it
// names), never the words it says of itself: one file gives one level in every plan. A hard path makes the work critical, never waived;
// a soft signal (a risk area, shared consumers) unless waived; a micro fix past MICRO_FILES, a glob or a shared path runs as normal, unless
// it writes only tests, fixtures or docs (QUIET_ROLES). No level proposed = critical. Each signal is said with what holds it. The risk
// areas are the repository's own where its policy names them (`risk`), and the level says so; else the built-in list.
const { repo: { fileRole }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { higher, HARD_PATHS, RISK_AREAS, MICRO_PATHS, FANOUT_MIN, MICRO_FILES, GROWN_FACTOR, GROWN_FLOOR, QUIET_ROLES } = require('../contracts/rubric.cjs');
const { WORDS } = require('../contracts/codes.cjs');
const { globsOverlap, globCovers, isGlob } = require('../base/glob.cjs');
const { ofKind, isAi } = require('../base/text.cjs');
const { scopeOf } = require('./fold.cjs');

const OUTCOMES = [[(s) => s.below && (s.hard || (s.soft && !s.waived)), 'level-raised'], [(s) => s.below && s.soft, 'level-waived'], [(s) => s.rejected, 'level-micro-rejected']];
// the gate's words for each raising signal, and for a level that runs as proposed
const [WHAT, KEPT] = [WORDS.levelWhy, WORDS.levelKept].map((words) => Object.fromEntries(Object.entries(words)
  .map(([name, text]) => [name, filled(text, { max: MICRO_FILES, fanout: FANOUT_MIN })])));
/** What can raise a plan above a small fix, in the gate's words and order (the pack names them beside the small form). */
const RAISERS = Object.values(WHAT);
const COUNTS = ['files', 'fanout']; // a signal that holds a count is one signal however high
const NEVER_WAIVED = ['danger', 'hard']; // the kinds of signal no waiver lowers
// what a path is named: each folder whole and the file before its first `.`, in lower case
const namesOfPath = (file) => file.split('/').map((name, i, all) => (i < all.length - 1 ? name : name.split('.')[0]).toLowerCase());

function signalsOf(view, danger, risk) {
  const files = scopeOf(view);
  const zone = files.filter((f) => danger.some((z) => globsOverlap(f, z)));
  const consumers = ofKind(view, 'consumer').filter((c) => !files.some((glob) => globCovers(glob, c.text))).length; // its own plan is no shared caller
  // a test, fixture or doc counts for nothing among its like, and it names what it covers, no risk area; a glob: its path's role
  const loud = files.filter((f) => !QUIET_ROLES.includes(fileRole(f).role));
  const counted = loud.length ? files : [];
  // the risk areas among the loud files, `<area>: <path>` each: the ones in force (`risk`, the policy's own, else the built-in list), and
  // the built-in ones the policy's list leaves out
  const [area, left] = [risk ?? RISK_AREAS, risk ? RISK_AREAS.filter((name) => !risk.includes(name)) : []].map((areas) => loud
    .flatMap((file) => namesOfPath(file).filter((name) => areas.includes(name)).slice(0, 1).map((name) => `${name}: ${file}`)));
  const held = { danger: zone, hard: files.filter((f) => !zone.includes(f) && HARD_PATHS.some((re) => re.test(f))),
    area: risk ? area.map((named) => `${named}, ${WORDS.riskOwn}`) : area,
    fanout: consumers >= FANOUT_MIN ? [consumers] : [], files: counted.length > MICRO_FILES ? [counted.length] : [],
    glob: counted.filter(isGlob), micro: files.filter((f) => MICRO_PATHS.some((re) => re.test(f))) };
  const said = (kinds) => kinds.flatMap((kind) => held[kind].map((h) => `${WHAT[kind]} (${h})`));
  const hard = said(NEVER_WAIVED);
  const soft = said(['area', 'fanout']);
  const big = said(['files', 'glob', 'micro']);
  const names = Object.keys(held).flatMap((kind) => held[kind].map((h) => [COUNTS.includes(kind) ? kind : `${kind} ${h}`, `${WHAT[kind]} (${h})`]));
  return { hard, soft, small: !big.length && !soft.length && !hard.length, big, names, left };
}

/** -> { proposed, stated: whether the plan proposed one, level, code: how code moved it (null: it runs as proposed), signals, names,
 * left: the built-in risk areas of its paths that the repository's own list leaves out } */
function planLevel(view, danger, risk) {
  const { hard, soft, small, big, names, left } = signalsOf(view, danger, risk);
  const proposed = view.level || 'critical';
  const asked = proposed === 'micro' && !small ? 'normal' : proposed;
  const said = { below: asked !== 'critical', hard: hard.length > 0, soft: soft.length > 0, waived: Boolean(view.waiver) && !isAi(view.waiver.by), rejected: asked !== proposed };
  const code = OUTCOMES.find(([holds]) => holds(said))?.[1] ?? null;
  return { proposed, stated: Boolean(view.level), level: code === 'level-raised' ? 'critical' : asked, code, signals: code === 'level-micro-rejected' ? big : [...hard, ...soft], names, left };
}

/** Why a level code did not move is what it is: none proposed, a frozen plan keeps its READY's (core/ready levelAt), or as proposed. */
const keptWhy = (level) => (!level.stated && KEPT.none) || (level.level !== level.proposed && KEPT.ready) || KEPT[level.level];

/** `now` past `seen`: a higher level, added files past the cap, a new raising signal (the file count only as a level's why). */
function grownSince(seen, now, danger, risk) {
  const was = planLevel(seen, danger, risk);
  const is = planLevel(now, danger, risk);
  const had = scopeOf(seen);
  const rose = higher(is.level, was.level)
    ? [filled(WORDS.grewLevel, { level: WORDS.levels[is.level], was: WORDS.levels[was.level] })] : [];
  const added = scopeOf(now).filter((file) => !had.includes(file)).length;
  const many = added > Math.max(GROWN_FACTOR * had.length, GROWN_FLOOR) ? [filled(WORDS.grewFiles, { added, held: had.length })] : [];
  return [...rose, ...many, ...is.names.filter(([name]) => (name !== 'files' || rose.length) && !was.names.some(([held]) => held === name)).map(([, text]) => text)];
}

/** Whether the person's waiver lowers a level: one raised by soft signals alone (a name is its signal's kind, then what holds it). */
const isWaivable = (level) => level.code === 'level-raised' && !level.names.some(([name]) => NEVER_WAIVED.includes(name.split(' ')[0]));

module.exports = { planLevel, grownSince, isWaivable, keptWhy, RAISERS };
