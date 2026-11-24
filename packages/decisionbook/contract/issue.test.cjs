// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The issue link over a session's messages: a new plan is linked to the issue the person named as its work, a later mention changes
// nothing, a second plan takes only what was named after the first, and the person removes a wrong link.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, begin, added, refusedWith, planRecords, starting, PERSON } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const ORIGIN = 'https://github.com/acme-example/shop.git';
const forLinks = (io, id) => planRecords(io, id).filter((r) => r.t === 'link' && r.rel === 'for').map(({ to, source }) => [to, source]);

/** An AI session on `branch` of a clone of `origin`; -> the world and `say` (a message the person types). */
async function issueWorld({ branch = 'main', origin = ORIGIN } = {}) {
  const io = bookWorld({ files: { 'src/export.js': 'x\n' }, branch, origin });
  await handlers.start(starting('s1'), io);
  io.session = 's1';
  return { io, say: (prompt) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt }, io) };
}
/** The `for` links of a new plan started after the person typed `messages`. */
async function linkedAfter(messages, world = {}) {
  const { io, say } = await issueWorld(world);
  for (const message of messages) await say(message);
  return forLinks(io, await begin(io));
}
const MESSAGE = 'the person\'s task message';

test('the task\'s issue holds through the replies after it: a later mention, a short answer and a yes change nothing', async () => {
  const task = 'Get issue #12 and let\'s develop it';
  assert.deepEqual(await linkedAfter([task]), [['issue:#12', MESSAGE]]);
  assert.deepEqual(await linkedAfter([task, 'ok, do the export like we did in #40']), [['issue:#12', MESSAGE]], 'a mention is no new work');
  assert.deepEqual(await linkedAfter([task, 'use a comma', 'yes go on', 'and add a test']), [['issue:#12', MESSAGE]]);
  assert.deepEqual(await linkedAfter([task, 'Also look at how issue #3 did the rounding before you plan']), [['issue:#12', MESSAGE]], 'named as an issue, still a mention');
  assert.deepEqual(await linkedAfter([task, 'do #2 first, then the rest']), [['issue:#12', MESSAGE]], 'a step of the work, not its issue');
  assert.deepEqual(await linkedAfter([task, 'Not that one after all: do issue #20, the import page']), [['issue:#12', MESSAGE]],
    'the task message\'s issue stands: a change of mind is the person\'s removal of the link');
  assert.deepEqual(await linkedAfter(['Review PR #12 and apply its idea to the export']), [], 'a pull request is no issue');
  assert.deepEqual(await linkedAfter(['use colour #123456 for the button'], { branch: 'fix/404-page' }), [], 'neither a colour nor a status code');
});

test('an issue a message only mentions is not the work where a message names its issue as the task, before it or after', async () => {
  const mention = 'Have a look at how issue #3 did the rounding';
  assert.deepEqual(await linkedAfter([mention, 'Now fix #12: the CSV export']), [['issue:#12', MESSAGE]], 'the mention came first, the task second');
  assert.deepEqual(await linkedAfter(['Get issue #12 done, the way issue #40 handled the header']), [['issue:#12', MESSAGE]], 'both in one message');
  assert.deepEqual(await linkedAfter(['Issue #12: the CSV export drops the last row']), [['issue:#12', MESSAGE]], 'named with no verb of work: still the task');
  assert.deepEqual(await linkedAfter([mention, 'and issue #4 too, same idea']), [['issue:#3', MESSAGE]], 'no task named anywhere: the first naming, as before');
  assert.deepEqual(await linkedAfter(['Work on issues #12 and #13 together']), [], 'two issues named as the task: nothing is guessed');
});

test('an issue\'s address links only in a clone of that repository', async () => {
  const address = 'Please do https://github.com/acme-example/shop/issues/12';
  assert.deepEqual(await linkedAfter([address]), [['issue:#12', MESSAGE]]);
  assert.deepEqual(await linkedAfter([address], { origin: 'git@github.com:acme-example/shop-web.git' }), [], 'another repository\'s issue');
  assert.deepEqual(await linkedAfter([address], { origin: null }), [], 'no remote: it cannot be told, so nothing is linked');
});

test('a second plan of a session takes the issue named after the first, never the first one\'s again', async () => {
  const { io, say } = await issueWorld({ branch: 'issue-7' });
  await say('Get issue #12 and let\'s develop it');
  assert.deepEqual(forLinks(io, await begin(io, { title: 'Alpha export works' })), [['issue:#12', MESSAGE]]);
  await say('Now a new task: issue #20, the import page');
  assert.deepEqual(forLinks(io, await begin(io, { title: 'Beta import works' })), [['issue:#20', MESSAGE]]);
  await say('Next, unrelated: rename the footer text');
  assert.deepEqual(forLinks(io, await begin(io, { title: 'Gamma footer rename' })), [['issue:#7', 'the branch name']], 'no message named one since: the branch\'s');
});

test('the person removes a wrong issue link, an AI alone never; the right one is linked after', async () => {
  const { io, say } = await issueWorld();
  await say('Do #3 of the list: add the export');
  const id = await begin(io);
  assert.deepEqual(forLinks(io, id), [['issue:#3', MESSAGE]]);
  const unlink = { t: 'unlink', rel: 'for', to: 'issue:#3', why: 'the person meant the third item of a list, not issue 3' };
  assert.equal((await refusedWith(io, id, { ...unlink, by: 'ai' }))[0], 'unlink-by-person');
  assert.equal(planRecords(io, id).find((r) => r.t === 'unlink'), undefined, 'nothing written');
  await say('that issue link is wrong, remove it: the work is for issue 31');
  const removed = await added(io, id, [{ ...unlink, by: '' }, { t: 'link', rel: 'for', to: 'issue:#31', why: 'the person named it' }]);
  assert.equal(planRecords(io, id).find((r) => r.t === 'unlink').by, PERSON, 'the removal is the person\'s, by name');
  assert.ok(!removed.text.includes('issue:#3 '), removed.text);
  const shown = (await verbs.show(io, { rest: [id, 'links'] })).text;
  assert.match(shown, /for issue:#31/);
  assert.doesNotMatch(shown, /issue:#3\b/, 'the removed link is gone from the plan');
  assert.doesNotMatch((await verbs.show(io, { rest: ['issue:#3'] })).text, /has-plan/, 'and from the issue\'s side');
  assert.match((await verbs.show(io, { rest: ['issue:#31'] })).text, new RegExp(`has-plan plan:${id}`));
});
