// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// inside an AI session a confirm is the person's yes when a person's prompt reached
// the session after the plan's `new`, and the plan as it stands neither runs at a higher level nor holds a raising signal it did not hold at that prompt.
// What changed the plan after that prompt is kept on the yes as kinds (never words) and shown. A plan that grew past what the person saw needs their next
// message. The session keeps a flag and a time per prompt, never its words. Outside a session: the terminal rule.
const test = require('node:test');
const assert = require('node:assert/strict');
const kit = require('@atlasbound/kit');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, recordsFor, wire, planRecords } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const TASK = 'Stream the export rows so a large report finishes';
const YES = { t: 'confirm', by: 'Amy', said: 'yes, go ahead' };
const head = { title: 'Stream the export', why: 'large exports time out', success: 'a 10,000 row export finishes in 5 s', kind: 'feature', level: 'micro' };
const [EXPORT, CSV, ROWS] = ['src/report/export.js', 'src/report/csv.js', 'src/report/rows.js'];
const PERSONS = ['question', 'decision', 'confirm']; // the person's part of a plan: their answers and their yes
const draftOf = (level, files) => recordsFor(level, files).filter((r) => !PERSONS.includes(r.t)); // a whole plan of the level, the person's part left out
// the person's answers as the session records them: each decision stands on their own sentence about it (`said`), copied from ANSWERED
const ANSWERED = 'my answers: rule1 is v1, rule2 is v2, rule3 is v3';
const theirWords = (r) => (r.t === 'decision' ? { ...r, said: `${r.key.split('.').at(-1)} is ${r.value}` } : r);
// the questions stand in the plan before the person is asked (an answer binds to a question written before it); none blocks here, so the
// yes these tests measure is the person's confirm
const asks = recordsFor('normal', []).filter((r) => r.t === 'question').map((q) => ({ ...q, blocking: false }));
const answers = recordsFor('normal', []).filter((r) => r.t === 'decision').map(theirWords);
const linksTo = (...files) => files.map((file) => ({ t: 'link', rel: 'plans', to: `file:${file}`, why: 'the export code' }));
const outcome = (p) => p.then((res) => (res.out.state ? (res.out.state.ready ? 'READY' : res.out.state.unmet.map((u) => u.code).join(',')) : res.out.code),
  (err) => [err.code, err.message]);

/** A started AI session `s1` on a protected world; `say` is a person's prompt in it. */
async function askedWorld({ home, level = 'micro' } = {}) {
  const io = bookWorld({ files: { [EXPORT]: 'a\nb\nc\n', [CSV]: 'x\n', [ROWS]: 'r\n', 'test/report.test.js': 't\n' }, ...(home === null ? { home: null } : {}) });
  writeConfig(io, { protect: ['src/**'] });
  await handlers.start({ hook_event_name: 'SessionStart', session_id: 's1', source: 'startup' }, io);
  io.session = 's1';
  const say = (prompt) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt }, io);
  const create = (records) => outcome(verbs.create(io, { rest: [wire({ ...head, level, records })] }));
  const created = async (records) => (await verbs.create(io, { rest: [wire({ ...head, level, records })] })).out.id;
  const add = (id, records) => outcome(verbs.add(io, { rest: [id, wire(records)] }));
  const planned = () => (io.fs.list('.decisionbook') || []).filter((name) => name.endsWith('.jsonl'));
  const amended = (id) => planRecords(io, id).filter((r) => r.t === 'confirm').at(-1).amended;
  return { io, say, create, created, add, planned, amended };
}
const notAsked = (id, why) => ['confirm-not-asked', `confirm-not-asked: nothing written: ${id}: ${why}`];
const NOT_ASKED = 'a confirm is the person\'s yes, and no person\'s message came in this session after this plan was first written: send this call\'s other records '
  + 'again now without the confirm (their words stay on them), then show the person the plan and ask; their next message lets you record the yes (a new sends its plan without the confirm)';
const grew = (what) => `the plan grew past what the person saw (${what}): show them the change; their next message lets you record the yes`;

test('a confirm sent in the turn that planned is refused; after the person\'s next prompt the same add is READY', async () => {
  const w = await askedWorld();
  await w.say(TASK);
  const whole = await w.create([...draftOf('micro', [EXPORT]), YES]);
  assert.equal(whole[0], 'confirm-not-asked', 'a new holding its own yes');
  assert.deepEqual(w.planned(), [], 'nothing of the batch is written');
  const id = await w.created(draftOf('micro', [EXPORT]));
  const before = w.io.fs.readText(`.decisionbook/${id}.jsonl`);
  assert.deepEqual(await w.add(id, [YES]), notAsked(id,NOT_ASKED), 'the same turn: the plan came after the last person\'s prompt');
  assert.equal(w.io.fs.readText(`.decisionbook/${id}.jsonl`), before, 'the refused add wrote nothing');
  await w.say('yes, go ahead');
  assert.equal(await w.add(id, [YES]), 'READY', 'the person\'s prompt came after the plan');
  assert.deepEqual(w.amended(id), [], 'nothing changed the plan after the person saw it');
  const rows = w.io.home.readText(kit.paths.hereKey(w.io.root, 'decisionbook', `recall-${kit.hash.sha256('s1').slice(0, 16)}.jsonl`));
  assert.deepEqual(rows.trim().split('\n').map((line) => JSON.parse(line)).filter((r) => r.t === 'prompt').map((r) => [r.as, typeof r.at]),
    [['task', 'string'], ['other', 'string']], 'a flag and a time per prompt');
  assert.ok(rows.includes('"yes, go ahead"'), 'their sentences, in their own home: a quote is kept as the whole sentence it stands in');
});

// the yes comes in turn 2, the plan then gains the six files the first plan did not name
// (tests, types, docs): the confirm of that same turn is kept, so the person is not asked again in a third turn
test('the second turn: the answers in one add, more files in another, then the confirm, and READY in that turn', async () => {
  const w = await askedWorld({ level: 'normal' });
  await w.say(TASK);
  const id = await w.created([...draftOf('normal', [EXPORT, CSV, ROWS]), ...asks]);
  await w.say(`${ANSWERED}, and yes, go ahead`);
  assert.equal(await w.add(id, answers), 'ready-no-confirm');
  const more = ['test/report.test.js', 'docs/report.md'];
  assert.equal(await w.add(id, [...linksTo(...more), { t: 'item', kind: 'step', order: 4, file: more[0], change: 'a case per row', verify: 'AC-1' }]), 'ready-no-confirm');
  assert.equal(await w.add(id, [YES]), 'READY', 'the level and its signals are what the person saw: more than 2 files then and now');
  assert.deepEqual(w.amended(id), ['plans', 'plans', 'step'], 'kinds, never words');
  const confirmed = (await verbs.show(w.io, { rest: [id, 'confirm'] })).text;
  assert.ok(confirmed.includes(`confirmed by Amy: ${ANSWERED}, and yes, go ahead; amended after the yes: 3 (plans, step)\n`), 'the yes kept as its whole sentence');
  assert.match((await decisionbook.debug.decisionbook(w.io, {})).text, new RegExp(`^${id} ready, .*; amended after the yes: 3 \\(plans, step\\)`, 'm'));
});

test('a goal, a check or a task changed after the person\'s message refuses the yes: shown first, then their next message', async () => {
  const w = await askedWorld();
  await w.say(TASK);
  const id = await w.created(draftOf('micro', [EXPORT]));
  await w.say('yes');
  const late = [{ t: 'amend', success: 'all helpers are deleted' },
    { t: 'check', id: 'AC-9', text: 'memory stays flat', command: 'npm test -- mem' },
    { t: 'item', kind: 'task', text: 'measure memory', covers: ['AC-9'] }];
  const before = w.io.fs.readText(`.decisionbook/${id}.jsonl`);
  const [code, said] = await w.add(id, [...late, YES]);
  const unseen = /the plan's amend, check, task changed after the person's last message/;
  assert.deepEqual([code, unseen.test(said)], ['confirm-not-asked', true], said);
  assert.equal(w.io.fs.readText(`.decisionbook/${id}.jsonl`), before, 'nothing written');
  for (const one of late) assert.equal((await w.add(id, [one, YES]))[0], 'confirm-not-asked', `${one.t} alone in the same call`);
  assert.equal(await w.add(id, late), 'ready-no-confirm', 'the change alone is stored');
  assert.equal((await w.add(id, [YES]))[0], 'confirm-not-asked', 'sent in an earlier call, still after the person\'s last message');
  await w.say('the new goal is right, yes, go ahead');
  assert.equal(await w.add(id, [YES]), 'READY');
  assert.deepEqual(w.amended(id), [], 'the person saw the plan they said yes to');
  await w.add(id, [{ t: 'item', kind: 'task', text: 'one more task', covers: ['AC-9'] }]);
  const shown = (await verbs.show(w.io, { rest: [id, 'confirm'] })).text;
  assert.match(shown, /; amended after the yes: 1 \(task\)$/m, 'a change after the yes is said');
});

// an AI that asks first and writes the plan after gets the person's answers before it, and they say each decision twice; the pack
// has the plan sent with its questions in it before anything is asked, and the person's one message answers each question once
test('a plan sent with its questions before the person is asked: their one message answers each, and one add is READY', async () => {
  const w = await askedWorld();
  await w.say(TASK);
  const asks = [['Q1', 'report.export.batch', 'Rows per write: 100 or 1,000?'], ['Q2', 'report.export.empty', 'An empty report: a header only, or no file?']]
    .map(([q, decides, text]) => ({ t: 'question', q, text, decides, whyNotCode: 'a product preference', blocking: true }));
  const made = await verbs.create(w.io, { rest: [wire({ ...head, records: [...draftOf('micro', [EXPORT]), ...asks] })] });
  assert.match(made.text, /"answers":"Q1"[^\n]*"answers":"Q2"/, 'the reply hands one answer row per question, in the person\'s add');
  const said = ['Write 1,000 rows per batch.', 'An empty report is a file with the header only.'];
  await w.say(`${said.join(' ')} Yes, go ahead.`);
  const answer = (q, i) => ({ t: 'decision', key: q.decides, value: ['1000', 'header'][i], why: 'the person chose', whose: 'person', said: said[i],
    answers: q.q, effect: ['check:AC-1'] });
  assert.equal(await w.add(made.out.id, [...asks.map(answer), YES]), 'READY');
  assert.deepEqual(decidedBy(w.io, made.out.id), [['1000', 'Amy'], ['header', 'Amy']], 'each answer is theirs, said once');
});

const KEY = 'report.export.rows';
const mine = { t: 'decision', key: KEY, value: 'stream', why: 'large exports', whose: 'person', files: [EXPORT], said: 'stream the rows' };
const decidedBy = (io, id) => planRecords(io, id).filter((r) => r.t === 'decision').map((r) => [r.value, r.by]);

test('a decision typed after a slash command of the repository stands on the person\'s own first sentence', async () => {
  const w = await askedWorld();
  w.io.fs.writeAtomic('.claude/commands/decisionbook.md', '# /decisionbook\n');
  await w.say(TASK);
  const a = await w.created(draftOf('micro', [EXPORT]));
  await w.say('/decisionbook Stream the rows, do not buffer them. Then show me the plan.');
  await w.say('/tmp is full, send them at once.');
  await w.add(a, [{ ...mine, said: 'Stream the rows' }]);
  assert.equal(planRecords(w.io, a).at(-1).said, 'Stream the rows, do not buffer them.', 'a part is kept as its whole sentence');
  const place = { ...mine, key: 'report.export.place', value: 'stream at once' };
  assert.equal((await w.add(a, [{ ...place, said: 'is ful' }]))[0], 'said-not-theirs', 'a word cut short is not theirs');
  await w.add(a, [{ ...place, said: '/tmp is full, send them at once.' }]);
  assert.deepEqual(decidedBy(w.io, a).slice(-2), [['stream', 'Amy'], ['stream at once', 'Amy']]);
});

// a later message such as "thanks, also what is 2+2?" is no assent: it makes nothing the sender signed with a person's name theirs.
test('a decision is the person\'s only on words they typed, kept as their whole sentence: a name or a later message is refused', async () => {
  const w = await askedWorld();
  await w.say(TASK);
  const a = await w.created(draftOf('micro', [EXPORT]));
  const refused = async (record) => (await w.add(a, [record]))[0];
  assert.equal(await refused(mine), 'said-not-theirs', 'words they never typed: a name the sender writes is no person');
  await w.say('thanks, also what is 2+2?');
  const { said, ...unsaid } = mine;
  assert.equal(await refused(unsaid), 'said-not-theirs', `a later message alone is no assent, and ${said} is not in it`);
  await w.say('Stream the rows, do not buffer them.');
  assert.equal(await refused({ ...mine, said: 'the row' }), 'said-not-theirs', 'a word cut short');
  assert.equal(await refused({ ...mine, said: 'Stream the rows, buffer them' }), 'said-not-theirs', 'a word left out between');
  await w.add(a, [{ ...mine, said: 'Stream the rows' }]);
  assert.deepEqual(decidedBy(w.io, a).at(-1), ['stream', 'Amy'], 'their whole sentence, the value as the AI read it');
  assert.equal(planRecords(w.io, a).at(-1).said, 'Stream the rows, do not buffer them.', 'the record keeps the words it stands on');
  await w.add(a, [{ ...mine, whose: 'assumed', said: 'Stream the rows, do not buffer them.', proposed: true }]);
  assert.deepEqual(decidedBy(w.io, a).at(-1), ['stream', 'ai'], 'the AI\'s own stays the AI\'s');
});

test('a person\'s decision naming theirs in supersedes replaces it on their own words, its own plan\'s too; never the AI\'s', async () => {
  const w = await askedWorld();
  await w.say(TASK);
  const a = await w.created(draftOf('micro', [EXPORT]));
  await w.say('stream the rows');
  await w.add(a, [mine]);
  assert.deepEqual(decidedBy(w.io, a), [['stream', 'Amy']], 'by is the product\'s word, never the sender\'s');
  await w.add(a, [{ ...mine, value: 'x', supersedes: [`${a}/${KEY}`] }]); // the documented change of this plan's own decision
  assert.deepEqual(decidedBy(w.io, a), [['stream', 'Amy'], ['x', 'Amy']], 'their words, the key written again naming itself');
  const b = await w.created(draftOf('micro', [EXPORT]));
  await w.say('yes, buffer them');
  const answer = { ...mine, value: 'buffer', why: 'shorter', said: 'yes, buffer them', supersedes: [`${a}/${KEY}`] };
  assert.equal((await w.add(b, [{ ...answer, whose: 'assumed' }]))[0], 'supersede-theirs', 'only the person replaces a person\'s decision');
  assert.equal(await w.add(b, [answer]), 'ready-no-confirm', 'their words replace it, no question asked; the plan waits for their yes');
  assert.deepEqual([decidedBy(w.io, b), planRecords(w.io, b).at(-1).supersedes], [[['buffer', 'Amy']], [`${a}/${KEY}`]]);
  await w.say('yes, go ahead');
  assert.equal(await w.add(b, [YES]), 'READY');
  const states = (await verbs.show(w.io, { rest: [`decision:${KEY}`] })).out.decisions.map((d) => [d.value, d.state]);
  assert.deepEqual(states.sort(), [['buffer', 'active'], ['stream', 'revised'], ['x', 'superseded']]);
});

test('an AI decision over a key the person decided is refused and their line holds; the AI\'s proposal is kept as a proposal', async () => {
  const w = await askedWorld();
  await w.say(TASK);
  const a = await w.created(draftOf('micro', [EXPORT]));
  await w.say('stream the rows');
  await w.add(a, [mine]);
  const over = await w.add(a, [{ ...mine, value: 'buffer', whose: 'assumed', said: undefined }]);
  assert.equal(over[0], 'decision-theirs', 'a plain rewrite of their key by the AI');
  assert.match(over[1], /only the person changes their decision: ask them/);
  await w.add(a, [{ ...mine, value: 'buffer', whose: 'assumed', said: undefined, proposed: true }]);
  const states = (await verbs.show(w.io, { rest: [`decision:${KEY}`] })).out.decisions.map((d) => [d.value, d.by, d.state]);
  assert.deepEqual(states, [['stream', 'Amy', 'active'], ['buffer', 'ai', 'proposed']]);
});

test('a small fix that grew into normal work after the person\'s prompt is refused: they saw a smaller plan',
  async () => {
  const w = await askedWorld();
  await w.say(TASK);
  const id = await w.created(draftOf('micro', [EXPORT]));
  await w.say('yes, go ahead');
  const before = w.io.fs.readText(`.decisionbook/${id}.jsonl`);
  assert.deepEqual(await w.add(id, [...linksTo(CSV, ROWS), YES]), ['confirm-not-asked', 'confirm-not-asked: nothing written: record 3 of 3: '
    + `${id}: ${grew('normal work, was small fix; more than 2 files (3)')}`]); // 2 added to 1 is under the floor; the count says why it rose
  assert.equal(w.io.fs.readText(`.decisionbook/${id}.jsonl`), before, 'nothing written');
  assert.equal(await w.add(id, [...linksTo(CSV), YES]), 'READY', 'two plain files are still the small fix the person approved');
  assert.deepEqual(w.amended(id), ['plans']);
});

// a plan of 3 files at the person's prompt gains 6 in the same turn, one of 2 gains 6:
// the tests, docs and types of the planned change, ordinary work that rides in the same turn. A yes
// covers up to max(GROWN_FACTOR x held, GROWN_FLOOR) added files; past that, and any other raising signal whatever the count, needs the next message.
const SIX = ['test/export.test.js', 'test/report.test.js', 'test/csv.test.js', 'test/rows.test.js', 'docs/report.md', 'docs/csv.md'];
async function heldThen(files) {
  const w = await askedWorld({ level: 'normal' });
  writeConfig(w.io, { protect: ['src/**'], danger: ['docs/pay/**'] });
  await w.say(TASK);
  const id = await w.created([...draftOf('normal', files), ...asks]);
  await w.say(`${ANSWERED}, and yes, go ahead`);
  await w.add(id, answers);
  return { w, id, before: w.io.fs.readText(`.decisionbook/${id}.jsonl`) };
}

test('these shapes ride on the yes: 3 held + 6 added, 2 held + 6 added, 0 held + its first file', async () => {
  for (const [held, added] of [[[EXPORT, CSV, ROWS], SIX], [[EXPORT, CSV], SIX], [[], SIX.slice(0, 1)]]) {
    const { w, id } = await heldThen(held);
    assert.equal(await w.add(id, [...linksTo(...added), YES]), 'READY', `${held.length} held + ${added.length} added`);
    assert.deepEqual(w.amended(id), added.map(() => 'plans'), 'kept on the yes as kinds');
  }
});

test('past max(3 x held, 6) added files, or a danger zone path whatever the count, the yes is refused and nothing is written', async () => {
  const ten = [...SIX, 'test/a.test.js', 'test/b.test.js', 'docs/a.md', 'docs/b.md'];
  const big = await heldThen([EXPORT, CSV, ROWS]);
  assert.deepEqual(await big.w.add(big.id, [...linksTo(...ten), YES]), ['confirm-not-asked', `confirm-not-asked: nothing written: record 11 of 11: ${big.id}: `
    + `${grew('10 files added to the 3 the person saw')}`], '3 held + 10 added');
  assert.equal(big.w.io.fs.readText(`.decisionbook/${big.id}.jsonl`), big.before, 'nothing written');
  const zone = await heldThen([EXPORT, CSV, ROWS]);
  const [code, message] = await zone.w.add(zone.id, [...linksTo('docs/pay/rules.md'), YES]);
  assert.equal(code, 'confirm-not-asked', '3 held + 1 added in a danger zone');
  assert.match(message, /^confirm-not-asked: nothing written: record 2 of 2: .*the plan grew past what the person saw \(critical work, was normal work; a danger zone .*\(docs\/pay\/rules\.md\)\)/);
  assert.equal(zone.w.io.fs.readText(`.decisionbook/${zone.id}.jsonl`), zone.before, 'nothing written');
});

test('a raising signal added after the person\'s prompt is refused though the files are the same', async () => {
  const w = await askedWorld({ level: 'normal' });
  await w.say(TASK);
  const id = await w.created([...draftOf('normal', [EXPORT]), ...asks]);
  await w.say(`${ANSWERED}, and yes`);
  await w.add(id, answers); // the person's answers come after their message: a `new` holds none
  const glob = { t: 'link', rel: 'plans', to: 'file:src/report/**', why: 'every report file' };
  assert.deepEqual(await w.add(id, [glob, YES]), ['confirm-not-asked', `confirm-not-asked: nothing written: record 2 of 2: ${id}: ${grew('a glob (src/report/**)')}`]);
  const callers = ['src/mail/digest.js', 'src/jobs/nightly.js', 'src/api/download.js'].map((text) => ({ t: 'item', kind: 'consumer', text }));
  assert.deepEqual(await w.add(id, [...callers, YES]), ['confirm-not-asked', 'confirm-not-asked: nothing written: '
    + `record 4 of 4: ${id}: ${grew('critical work, was normal work; 3+ shared consumers (3)')}`]);
  assert.equal(await w.add(id, [glob]), 'ready-no-confirm', 'the change alone is stored');
  assert.deepEqual(await w.add(id, [YES]), notAsked(id,grew('a glob (src/report/**)')), 'still the turn the person has not seen it in');
  await w.say('yes, go ahead, the whole folder');
  assert.equal(await w.add(id, [YES]), 'READY');
  assert.deepEqual(w.amended(id), [], 'the person saw this plan');
});

// "could not tell" is never a yes: else an AI that sets the session variable to a fresh value, or removes the session's rows in
// the home, records the person's confirm itself
const UNSEEN = `the product could not see a person's message in this session: ${NOT_ASKED}`;
test('in a session a confirm needs a positive row of that session; without one it is refused and nothing is written', async () => {
  const w = await askedWorld();
  await w.say(TASK);
  const id = await w.created(draftOf('micro', [EXPORT]));
  await w.say('yes, go ahead');
  const before = w.io.fs.readText(`.decisionbook/${id}.jsonl`);
  w.io.session = 'never-seen-session-xyz';
  assert.deepEqual(await w.add(id, [YES]), notAsked(id, UNSEEN), 'a fresh session id');
  w.io.session = 's1';
  w.io.home.remove(kit.paths.hereKey(w.io.root, 'decisionbook', `recall-${kit.hash.sha256('s1').slice(0, 16)}.jsonl`));
  assert.deepEqual(await w.add(id, [YES]), notAsked(id, UNSEEN), 'the session\'s rows deleted');
  assert.equal(w.io.fs.readText(`.decisionbook/${id}.jsonl`), before, 'nothing written');
  await w.say('yes, go ahead');
  assert.equal(await w.add(id, [YES]), 'READY', 'the person\'s next message is a row again');
  const homeless = await askedWorld({ home: null });
  await homeless.say(TASK);
  const made = await homeless.created(draftOf('micro', [EXPORT]));
  assert.deepEqual(await homeless.add(made, [YES]), notAsked(made, UNSEEN), 'no home: no row can be kept, so no yes can be told');
  assert.match((await decisionbook.debug.decisionbook(homeless.io, {})).text, new RegExp(`^${made} .*; a person's prompt after its plan in session s1: could not tell$`, 'm'));
});

test('outside an AI session a confirm needs a person\'s terminal: with none it is refused, at one it is accepted', async () => {
  const bare = await askedWorld();
  delete bare.io.session;
  bare.io.terminal = false; // stdin is no terminal
  const none = await bare.create([...draftOf('micro', [EXPORT]), YES]);
  assert.equal(none[0], 'confirm-not-asked', String(none));
  assert.deepEqual(bare.planned(), [], 'a refused new writes nothing');
  const id = await bare.created(draftOf('micro', [EXPORT]));
  const before = bare.io.fs.readText(`.decisionbook/${id}.jsonl`);
  assert.equal((await bare.add(id, [YES]))[0], 'confirm-not-asked');
  assert.equal(bare.io.fs.readText(`.decisionbook/${id}.jsonl`), before, 'nothing written');
  Object.assign(bare.io, { terminal: true, above: null }); // a terminal whose ancestors could not be read is no person's
  assert.equal((await bare.add(id, [YES]))[0], 'confirm-not-asked');
  bare.io.above = [['-zsh']];
  assert.equal(await bare.add(id, [YES]), 'READY', 'a person at their own terminal');
});

test('debug decisionbook says, for the session, whether a person\'s prompt came after each plan\'s new', async () => {
  const w = await askedWorld();
  await w.say(TASK);
  const id = await w.created(draftOf('micro', [EXPORT]));
  const line = async () => (await decisionbook.debug.decisionbook(w.io, {})).text.split('\n').find((l) => l.startsWith(`${id} `));
  assert.match(await line(), /; a person's prompt after its plan in session s1: no$/);
  await w.say('yes');
  assert.match(await line(), /; a person's prompt after its plan in session s1: yes$/);
  assert.deepEqual((await decisionbook.debug.decisionbook(w.io, {})).out.plans.map((i) => i.asked), ['yes'], 'the flag as data');
});
