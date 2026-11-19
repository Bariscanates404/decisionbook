// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE error owner: `fail` RETURNS a coded Error, so `throw fail(code, msg)` keeps a rethrowing catch visible; the trace writer checks the
// code and cuts the message after the scrub. A failure of the product is an error `fail` made, and nothing else is one: node's own errors
// carry a string `code` too (ENOENT, ERR_INVALID_ARG_TYPE), and one of those is a crash, never a refusal.

const MSG_CAP = 200; // a recorded message names the case, never file content
// the mark `fail` leaves on what it makes; a registered symbol, so every copy of kit one process loads reads the same mark
const MADE_BY_FAIL = Symbol.for('atlasbound.fail');

/** A coded failure: `message` is `<code>: <msg>`, `detail` the msg alone, for a caller that names several failures in one reply. */
function fail(code, msg) {
  const err = new Error(msg === undefined ? code : `${code}: ${msg}`);
  err.code = code;
  err.detail = msg === undefined ? '' : String(msg);
  Object.defineProperty(err, MADE_BY_FAIL, { value: true });
  return err;
}

/** The code a call throws (`unexpected-error` for an error with none), or null where it returns: for a call whose failure is an answer. */
function thrownCode(call) {
  try {
    call();
    return null;
    // eslint-disable-next-line no-restricted-syntax -- not silent: the code IS the answer, to the caller
  } catch (err) {
    return err.code || 'unexpected-error';
  }
}

const isFail = (err, code) => Boolean(err) && err[MADE_BY_FAIL] === true && (code === undefined || err.code === code);

module.exports = { fail, isFail, thrownCode, MSG_CAP };
