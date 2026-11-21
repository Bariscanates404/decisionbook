// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// the modules are data. What is on and what a choice leaves come from the rows alone: contracts/modules.json holds the open package's
// own, and a module an add-on brings (here: the toy row `extra`, wired only when named) is one more row before them.
const test = require('node:test');
const assert = require('node:assert/strict');
const { MODULES } = require('../../contracts/verbs.cjs');
const core = require('../../core/modules.cjs');

const ROWS = [{ name: 'extra', packages: ['notebook', 'speaker'], optIn: true }, { name: 'handoff', packages: ['handoff'] },
  { name: 'decisionbook', packages: ['decisionbook'], alias: ['db'] }];
const DATA = { base: ['kit', 'telemetry'], modules: ROWS };

test('the shipped file holds the open package\'s two modules and nothing of an add-on, the handoff before the decision book', () => {
  assert.deepEqual(MODULES.modules.map((m) => m.name), ['handoff', 'decisionbook'], 'on /resume-handoff the handoff answers before the decision book');
  assert.deepEqual(MODULES.modules.flatMap((m) => m.packages), ['handoff', 'decisionbook']);
  assert.deepEqual(MODULES.modules.filter((m) => m.optIn || m.from), [], 'every shipped module is wired by a plain setup');
});

test('a base package is always on, a module\'s package only while its module is on; a module the file lacks wires nothing', () => {
  assert.equal(core.isOn(DATA, 'telemetry', []), true);
  assert.equal(core.isOn(DATA, 'decisionbook', ['extra']), false);
  assert.equal(core.isOn(DATA, 'decisionbook', ['decisionbook']), true);
  const without = { ...DATA, modules: ROWS.filter((m) => m.name !== 'decisionbook') };
  assert.equal(core.isOn(without, 'decisionbook', ['extra', 'handoff', 'decisionbook']), false, 'removed from the file, its package is unwired');
});

test('a plain setup, never set up before, wires the shipped modules; a row wired only when named stays off', () => {
  assert.deepEqual(core.choose(MODULES.modules, {}, null), { on: ['handoff', 'decisionbook'] });
  assert.deepEqual(core.choose([ROWS[0], ...MODULES.modules], {}, null), { on: ['handoff', 'decisionbook'] });
});

test('setup\'s choice: --only and --without by name or alias; an unknown name or nothing left is refused', () => {
  assert.deepEqual(core.choose(ROWS, { only: 'db,handoff' }, null), { on: ['handoff', 'decisionbook'] });
  assert.deepEqual(core.choose(ROWS, { only: 'extra' }, null), { on: ['extra'] }, 'an optIn module named by --only is on');
  assert.deepEqual(core.choose(ROWS, { without: 'extra' }, null), { on: ['handoff', 'decisionbook'] });
  assert.equal(core.choose(ROWS, { only: 'extra,nope' }, null).refused, 'no module is called nope');
  assert.match(core.choose(ROWS, { without: 'extra,db,handoff' }).refused, /^that choice leaves no module on/);
  assert.match(core.choose(ROWS, { only: ',' }, null).refused, /^that choice leaves no module on/);
});

test('setup\'s choice with no flag: never set up, every module that is not optIn; set up before, the stored choice as it is', () => {
  assert.deepEqual(core.choose(ROWS, {}, null), { on: ['handoff', 'decisionbook'] });
  assert.deepEqual(core.choose(ROWS, {}, ['extra', 'handoff', 'decisionbook']), { on: ['extra', 'handoff', 'decisionbook'] }, 'extra stays on');
  assert.deepEqual(core.choose(ROWS, {}, ['decisionbook']), { on: ['decisionbook'] }, 'an off module stays off');
});

test('setup --with: the modules on here and the named, so one switched off stays off; with --only or --without it is refused', () => {
  assert.deepEqual(core.choose(ROWS, { with: 'extra' }, null), { on: ['extra', 'handoff', 'decisionbook'] }, 'never set up: the plain set and the named');
  assert.deepEqual(core.choose(ROWS, { with: 'extra' }, ['decisionbook']), { on: ['extra', 'decisionbook'] }, 'handoff, switched off, stays off');
  assert.deepEqual(core.choose(ROWS, { with: 'handoff' }, ['decisionbook']), { on: ['handoff', 'decisionbook'] }, 'named, it is on again');
  assert.equal(core.choose(ROWS, { with: 'nope' }, null).refused, 'no module is called nope');
  for (const flags of [{ only: 'db', without: 'extra' }, { with: 'extra', only: 'db' }, { with: 'extra', without: 'handoff' }]) {
    assert.equal(core.choose(ROWS, flags, null).refused, 'one of --only, --without or --with, not two', Object.keys(flags).join(' '));
  }
});

test('modules on|off over the stored set, a word by name or alias; the last one off is refused', () => {
  assert.deepEqual(core.toggled(ROWS, ['decisionbook'], 'on', 'handoff'), { on: ['handoff', 'decisionbook'] });
  assert.deepEqual(core.toggled(ROWS, ['handoff', 'decisionbook'], 'off', core.byWord(ROWS, 'db').name), { on: ['handoff'] });
  assert.match(core.toggled(ROWS, ['handoff'], 'off', 'handoff').refused, /^handoff is the last module on here; atlasbound uninstall/);
  assert.equal(core.byWord(ROWS, 'nope'), null);
});

test('a module is installed when any of its packages is on disk', () => {
  assert.deepEqual(core.installedOf(ROWS, (pkg) => ['speaker', 'decisionbook'].includes(pkg)), ['extra', 'decisionbook']);
});

test('what moves between two wired sets: each hook as event package.handler, each command, each MCP server, nothing else', () => {
  const decisionbook = { name: 'decisionbook', hooks: [{ event: 'Stop', handler: 'stop' }], commands: [{ dest: '.claude/commands/decisionbook.md' }] };
  const server = { name: 'speaker', mcp: { servers: [{ name: 'ab-one', args: ['serve', 'one'], tools: ['look'] }] } };
  assert.deepEqual(core.changeOf([decisionbook], [server]), {
    added: { hooks: [], commands: [], servers: ['ab-one'] },
    removed: { hooks: ['Stop decisionbook.stop'], commands: ['.claude/commands/decisionbook.md'], servers: [] } });
});

test('a row only an off module answers says one line naming that module; no off module reached, nothing', () => {
  assert.deepEqual(core.offItem(ROWS, [{ pkg: 'handoff' }], 'it does nothing'), { key: 'module-off', text: 'atlasbound: module-off handoff: it does nothing' });
  assert.equal(core.offItem(ROWS, [], 'x'), null);
});
