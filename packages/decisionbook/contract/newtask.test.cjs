// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// A later session and the plan an earlier one left open. A READY plan is frozen: the session's start gives it as the intake to build
// from (the same text after /resume-handoff), a task prompt adds nothing to it and hands no new, and its edits pass with no call to send. A
// draft is said as the work in progress and a denial under it names its ONE next call. Other work is planned only once the person set
// the open plan aside (open.test.cjs holds those rows).
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, readyOne, starting, writeConfig, textOf } = require('./world.cjs');

const { handlers } = decisionbook;
const { WORDS } = decisionbook.codes;
const TASK = 'Add tenants and quotas to the scheduler, with tests';
/** How a READY plan's start opens: its title line, then the freeze, in the words of words.json. */
const intake = (id) => `Plan ${id} READY on feat/export: Report export is slow\n${WORDS.frozen}\n${WORDS.data}\nlevel: normal work\n`
  + 'why: large exports time out\nfiles: app/x.rb\n';

/** A READY plan of an earlier session, app/** protected, and a later session `session` started; `prompt` and `edit` are that session's. */
async function earlierWorld(session = 's2') {
  const io = bookWorld({ files: { 'app/x.rb': 'class X\n' } });
  writeConfig(io, { protect: ['app/**'] });
  const { id } = await readyOne(io, { plans: ['app/x.rb'] });
  await handlers.start(starting(session), io);
  const prompt = (text) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: session, prompt: text }, io);
  const edit = () => handlers.preEdit({ hook_event_name: 'PreToolUse', session_id: session, tool_name: 'Edit', tool_input: { file_path: '/fake/app/x.rb' } }, io);
  return { io, id, prompt, edit };
}

test('a later session gets the READY plan as the frozen intake: a text at the start and after /resume-handoff, none at a task', async () => {
  const { io, id, prompt, edit } = await earlierWorld();
  const start = textOf(await handlers.session(starting('s2'), io));
  assert.ok(start.startsWith(intake(id)), start);
  assert.ok(!/earlier session|"t":"resume"|<<'JSON'/.test(start), 'no call to send before the work goes on');
  const asked = await prompt(TASK);
  assert.deepEqual(asked, { code: 'prompt-passed' }, 'the task prompt: the start gave the plan; no second text, no nudge and no new handed');
  assert.deepEqual(await edit(), { verdict: 'allow', code: 'gate-in-scope', file: 'app/x.rb', plan: id }, 'its edits pass, with nothing recorded first');
  const resumed = await prompt('/resume-handoff');
  assert.equal(resumed.code, 'prompt-resume');
  assert.equal(resumed.context, `## DecisionBook's shared part\n${start}`, 'after the person\'s /resume-handoff: the same intake');
  assert.deepEqual([(await edit()).verdict, (await edit()).code], ['allow', 'gate-in-scope']);
});

// the session's own plan lacks only the person's yes: the denial names this plan, whose each missing part is and the ONE call that shows it
test('an edit while the branch\'s plan is a draft is denied, naming that plan, what it lacks, whose it is and its one call', async () => {
  const io = bookWorld({ files: { 'app/x.rb': 'class X\n' } });
  writeConfig(io, { protect: ['app/**'] });
  await handlers.start(starting('s2'), io);
  const made = await decisionbook.verbs.create(io, { rest: [JSON.stringify({ title: 'Quota statement', why: 'teams share it', success: 'quotas hold', kind: 'feature',
    level: 'micro', records: [{ t: 'research', tool: 'read', asked: 'how x starts', answer: 'class X', source: 'app/x.rb:1' }, { t: 'item', kind: 'feature', text: 'quotas' },
      { t: 'link', rel: 'plans', to: 'file:app/x.rb', why: 'the quota' }, { t: 'check', id: 'AC-1', text: 'a quota holds', command: 'rake test' },
      { t: 'item', kind: 'task', text: 'add it', covers: ['AC-1'] }] })] });
  const own = made.out.id;
  const denied = await handlers.preEdit({ hook_event_name: 'PreToolUse', session_id: 's2', tool_name: 'Edit', tool_input: { file_path: '/fake/app/x.rb' } }, io);
  assert.deepEqual([denied.verdict, denied.code], ['deny', 'plan-draft-here']);
  assert.equal(denied.reason, `DecisionBook gate: plan-draft-here: app/x.rb: this branch's plan is not READY yet, so it covers no edit (${own} `
    + 'lacks confirm. The person\'s: their yes to the plan; where no message of theirs since it was written gives it, show them the plan and ask whether to go '
    + `ahead. The one call that shows what is missing, as one add you fill and send: \`atlasbound decisionbook ready ${own}\`; the person types no command)`);
  assert.ok(!/earlier session/.test(denied.reason) && !denied.reason.includes('\n'), 'one sentence, no fill-in pasted into the denial');
});

test('an earlier session\'s READY plan, none of this one: a file outside it joins it, a danger path outside it asks the person', async () => {
  const { io, id, edit } = await earlierWorld();
  const write = (file) => handlers.preEdit({ hook_event_name: 'PreToolUse', session_id: 's2', tool_name: 'Write', tool_input: { file_path: `/fake/${file}` } }, io);
  assert.deepEqual([(await edit()).verdict, (await edit()).code], ['allow', 'gate-in-scope']);
  const grown = await write('app/quota.rb'); // the different task's file: the frozen plan takes it in and says so in one line
  assert.deepEqual([grown.verdict, grown.code, grown.context], ['allow', 'plan-grown',
    `DecisionBook: app/quota.rb was outside plan ${id}; the plan is frozen and took it in (one line added to it). Nothing to do.`]);
  assert.ok(textOf(await handlers.session(starting('s3'), io)).includes('\nfiles: app/x.rb, app/quota.rb\n'), 'the next session\'s intake names it');
  const asked = await write('app/db/schema.rb');
  assert.deepEqual([asked.verdict, asked.code, asked.plan, 'context' in asked], ['ask', 'plan-out-of-scope', id, false]);
});
