// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. A text in a byte budget: the lines that fit, then how many were left out and the command that shows them.
const MORE_ROOM = 60; // kept free for the line that names what was left out

const bytes = (lines) => Buffer.byteLength(lines.join('\n'));

/** `head`, the lines of `list` that fit in `max` bytes (at most `count` of them), one line naming how many were
 * left out and the command `more` that shows them, then `tail`; head and tail are never cut. */
function boundedLines({ head, list, tail, max, more, count = list.length }) {
  const room = max - bytes([...head, ...tail]) - MORE_ROOM;
  const fit = [];
  for (const line of list) {
    if (fit.length >= count || bytes([...fit, line]) > room) break;
    fit.push(line);
  }
  const left = list.length - fit.length;
  const leftOut = left ? [`+${left} more: ${more}`] : [];
  return [...head, ...fit, ...leftOut, ...tail];
}

module.exports = { bytes, boundedLines };
