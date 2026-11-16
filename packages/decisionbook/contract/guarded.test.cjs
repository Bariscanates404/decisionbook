// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The rule for a folder a package declares guarded (a toy one here: its files are labels, a label's `lock` holds a protection): the AI
// may change a label only after the person's yes, every time; where the host asks no one it is denied with the words to ask. A shell
// command never reaches the gate, so a session start says when a label's lock changed. Where no package declares a folder the rung is off.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, editEvent, writeConfig, wire, textOf } = require('./world.cjs');

const { handlers } = decisionbook;
const LABELS = '.atlasbound/labels';
const LABEL = `${LABELS}/b.door.json`;
const MODES = [[undefined, 'ask'], ['default', 'ask'], ['acceptEdits', 'ask'], ['plan', 'ask'], ['bypassPermissions', 'deny'], ['auto', 'deny'],
  ['dontAsk', 'deny']];
const labelOf = (id, lock) => wire({ id, note: 'a label', ...(lock ? { lock } : {}) });
const startIn = (io, source = 'startup') => handlers.session({ hook_event_name: 'SessionStart', session_id: 's1', source }, io);

test('a write tool on a guarded folder\'s label asks the person every time, in every mode; a new label or a shell command never',
  async () => {
  const io = bookWorld({ files: { [LABEL]: labelOf('b.door', 'firm') } }); // no .decisionbook/config.json: nothing protected, and still asked (every install)
  const writes = [editEvent(LABEL), editEvent(LABEL, 'Write'), editEvent(LABEL, 'MultiEdit'),
    { ...editEvent(LABEL, 'NotebookEdit'), tool_input: { notebook_path: `/fake/${LABEL}` } }];
  for (const event of writes) {
    const file = event.tool_input.file_path || event.tool_input.notebook_path;
    for (const [mode, verdict] of MODES) {
      const said = await handlers.preEdit({ ...event, permission_mode: mode }, io);
      assert.deepEqual([said.verdict, said.code, said.file], [verdict, 'guarded-person', file.slice('/fake/'.length)], `${event.tool_name} in ${mode}`);
      assert.match(said.reason,
        /^DecisionBook gate: guarded-person: \.atlasbound\/labels\/b\.door\.json: this changes a file only the person changes, so the person says yes to it, every time \(a label decides what a write may change\)/);
      const instead = /the gate cannot ask: tell the person[^]*\(atlasbound protect, in their own terminal, or an editor\)/;
      if (verdict === 'deny') assert.match(said.reason, instead);
      assert.doesNotMatch(said.reason, /a new label:/, 'no package handed a way to make a label, so DecisionBook names none');
    }
    assert.equal((await handlers.preEdit(event, io)).code, 'guarded-person', 'asked again: nothing is remembered');
  }
  const adding = { ...editEvent(`${LABELS}/d.new.json`, 'Write'), tool_input: { file_path: `/fake/${LABELS}/d.new.json`, content: labelOf('d.new') } };
  assert.equal((await handlers.preEdit(adding, io)).code, 'gate-off',
    'a label file written where none was that only adds lowers nothing (one naming a lock is the person\'s)');
  assert.equal((await handlers.preEdit(editEvent('.atlasbound/label-draft.json', 'Write'), io)).code, 'gate-off', 'the draft is outside the folder');
  assert.equal((await handlers.preEdit({ ...editEvent(LABEL), tool_name: 'Bash', tool_input: { command: `rm ${LABEL}` } }, io)).code, 'gate-not-write-tool',
    'a shell command never reaches the gate');
  writeConfig(io, { protect: ['src/**'] });
  assert.equal((await handlers.preEdit(editEvent(LABEL), io)).code, 'guarded-person', 'before every rung of the ladder');
  assert.equal((await handlers.preEdit(editEvent('src/a.js'), io)).code, 'plan-none', 'the ladder as it was for every other file');
  const noGuard = bookWorld({ files: { [LABEL]: labelOf('b.door', 'firm') }, guarded: () => null });
  assert.equal((await handlers.preEdit(editEvent(LABEL), noGuard)).code, 'gate-off', 'an install where no package declares a guarded folder guards none');
});

test('the session start tells when a label\'s lock changed since the last session here',
  async () => {
  const io = bookWorld({ files: { [LABEL]: labelOf('b.door', 'firm'), [`${LABELS}/a.desk.json`]: labelOf('a.desk', 'soft'),
    [`${LABELS}/c.lamp.json`]: labelOf('c.lamp'), [`${LABELS}/e.off.json`]: labelOf('e.off', 'none') } });
  assert.doesNotMatch(textOf(await startIn(io)), /changed since/, 'the first session here has nothing to compare');
  assert.doesNotMatch(textOf(await startIn(io)), /changed since/, 'unchanged: nothing');
  io.fs.writeAtomic(LABEL, labelOf('b.door', 'none')); // a shell write: the gate never saw any of these
  io.fs.remove(`${LABELS}/a.desk.json`);
  io.fs.writeAtomic(`${LABELS}/c.lamp.json`, labelOf('c.lamp', 'firm'));
  io.fs.writeAtomic(`${LABELS}/e.off.json`, labelOf('e.off'));
  const said = await startIn(io);
  assert.match(textOf(said),
    /^Tell the person: what DecisionBook protects here changed since the last session: no longer protected: label a\.desk \(lock soft\), label b\.door \(lock firm\); newly protected: label c\.lamp \(lock firm\)\.$/m);
  assert.deepEqual([said.code, said.verdict], ['session-unprotected', 'allow'], 'said where nothing else is protected, too');
  assert.doesNotMatch(textOf(await startIn(io)), /changed since/, 'said once');
  io.fs.writeAtomic(`${LABELS}/c.lamp.json`, wire({ id: 'c.lamp', lock: 'firm', note: 'changed', more: ['m'] }));
  io.fs.writeAtomic(`${LABELS}/a.torn.json`, '{ not json');
  assert.doesNotMatch(textOf(await startIn(io)), /changed since/, 'a label whose lock stands, and a torn one, protect nothing new');
  writeConfig(io, { protect: ['src/**'] });
  io.fs.remove(`${LABELS}/c.lamp.json`);
  assert.match(textOf(await startIn(io)),
    /changed since the last session: no longer protected: label c\.lamp \(lock firm\); newly protected: src\/\*\*\.$/m,
      'one line for the policy and the labels together');
});

test('a refused label edit says how to make a new label only in the words the root hands from the package that has that verb', async () => {
  const way = "a new label: the package's own command, in the person's own terminal";
  const io = bookWorld({ files: { [LABEL]: labelOf('b.door', 'firm') }, guardedWay: way });
  for (const [mode] of [MODES[0], MODES[4]]) {
    const said = await handlers.preEdit({ ...editEvent(LABEL), permission_mode: mode }, io);
    assert.ok(said.reason.includes(`every time (a label decides what a write may change; ${way})`), `${mode}: ${said.reason}`);
  }
});
