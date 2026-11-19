// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The plan pack's lines: the decisions that bind the area, each plan's under where it came from, the assumptions no person confirmed,
// how the area is checked, its files, what was not found; then the level, what READY needs there, and the two calls to fill and send.
const { text: { lines: { filled, counted, dayOf } } } = require('@atlasbound/kit');
const { WORDS, SHOWN: { pack: shown } } = require('../../contracts/codes.cjs');
const { RUBRIC } = require('../../contracts/rubric.cjs');
const { RAISERS } = require('../level.cjs');
const { draftedCall, addCall, showCall, shapesLine, replaceLine } = require('./calls.cjs');
const { deciderOf, agedOf, rivalText } = require('./records.cjs');

const RAISED_BY = `${RAISERS.slice(0, -1).join(', ')} or ${RAISERS.at(-1)}`;

const sourceLine = ({ id, at, picked }) => filled(WORDS.packSource, { id, day: dayOf(at), picked: shown.picked(picked), call: showCall(id, 'decisions') });
/** The decisions shown, each plan's under the line of its id, day, why the walk picked it and the call that shows it whole; where the rest
 * are when some were cut (`more`: the work's first file); how a person replaces one. */
function decidedLines(decisions, more) {
  const rest = more ? [filled(WORDS.packMore, { file: shown.more(more) })] : [];
  if (!decisions.length) return rest;
  const rows = decisions.flatMap((d, i) => [...(d.from.id === decisions[i - 1]?.from.id ? [] : [sourceLine(d.from)]),
    d.rivals?.length ? `- ${shown.key(d.key)} ${rivalText(d)}` : `- ${shown.key(d.key)} = ${shown.value(d.value)} (${deciderOf(d.by)}${agedOf(d,
      dayOf(d.from.at))})`]);
  return [WORDS.packDecided, ...rows, ...rest, `${replaceLine(WORDS.packRef)} ${WORDS.packRefAt}`];
}

function checkedLine(checks) {
  const commands = checks.map(([command, plans]) => `\`${command}\` (${counted(plans, WORDS.planUnit)})`);
  return `${WORDS.packChecked} ${shown.commands(commands.join(', '))}`;
}

function areaFilesLine(files) {
  const held = files.map(([file, plans]) => `${file} (${plans})`);
  return `${WORDS.packFiles} ${shown.held(held.join(', '))}`;
}

/** What the area's earlier plans hold, then what was not found; each list comes already cut to what the pack's budget leaves. */
function areaLines({ decisions, more, assumed, checks, files, absent }) {
  return [...decidedLines(decisions, more),
    ...assumed.map((a) => filled(WORDS.packAssumed, { text: shown.text(a.text), id: a.id })),
    ...(checks.length ? [checkedLine(checks)] : []),
    ...(files.length ? [areaFilesLine(files)] : []), ...absent];
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
function levelLines(judged, first, session) {
  const { level, signals, fill, small } = judged;
  const layouts = [{ rows: fill.rows, level }, ...(small ? [{ rows: small.rows, level: 'micro' }] : [])];
  const [needs, smallNeeds] = layouts.map(needsOf);
  const slots = {
    level: WORDS.levels[level],
    from: levelFrom(judged),
    signals: signals.length ? `: ${shown.signals(signals.join(', '))}` : '',
    needs,
  };
  const smallLine = small ? [filled(WORDS.packSmall, { raisers: RAISED_BY, needs: smallNeeds })] : [];
  // the success row's amend is the head's own fields in a new
  const head = Object.assign({ title: '', why: '' }, ...fill.ai.filter((r) => r.t === 'amend'), { level });
  delete head.t;
  const records = fill.ai.filter((r) => r.t !== 'amend');
  const shapes = shapesLine([{ t: 'plan', ...head }, ...fill.ai, ...fill.person]);
  return [filled(WORDS.packLevel, slots), ...smallLine, filled(WORDS.packCalls, { first: first ? `${first}; then ` : '' }), ...[shapes].filter(Boolean),
    draftedCall('new', { ...head, records }, session), addCall('<id>', fill.person, session)];
}

module.exports = { areaLines, levelLines };
