// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE; the plan pack, what planning needs of the area's earlier plans in one text within its budget: the decisions that bind the area
// (active, newest first), the assumptions no person confirmed, how the area is checked, its files, the level this task runs at with what
// READY needs there, the two calls. This module chooses and cuts; core/text/pack writes the lines.
const PACK = require('../contracts/pack.json');
const { byTime, isAnswered } = require('../base/text.cjs');
const { foldPlan, scopeOf } = require('./fold.cjs');
const { planLevel } = require('./level.cjs');
const { skeletonOf } = require('./skeleton.cjs');
const { areaLines, levelLines } = require('./text/pack.cjs');

// replaced, revised, proposed: never
const bindingOf = (views) => views.flatMap((v) => v.decisions).filter((d) => d.state === 'active').sort((a, b) => byTime(b, a));
const assumedOf = (views) => views.flatMap((v) => v.assumptions.filter((a) => !a.q || !isAnswered(v, { q: a.q }))
  .map((a) => ({ ...a, id: v.id })))
  .sort((a, b) => byTime(b, a));

/** The level the gate's own rule gives a plan of these files and these words (proposed as small, the lowest a plan may ask) and a blank
 * plan's fill-in there, from the same rubric rows (core/skeleton): core/level and core/ready, never a second rule. Words alone cannot say
 * a task is small, so a prompt naming no file is laid out as normal work, with the small form beside it. */
function levelNeeds({ words, files, danger }) {
  const links = files.map((file) => ({ t: 'link', rel: 'plans', to: `file:${file}` }));
  const judged = planLevel(foldPlan([{ id: 'pack', title: words, level: 'micro' }, ...links]), danger);
  const unnamed = !files.length && judged.level === 'micro';
  const level = unnamed ? 'normal' : judged.level;
  const blankAt = (at) => skeletonOf(foldPlan([{ id: 'pack', level: at }]), at, { files, danger });
  const [fill, small] = (unnamed ? [level, 'micro'] : [level]).map(blankAt);
  return { level, signals: judged.signals, named: files.length > 0, unnamed, fill, small: small || null };
}

/** Each key with the count of lists holding it, most first; a tie keeps the first seen. */
const heldCounts = (lists) => [...lists.flatMap((list) => [...new Set(list)])
  .reduce((m, key) => m.set(key, (m.get(key) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);

/** The pack's lists, `cut` steps dropped: the files line first, then assumptions, then decisions from their ends; the two calls are never
 * cut. */
function listsOf({ views, first, checks, files }, cut) {
  const decided = bindingOf(views);
  const shown = decided.slice(0, Math.max(PACK.decisions - Math.max(cut - 1 - PACK.assumptions, 0), 0));
  const assumed = assumedOf(views).slice(0, Math.max(PACK.assumptions - Math.max(cut - 1, 0), 0));
  const more = decided.length > shown.length && first ? first : null; // where the decisions not shown are
  return { lines: areaLines({ decisions: shown, more, assumed, checks, files: cut ? [] : files }), refs: shown.map((d) => d.ref) };
}

/** The pack: `views` the area's earlier plans, each with `built` (the files it built; none: a first task here, the level line and the
 * calls only), `seeds` the work's files (the first names where the rest are), `named` the prompt's files and `words` it, what its `new` is
 * judged on, `first` where another package sends the research first (none: '') -> { text, refs, ids } (refs: `<id>/<key>`). */
function packOf({ views, seeds = [], named = [], words, danger = [], first }) {
  const commands = views.map((v) => v.checks.map((c) => c.command).filter(Boolean));
  const paths = views.map((v) => [...scopeOf(v), ...v.built]);
  const [checks, files] = [[commands, PACK.checks], [paths, PACK.files]].map(([lists, most]) => heldCounts(lists).slice(0, most));
  const tail = levelLines(levelNeeds({ words, files: named, danger }), first);
  const fit = (cut) => {
    const { lines, refs } = listsOf({ views, first: seeds[0], checks, files }, cut);
    const text = [...lines, ...tail].join('\n');
    return text.length <= PACK.budget || cut > PACK.decisions + PACK.assumptions ? { text, refs } : fit(cut + 1);
  };
  return { ...fit(0), ids: views.map((v) => v.id) };
}

module.exports = { packOf };
