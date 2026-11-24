// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// A question parked with someone on the team waits in every clone that holds its plan: the session start and `inbox` of a teammate who
// pulled it name it with its plan, whom it waits for and who asked, until a human's answer is on record. And what `show` says under an
// answer: the question's proposal, only where the answer's value is another one.
const test = require('node:test');
const assert = require('node:assert/strict');
const kit = require('@atlasbound/kit');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, begin, added, logFile, starting, textOf } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const FILE = 'src/quote.js';
const planned = { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the quote is here' };
const read = { t: 'research', tool: 'read', asked: 'how a quote rounds', answer: 'it does not round', source: `${FILE}:1` };
const parkedWith = (q, to, text) => ({ t: 'question', q, text, decides: `quote.${q.toLowerCase()}`, whyNotCode: 'a business rule',
  to, source: 'issue 1: "Emma will confirm the rounding"' });
const ROUNDING = 'Does a quote round half up or to even?';
const CURRENCY = 'Which currency does the partner feed quote in?';

/** A clone holding Mark's draft of the quote, whose two questions wait for Emma (the analyst) and for Lee; `as`: who works in the clone
 * (Mark wrote it there; for Lee it came with Mark's commit and no row of it is in the home); then a session started in it. */
async function quoteClone(as) {
  const authors = {};
  const io = bookWorld({ files: { [FILE]: 'export const quote = (n) => n;\n' }, branch: 'main', authors, begun: null });
  writeConfig(io, { protect: ['src/**'] });
  const id = await begin(io, { title: 'Round the quote' });
  await added(io, id, [planned, read, parkedWith('Q1', 'Emma (BA)', ROUNDING), parkedWith('Q2', 'Lee', CURRENCY)]);
  if (as === 'Lee') {
    authors[logFile(id)] = 'Mark';
    io.home = kit.testing.memoryFs();
  }
  io.identity = async () => ({ name: as, from: 'git' });
  await handlers.start(starting('t1'), io);
  const start = textOf(await handlers.session(starting('t1'), io));
  io.session = 't1';
  return { io, id, start };
}

test('a teammate who pulled the plan sees its parked questions at session start and in inbox, each with its plan and who asked', async () => {
  const { io, id, start } = await quoteClone('Lee');
  assert.match(start, /a teammate's open draft/, 'the draft itself stays Mark\'s work');
  assert.ok(start.includes(`\n- ${id} Q1 for Emma (BA), asked by Mark: ${ROUNDING} (from issue 1: "Emma will confirm the rounding")`), start);
  assert.ok(start.includes(`\n- ${id} Q2 for Lee (the person working here: their own answer settles it), asked by Mark: ${CURRENCY}`), start);
  const inbox = await verbs.inbox(io, {});
  assert.deepEqual(inbox.out.here.map(({ waits, q, to, mine, author }) => [waits, q, to, mine, author]),
    [['parked', 'Q1', 'Emma (BA)', false, 'Mark'], ['parked', 'Q2', 'Lee', true, 'Mark']]);
  assert.equal(inbox.text.split('\n')[0], 'Waiting for you on main: open questions 0, questions parked with someone 2, READY plans not closed 0, set aside 0');
  assert.ok(inbox.text.includes(`- ${id} Q1 for Emma (BA), asked by Mark: ${ROUNDING}`), inbox.text);
});

test('the one who asked sees them too, with no asker named; a human\'s answer on record ends the wait in both readers', async () => {
  const { io, id, start } = await quoteClone('Mark');
  assert.ok(start.includes(`\n- ${id} Q1 for Emma (BA): ${ROUNDING}`), start);
  assert.deepEqual((await verbs.inbox(io, {})).out.here.map((row) => [row.q, row.mine, row.author]), [['Q1', false, undefined], ['Q2', false, undefined]]);
  const comment = 'https://tracker.invalid/shop/web/issues/1#issuecomment-2';
  io.tracker = { read: async (address) => (address === comment ? { text: 'Round half up.', author: 'emma-b' } : null) };
  await added(io, id, { t: 'decision', key: 'quote.q1', value: 'half up', why: 'her comment', whose: 'Emma (BA)', answers: 'Q1', effect: [`file:${FILE}`],
    said: 'Round half up.', source: comment });
  assert.deepEqual((await verbs.inbox(io, {})).out.here.map((row) => row.q), ['Q2'], 'Q1 has a human\'s answer');
  const again = textOf(await handlers.session(starting('t2'), io));
  assert.ok(!again.includes(' Q1 for ') && again.includes(' Q2 for Lee: '), again);
});

test('a question parked with someone still waits when its plan is closed: every teammate\'s start and inbox name it', async () => {
  const { io, id } = await quoteClone('Lee');
  io.fs.append(logFile(id), `${JSON.stringify({ t: 'closed', own: [], files: [FILE], tests: [], other: 0, by: 'Mark', at: '2026-11-02T07:00:00.000Z' })}\n`);
  const inbox = await verbs.inbox(io, {});
  assert.deepEqual(inbox.out.here.filter((row) => row.waits === 'parked').map(({ q, to, mine }) => [q, to, mine]), [['Q1', 'Emma (BA)', false], ['Q2', 'Lee', true]]);
  assert.ok(inbox.text.includes(`- ${id} Q1 for Emma (BA), asked by Mark: ${ROUNDING}`), inbox.text);
  const start = textOf(await handlers.session(starting('t2'), io));
  assert.ok(start.includes(`${id} Q2 for Lee (the person working here: their own answer settles it), asked by Mark: ${CURRENCY}`), start);  // with nothing guarded no plan is asked for, and what waits is said all the same
  writeConfig(io, { protect: [] });
  const bare = textOf(await handlers.session(starting('t3'), io));
  assert.ok(bare.includes(`${id} Q1 for Emma (BA), asked by Mark: ${ROUNDING}`) && !bare.includes('Plan before code'), bare);
});

test('whom the person names for a question outranks whom the issue named: sent again under its q, it waits for that one', async () => {
  const { io, id } = await quoteClone('Mark');
  const said = 'The rounding is Olivia\'s to answer, park it for her.';
  await handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 't1', prompt: said }, io);
  await added(io, id, { ...parkedWith('Q1', 'Olivia', ROUNDING), source: `the person: "${said}"` });
  const rows = (await verbs.inbox(io, {})).out.here.filter((row) => row.waits === 'parked').map(({ q, to }) => [q, to]);
  assert.deepEqual(rows.sort(), [['Q1', 'Olivia'], ['Q2', 'Lee']], 'one question Q1, now Olivia\'s');
});

test('a question of a plan set aside waits no more', async () => {
  const { io, id } = await quoteClone('Mark');
  await handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 't1', prompt: 'Drop the rounding work, we will not do it.' }, io);
  await added(io, id, { t: 'aside', by: '', said: 'Drop the rounding work, we will not do it.' });
  assert.deepEqual((await verbs.inbox(io, {})).out.here.map((row) => row.waits), ['aside']);
});

test('show names the proposal under an answer of another value; other punctuation or case is the same value', async () => {
  const io = bookWorld({ files: { [FILE]: 'export const quote = (n) => n;\n' } });
  const id = await begin(io, { title: 'Round the quote' });
  const asked = (q, proposal) => ({ t: 'question', q, text: `rule ${q}?`, decides: `quote.${q.toLowerCase()}`, whyNotCode: 'a product rule', proposal });
  const answer = (q, value) => ({ t: 'decision', key: `quote.${q.toLowerCase()}`, value, why: 'their answer', whose: 'person', answers: q, effect: [`file:${FILE}`] });
  await added(io, id, [planned, read, asked('Q1', 'SAVE10 = 10% off the total, FIVEOFF = 5 off (never below 0)'), asked('Q2', 'one coupon per cart')]);
  await added(io, id, [answer('Q1', 'save10 = 10% off the total; FIVEOFF = 5 off, never below 0'), answer('Q2', 'coupons combine')]);
  const { out, text } = await verbs.show(io, { rest: [id, 'decisions'] });
  assert.deepEqual(out.decisions.map((d) => d.proposedThen), [undefined, 'one coupon per cart']);
  assert.equal(text.split('\n').filter((line) => line.includes('its question proposed: ')).length, 1, text);
});
