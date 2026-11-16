// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// A capability that is gone is said, never silent: debug doctor holds every verb, hook and
// free MCP tool the product promises against the code that answers it; a removed function is `capability-missing`, an absent package says so.
const test = require('node:test');
const assert = require('node:assert/strict');
const { capabilitiesOf } = require('../../core/capabilities.cjs');

const VERB_ROWS = [{ words: ['toy', 'make'], pkg: 'maker', call: 'make' }, { words: ['debug', 'toy'], pkg: 'maker', call: 'debug.toy' },
  { words: ['debug', 'speak'], pkg: 'speaker', call: 'debug.speak', render: 'debug.render' }, { words: ['setup'], run: 'setup' }];
const MANIFESTS = [{ name: 'gatekeeper', hooks: [{ event: 'PreToolUse', handler: 'preEdit' }] }, { name: 'speaker', mcp: { free: ['look', 'walk'] } }];
const fn = () => null;

test('a verb, hook or MCP tool the product promises whose code is gone is capability-missing; the rest answer', () => {
  const entries = { maker: { debug: { toy: fn } }, gatekeeper: { handlers: { preEdit: fn } }, speaker: { debug: { speak: fn }, TOOLS: [{ name: 'look' }] } };
  const rows = capabilitiesOf({ verbs: VERB_ROWS, manifests: MANIFESTS, entryOf: (name) => ({ entry: entries[name] }) });
  assert.deepEqual(rows.map((r) => [r.what, r.needs, r.state]), [
    ['verb toy make', 'make', 'capability-missing'], ['verb debug toy', 'debug.toy', 'answers'], ['verb debug speak', 'debug.speak', 'answers'],
    ['verb debug speak', 'debug.render', 'capability-missing'], ['hook PreToolUse gatekeeper.preEdit', 'handlers.preEdit', 'answers'],
    ['mcp tool look', 'TOOLS look', 'answers'], ['mcp tool walk', 'TOOLS walk', 'capability-missing']]);
});

test('a package that is not installed says so for each promise of it, never capability-missing', () => {
  const rows = capabilitiesOf({ verbs: VERB_ROWS.slice(0, 2), manifests: [], entryOf: () => ({ state: 'not-installed' }) });
  assert.deepEqual(rows.map((r) => r.state), ['not-installed', 'not-installed']);
});

