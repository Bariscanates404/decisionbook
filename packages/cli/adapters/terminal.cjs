// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE terminal port: one question to a person, one line back. Nothing asks unless kit's one answer to "who is acting" names a person at
// this terminal (`on`); a verb's own question is its grave act's typed phrase, which the cli asks through it (steps/person).
const readline = require('node:readline');

/** The question goes to stderr so --json stays one document. `person()`: whether a person sits at this terminal (the root's actor),
 * asked once. */
function createTerminal({ in: input, err, person }) {
  let lines = null;
  let seated = null;
  const open = () => lines || (lines = readline.createInterface({ input, terminal: false })[Symbol.asyncIterator]());
  const close = () => lines && lines.return();
  async function ask(question) {
    err.write(question);
    const { value, done } = await open().next();
    return done ? null : value.trim();
  }
  const isPerson = () => (seated ??= person());
  return { get on() {
    return isPerson();
  }, ask, close };
}

module.exports = { createTerminal };
