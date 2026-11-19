// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The calls a text hands to fill and send, in the one form every text prints (kit's draftCall): the JSON written as a
// draft file, then the call that reads it, so no shell quoting applies and an apostrophe in a text is a character.
const { text: { lines: { filled } }, host: { draftCall } } = require('@atlasbound/kit');
const { WORDS } = require('../../contracts/codes.cjs');
const { SHAPES, shapeOf } = require('../../contracts/shapes.cjs');
const { skeletonOf } = require('../skeleton.cjs');

/** `words`: `new`, or `add <id>`; the draft is named by the plan it writes (`new` before there is one), in `session`'s drafts folder. */
const draftedCall = (words, value, session) => draftCall(`${WORDS.call} ${words}`, words.split(' ').at(-1), JSON.stringify(value), session);
/** The one add that supplies `records` to the plan `id`. */
const addCall = (id, records, session) => draftedCall(`add ${id}`, records, session);
/** The command that shows `ref` (a plan id, or a `type:value` node); `node`: the one part of a plan to show. */
const showCall = (ref, node) => [WORDS.call, 'show', ref, ...(node ? [node] : [])].join(' ');
const jsonCall = (...words) => [WORDS.call, ...words, '--json'].join(' '); // the call a bounded text's `+n more` line names

/** How a person's decision replaces an earlier one: a question that names it, and their answer that places it; `ref`: that one's
 * `<plan id>/<key>`. */
const replaceLine = (ref) => filled(WORDS.replaceOne, { ref });

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
function nextAdd(view, danger, session) {
  const fill = skeletonOf(view, view.level.level, { rows: view.unmet.map((row) => row.id), danger });
  const records = [...fill.ai, ...fill.person];
  return { call: addCall(view.id, records, session), shapes: shapesLine(records) };
}

module.exports = { draftedCall, addCall, showCall, jsonCall, replaceLine, shapesLine, nextAdd };
