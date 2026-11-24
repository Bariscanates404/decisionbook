// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// READY is the freeze: a later session goes on with the READY plan by building from it, and no resume record is asked of it. One an
// AI still sends is kept as history, from any seat, and opens nothing: the gate reads none. The session's beginning is a flag only
// (task | resume | other), never the prompt's words. What still holds a different task back: a danger path outside the plan asks the
// person, and `new` is refused while the open plan is neither closed nor set aside by the person (open.test.cjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const kit = require('@atlasbound/kit');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, readyOne, begin, added, planRecords, starting, writeConfig, ruling } = require('./world.cjs');

const { handlers } = decisionbook;
const TASK = 'Add tenants and quotas to the scheduler, with tests';
const RESUME = { t: 'resume', why: 'the same task, its last step is open' };
const editAs = (session) => ({ hook_event_name: 'PreToolUse', session_id: session, tool_name: 'Edit', tool_input: { file_path: '/fake/app/x.rb' } });

/** A READY plan of an earlier session and a later session `session`, started, whose verbs run as that session. */
async function laterSession(session, over = {}) {
  const io = bookWorld({ files: { 'app/x.rb': 'class X\n' }, ...over });
  writeConfig(io, { protect: ['app/**'] });
  const { id } = await readyOne(io, { plans: ['app/x.rb'] });
  await handlers.start(starting(session), io);
  io.session = session;
  const prompt = (text) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: session, prompt: text }, io);
  const resume = () => added(io, id, RESUME).then((res) => res.out.code, (err) => [err.code, err.message]);
  return { io, id, prompt, resume };
}

test('before any message of a person a later session\'s edit passes under the READY plan; a resume it sends is untraced history', async () => {
  const { io, id, prompt, resume } = await laterSession('s2');
  const held = planRecords(io, id).length;
  assert.deepEqual(await handlers.preEdit(editAs('s2'), io), { verdict: 'allow', code: 'gate-in-scope', file: 'app/x.rb', plan: id },
    'no resume, no message of a person: the plan is frozen and covers it');
  assert.equal(planRecords(io, id).length, held, 'nothing was written');
  assert.equal(await resume(), 'plan-recorded', 'no person spoke yet: a resume is kept, nobody is asked for it');
  await prompt(TASK);
  assert.equal(await resume(), 'plan-recorded', 'after a person\'s message too');
  assert.deepEqual(planRecords(io, id).slice(held).map((r) => r.t), ['resume', 'resume']);
  const rows = io.fs.readText('.atlasbound/trace/r1.ndjson').trim().split('\n').map((line) => JSON.parse(line)).filter((r) => r.step === 'decisionbook.add');
  assert.deepEqual(rows.slice(-2).map((r) => 'plan-continued' in r.codes), [false, false], 'the trace counts no session as going on by a resume');
  await prompt('/resume-handoff');
  const kept = io.home.readText(kit.paths.hereKey(io.root, 'decisionbook', `recall-${kit.hash.sha256('s2').slice(0, 16)}.jsonl`));
  assert.deepEqual(kept.trim().split('\n').map((line) => JSON.parse(line)).filter((r) => r.t === 'prompt').map((r) => r.as), ['task', 'resume'],
    'the flags: how it began, and the person\'s /resume-handoff');
  assert.ok(kept.includes('tenants'), 'the prompt\'s sentences are kept in the person\'s own home, to find a quote\'s whole sentence');
  assert.ok(!(io.fs.list('.decisionbook') || []).some((name) => (io.fs.readText(`.decisionbook/${name}`) || '').includes('tenants')), 'never in the repository');
  const debug = await decisionbook.debug.decisionbook(io, {});
  assert.deepEqual({ ...debug.out.began, lastAt: typeof debug.out.began.lastAt }, { as: 'task', resumed: true, lastAt: 'string' }, 'a time, no words');
  assert.match(debug.text, /^session s2 began with a task prompt; a person's \/resume-handoff in it: yes$/m, 'debug decisionbook says the flags');
});

// A resume record opened an earlier session's plan once, so who may send one was guarded. It opens nothing now: it is accepted from
// every seat, and what the gate refuses or asks without it, it refuses or asks with it.
test('a resume record is kept from any seat and opens nothing: a draft covers no edit, a plan with no yes here is still asked', async () => {
  const unknown = await laterSession('s5');
  assert.equal(await unknown.resume(), 'plan-recorded', 'a session the prompt hook never saw');
  const verb = await laterSession('s6');
  delete verb.io.session;
  assert.equal(await verb.resume(), 'plan-recorded', 'a verb run outside a session, at a person\'s terminal');
  verb.io.terminal = false;
  assert.equal(await verb.resume(), 'plan-recorded', 'no session and no terminal');
  const io = bookWorld({ files: { 'app/x.rb': 'class X\n' } });
  writeConfig(io, { protect: ['app/**'] });
  const draft = await begin(io);
  await handlers.start(starting('s2'), io);
  assert.equal((await added(io, draft, RESUME)).out.state.ready, false);
  assert.deepEqual(ruling(await handlers.preEdit(editAs('s2'), io)), ['deny', 'plan-none'], 'a resume of a draft makes nothing READY');
  const homeless = await laterSession('s7', { home: null }); // no home: no yes of a person is kept here
  assert.deepEqual(ruling(await handlers.preEdit(editAs('s7'), homeless.io)), ['ask', 'plan-not-here']);
  assert.equal(await homeless.resume(), 'plan-recorded');
  assert.deepEqual(ruling(await handlers.preEdit(editAs('s7'), homeless.io)), ['ask', 'plan-not-here'], 'a resume is no yes: the person is still asked');
});
