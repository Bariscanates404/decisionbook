// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// the terminal port asks a question only where the root's actor (kit's one answer to "who is acting") names a person at this terminal.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTerminal } = require('../../adapters/terminal.cjs');

test('the terminal port says whether a person sits at it, and it asks the actor once', () => {
  const seen = (isPerson) => {
    let asked = 0;
    const terminal = createTerminal({ in: {}, err: { write() {} }, person() {
      asked += 1;
      return isPerson;
    } });
    return [terminal.on, terminal.on, asked];
  };
  assert.deepEqual(seen(true), [true, true, 1]);
  assert.deepEqual(seen(false), [false, false, 1]);
});
