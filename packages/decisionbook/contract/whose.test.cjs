// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Who is working is known by name before any record: the person's records carry it, someone else's answer says whose it is and where
// their words are, every reader shows both, and a new plan is linked to the issue its work starts from.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, PERSON, wire, planRecords, writtenDecisions, starting, theirAnswer, begin, refusedWith, added, textOf } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const FILE = 'src/billing/fee.js';
const HEAD = { title: 'Delivery fee', why: 'the fee is hard-coded', success: 'the fee reads from one place', kind: 'feature', level: 'micro' };
const DRAFT = [{ t: 'research', tool: 'read', asked: 'the fee', answer: 'a constant', source: `${FILE}:1` },
  { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the fee' }, { t: 'check', id: 'AC-1', text: 'the fee holds', command: 'npm test' }];
const ASK = { t: 'question', q: 'Q1', text: 'What is the fee?', decides: 'fee.amount', whyNotCode: 'a business rule', proposal: '100', blocking: true };
const COMMENT = 'https://tracker.invalid/shop/web/issues/12#issuecomment-3';
// what the root's tracker port reads at that address: the comment's text, and who wrote it
const COMMENTS = { [COMMENT]: { text: 'Finance confirmed: round down to the yen. Finance confirmed: the fee stays 100.\n\n— Emma (BA)', author: 'emma-b' } };

/** An AI session on `branch` where the person typed `task`; -> the world, `say` (a message of theirs) and `plan` (a new plan's write). */
async function sessionWorld({ task = 'Make the delivery fee one setting.', branch = 'main', records = [...DRAFT, ASK] } = {}) {
  const io = bookWorld({ files: { [FILE]: 'fee = 100\n' }, branch, comments: COMMENTS });
  await handlers.start(starting('s1'), io);
  io.session = 's1';
  const say = (prompt) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt }, io);
  await say(task);
  const plan = async (more = []) => (await verbs.create(io, { rest: [wire({ ...HEAD, records: [...records, ...more] })] }));
  return { io, say, plan };
}

test('a record of the person\'s carries their name; where no one is named it is refused and nothing is written', async () => {
  const io = bookWorld({ files: { [FILE]: 'fee = 100\n' } });
  const id = await begin(io);
  const fee = { t: 'decision', key: 'fee.amount', value: '100', why: 'finance', whose: 'person' };
  for (const name of [null, '', 'assistant']) {
    io.identity = async () => ({ name, from: 'git' });
    assert.equal((await refusedWith(io, id, fee))[0], 'person-unnamed', `named ${name}: no record of the person's`);
    assert.equal((await refusedWith(io, id, { t: 'confirm', by: '', said: 'yes' }))[0], 'person-unnamed', 'nor their yes');
  }
  assert.deepEqual(writtenDecisions(io, id), [], 'nothing was written');
  io.identity = async () => ({ name: 'Mark', from: 'git' });
  await added(io, id, fee);
  assert.deepEqual(writtenDecisions(io, id).map((d) => d.by), ['Mark'], 'the name the root gives, never the sender\'s word');
  await added(io, id, { ...fee, key: 'fee.currency', value: 'yen', whose: 'assumed' });
  assert.equal(writtenDecisions(io, id).at(-1).by, 'ai', 'the AI\'s own needs no name');
});

test('an answer the person relays and one the AI copies from its source: every reader says whose it is and where the words are', async () => {
  const park = { ...ASK, q: 'Q2', decides: 'fee.rounding', text: 'Round up or down?', blocking: false, to: 'Emma (BA)', source: `${COMMENT}: "I will confirm"` };
  const w = await sessionWorld({ records: [...DRAFT, ASK, park] });
  const { out: { id } } = await w.plan();
  await w.say('Emma (BA): keep the fee at 100.');
  const relayed = await verbs.add(w.io, { rest: [id, wire({ ...theirAnswer('Q1', 'fee.amount', '100', 'Emma (BA): keep the fee at 100.'), whose: 'Emma (BA)' })] });
  assert.match(relayed.text, /^recorded, by Emma \(BA\), relayed by Amy, said in session: fee\.amount: "Emma \(BA\): keep the fee at 100\."$/m);
  const copied = { ...theirAnswer('Q2', 'fee.rounding', 'down', 'Finance confirmed: round down to the yen.'), whose: 'Emma (BA)', source: COMMENT };
  await verbs.add(w.io, { rest: [id, wire(copied)] });
  assert.deepEqual(writtenDecisions(w.io, id).map(({ by, saidBy, source }) => [by, saidBy, source]),
    [[PERSON, 'Emma (BA)', 'said in session'], [PERSON, 'Emma (BA)', COMMENT]]);
  const shown = (await verbs.show(w.io, { rest: [id, 'decisions'] })).text;
  assert.match(shown, /- fee\.amount = 100 \([^)]*; by Emma \(BA\), relayed by Amy, said in session\) active; Emma \(BA\): "Emma \(BA\): keep the fee at 100\."/);
  assert.ok(shown.includes(`by Emma (BA), relayed by ${PERSON}, ${COMMENT}) active; Emma (BA): "Finance confirmed: round down to the yen."`), shown);
  const forks = async () => (await verbs.ready(w.io, { rest: [id] })).out.unmet.find((row) => row.id === 'answers').forks;
  assert.deepEqual(await forks(), ['fee.amount', 'fee.rounding'], 'an answer read where Emma wrote it answers the parked question and settles its fork');
  await w.say('Emma (BA): round down, always.');
  await verbs.add(w.io, { rest: [id, wire([{ ...park, q: 'Q3', decides: 'fee.cents' },
    { ...theirAnswer('Q3', 'fee.cents', 'down', 'Emma (BA): round down, always.'), whose: 'Emma (BA)' }])] });
  assert.deepEqual(await forks(), ['fee.amount', 'fee.rounding', 'fee.cents'], 'a parked question the person relays the answer of is a fork settled');
  await handlers.start(starting('s2'), w.io);
  w.io.session = 's2';
  assert.doesNotMatch(textOf(await handlers.session(starting('s2'), w.io)), /questions that wait for someone else/, 'the parked question is answered');
});

test('a question goes to someone else only with what names them as the one who answers it', async () => {
  const w = await sessionWorld();
  const { out: { id } } = await w.plan();
  const emmas = { ...ASK, q: 'Q2', decides: 'fee.rounding', text: 'Round up or down?', to: 'Emma (BA)' };
  assert.equal((await refusedWith(w.io, id, emmas))[0], 'question-unsourced');
  await added(w.io, id, { ...emmas, source: 'issue 12: "Emma will confirm the rounding with finance"' });
  assert.equal(planRecords(w.io, id).at(-1).to, 'Emma (BA)');
});

test('a new plan is linked to the issue the person\'s message names, else the branch\'s; several named or one sent: none added', async () => {
  const linksOf = (io, id) => planRecords(io, id).filter((r) => r.rel === 'for').map(({ to, source }) => [to, source]);
  const named = await sessionWorld({ task: 'Get issue #12 and let us develop it.', branch: 'feat/7-export' });
  const made = await named.plan();
  assert.deepEqual(linksOf(named.io, made.out.id), [['issue:#12', 'the person\'s task message']], 'their message before the branch');
  assert.match(made.text, /^for issue:#12: linked by DecisionBook, named in the person's task message; where it is not the work's issue only the person removes it /m);
  const branch = await sessionWorld({ branch: 'feat/issue-7-export' });
  assert.deepEqual(linksOf(branch.io, (await branch.plan()).out.id), [['issue:#7', 'the branch name']]);
  const two = await sessionWorld({ task: 'Fix #12 and #14 together.', branch: 'feat/issue-7-export' });
  assert.deepEqual(linksOf(two.io, (await two.plan()).out.id), [], 'two issues named: none is guessed');
  const own = await sessionWorld({ task: 'Get issue #12 and let us develop it.' });
  const byHand = { t: 'link', rel: 'for', to: 'issue:#40', why: 'the parent issue' };
  assert.deepEqual(linksOf(own.io, (await own.plan([byHand])).out.id), [['issue:#40', undefined]], 'the sender\'s own link stands alone');
});
