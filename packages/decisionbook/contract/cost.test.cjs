// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// a plan costs what the work is worth. Only the public entry and kit's fake io.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld: world, begin, added, writeConfig, readyOne, starting, textOf, lastN, recordsFor, planRecords, theirAnswer, LEVEL_KEPT } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const { WORDS } = decisionbook.codes;

test('a plan of only tests, fixtures or docs may be micro at any size; a source file or a danger zone still raises it', async () => {
  const io = world();
  writeConfig(io, { danger: ['test/payroll/**'] });
  const plan = async (paths) => {
    const id = await begin(io, { title: `plan ${paths.join(' ')}`, level: 'micro' });
    for (const to of paths) await added(io, id, { t: 'link', rel: 'plans', to: `file:${to}`, why: 'w' });
    const { level } = (await verbs.show(io, { rest: [id, 'plan'] })).out;
    return [level.proposed, level.level, level.code];
  };
  const unit = ['test/sched-unit/urgency/*.js', 'test/sched-unit/fixtures/a.json', 'test/sched-unit/b.test.js', 'docs/sched.md'];
  assert.deepEqual(await plan(unit), ['micro', 'micro', null], 'a glob of tests, a fixture, a test and a doc: still a small fix');
  assert.deepEqual(await plan([...unit, 'lib/sched/urgency.js']), ['micro', 'normal', 'level-micro-rejected'], 'one source file among them: every path counts again');
  assert.deepEqual(await plan(['lib/sched/*.js', 'test/sched-unit/b.test.js']), ['micro', 'normal', 'level-micro-rejected'], 'a glob of source counts');
  assert.deepEqual(await plan(['test/payroll/pay.test.js']), ['micro', 'critical', 'level-raised'], 'a danger zone inside the tests keeps its force');
});

test('an earlier session\'s READY plan is the start\'s intake: frozen, files, steps, research, settled; a task prompt adds none',
  async () => {
  const io = world({ files: { 'app/x.rb': 'class X\n' } });
  writeConfig(io, { protect: ['app/**'] });
  const { id } = await readyOne(io, { plans: ['app/x.rb'] });
  await added(io, id, [{ t: 'question', q: 'Q8', text: 'which page size?', decides: 'report.page', whyNotCode: 'a product rule', blocking: false },
    theirAnswer('Q8', 'report.page', '50 rows', 'Fifty rows a page, as the old report had.'),
    { t: 'question', q: 'Q9', text: 'which colour?', decides: 'report.colour', whyNotCode: 'a product rule', blocking: false },
    theirAnswer('Q9', 'report.colour', 'Blue, like the logo.', 'Blue, like the logo.'),
    { t: 'decision', key: 'report.cache', value: 'none', why: 'simplest', whose: 'assumed' }]);
  await handlers.start(starting('s2'), io);
  const start = textOf(await handlers.session(starting('s2'), io));
  // one text a new session builds from: no session reads the plan again to find what is left, what was found or what was said
  assert.deepEqual(start.split('\n'), [`Plan ${id} READY on feat/export: Report export is slow`, WORDS.frozen, WORDS.data, LEVEL_KEPT,
    'why: large exports time out', 'files: app/x.rb',
    'steps:', '- step 1 app/x.rb: stream the rows (verify AC-1)',
    'found by the research:', ...[1, 2, 3].map((n) => `- src/report/export.js:${n} (src/report/export.js:${n})`),
    'confirmed by Amy: yes, go ahead',
    `settled, do not re-ask unless its source, scope or requirement changed (whole: atlasbound decisionbook show ${id} decisions):`,
    ...[1, 2, 3].map((n) => `- report.export.rule${n} = v${n} (support; by Amy, 2026-11-02)`),
    '- report.page = 50 rows; Amy, 2026-11-02: "Fifty rows a page, as the old report had."', // their own sentence beside the value
    '- report.colour; Amy, 2026-11-02: "Blue, like the logo."', // the value is their sentence: said once
    '- report.cache = none (simplest; by the AI, 2026-11-02)',
    // how a person replaces one: a question that names it, with this plan's id in the name, and their answer that places it
    `a person replaces one, never you: record a question naming it ("supersedes":["${id}/<key>"]), then ask; their answer, one word too, or what they say of it `
      + 'unasked, is their decision naming it: "supersedes" if it replaces it, "keeps" if it stays, code changed or not',
    WORDS.more]);
  assert.doesNotMatch(start, /earlier session|"t":"resume"/, 'no resume is asked of a later session');
  const asked = await handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's2', prompt: 'Add a CSV download to the report page' }, io);
  // the start gave the plan: the task prompt says nothing more and hands no new while the plan is open
  assert.deepEqual([asked, textOf(asked)], [{ code: 'prompt-passed' }, '']);
  assert.deepEqual(lastN(io, 'decisionbook.session'), { changed: 0, stale_draft: 0, stale_ready: 0, decision_allow: 1 }, 'the start row counts no earlier session');
  assert.equal(textOf(await handlers.session(starting('s2', 'resume'), io)), start, 'a resumed session: the same intake');
  const own = world({ files: { 'app/x.rb': 'class X\n' } });
  writeConfig(own, { protect: ['app/**'] });
  await handlers.start(starting('s1'), own);
  await readyOne(own, { plans: ['app/x.rb'] });
  const compacted = textOf(await handlers.session(starting('s1', 'compact'), own));
  assert.match(compacted, /\nfiles: app\/x\.rb\nsteps:\n- step 1 app\/x\.rb/, 'its own READY, after a compaction: the same intake');
  assert.ok(compacted.includes(`\n${WORDS.frozen}\n`));
});

const SCHED = { 'lib/sched/index.js': 'module.exports = createScheduler\n', 'lib/sched/parse.js': 'x\n' };
const HEARD = [{ id: 'h1.1', at: '2026-11-10T09:00:00.000Z', text: "Callers use:\nconst { createScheduler, replay } = require('./lib/sched')" }];
const CONTRACT = "contract, the person's words in heard:h1.1: `const { createScheduler, replay } = require('./lib/sched')`: tests and callers import exactly this";

test('[I-30] a plan of a test file where a promise is heard carries the contract link and says it first, and once at READY', async () => {
  const io = world({ files: SCHED, heard: HEARD }); // a whole plan with its yes is a person's own call, outside a session
  const res = await verbs.create(io, { rest: [JSON.stringify({ title: 'Unit tests for parse', why: 'w', success: 's', kind: 'chore', level: 'micro',
    records: recordsFor('micro', ['test/sched-unit/parse.test.js']) })] });
  const { id } = res.out;
  assert.equal(res.text.split('\n')[0], CONTRACT, 'the write states the contract in its first line');
  assert.equal(res.text.split(CONTRACT).length - 1, 2, 'and the READY reply repeats it once');
  assert.deepEqual(planRecords(io, id).filter((r) => r.rel === 'contract').map((r) => [r.t, r.to, r.why, r.source]),
    [['link', 'file:lib/sched/index.js', "const { createScheduler, replay } = require('./lib/sched')", 'heard:h1.1']]);
  assert.doesNotMatch((await added(io, id, { t: 'note', text: 'more' })).text, /contract/, 'a later write: written once, said once');
  const node = await verbs.show(io, { rest: [id, 'contract'] });
  assert.deepEqual([node.out.contract.length, node.text.includes(CONTRACT)], [1, true]);
  const plain = world({ files: SCHED, heard: null });
  const none = await verbs.create(plain, { rest: [JSON.stringify({ title: 'T', why: 'w', success: 's', kind: 'chore', level: 'micro', records: recordsFor('micro', ['test/a.test.js']) })] });
  assert.doesNotMatch(none.text, /contract/, 'no promise heard: no link, no word');
  assert.equal(planRecords(plain, none.out.id).filter((r) => r.rel === 'contract').length, 0);
});

test('[I-30] two test files that break one promise are asked until a yes; then the second passes and its row says why', async () => {
  const io = world({ files: SCHED, heard: HEARD });
  const write = (file) => ({ hook_event_name: 'PreToolUse', session_id: 's1', permission_mode: 'default', tool_name: 'Write',
    tool_input: { file_path: `/fake/${file}`, content: "const createScheduler = require('../../lib/sched')\n" } });
  assert.equal((await handlers.preEdit(write('test/e2e/a.test.js'), io)).verdict, 'ask');
  assert.equal((await handlers.postEdit({ ...write('test/e2e/a.test.js'), hook_event_name: 'PostToolUse' }, io), await handlers.preEdit(write('test/e2e/b.test.js'), io)).verdict, 'allow', 'the same promise, another file: the person said yes to it');
  assert.equal(lastN(io, 'decisionbook.gate').contractAsked, 1);
});

test('[I-30] a promised import line inside a sentence or backticks is read; naming require alone promises nothing', async () => {
  const files = { 'lib/sched/index.js': 'module.exports = {}\n', 'lib/x.js': 'x\n' };
  const said = (text) => decisionbook.debug.decisionbook(world({ files, heard: [{ id: 'h1.1', at: '2026-11-10T09:00:00.000Z', text }] }), {}).then((r) => r.out.promises);
  const inline = await said("Callers use: const { createScheduler, replay } = require('./lib/sched') and nothing else.");
  assert.deepEqual(inline.map((p) => [p.file, p.names, p.text]), [['lib/sched/index.js', ['createScheduler', 'replay'], "const { createScheduler, replay } = require('./lib/sched')"]]);
  assert.deepEqual((await said('Keep it: `import { a } from "./lib/x"` is the surface.')).map((p) => [p.file, p.names]), [['lib/x.js', ['a']]], 'inside backticks');
  assert.deepEqual(await said('Use require to load ./lib/sched, the module the callers know.'), [], 'a word, no statement');
  assert.deepEqual(await said('obj.const { a } = require(\'./lib/x\')'), [], 'a statement shape glued to a name is no statement');
});

// a heading only over its lines; a READY plan with no decision gives no "settled" heading at the start
test('a session start of a READY plan with no decision says no settled heading; one with a decision does', async () => {
  const io = world({ files: { 'app/x.rb': 'class X\n' } });
  writeConfig(io, { protect: ['app/**'] });
  await verbs.create(io, { rest: [JSON.stringify({ title: 'Fix x', why: 'w', success: 's', kind: 'bug', level: 'micro', records: [
    { t: 'research', tool: 'read', asked: 'a', answer: 'b', source: 'app/x.rb:1' }, { t: 'item', kind: 'feature', text: 'x' }, { t: 'item', kind: 'repro', text: 'r' },
    { t: 'link', rel: 'plans', to: 'file:app/x.rb', why: 'w' }, { t: 'check', id: 'AC-1', text: 'c', command: 'rake' }, { t: 'item', kind: 'task', text: 't', covers: ['AC-1'] },
    { t: 'confirm', by: 'Amy', said: 'yes' }] })] });
  assert.doesNotMatch(textOf(await handlers.session(starting('s2'), io)), /^settled/m);
  const other = world({ files: { 'app/x.rb': 'class X\n' } });
  writeConfig(other, { protect: ['app/**'] });
  await readyOne(other, { plans: ['app/x.rb'] });
  assert.match(textOf(await handlers.session(starting('s2'), other)), /^settled, do not re-ask [^\n]+\n- /m);
});
