// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The plan pack's lines: the decisions that bind the area, the assumptions no person confirmed, how the area
// is checked, its files; then the level this task runs at, what READY needs there, and the two calls to fill and send.
const { text: { safe: { clip }, lines: { filled, counted } } } = require('@atlasbound/kit');
const { WORDS } = require('../../contracts/codes.cjs');
const { RUBRIC } = require('../../contracts/rubric.cjs');
const { RAISERS } = require('../level.cjs');
const { heredocOf, addCall, shapesLine, replaceLine } = require('./calls.cjs');
const { deciderOf } = require('./records.cjs');

const RAISED_BY = `${RAISERS.slice(0, -1).join(', ')} or ${RAISERS.at(-1)}`;

/** The decisions shown; where the rest are when some were cut (`more`: the work's first file); how a person
 * replaces one. */
function decidedLines(decisions, more) {
  const rest = more ? [filled(WORDS.packMore, { file: clip(more, 160) })] : [];
  if (!decisions.length) return rest;
  const rows = decisions.map((d) => `- ${clip(d.key, 60)} = ${clip(d.value, 160)} (${deciderOf(d.by)})`);
  return [WORDS.packDecided, ...rows, ...rest, `${replaceLine(WORDS.packRef)} ${WORDS.packRefAt}`];
}

function checkedLine(checks) {
  const commands = checks.map(([command, plans]) => `\`${command}\` (${counted(plans, WORDS.planUnit)})`);
  return `${WORDS.packChecked} ${clip(commands.join(', '), 300)}`;
}

function areaFilesLine(files) {
  const held = files.map(([file, plans]) => `${file} (${plans})`);
  return `${WORDS.packFiles} ${clip(held.join(', '), 600)}`;
}

/** What the area's earlier plans hold; each list comes already cut to what the pack's budget leaves (core/pack). */
function areaLines({ decisions, more, assumed, checks, files }) {
  return [...decidedLines(decisions, more),
    ...assumed.map((a) => filled(WORDS.packAssumed, { text: clip(a.text, 160), id: a.id })),
    ...(checks.length ? [checkedLine(checks)] : []),
    ...(files.length ? [areaFilesLine(files)] : [])];
}

/** The rubric rows a blank plan at a level asks for, each with its count where it asks more than one. */
function needsOf({ rows, level }) {
  const countOf = (id) => RUBRIC.find((row) => row.id === id).floor[level];
  return rows.map((id) => (countOf(id) > 1 ? `${id} ${countOf(id)}` : id)).join(', ');
}

/** Where the level comes from: the files the prompt names, its words alone, or the layout given when it names no
 * file. */
function levelFrom({ named, unnamed }) {
  if (named) return WORDS.packFrom.files;
  return unnamed ? WORDS.packFrom.unnamed : filled(WORDS.packFrom.words, { raisers: RAISED_BY });
}

/** The level line, the small form in one line when the layout was raised for a prompt naming no file, what to do (`first`: where another
 * package sends the research before this pack), the shapes of the blanks, then the `new` and the person's `add` as fill-in JSON. */
function levelLines(judged, first) {
  const { level, signals, fill, small } = judged;
  const layouts = [{ rows: fill.rows, level }, ...(small ? [{ rows: small.rows, level: 'micro' }] : [])];
  const [needs, smallNeeds] = layouts.map(needsOf);
  const slots = {
    level: WORDS.levels[level],
    from: levelFrom(judged),
    signals: signals.length ? `: ${clip(signals.join(', '), 120)}` : '',
    needs,
  };
  const smallLine = small ? [filled(WORDS.packSmall, { raisers: RAISED_BY, needs: smallNeeds })] : [];
  // the success row's amend is the head's own fields in a new
  const head = Object.assign({ title: '', why: '' }, ...fill.ai.filter((r) => r.t === 'amend'), { level });
  delete head.t;
  const records = fill.ai.filter((r) => r.t !== 'amend');
  const shapes = shapesLine([{ t: 'plan', ...head }, ...fill.ai, ...fill.person]);
  return [filled(WORDS.packLevel, slots), ...smallLine, filled(WORDS.packCalls, { first: first ? `${first}; then ` : '' }), ...[shapes].filter(Boolean),
    heredocOf('new', { ...head, records }), addCall('<id>', fill.person)];
}

module.exports = { areaLines, levelLines };
