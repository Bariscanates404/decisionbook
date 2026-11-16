// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Fold what has not left yet of the trace files into raw events; a torn line (a crash mid-append) is refused by its code and costs only
// itself.
const { trace: { TRACE_DIR } } = require('@atlasbound/kit');
const { fold, wholeOf } = require('../core/fold.cjs');
const { takeNew, stateKeyOf } = require('../core/window.cjs');
const { MAX_ROWS_PER_SEND } = require('../contracts/rules.cjs');
const { SENT_PATH, validate } = require('../contracts/shapes.cjs');
const { codesSaid } = require('../contracts/helpers.cjs');

// The last mirror line per file wins; a torn line loses only its own send's offsets, so those rows may leave again (at least once).
function sentOf(mirror, states) {
  const { rows, refused } = validate.kept(mirror, 'SentLine');
  const sentState = rows.reduceRight((found, line) => found || stateKeyOf(validate.jsonOrNull(line.body)?.events || [], states), '');
  return { seen: Object.assign({}, ...rows.map((line) => line.offsets)), sentState, refused: refused.length };
}

function filesRead(io) {
  const names = (io.fs.list(TRACE_DIR) || []).filter((name) => name.endsWith('.ndjson')).sort();
  const read = names.map((name) => ({ name, ...validate.kept(io.fs.readText(`${TRACE_DIR}/${name}`) || '', 'TraceRow') }));
  const torn = read.filter((file) => file.refused.length);
  return { files: read.map(({ name, rows }) => ({ name, rows })), torn: torn.map((file) => file.name),
    refused: torn.flatMap((file) => file.refused).length };
}

async function collect({ version, rules }, io) {
  const mirror = io.fs.readText(SENT_PATH) || '';
  const { seen, sentState, refused: sentRefused } = sentOf(mirror, rules.FORMS.state);
  const { files, torn, refused } = filesRead(io);
  const { rows, offsets, waiting } = takeNew(files, seen, MAX_ROWS_PER_SEND);
  const { events, unruled, localOnly, cut } = fold(rows, version, rules);
  const whole = wholeOf(takeNew(files, seen, Infinity).rows, rules);
  const codes = codesSaid({ 'step-unruled': unruled.length, 'trace-line-refused': refused, 'sent-line-refused': sentRefused,
    'words-unread': rules.unread.length });
  const out = { events, unruled, localOnly, torn, offsets, waiting, whole, sentState, first: !mirror };
  return { out, n: { files: files.length, rows: rows.length, events: events.length, cut, refused: refused + sentRefused }, codes };
}

module.exports = { collect };
