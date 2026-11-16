// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// DecisionBook hears a promise in the prompt it is handed, with no prompt journal. It keeps only the
// matched statement on this machine, says the contract in that prompt's answer, and links a promise decided in the plan's own call.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, testWrite, readOf, asMode, ruling, textOf, lastN, recordsFor, planRecords } = require('./world.cjs');
const CAP = { kept: 20 }; // black box: the published cap (contracts/promise.json)
// the store is in this repository's home folder, the one the public entry names (homeStores), never in the repository
const STORE = `${decisionbook.homeStores({ root: '/fake' })[0]}/promises.jsonl`;

const { handlers, verbs } = decisionbook;
const FILES = { 'lib/x/index.js': 'module.exports = { a, b }\n', 'lib/x/inner.js': 'x\n', 'lib/y.js': 'y\n' };
const STATEMENT = "const { a, b } = require('./lib/x')";
const PROMPT = `Please build the widget pipeline, Melbourne quarterly. Callers use: ${STATEMENT} and nothing else, zanzibar.`;
const CONTRACT = "contract (promised in prompt:s1): `const { a, b } = require('./lib/x')`. A test imports only that: lib/x/index.js gives a, b; "
  + "the other files of lib/x/ are this code's own, never promised";
const prompted = (prompt, session = 's1') => ({ hook_event_name: 'UserPromptSubmit', session_id: session, prompt });
const keptRows = (io) => (io.home.readText(STORE) || '').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const noJournal = (over = {}) => bookWorld({ files: FILES, heard: null, ...over });

test('with no prompt journal, a prompt holding an import statement gets the contract in its own answer', async () => {
  const io = noJournal();
  const said = await handlers.prompt(prompted(PROMPT), io);
  assert.equal(said.say.find((s) => s.key === 'decisionbook.contract').text, CONTRACT, 'the answer to the prompt that made it');
  const n = lastN(io, 'decisionbook.prompt');
  assert.deepEqual([n.kept, n.promises, n.contract], [1, 1, 1], 'the prompt row counts what it kept and said');
  assert.equal(textOf(await handlers.recall(readOf('test/x.test.js'), io)).split('\n')[0], CONTRACT, 'a later read of a test file');
  const whole = await handlers.preEdit(asMode(testWrite('test/x.test.js', "const a = require('../lib/x')\n"), 'default'), io);
  assert.deepEqual(ruling(whole), ['ask', 'contract-unpromised']);
  assert.match(whole.reason, /test\/x\.test\.js:1 `const a = require\('\.\.\/lib\/x'\)` .*\(in prompt:s1\)/);
  assert.deepEqual(ruling(await handlers.preEdit(asMode(testWrite('test/x.test.js', "const a = require('../lib/x')\n"), 'default'), io)), ['allow', 'gate-off'],
    'asked once');
});

test('the kept row holds the matched statement, the module, the names, the session and the time: no other word of the prompt', async () => {
  const io = noJournal();
  await handlers.prompt(prompted(PROMPT), io);
  const rows = keptRows(io);
  assert.deepEqual(rows.map((r) => Object.keys(r)), [['statement', 'module', 'names', 'session', 'at']], 'these fields and nothing else');
  assert.deepEqual(rows.map((r) => [r.statement, r.module, r.names, r.session]), [[STATEMENT, './lib/x', ['a', 'b'], 's1']]);
  assert.ok(Number.isFinite(Date.parse(rows[0].at)));
  const stored = io.home.readText(STORE);
  const others = PROMPT.replace(STATEMENT, ' ').split(/\W+/).filter((w) => w.length > 2);
  assert.deepEqual(others.filter((w) => stored.includes(w)), [], 'not one other word of the prompt');
  await handlers.prompt(prompted(`Again: ${STATEMENT}`, 's2'), io);
  assert.equal(keptRows(io).length, 1, 'the same statement is kept once, where it was first said');
  await handlers.prompt(prompted('Please make the export faster, it times out on big reports.'), io);
  assert.equal(keptRows(io).length, 1, 'a prompt with no statement keeps nothing');
});

test('the kept rows are capped by data, the oldest goes; a statement the secret reader would clip is never kept nor said', async () => {
  const io = noJournal();
  for (let i = 0; i <= CAP.kept; i += 1) await handlers.prompt(prompted(`Callers use const { f${i} } = require('./lib/y') from now on.`), io);
  const rows = keptRows(io);
  assert.equal(rows.length, CAP.kept);
  assert.deepEqual([rows[0].names, rows.at(-1).names], [['f1'], [`f${CAP.kept}`]], 'the oldest went');
  const secret = noJournal();
  const said = await handlers.prompt(prompted("Wire it: const { password = 'hunter2secret' } = require('./lib/x') please."), secret);
  assert.equal(secret.home.readText(STORE), null, 'nothing kept');
  assert.equal((said.say || []).some((s) => s.key === 'decisionbook.contract'), false, 'nothing said');
  assert.equal(lastN(secret, 'decisionbook.prompt').secret, 1, 'the row counts what it dropped');
});

test('with the journal, an old journaled prompt and a new typed one for the same module are one promise, from where first seen', async () => {
  const old = { id: 'h0.1', at: '2026-11-01T09:00:00.000Z', text: "Callers use const { a } = require('./lib/x') only." };
  const io = bookWorld({ files: FILES, heard: [old] });
  await handlers.prompt(prompted(PROMPT), io);
  const { out } = await decisionbook.debug.decisionbook(io, {});
  assert.deepEqual(out.promises.map((p) => [p.file, p.names, p.text, p.from]), [['lib/x/index.js', ['a', 'b'], STATEMENT, 'prompt:s1']]);
  const same = bookWorld({ files: FILES, heard: [{ ...old, text: `Callers use ${STATEMENT} only.` }] });
  await handlers.prompt(prompted(PROMPT), same);
  assert.deepEqual((await decisionbook.debug.decisionbook(same, {})).out.promises.map((p) => [p.text, p.from]), [[STATEMENT, 'heard:h0.1']], 'first seen in the journal');
});

test('debug decisionbook reads the own store with no journal and says the journal is not installed', async () => {
  const io = noJournal();
  await handlers.prompt(prompted(PROMPT), io);
  const { text } = await decisionbook.debug.decisionbook(io, {});
  assert.match(text, /^promise lib\/x\/index\.js gives a, b: `const \{ a, b \} = require\('\.\/lib\/x'\)` \(in prompt:s1\)$/m);
  assert.match(text, /^prompt journal: not installed$/m);
  assert.doesNotMatch((await decisionbook.debug.decisionbook(bookWorld({ files: FILES, heard: [] }), {})).text, /prompt journal/);
});

test('a promise decided in the same call as the plan link is linked in that call', async () => {
  const io = noJournal(); // a whole plan with its yes is a person's own call, outside a session
  const decision = { t: 'decision', key: 'api.x', value: STATEMENT, why: 'the task promised it', by: 'Ayse' };
  const res = await verbs.create(io, { rest: [JSON.stringify({ title: 'Unit tests for x', why: 'w', success: 's', kind: 'chore', level: 'micro',
    records: [decision, ...recordsFor('micro', ['test/x.test.js'])] })] });
  assert.deepEqual(planRecords(io, res.out.id).filter((r) => r.rel === 'contract').map((r) => [r.to, r.source]), [['file:lib/x/index.js', 'decision:api.x']]);
  assert.match(res.text.split('\n')[0], /^contract, the person's words in decision:api\.x: /);
});

test('the kept statements live in this repository\'s home folder, never in the repository; debug decisionbook says where', async () => {
  const io = noJournal();
  const before = [...io.fs.store.keys()];
  await handlers.prompt(prompted(PROMPT), io);
  const ours = [...io.fs.store.keys()].filter((key) => !before.includes(key) && !key.startsWith('.atlasbound/trace/'));
  assert.deepEqual(ours, [], 'the prompt wrote nothing into the repository but the trace');
  assert.equal(keptRows(io).length, 1, 'kept in the home');
  const { out, text } = await decisionbook.debug.decisionbook(io, {});
  assert.deepEqual(out.kept, { at: `~/${STORE}`, rows: 1 });
  assert.match(text, new RegExp(`^statements kept from prompts: 1 in ~/${STORE.replace(/[.]/g, '\\.')}, your home, never in the repository$`, 'm'));
  const homeless = Object.assign(noJournal(), { home: null });
  await handlers.prompt(prompted(PROMPT), homeless);
  assert.deepEqual([...homeless.fs.store.keys()].filter((key) => !key.startsWith('.atlasbound/trace/')), Object.keys(FILES), 'no home: nothing kept anywhere');
  assert.match((await decisionbook.debug.decisionbook(homeless, {})).text, /^statements kept from prompts: none, no home folder here$/m);
});

const SECRET = "const { password = 'hunter2secret' } = require('./lib/x')";
const traceText = (io) => io.fs.readText('.atlasbound/trace/r1.ndjson') || '';
/** One reader screens every source: no promise, no contract on a test file's read, no word of it in any trace row. */
async function screened(io, source) {
  const { out } = await decisionbook.debug.decisionbook(io, {});
  assert.deepEqual(out.promises, [], `${source}: not shown`);
  const read = await handlers.recall(readOf('test/x.test.js'), io);
  assert.equal((read.say || []).some((s) => s.key === 'decisionbook.contract'), false, `${source}: not said on a read`);
  assert.doesNotMatch(traceText(io), /hunter2secret/, `${source}: no trace row carries it`);
}

test('a secret-looking statement from each of the three sources is not shown, said or linked, and no trace row carries it', async () => {
  const kept = noJournal();
  kept.home.writeAtomic(STORE, `${JSON.stringify({ statement: SECRET, module: './lib/x', names: ['password'], session: 'old', at: '2026-11-01T09:00:00.000Z' })}\n`);
  await screened(kept, 'the kept store (an older version wrote it)');
  await screened(bookWorld({ files: FILES, heard: [{ id: 'h0.1', at: '2026-11-01T09:00:00.000Z', text: `Wire it: ${SECRET} please.` }] }), 'the journal');
  const planned = noJournal();
  const decision = { t: 'decision', key: 'api.x', value: SECRET, why: 'the task promised it', by: 'Ayse' };
  const asked = { title: 'Unit tests for x', why: 'w', success: 's', kind: 'chore', level: 'micro' };
  await assert.rejects(verbs.create(planned, { rest: [JSON.stringify({ ...asked, records: [decision] })] }), (err) => err.code === 'record-secret',
    'new refuses it at the door');
  const res = await verbs.create(planned, { rest: [JSON.stringify({ ...asked, records: recordsFor('micro', ['test/x.test.js']) })] });
  // a record an older version (or a teammate's commit) holds: the read screen still keeps it out
  planned.fs.append(`.decisionbook/${res.out.id}.jsonl`, `${JSON.stringify({ ...decision, head: 'h0', at: '2026-11-02T06:00:00.900Z' })}\n`);
  assert.deepEqual(planRecords(planned, res.out.id).filter((r) => r.rel === 'contract'), [], 'a plan record: not linked');
  await screened(planned, 'a plan record an older version wrote');
});

test('a prompt\'s answer carries only the promise that prompt names; the others come when their files are read', async () => {
  const three = { ...FILES, 'lib/z/index.js': 'module.exports = { z }\n' };
  const old = [{ id: 'h0.1', at: '2026-11-01T09:00:00.000Z', text: "Use const { y } = require('./lib/y') there." },
    { id: 'h0.2', at: '2026-11-01T09:01:00.000Z', text: "Use const { z } = require('./lib/z') there." }];
  const io = bookWorld({ files: three, heard: old });
  const said = await handlers.prompt(prompted(PROMPT), io);
  assert.equal((await decisionbook.debug.decisionbook(io, {})).out.promises.length, 3, 'three promises here');
  assert.deepEqual(said.say.find((s) => s.key === 'decisionbook.contract').text.split('\n'), [CONTRACT], 'one contract line: this prompt\'s');
  assert.equal(textOf(await handlers.recall(readOf('test/x.test.js'), io)).split('\n').filter((l) => l.startsWith('contract ')).length, 3, 'a test file\'s read shows all three');
  const unresolved = await handlers.prompt(prompted("Callers use const { q } = require('./lib/nowhere') too."), io);
  assert.equal((unresolved.say || []).some((s) => s.key === 'decisionbook.contract'), false, 'a statement naming no file here repeats no older promise');
});

test('debug decisionbook says why no journal is read, as the root says it: off by choice or not installed', async () => {
  assert.match((await decisionbook.debug.decisionbook(bookWorld({ files: FILES, journalOff: true }), {})).text, /^prompt journal: off here \(by choice\)$/m);
  assert.match((await decisionbook.debug.decisionbook(noJournal(), {})).text, /^prompt journal: not installed$/m);
});

test('new and add refuse a record holding a secret, naming the field and its place; the secret is in no reply and no trace row', async () => {
  const KEY = ['sk', 'ant', 'api03', 'Zq9vQ2mXr7Lw4Tn8Bd1Hc6Kp3Yf5Gj0Ns'].join('-');
  const io = bookWorld({ files: FILES });
  const id = (await verbs.create(io, { rest: [JSON.stringify({ title: 'Export keys', why: 'w', success: 's', kind: 'feature', level: 'micro' })] })).out.id;
  const before = io.fs.readText(`.decisionbook/${id}.jsonl`);
  const add = (records) => verbs.add(io, { rest: [id, JSON.stringify(records)] }).then(() => null, (err) => [err.code, err.message]);
  const planted = [
    [[{ t: 'note', text: 'fine' }, { t: 'decision', key: 'api.key', value: `use ${KEY} for staging`, why: 'w', by: 'ana' }], 'record 2 of 2: value'],
    [[{ t: 'research', tool: 'grep', asked: 'which key', answer: `the key is ${KEY}` }], 'record 1 of 1: answer'],
    [[{ t: 'confirm', by: 'ana', said: `yes, with ${KEY}` }], 'record 1 of 1: said'],
  ];
  for (const [records, where] of planted) {
    const refused = await add(records);
    assert.deepEqual([refused[0], refused[1].endsWith(where), refused[1].includes(KEY)], ['record-secret', true, false], `${where}: named, never echoed`);
  }
  assert.equal(io.fs.readText(`.decisionbook/${id}.jsonl`), before, 'none of any batch was written');
  const fresh = await verbs.create(io, { rest: [JSON.stringify({ title: 'Other', why: 'w', success: 's', kind: 'feature', level: 'micro',
    records: [{ t: 'decision', key: 'k.k', value: KEY, why: 'w', by: 'ana' }] })] }).then(() => null, (err) => [err.code, err.message]);
  assert.deepEqual([fresh[0], /record 1 of 1: value$/.test(fresh[1])], ['record-secret', true]);
  assert.equal((io.fs.list('.decisionbook') || []).length, 1, 'new with a secret starts no plan');
  assert.doesNotMatch(traceText(io), /sk-ant-api03/, 'no trace row carries it');
  assert.equal(await add([{ t: 'decision', key: 'api.key', value: 'kept in the STAGING_KEY variable', why: 'w', by: 'ana' }]), null, 'a name of where it lives is fine');
});
