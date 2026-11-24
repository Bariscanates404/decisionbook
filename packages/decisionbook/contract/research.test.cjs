// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Research is the AI's own reading of the code, never a tool's answer. A research record counts only
// where its source names a file of this repository read in the plan's sessions (a Read, or a shell command naming it); a tool's answer
// is stored as a pointer. Critical work needs five such records (no ceiling) and the refusal names the planned files here not read;
// normal work gets one note under three; a small fix nothing. At critical a no-fork item stands for a planned file only once it was read.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, begin, added, recordsFor, unmetOf, planRecords, readFor, readyOne, noForks, stateOf, stepRows: trace, readOf, ROOT } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const FILES = { 'src/report/export.js': 'a\nb\nc\n', 'src/report/csv.js': 'x\n', 'src/report/rows.js': 'r\n' };
const filesWorld = () => bookWorld({ files: FILES });
const bashAt = (command) => ({ ...readOf('', 's1', 'Bash'), hook_event_name: 'PreToolUse', tool_input: { command }, cwd: ROOT }); // session s1
const POINTED = { t: 'research', tool: 'mcp__some-server__examples', asked: 'test patterns', answer: 'request specs use parsed_body',
  source: 'src/report/csv.js:1' };

test('[I-12] a tool\'s answer sent as research is stored as a pointer to what it pointed at, shown, traced, and never counted', async () => {
  const io = filesWorld();
  const id = await begin(io, { level: 'critical' });
  await readFor(io, id, ['src/report/csv.js']); // even a file the session read: the record is the tool's answer, not the reading
  const res = await added(io, id, POINTED);
  const stored = { ...planRecords(io, id).at(-1), at: undefined };
  assert.deepEqual(stored, { at: undefined, t: 'pointer', tool: POINTED.tool, asked: POINTED.asked, answer: POINTED.answer, source: POINTED.source });
  assert.match(res.text, /kept as a pointer, not research \(a tool's answer: mcp__some-server__examples\)/);
  assert.match((await verbs.show(io, { rest: [id, 'pointers'] })).text, /^pointer mcp__some-server__examples: test patterns -> /m);
  assert.deepEqual(trace(io, 'research.pointer').map((r) => [r.ref.tool, r.codes]), [[POINTED.tool, { 'research-pointer': 1 }]]);
  assert.match((await verbs.ready(io, { rest: [id] })).text, /0 of 5 research records cite a file read/, 'a pointer is no research record');
  const asked = { t: 'question', q: 'Q1', text: 'Keep the order?', decides: 'report.order', whyNotCode: 'a product rule', blocking: true };
  await assert.rejects(added(io, id, asked), { code: 'research-first' }, 'a pointer alone is no research before a question');
  for (const tool of ['WebFetch', 'atlasbound-tool', 'mcp__context7__query-docs']) {
    await added(io, id, { ...POINTED, tool });
    assert.equal(planRecords(io, id).at(-1).t, 'pointer', tool);
  }
  await added(io, id, { ...POINTED, tool: 'read' });
  assert.equal(planRecords(io, id).at(-1).t, 'research', 'the AI\'s own reading stays research');
});

test('[I-12] critical READY: five records on files read in its sessions, no ceiling; not READY names the files not read',
  async () => {
  const io = filesWorld();
  const id = await begin(io, { level: 'critical' });
  const records = recordsFor('critical', ['src/report/export.js', 'src/report/csv.js', 'src/report/new.js']);
  const res = await added(io, id, records);
  assert.deepEqual(stateOf(res), 'ready-research', 'every other row holds');
  assert.match(res.text, /\n {2}0 of 5 research records cite a file read in this plan's sessions; the planned files here not read yet: src\/report\/export\.js, src\/report\/csv\.js\n/,
    'one plain list: the planned files that are here (a new file has nothing to read)');
  assert.deepEqual(trace(io, 'ready.research').at(-1).n, { met: 0, asked: 5, notRead: 2 });
  // a shell read where its cd leaves it is a receipt, at PreToolUse; a folder or a word that is no file is none
  await handlers.preShell(bashAt('cd src/report && sed -n 1,40p export.js | grep -n row; ls src; cat nothing.js'), io);
  assert.deepEqual(trace(io, 'research.read').map((r) => [r.ref.file, r.ref.via, Object.keys(r.codes)[0]]), [['src/report/export.js', 'Bash', 'read-by-shell']]);
  await handlers.preShell(bashAt('cat src/report/export.js'), io);
  assert.equal(trace(io, 'research.read').length, 1, 'once per session and file');
  // the PowerShell tool's text is read in its own language (a backslash is a folder's separator) and receipted under its own name
  await handlers.preShell({ ...bashAt('Set-Location src; Get-Content report\\csv.js'), tool_name: 'PowerShell' }, io);
  assert.deepEqual(trace(io, 'research.read').map((r) => [r.ref.file, r.ref.via]).at(-1), ['src/report/csv.js', 'PowerShell']);
  await readFor(io, id, []); // the session shows the plan: its reads are this plan's
  const ready = await verbs.ready(io, { rest: [id] });
  assert.equal(ready.out.ready, true, ready.text);
  assert.deepEqual(trace(io, 'ready.research').at(-1).codes, { 'research-met': 1 });
  const more = await added(io, id, records.filter((r) => r.t === 'research').map((r, i) => ({ ...r, asked: `more ${i}` })));
  assert.equal(more.out.state.ready, true, 'more research is never refused');
});

test('[I-12] the reads of another session count only where that session worked on the plan', async () => {
  const io = filesWorld();
  const id = await begin(io, { level: 'critical' });
  for (const file of Object.keys(FILES)) await handlers.recall({ hook_event_name: 'PostToolUse', session_id: 'other', tool_name: 'Read', tool_input: { file_path: `${ROOT}/${file}` } }, io);
  await added(io, id, recordsFor('critical', ['src/report/export.js']));
  assert.deepEqual(await unmetOf(io, id), ['ready-research'], 'a session that never named this plan');
  await handlers.recall({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Edit', tool_input: { file_path: `${ROOT}/src/report/export.js` } }, io);
  await readFor(io, id, []);
  assert.deepEqual(await unmetOf(io, id), ['ready-research'], 'an edit is no read');
  await readFor(io, id, ['src/report/export.js']);
  assert.deepEqual(await unmetOf(io, id), []);
});

test('[I-12] critical: a no-fork item stands for a planned file only once that file was read in the plan\'s sessions', async () => {
  const io = filesWorld();
  const id = await begin(io, { level: 'critical' });
  await readFor(io, id, ['src/report/export.js']);
  const plans = ['src/report/export.js', 'src/report/csv.js'];
  const asked = recordsFor('critical', plans).filter((r) => !['question', 'decision', 'confirm'].includes(r.t));
  const links = plans.map((file) => ({ t: 'link', rel: 'plans', to: `file:${file}`, why: 'the export' }));
  const res = await added(io, id, [...asked, ...noForks(links), { t: 'confirm', by: 'Amy', said: 'yes' }]);
  assert.equal(stateOf(res), 'ready-answers', res.text);
  assert.match(res.text, /none yet for: src\/report\/csv\.js/, 'the file it did not read');
  await readFor(io, id, ['src/report/csv.js']);
  assert.equal((await verbs.ready(io, { rest: [id] })).out.ready, true);
});

test('[I-12] normal work: one note at READY under three research records on read files, never a refusal; a small fix: nothing', async () => {
  const io = filesWorld();
  const normal = await readyOne(io, { title: 'Normal one' });
  assert.equal(normal.res.out.ready, true);
  assert.match(normal.res.text, /\nnote: 0 of 3 research records cite a file read in this plan's sessions: is the work grounded in the code you read\?\n/);
  const small = await readyOne(io, { title: 'Small one', level: 'micro', plans: ['src/report/export.js'] });
  assert.equal(small.res.out.ready, true);
  assert.doesNotMatch(small.res.text, /research records cite/);
  const read = bookWorld({ files: FILES });
  const id = await begin(read, { title: 'Read one' });
  await readFor(read, id, ['src/report/export.js']);
  for (const record of recordsFor('normal', ['src/report/**'])) await added(read, id, record);
  assert.doesNotMatch((await verbs.ready(read, { rest: [id] })).text, /note:/, 'three read: no note');
});

test('[I-12] show decisions gives a person\'s decision in their own sentence beside the value an AI wrote of it', async () => {
  const io = filesWorld();
  const id = await begin(io);
  const said = 'The setting is the only list. Whatever accepts a reaction name refuses one the setting does not list, with 422.';
  await added(io, id, [{ t: 'research', tool: 'read', asked: 'where names are taken', answer: 'the controller', source: 'src/report/export.js:1' },
    { t: 'question', q: 'Q1', text: 'How do open clients follow a palette change?', decides: 'ui.palette', whyNotCode: 'a product rule', blocking: true },
    { t: 'decision', key: 'ui.palette', value: 'the setting is the only list', why: 'one source', whose: 'person', said, answers: 'Q1', effect: ['check:AC-1'] }]);
  const text = (await verbs.show(io, { rest: [id, 'decisions'] })).text;
  assert.match(text, /- ui\.palette = the setting is the only list \(one source; by Amy\) active; Amy: "The setting is the only list\. Whatever accepts a reaction name refuses one the setting does not list, with 422\."/);
});
