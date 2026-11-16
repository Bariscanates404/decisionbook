// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// a promised import line in the person's words or a plan record is the contract a test is written against: a reader of the
// promised module or of a test file is shown it, and a test file importing outside it is asked once, naming its line and the promise.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, testWrite, readOf, asMode, ruling, textOf, begin, added, writeConfig } = require('./world.cjs');

const { handlers } = decisionbook;
const FILES = { 'lib/sched/index.js': 'module.exports = createScheduler\n', 'lib/sched/parse.js': 'module.exports = { parse }\n', 'lib/other.js': 'x\n',
  'README.md': 'docs\n' };
const PROMPT = { id: 'h1.1', at: '2026-11-10T09:00:00.000Z',
  text: 'Replay fails. This shows it:\n\n```js\nconst { createScheduler, replay } = require(\'./lib/sched\')\nconst s = createScheduler(src)\n```' };
const WHOLE = "'use strict'\nconst createScheduler = require('../../lib/sched')\nconst { replay } = createScheduler\n";
const NAMED = "'use strict'\nconst { createScheduler, replay } = require('../../lib/sched')\n";
const INSIDE = "'use strict'\nconst { createScheduler } = require('../../lib/sched')\nconst { parse } = require('../../lib/sched/parse')\n";
const promisedWorld = (over = {}) => bookWorld({ files: FILES, heard: [PROMPT], ...over });

test('[I-30] a test file binding the promised module whole under a promised name is asked once, naming both lines', async () => {
  const io = promisedWorld();
  const first = await handlers.preEdit(asMode(testWrite('test/sched-e2e/helpers.js', WHOLE), 'default'), io);
  assert.deepEqual(ruling(first), ['ask', 'contract-unpromised']);
  assert.match(first.reason, /test\/sched-e2e\/helpers\.js:2 `const createScheduler = require\('\.\.\/\.\.\/lib\/sched'\)` binds lib\/sched\/index\.js whole/);
  assert.match(first.reason, /the promise is `const \{ createScheduler, replay \} = require\('\.\/lib\/sched'\)` \(in heard:h1\.1\)/);
  const again = await handlers.preEdit(asMode(testWrite('test/sched-e2e/helpers.js', WHOLE), 'default'), io);
  assert.deepEqual(ruling(again), ['allow', 'gate-off'], 'asked once a session and file: the second write keeps it');
});

test('[I-30] where no one is asked the unpromised import is refused once with the same line; the promised import passes', async () => {
  const io = promisedWorld();
  const refused = await handlers.preEdit(asMode(testWrite('test/unit/a.test.js', WHOLE), 'bypassPermissions'), io);
  assert.deepEqual(ruling(refused), ['deny', 'contract-unpromised']);
  assert.match(refused.reason, /test\/unit\/a\.test\.js:2 /);
  assert.deepEqual(ruling(await handlers.preEdit(asMode(testWrite('test/unit/b.test.js', NAMED), 'bypassPermissions'), io)), ['allow', 'gate-off'], 'the promised line');
  assert.deepEqual(ruling(await handlers.preEdit(asMode(testWrite('lib/c.js', WHOLE), 'bypassPermissions'), io)), ['allow', 'gate-off'], 'not a test file');
});

test('[I-30] a test file importing a file inside the promised folder is asked, naming that line', async () => {
  const said = await handlers.preEdit(asMode(testWrite('test/sched-unit/parse.test.js', INSIDE), 'default'), promisedWorld());
  assert.deepEqual(ruling(said), ['ask', 'contract-unpromised']);
  assert.match(said.reason, /parse\.test\.js:3 `const \{ parse \} = require\('\.\.\/\.\.\/lib\/sched\/parse'\)` imports lib\/sched\/parse\.js, a file of lib\/sched\/ that is this code's own/);
  const none = await handlers.preEdit(asMode(testWrite('test/sched-unit/parse.test.js', INSIDE), 'default'), promisedWorld({ heard: null }));
  assert.deepEqual(ruling(none), ['allow', 'gate-off'], 'no handoff, no plan promise: nothing is invented');
  const prose = await handlers.preEdit(asMode(testWrite('test/unit/x.test.js', INSIDE), 'default'), promisedWorld({ heard: [{ ...PROMPT, text: 'lib/sched exports createScheduler(source)' }] }));
  assert.deepEqual(ruling(prose), ['allow', 'gate-off'], 'words with no import line shape promise nothing');
});

test('[I-30] a read of the promised module or a test file is shown the contract and its source; another file is shown none', async () => {
  const io = promisedWorld();
  const read = await handlers.recall(readOf('lib/sched/index.js'), io);
  assert.equal(read.code, 'recall-contract');
  assert.equal(textOf(read), "contract (promised in heard:h1.1): `const { createScheduler, replay } = require('./lib/sched')`. A test imports only that: "
    + "lib/sched/index.js gives createScheduler, replay; the other files of lib/sched/ are this code's own, never promised");
  assert.equal((await handlers.recall(readOf('test/sched-e2e/flow.test.js', 's2'), io)).code, 'recall-contract', 'a test file');
  const other = await handlers.recall(readOf('lib/other.js', 's3'), io);
  assert.equal(other.code, 'recall-none');
  assert.equal(other.say, undefined);
  const rows = io.fs.readText('.atlasbound/trace/r1.ndjson').trim().split('\n').map((line) => JSON.parse(line)).filter((r) => r.step === 'decisionbook.recall');
  assert.deepEqual(rows.map((r) => [r.ref.file, Object.keys(r.codes)[0], r.n.promises]), [['lib/sched/index.js', 'recall-contract', 1],
    ['test/sched-e2e/flow.test.js', 'recall-contract', 1], ['lib/other.js', 'recall-none', 1]], 'each recall row names the file it judged and the promises read');
});

test('[I-30] a test write the plan refuses names the unpromised import in the same reason', async () => {
  const io = promisedWorld();
  writeConfig(io, { protect: ['test/**'] });
  const refused = await handlers.preEdit(asMode(testWrite('test/sched-e2e/helpers.js', WHOLE), 'bypassPermissions'), io);
  assert.deepEqual(ruling(refused), ['deny', 'plan-none']);
  assert.match(refused.reason, /^DecisionBook gate: plan-none: .* ; DecisionBook gate: contract-unpromised: test\/sched-e2e\/helpers\.js:2 `const createScheduler = /);
  writeConfig(io, { protect: [] });
  assert.deepEqual(ruling(await handlers.preEdit(asMode(testWrite('test/sched-e2e/helpers.js', WHOLE), 'bypassPermissions'), io)), ['allow', 'gate-off'],
    'told once with the plan, the write is the AI\'s choice');
});

test('[I-30] debug decisionbook lists every promise it reads, the file, the names and the source; with none it lists none', async () => {
  const { text, out } = await decisionbook.debug.decisionbook(promisedWorld(), {});
  assert.match(text, /^promise lib\/sched\/index\.js gives createScheduler, replay: `const \{ createScheduler, replay \} = require\('\.\/lib\/sched'\)` \(in heard:h1\.1\)$/m);
  assert.deepEqual(out.promises.map((p) => p.file), ['lib/sched/index.js']);
  assert.deepEqual((await decisionbook.debug.decisionbook(promisedWorld({ heard: null }), {})).out.promises, []);
});

test('[I-30] a promise recorded in a plan decision is the contract with no journal at all', async () => {
  const io = promisedWorld({ heard: null });
  const id = await begin(io);
  await added(io, id, { t: 'decision', key: 'api.sched-surface', value: "const { createScheduler } = require('./lib/sched')", why: 'the task promised it', by: 'Ayse' });
  const said = await handlers.preEdit(asMode(testWrite('test/sched-e2e/helpers.js', WHOLE), 'default'), io);
  assert.deepEqual(ruling(said), ['ask', 'contract-unpromised']);
  assert.match(said.reason, /\(in decision:api\.sched-surface\)/);
});
