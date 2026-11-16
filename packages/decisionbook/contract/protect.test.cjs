// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// protect keeps what it says it protects: a folder however it is typed is the folder's files, and an answer that covers no tracked file is refused.
// `debug gate`'s read of this gate judges the file the hook would, with the session and the mode the hook has.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { ROOT, bookWorld, readyOne, editEvent, starting, writeConfig, ruling, wire, begin, added, recordsFor, planRecords } = require('./world.cjs');

const { verbs, handlers, gateRead } = decisionbook;
const TRACKED = ['app/models/user.rb', 'app/views/x.erb', 'lib/a.rb', 'README.md'];
const shellOf = (command) => ({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command }, cwd: ROOT });
const protectedNow = (io) => JSON.parse(io.fs.readText('.decisionbook/config.json')).protect;

test('[I-17] protect: a folder typed in any of its spellings protects its files, for an Edit and a shell write alike',
  async () => {
  for (const word of ['app', 'app/', './app', './app/**', 'app/**']) {
    const io = bookWorld({ tracked: TRACKED });
    const said = await verbs.protect(io, { rest: [word] });
    assert.deepEqual(protectedNow(io), ['app/**'], word);
    assert.match(said.text, /^protected paths: app\/\*\*\nan edit there now needs a READY plan/, word);
    assert.deepEqual(ruling(await handlers.preEdit(editEvent('app/models/user.rb'), io)), ['deny', 'plan-none'], `${word}: an Edit`);
    assert.deepEqual(ruling(await handlers.preShell(shellOf('echo x > app/models/user.rb'), io)), ['deny', 'plan-none'], `${word}: a shell write`);
    assert.deepEqual(ruling(await handlers.preEdit(editEvent('lib/a.rb'), io)), ['allow', 'gate-not-protected'], `${word}: another folder is not`);
  }
});

test('[I-17] protect: a file stays a file; an answer that covers no tracked file is refused and writes nothing', async () => {
  const io = bookWorld({ tracked: TRACKED });
  await verbs.protect(io, { rest: ['README.md, ./lib/'] });
  assert.deepEqual(protectedNow(io), ['README.md', 'lib/**']);
  for (const word of ['ap', 'apps/**', 'app/models/user', 'nothing/']) {
    await assert.rejects(verbs.protect(io, { rest: [`app, ${word}`] }), (err) => err.code === 'protect-refused' && err.message.includes(word), word);
  }
  assert.deepEqual(protectedNow(io), ['README.md', 'lib/**'], 'a refusal writes nothing');
});

test('[I-17] protect of the repository itself, in any spelling, is refused as the whole repository and never crashes', async () => {
  for (const word of ['./', '.', './.']) {
    const io = bookWorld({ tracked: TRACKED });
    await assert.rejects(verbs.protect(io, { rest: [word] }), (err) => err.code === 'protect-refused' && /whole repository/.test(err.message), word);
    assert.equal(io.fs.exists('.decisionbook/config.json'), false, `${word}: a refusal writes nothing`);
  }
});

test('[I-5] a glob of many stars against a long path answers at once: the matcher is a table', async () => {
  const io = bookWorld();
  writeConfig(io, { protect: [`${'*a'.repeat(8)}!`] });
  const started = process.hrtime.bigint();
  assert.deepEqual(ruling(await handlers.preEdit(editEvent('a'.repeat(60)), io)), ['allow', 'gate-not-protected']);
  assert.ok(Number(process.hrtime.bigint() - started) / 1e6 < 300, 'well under the hook\'s limit');
});

test('[I-6] a planned file named like a danger-zone folder is not in it; a file inside the folder is', async () => {
  const io = bookWorld();
  writeConfig(io, { protect: ['src/**'], danger: ['src/auth'] });
  const outside = await readyOne(io, { plans: ['src/author.js'], title: 'Author page' });
  assert.deepEqual([outside.res.out.ready, outside.res.out.level.level, outside.res.out.level.code], [true, 'normal', null]);
  const inside = await readyOne(io, { plans: ['src/auth/login.js'], title: 'Login page' });
  assert.deepEqual([inside.res.out.level.level, inside.res.out.level.code], ['critical', 'level-raised']);
});

test('[I-6] a danger zone typed as a folder is guarded as the level reads it: a file beside it is not in it', async () => {
  for (const zone of ['src/auth', 'src/auth/', 'src/auth/**']) {
    const io = bookWorld();
    writeConfig(io, { danger: [zone] });
    assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/auth/login.js'), io)), ['deny', 'plan-none'], `${zone}: an Edit`);
    assert.deepEqual(ruling(await handlers.preShell(shellOf('echo x > src/auth/login.js'), io)), ['deny', 'plan-none'], `${zone}: a shell write`);
    assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/author.js'), io)), ['allow', 'gate-not-protected'], `${zone}: a file beside it`);
  }
});

const planOf = async (io, word, title) => {
  const id = await begin(io, { title });
  const step = (r) => (r.kind === 'step' ? { ...r, file: 'src/report/export.js:1' } : r);
  for (const record of recordsFor('normal', [word], `.${title.toLowerCase().replace(/\W+/g, '-')}`).map(step)) await added(io, id, record);
  return { id, res: await verbs.ready(io, { rest: [id] }) };
};

test('[I-6] a plan word written plain is the folder it names: too wide, never a pass for every file under it', async () => {
  for (const word of ['src', 'src/', './src', 'src/**']) {
    const io = bookWorld({ tracked: ['src/report/export.js', 'src/a/b/c/deep.js', 'README.md'], begun: null }); // the draft is no session's
    writeConfig(io, { protect: ['src/**'] });
    const { id, res } = await planOf(io, word, 'Report totals');
    assert.deepEqual([res.out.ready, res.out.unmet.map((u) => u.code)], [false, ['ready-no-plan']], word);
    assert.equal(planRecords(io, id).find((r) => r.rel === 'plans').to, 'file:src/**', `${word}: one reading, stored as the glob`);
    assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/a/b/c/deep.js'), io)), ['deny', 'plan-draft-here'], word);
  }
});

test('[I-6] a two-folder plan word is that folder\'s glob and covers only what is inside it; `./` before a file is dropped', async () => {
  const io = bookWorld({ tracked: ['src/report/export.js', 'src/other/x.js'] });
  writeConfig(io, { protect: ['src/**'] });
  const { id, res } = await planOf(io, './src/report', 'Report totals');
  assert.deepEqual([res.out.unmet, planRecords(io, id).find((r) => r.rel === 'plans').to], [[], 'file:src/report/**']);
  assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/report/export.js'), io)), ['allow', 'gate-in-scope']);
  assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/other/db/x.sql'), io)), ['ask', 'plan-out-of-scope'], 'a danger path outside the folder asks');
  // a plain file outside the folder is not covered by the word: the frozen plan takes it in by its own name, one path
  assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/other/x.js'), io)), ['allow', 'plan-grown']);
  assert.deepEqual(planRecords(io, id).filter((r) => r.rel === 'plans').map((r) => r.to), ['file:src/report/**', 'file:src/other/x.js']);
  const file = await planOf(bookWorld({ tracked: ['src/report/export.js'] }), './src/report/export.js', 'Report sums');
  assert.equal(file.res.out.ready, true);
});

test('[I-6] a danger zone or protect word typed with `./` in the config guards what it names, never nothing', async () => {
  for (const config of [{ danger: ['./src/auth'] }, { danger: ['./src/auth/**'] }, { protect: ['./src/**'] }]) {
    const io = bookWorld();
    writeConfig(io, config);
    const said = JSON.stringify(config);
    assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/auth/login.js'), io)), ['deny', 'plan-none'], `${said}: an Edit`);
    assert.deepEqual(ruling(await handlers.preShell(shellOf('echo x > src/auth/login.js'), io)), ['deny', 'plan-none'], `${said}: a shell write`);
    assert.deepEqual(ruling(await handlers.preEdit(editEvent('docs/a.md'), io)), ['allow', 'gate-not-protected'], `${said}: a file outside`);
  }
});

test('[I-3] a shown value cut at its cap never splits a character pair and is marked cut', async () => {
  const io = bookWorld();
  const { id } = await readyOne(io);
  await verbs.add(io, { rest: [id, wire({ t: 'decision', key: 'report.export.big', value: `${'x'.repeat(98)}😀😀 tail`, why: 'w', by: 'Ayse' })] });
  const { text } = await verbs.show(io, { rest: [id, 'decisions'] });
  assert.doesNotMatch(text, /[\ud800-\udbff](?![\udc00-\udfff])/u, 'no lone high surrogate');
  assert.match(text, new RegExp(`${'x'.repeat(98)}~`), 'the cut is marked');
});

test('[I-8] gateRead: an absolute path is the same file the hook judges; its code, and whether it guards the file, are read', async () => {
  const io = bookWorld({ files: { 'app/x.rb': 'x\n' } });
  writeConfig(io, { protect: ['app/**'] });
  const hook = await handlers.preEdit(editEvent('app/x.rb'), io);
  for (const file of [`${ROOT}/app/x.rb`, 'app/x.rb', './app/x.rb']) {
    const read = await gateRead(io, { file });
    assert.deepEqual([read.verdict, read.code, read.guarded], [hook.verdict, hook.code, true], file);
    assert.deepEqual([read.verdict, read.code], ['deny', 'plan-none'], file);
  }
  const free = await gateRead(io, { file: `${ROOT}/docs/a.md` });
  assert.deepEqual([free.verdict, free.code, free.guarded], ['allow', 'gate-not-protected', false]);
});

test('[I-8] gateRead: the mode reaches the gate, so a deny where no one is asked shows too; a read takes no file into the plan', async () => {
  const io = bookWorld({ files: { 'app/x.rb': 'x\n', '.atlasbound/labels/k.one.json': wire({ id: 'k.one' }) } });
  writeConfig(io, { protect: ['app/**'] });
  const { id } = await readyOne(io, { plans: ['app/x.rb'] });
  await handlers.start(starting('s2'), io);
  assert.deepEqual(ruling(await gateRead(io, { file: 'app/x.rb', session: 's1' })), ['allow', 'gate-in-scope'], 'the session that made it READY');
  assert.deepEqual(ruling(await gateRead(io, { file: 'app/x.rb', session: 's2' })), ['allow', 'gate-in-scope'], 'a later session: the same READY plan');
  const held = planRecords(io, id).length;
  assert.deepEqual(ruling(await gateRead(io, { file: 'app/y.rb', session: 's2' })), ['allow', 'plan-grown'], 'what the hook would say of a file outside it');
  assert.equal(planRecords(io, id).length, held, 'a reading writes nothing: the file is not in the plan');
  const hook = await handlers.preEdit({ ...editEvent('app/y.rb'), session_id: 's2' }, io);
  assert.deepEqual([...ruling(hook), planRecords(io, id).length], ['allow', 'plan-grown', held + 1], 'the hook\'s own write of it is what joins the plan');
  assert.deepEqual(ruling(await gateRead(io, { file: 'app/db/schema.rb', session: 's2' })), ['ask', 'plan-out-of-scope']);
  const guardedFile = '.atlasbound/labels/k.one.json';
  assert.deepEqual(ruling(await gateRead(io, { file: guardedFile })), ['ask', 'guarded-person']);
  assert.deepEqual(ruling(await gateRead(io, { file: guardedFile, mode: 'bypassPermissions' })), ['deny', 'guarded-person'], 'where no one is asked');
});

test('[I-23] a step in the plan\'s own word is kept as written: the folder is stored as its glob, a name beside it is outside', async () => {
  const io = bookWorld({ tracked: ['src/report/export.js', 'src/other/x.js'] });
  writeConfig(io, { protect: ['src/**'] });
  const id = await begin(io, { title: 'Report totals' });
  for (const record of recordsFor('normal', ['src/report'], '.report-totals')) await added(io, id, record);
  assert.deepEqual(planRecords(io, id).filter((r) => r.kind === 'step' || r.rel === 'plans').map((r) => r.to || r.file), ['file:src/report/**', 'src/report']);
  assert.equal((await verbs.ready(io, { rest: [id] })).out.ready, true);
  assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/report'), io)), ['allow', 'gate-in-scope'], 'the folder\'s own name is inside its glob');
  assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/reporter.js'), io)), ['allow', 'plan-grown'],
    'a name beside it is never inside the glob: it joins the frozen plan as a file of its own');
  assert.deepEqual(planRecords(io, id).filter((r) => r.rel === 'plans').map((r) => r.to), ['file:src/report/**', 'file:src/reporter.js']);
});

test('[I-6] a one-segment plan word git does not track yet is a folder: too wide, never a pass for the whole folder', async () => {
  const planned = async (io, word) => {
    const id = await begin(io, { title: 'New top' });
    const step = (r) => (r.kind === 'step' ? { ...r, file: word.startsWith('newtop') ? 'newtop/a.js' : word } : r);
    for (const record of recordsFor('normal', [word], '.new-top').map(step)) await added(io, id, record);
    return { id, res: await verbs.ready(io, { rest: [id] }) };
  };
  for (const word of ['newtop', 'newtop/', 'newtop/**']) {
    const io = bookWorld({ tracked: ['src/report/export.js'], begun: null }); // the draft is no session's
    writeConfig(io, { protect: ['newtop/**', 'src/**'] });
    const { id, res } = await planned(io, word);
    assert.deepEqual([res.out.ready, res.out.unmet.map((u) => u.code)], [false, ['ready-no-plan']], word);
    assert.equal(planRecords(io, id).find((r) => r.rel === 'plans').to, 'file:newtop/**', word);
    assert.deepEqual(ruling(await handlers.preEdit(editEvent('newtop/deep/er/x.js'), io)), ['deny', 'plan-draft-here'], word);
  }
  const io = bookWorld({ tracked: ['README.md', 'src/report/export.js'] });
  const { id, res } = await planned(io, 'README.md');
  assert.deepEqual([res.out.ready, planRecords(io, id).find((r) => r.rel === 'plans').to], [true, 'file:README.md'], 'a tracked root file stays a file');
});
