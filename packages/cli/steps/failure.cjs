// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The one place that turns a caught error a step goes on past into one coded trace record and one line a person can read; an uncoded error
// is recorded by its name only (kit's rule).
const { errors: { isFail } } = require('@atlasbound/kit');

const firstLine = (text) => String(text).trim().split('\n')[0];
/** An error as one line, its code once: kit's `fail` and node's system errors already start their message with it. */
function errorLine({ code, name, message }) {
  const first = firstLine(message);
  return first.startsWith(code || name) ? first : `${code || name}: ${first}`;
}

function saidFailure(io, step, code, err) {
  io.trace.event(io.run, step, { code, msg: isFail(err) ? errorLine(err) : err.name });
  return `  ${code} ${errorLine(err)}`;
}

module.exports = { saidFailure, errorLine, firstLine };
