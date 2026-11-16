// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The calls a text hands to fill and send, in the one form every text prints: the JSON on standard input as a
// quoted heredoc, so no shell quoting applies and an apostrophe in a text is a character.
const { text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS } = require('../../contracts/codes.cjs');
const { SHAPES, shapeOf } = require('../../contracts/shapes.cjs');
const { decision } = require('../../base/fill.cjs');
const { skeletonOf } = require('../skeleton.cjs');

/** `words`: `new`, or `add <id>`. */
const heredocOf = (words, value) => `atlasbound decisionbook ${words} <<'JSON'\n${JSON.stringify(value)}\nJSON`;
/** The one add that supplies `records` to the plan `id`. */
const addCall = (id, records) => heredocOf(`add ${id}`, records);
/** The command that shows `ref` (a plan id, or a `type:value` node); `node`: the one part of a plan to show. */
const showCall = (ref, node) => ['atlasbound decisionbook show', ref, ...(node ? [node] : [])].join(' ');

/** The one record by which a person's decision replaces an earlier one; `ref`: that one's `<plan id>/<key>`. */
function replaceLine(ref) {
  return filled(WORDS.replaceOne, { record: JSON.stringify(decision({ key: '<key>', supersedes: [ref] })) });
}

/** The published type of each blank ("") field of `records`, as [field, type]. */
const blankTypes = (records) => records.flatMap((record) => Object.keys(record)
  .filter((field) => record[field] === '')
  .map((field) => [field, String(SHAPES[shapeOf(record)][field]).replace('?', '')]));

/** What the blanks of `records` must hold where the published type is not free text (a key is one word, a gap's
 * source one file:line, the kind one of its values), in one line, or ''. */
function shapesLine(records) {
  const blanks = blankTypes(records);
  const fieldsOf = (type) => [...new Set(blanks.filter(([, held]) => held === type).map(([field]) => `\`${field}\``))];
  const said = Object.entries(WORDS.fillShapes)
    .map(([type, words]) => [fieldsOf(type), words])
    .filter(([fields]) => fields.length)
    .map(([fields, words]) => filled(words, { fields: fields.join(', ') }));
  return said.length ? filled(WORDS.fillShaped, { shapes: said.join('; ') }) : '';
}

/** A not-READY plan's one add of everything it still lacks, as a call to fill and send, and the shapes its blanks
 * hold. */
function nextAdd(view, danger) {
  const fill = skeletonOf(view, view.level.level, { rows: view.unmet.map((row) => row.id), danger });
  const records = [...fill.ai, ...fill.person];
  return { call: addCall(view.id, records), shapes: shapesLine(records) };
}

module.exports = { heredocOf, addCall, showCall, replaceLine, shapesLine, nextAdd };
