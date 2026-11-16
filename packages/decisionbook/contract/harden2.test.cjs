// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// black box: three holds of the DecisionBook gate. A READY plan this machine never said yes to lowers no deny:
// its one ask comes before the plan's own. A protect policy that cannot be read (torn, a link) makes every write the person's, never a quiet allow. The
// gate judges the file the disk writes, never the spelling. And the rule for a new label: a label file written where
// none was is free; a label already there stays the person's.
const test = require('node:test');
const assert = require('node:assert/strict');
const nodeFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const kit = require('@atlasbound/kit');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, readyOne, editEvent, asMode, writeConfig, wire, ruling, textOf, planRecords } = require('./world.cjs');

const { handlers } = decisionbook;
const CONFIG = '.decisionbook/config.json';
const LABELS = '.atlasbound/labels';
const MODES = [[undefined, 'ask'], ['default', 'ask'], ['acceptEdits', 'ask'], ['plan', 'ask'], ['bypassPermissions', 'deny'], ['auto', 'deny'],
  ['dontAsk', 'deny']];
/** A write tool's event naming a host path as it is spelled. */
const writing = (hostPath, content = '{}', tool = 'Write') => ({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: tool,
  tool_input: { file_path: hostPath, content } });

/** A READY plan made on another machine, its file committed here by Mallory; src/** is protected. -> { io, id, file } */
async function committed() {
  const theirs = bookWorld();
  const { id } = await readyOne(theirs, { plans: ['src/report/**'] });
  const file = `.decisionbook/${id}.jsonl`;
  const io = bookWorld({ files: { [file]: theirs.fs.readText(file) }, authors: { [file]: 'Mallory' } });
  writeConfig(io, { protect: ['src/**'] });
  return { io, id, file };
}

/** A real repository (links and case need a disk) beside a home file: src/a.js and src/**, db/** protected, a locked label. -> { at, root, io } */
function diskRepo() {
  const at = nodeFs.realpathSync(nodeFs.mkdtempSync(path.join(os.tmpdir(), 'harden2-plan-')));
  const root = path.join(at, 'repo');
  for (const dir of ['.decisionbook', 'src', 'lib', LABELS]) nodeFs.mkdirSync(path.join(root, dir), { recursive: true });
  nodeFs.writeFileSync(path.join(root, CONFIG), wire({ protect: ['src/**'] }));
  nodeFs.writeFileSync(path.join(root, 'src', 'a.js'), 'a\n');
  nodeFs.writeFileSync(path.join(root, LABELS, 'b.door.json'), wire({ id: 'b.door', note: 'a label', lock: 'firm' }));
  nodeFs.writeFileSync(path.join(at, 'outside.js'), 'x\n');
  return { at, root, io: { ...bookWorld(), fs: kit.io.createFs(root), root } };
}

test('a READY plan that came with a commit lowers no deny: its one ask comes first, also for a file outside its plan',
  async () => {
  const { io, id, file } = await committed();
  const outside = { ...editEvent('src/billing/pay.js'), tool_use_id: 'tu1' };
  const first = await handlers.preEdit(outside, io);
  assert.deepEqual([...ruling(first), first.plan], ['ask', 'plan-not-here', id], 'not the plan\'s own out-of-scope ask: the plan is no one\'s here yet');
  assert.match(first.reason,
    /^DecisionBook gate: plan-not-here: src\/billing\/pay\.js: this READY plan was not confirmed on this machine[^]*\(it came with a commit from Mallory\)$/);
  assert.deepEqual(ruling(await handlers.preEdit(asMode(outside, 'bypassPermissions'), io)), ['deny', 'plan-not-here'],
    'where the host asks no one: a deny, as with no plan');
  assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/report/db/rows.sql'), io)), ['deny', 'plan-not-critical'],
    'the plan\'s own deny stands first: no yes opens it');
  assert.equal((await handlers.postEdit({ ...outside, hook_event_name: 'PostToolUse' }, io)).code, 'trust-kept', 'the person said yes to the one ask');
  const joined = () => planRecords(io, id).filter((r) => r.t === 'link' && r.source).map((r) => [r.rel, r.to, r.source]);
  assert.deepEqual(joined(), [], 'nothing joined the plan while it was no one\'s here');
  assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/billing/db/rows.sql'), io)), ['ask', 'plan-out-of-scope'],
    'then the plan\'s own ask follows: a danger path outside it is still the person\'s');
  // READY is the freeze. Only after the person's yes to the one ask, a plain protected file outside the plan joins it
  const grown = await handlers.preEdit(editEvent('src/billing/pay.js'), io);
  assert.deepEqual(ruling(grown), ['allow', 'plan-grown']);
  assert.equal(grown.context, `DecisionBook: src/billing/pay.js was outside plan ${id}; the plan is frozen and took it in (one line added to it). Nothing to do.`);
  assert.deepEqual(joined(), [['plans', 'file:src/billing/pay.js', 'the gate: written under the READY plan']],
    'the product wrote the one line, the danger path none');
  assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/billing/pay.js'), io)), ['allow', 'gate-in-scope'], 'it is the plan\'s now');
  assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/report/a.js'), io)), ['allow', 'gate-in-scope']);
  // a commit readies it again with a plan of nothing
  io.fs.append(file, `${wire({ t: 'ready', scope: [], level: 'normal', at: '2026-11-02T07:00:00.000Z' })}\n`);
  for (const [mode, verdict] of MODES) {
    assert.deepEqual(ruling(await handlers.preEdit(asMode(editEvent('src/a.js'), mode), io)), [verdict, 'plan-not-here'], `a plan of nothing in ${mode}`);
  }
});

test('a protect policy that cannot be read makes every write the person\'s, and the session start says so',
  async () => {
  const io = bookWorld();
  writeConfig(io, { protect: ['src/**'] });
  assert.doesNotMatch(textOf(await handlers.session({ hook_event_name: 'SessionStart', session_id: 's1' }, io)),/cannot be read/,
    'a readable policy: nothing to tell');
  io.fs.writeAtomic(CONFIG, '{ torn');
  for (const file of ['src/a.js', 'README.md', CONFIG]) {
    for (const [mode, verdict] of MODES) {
      const said = await handlers.preEdit(asMode(editEvent(file), mode), io);
      assert.deepEqual(ruling(said), [verdict, 'policy-unreadable'], `${file} in ${mode}`);
      assert.match(said.reason, new RegExp(`^DecisionBook gate: policy-unreadable: ${file.replace(/\./g,
        '\\.')}: the protect policy in \\.decisionbook/config\\.json cannot be read, so every write asks the person until it is repaired \\(policy-unreadable: SyntaxError\\)`));
      if (verdict === 'deny') assert.match(said.reason, /the gate cannot ask: tell the person what you want and why/);
    }
  }
  const started = await handlers.session({ hook_event_name: 'SessionStart', session_id: 's1' }, io);
  assert.deepEqual([started.code, started.verdict], ['policy-unreadable', 'allow']);
  assert.match(textOf(started),
    /^Tell the person: what DecisionBook protects here changed since the last session: no longer protected: src\/\*\*; the config cannot be read, so every write asks the person until it is repaired\.$/m);
  assert.match(textOf(started),
    /^Tell the person: the protect policy in \.decisionbook\/config\.json cannot be read, so every write asks the person until it is repaired \(policy-unreadable: SyntaxError\)\.$/m);
  for (const verb of ['find', 'resume']) { // the readers keep answering and name the config they could not read
    assert.deepEqual((await decisionbook.verbs[verb](io, { rest: ['x'] })).out.refused, [{ id: CONFIG, code: 'policy-unreadable' }], `${verb}: names the unreadable config`);
  }
  assert.equal((await decisionbook.verbs.find(io, { rest: ['x'] })).text, 'nothing found\nnot read: .decisionbook/config.json (policy-unreadable)\n', 'never a bare nothing found');
  const { at, root, io: disk } = diskRepo();
  nodeFs.writeFileSync(path.join(at, 'home.json'), wire({ protect: [] }));
  nodeFs.rmSync(path.join(root, CONFIG));
  nodeFs.symlinkSync(path.join(at, 'home.json'), path.join(root, CONFIG));
  assert.deepEqual(ruling(await handlers.preEdit(writing(path.join(root, 'src', 'a.js')), disk)), ['ask', 'policy-unreadable'],
    'a committed link: the policy it points at is never read');
  assert.match(textOf(await handlers.session({ hook_event_name: 'SessionStart', session_id: 's1' }, disk)),
    /cannot be read, so every write asks the person until it is repaired \(path-link: [^)]*\)\.$/m);
});

test('a policy word the gate does not read asks on every write and names that word, never a quiet nothing-protected',
  async () => {
  const io = bookWorld();
  writeConfig(io, { protected: ['src/**'], danger: [] });
  const said = await handlers.preEdit(editEvent('src/a.js'), io);
  assert.deepEqual(ruling(said), ['ask', 'policy-unreadable'], 'an unknown policy word asks, never a quiet allow');
  assert.match(said.reason, /cannot be read, so every write asks the person until it is repaired \(policy-word-unknown: protected: the policy's words are protect, danger, answer\)/);
  assert.match(textOf(await handlers.session({ hook_event_name: 'SessionStart', session_id: 's1' }, io)), /\(policy-word-unknown: protected: /m);
  writeConfig(io, { protect: ['src/**'], danger: [], answer: { answer: 'chosen', door: 'protect-command', at: '2026-11-09T00:00:00.000Z' } });
  assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/a.js'), io)), ['deny', 'plan-none'], 'the three words the policy holds stay readable');
});

test('the gate judges the file the disk writes: a case variant, a dot-dot and a link meet the file\'s own rung',
  async () => {
  const { at, root, io } = diskRepo();
  nodeFs.symlinkSync('../src/a.js', path.join(root, 'lib', 'link.js'));
  nodeFs.symlinkSync(CONFIG, path.join(root, 'policy.json'));
  nodeFs.symlinkSync(root, path.join(at, 'alias'));
  nodeFs.symlinkSync(path.join(at, 'outside.js'), path.join(root, 'lib', 'away.js'));
  const folds = nodeFs.existsSync(path.join(root, 'SRC', 'A.JS'));
  const guarded = [['src/a.js', 'src/a.js'], ['lib/link.js', 'src/a.js'], ['lib/../src/a.js', 'src/a.js'], ['src/new/deep.js', 'src/new/deep.js'],
    ...(folds ? [['SRC/A.JS', 'src/a.js'], ['Src/new.js', 'src/new.js']] : [])];
  for (const [spelled, file] of guarded) {
    const said = await handlers.preEdit(writing(`${root}/${spelled}`, 'x'), io); // as spelled: path.join would apply the `..` itself
    assert.deepEqual([...ruling(said), said.file], ['deny', 'plan-none', file], spelled);
  }
  assert.deepEqual(ruling(await handlers.preEdit(writing(path.join(at, 'alias', 'src', 'a.js'), 'x'), io)), ['deny', 'plan-none'],
    'the root named through a link');
  if (folds) assert.deepEqual(ruling(await handlers.preEdit(writing(path.join(root.toUpperCase(), 'src', 'a.js'), 'x'), io)), ['deny', 'plan-none'],
    'the root in another case');
  for (const spelled of ['policy.json', 'src/../.decisionbook/config.json', ...(folds ? ['.DECISIONBOOK/CONFIG.JSON', '.DecisionBook/config.json'] : [])]) {
    for (const [mode, verdict] of [['default', 'ask'], ['bypassPermissions', 'deny']]) {
      const said = await handlers.preEdit(asMode(writing(`${root}/${spelled}`), mode), io);
      assert.deepEqual([...ruling(said), said.file], [verdict, 'policy-narrowed', CONFIG], `${spelled} emptying the policy, ${mode}`);
    }
  }
  if (folds) assert.deepEqual(ruling(await handlers.preEdit(writing(path.join(root, '.atlasbound', 'LABELS', 'b.door.json')), io)),
    ['ask', 'guarded-person'], 'a label already there, in another case');
  const away = await handlers.preEdit(writing(path.join(root, 'lib', 'away.js'), 'x'), io);
  assert.deepEqual([...ruling(away), away.file], ['allow', 'gate-not-protected', 'lib/away.js'], 'a link out of the repository is the name it has here');
  assert.deepEqual(ruling(await handlers.preEdit(writing(path.join(at, 'outside.js'), 'x'), io)), ['allow', 'gate-not-write-tool'],
    'a file outside the repository is not the gate\'s');
});

test('a hard link of a guarded file is that file, inside the repository or out of it: the gate denies it as it denies the file',
  async () => {
  const { at, root, io } = diskRepo();
  io.state.tracked = ['src/a.js', 'lib/free.js'];
  nodeFs.writeFileSync(path.join(root, 'lib', 'free.js'), 'f\n');
  const links = [path.join(root, 'hl.js'), path.join(at, 'out-hl.js')];
  links.forEach((link) => nodeFs.linkSync(path.join(root, 'src', 'a.js'), link));
  nodeFs.linkSync(path.join(root, 'lib', 'free.js'), path.join(root, 'free2.js'));
  for (const link of links) {
    const said = await handlers.preEdit(writing(link, 'x'), io);
    assert.deepEqual([...ruling(said), said.file], ['deny', 'plan-none', 'src/a.js'], link);
  }
  const free = await handlers.preEdit(writing(path.join(root, 'free2.js'), 'x'), io);
  assert.deepEqual([...ruling(free), free.file], ['allow', 'gate-not-protected', 'free2.js'], 'two names of a file nothing guards: itself');
  const shell = { hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', cwd: root, tool_input: { command: 'echo x > hl.js' } };
  assert.deepEqual(ruling(await handlers.preShell(shell, io)), ['deny', 'plan-none'], 'a shell command that writes through the link');
});

test('a relative write path is the host\'s cwd\'s, not the root\'s, so a subfolder meets the right rung',
  async () => {
  const io = bookWorld();
  writeConfig(io, { protect: ['src/**'] });
  const from = (cwd, file, tool = 'Write') => ({ ...writing(file, '{}', tool), cwd });
  for (const [mode, verdict] of [['default', 'ask'], ['bypassPermissions', 'deny']]) {
    const said = await handlers.preEdit(asMode(from('/fake/src', '../.decisionbook/config.json'), mode), io);
    assert.deepEqual([...ruling(said), said.file], [verdict, 'policy-narrowed', CONFIG], `the policy emptied from src/, ${mode}`);
  }
  const edit = await handlers.preEdit(from('/fake/lib', '../src/a.js', 'Edit'), io);
  assert.deepEqual([...ruling(edit), edit.file], ['deny', 'plan-none', 'src/a.js'], 'a protected file named from lib/');
  assert.deepEqual([...ruling(await handlers.preEdit(writing('src/a.js', 'x'), io)), 'root'], ['deny', 'plan-none', 'root'],
    'an event with no cwd: the root\'s');
  const { io: theirs, id } = await committed();
  const asked = { ...from('/fake/src', 'billing/pay.js', 'Edit'), tool_use_id: 'tu1' };
  const first = await handlers.preEdit(asked, theirs);
  assert.deepEqual([...ruling(first), first.file, first.plan], ['ask', 'plan-not-here', 'src/billing/pay.js', id], 'from src/: the file under it');
  assert.equal((await handlers.postEdit({ ...asked, hook_event_name: 'PostToolUse' }, theirs)).code, 'trust-kept', 'the PostToolUse yes reads the same file');
});

test('a new label file is free only when it adds: one naming a lock, taking over another label or unreadable is the person\'s',
  async () => {
  const label = `${LABELS}/b.door.json`;
  const fresh = `${LABELS}/d.new.json`;
  const io = bookWorld({ files: { [label]: wire({ id: 'b.door', note: 'a label', lock: 'firm' }) } });
  const adds = wire({ id: 'd.new', note: 'a label' });
  const lowers = [wire({ id: 'd.new', takes: 'x' }), wire({ id: 'd.new', lock: 'none' }), wire({ id: 'd.new', joins: 'door' }), '{ torn'];
  for (const [mode, verdict] of MODES) {
    assert.deepEqual(ruling(await handlers.preEdit(asMode(writing(`/fake/${fresh}`, adds), mode), io)), ['allow', 'gate-off'],
      `a new label that adds, in ${mode}`);
    for (const text of lowers) assert.deepEqual(ruling(await handlers.preEdit(asMode(writing(`/fake/${fresh}`, text), mode), io)), [verdict, 'guarded-person'],
      `a new ${text} in ${mode}`);
    assert.deepEqual(ruling(await handlers.preEdit(asMode(editEvent(fresh), mode), io)), [verdict, 'guarded-person'],
      `an Edit making a label, its text unknown, in ${mode}`);
    assert.deepEqual(ruling(await handlers.preEdit(asMode(editEvent(label, 'Write'), mode), io)), [verdict, 'guarded-person'], `the label there, in ${mode}`);
  }
  writeConfig(io, { protect: ['src/**'] });
  assert.deepEqual(ruling(await handlers.preEdit(writing(`/fake/${fresh}`, adds), io)), ['allow', 'gate-not-protected'],
    'and the ladder as for any other file');
});
