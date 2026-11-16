// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The one code table format + the codes of kit's own primitives. A row is [code, short, rule?]. Every package builds its table
// with createCodes, on top of a base table (default: kit's), because a kit primitive can fail inside any package and the package's
// trace must still know that code. A code is a key here or in a package's contracts/codes; nobody invents a reason string.
const ROWS = [
  ['path-absolute', 'absolute path refused'],
  ['path-outside-repo', 'path outside the repository refused'],
  ['path-empty', 'empty path refused'],
  ['path-link', 'a symbolic or hard link is never written through'],
  ['io-read-failed', 'a file could not be read'],
  ['io-read-too-large', 'a file is past the size this read allows'],
  ['io-read-not-utf8', 'a file holds bytes that are not UTF-8'],
  ['io-write-failed', 'a file could not be written'],
  ['proc-kill-failed', 'a child process group could not be signalled'],
  ['git-failed', 'git did not answer'],
  ['lock-held', 'another run holds the lock'], // the lock's own code (run/lock)
  ['json-invalid', 'not valid JSON'],
  ['shape-invalid', 'not the expected shape'],
  ['trace-invalid', 'not a trace record'],
  ['config-invalid', 'not a valid configuration'],
  ['store-empty', 'nothing published yet'],
  ['not-found', 'no such entry'],
  ['unexpected-error', 'an uncoded error (see the trace step)'],
  // why a shell write is unplaced (text/shell writtenBy `why`)
  ['shell-word-expands', 'the word naming the file expands (a variable, a glob, a command)'],
  ['shell-cd-lost', 'a cd before it went to a folder the text does not name'],
  ['shell-handed', 'the files are handed to it at run time (xargs, find -exec)'],
  ['shell-writes-unnamed', 'the command writes files its words do not name'],
  ['shell-code-path', 'the code builds the path it writes'],
  ['shell-too-deep', 'a command string nested deeper than the reader goes'],
  ['shell-cut-short', 'the reader stopped before the end (time up, a cd too long, code too long)'],
  // the product's own store (base/paths OWN_STORE), here and in the person's home: the write gate and the shell gate
  // (decisionbook) refuse it alike
  ['STORE_SEALED', 'only AtlasBound itself writes here: its state and what a person said', // a short is at most 80
    'Leave it as it is; if something in it looks wrong, say so to the person.'],
  // what has no canonical JSON (base/canonical, RFC 8785)
  ['json-not-finite', 'a number that is not finite has no JSON form'],
  ['json-lone-surrogate', 'a string holds half of a surrogate pair'],
  ['json-not-json', 'a value JSON cannot hold'],
  ['json-duplicate-key', 'an object names one key twice'],
  ['json-too-deep', 'nested deeper than canonical JSON is read'],
  ['json-too-large', 'more bytes than canonical JSON is read'],
  // signatures (base/sign)
  ['signed-type-invalid', 'a signed type is a short lower-case word'],
  ['key-invalid', 'not an Ed25519 key in its carried form'],
  ['signature-invalid', 'the signature does not hold for this type, content and key'],
];

function tableOf(rows, base) {
  const CODES = { ...base };
  rows.forEach(([code, short, rule = null]) => {
    CODES[code] = { short, rule };
  });
  return Object.freeze(CODES);
}

function bind(CODES) {
  const isCode = (code) => typeof code === 'string' && Object.hasOwn(CODES, code);
  return { CODES, isCode, shortOf: (code) => (isCode(code) ? CODES[code].short : null),
    ruleOf: (code) => (isCode(code) ? CODES[code].rule : null) };
}

const KIT = tableOf(ROWS, {});
/** createCodes(rows, base = kit's table) -> { CODES, isCode, shortOf, ruleOf } */
const createCodes = (rows, base = KIT) => bind(tableOf(rows, base));

module.exports = { ...bind(KIT), createCodes };
