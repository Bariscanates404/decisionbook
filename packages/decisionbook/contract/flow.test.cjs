// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// A real person's plain answer opens the plan (were every answer stored as the AI's, nothing could be edited). The AI records what
// it understood, the person's own words beside it; the tests run one task over sessions: the person's prompts, the AI's records.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, wire, planRecords, recordsFor, editEvent, ruling, lastN, theirAnswer, stateOf, storedOf } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const ISSUE = 'Add a way to mark an option as deprecated: when the program is run with a deprecated option, the library writes a warning';
const FILES = { 'lib/option.js': 'a\nb\n', 'lib/command.js': 'c\nd\n', 'Readme.md': 'r\n' };
const HEAD = { title: 'Option.deprecated(message) warns on use', why: 'retire an option without breaking scripts',
  success: 'using a deprecated option writes a warning through writeErr', kind: 'feature', level: 'micro' };
const BODY = [{ t: 'research', tool: 'read', asked: 'where are option values handled?', answer: 'Command.addOption', source: 'lib/command.js:1' },
  { t: 'item', kind: 'feature', text: 'Option.deprecated(message?) warns when the option is used' },
  { t: 'link', rel: 'plans', to: 'file:lib/option.js', why: 'the deprecated() method' },
  { t: 'link', rel: 'plans', to: 'file:lib/command.js', why: 'the warning' },
  { t: 'check', id: 'AC-1', text: 'the new tests pass', command: 'node --test tests/options.deprecated.test.js' },
  { t: 'item', kind: 'task', text: 'implement deprecated()', covers: ['AC-1'] }];
const planQuestion = (q, text, decides, blocking) => ({ t: 'question', q, text, decides, whyNotCode: 'a product choice the code does not settle', blocking });

/** A started AI session on a protected world; `say` is a person's prompt in it, `add` answers what the write left. */
async function answerWorld(session = 's1') {
  const io = bookWorld({ files: FILES });
  writeConfig(io, { protect: ['lib/**'] });
  const enter = async (id) => {
    await handlers.start({ hook_event_name: 'SessionStart', session_id: id, source: 'startup' }, io);
    io.session = id;
  };
  await enter(session);
  const say = (prompt) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: io.session, prompt }, io);
  const create = async (records, head = HEAD) => (await verbs.create(io, { rest: [wire({ ...head, records })] })).out.id;
  const add = async (id, records) => (await verbs.add(io, { rest: [id, wire(records)] }));
  const deciders = (id) => Object.fromEntries(planRecords(io, id).filter((r) => r.t === 'decision').map((r) => [r.answers, r.by]));
  const edit = async (file) => ruling(await handlers.preEdit({ ...editEvent(file), session_id: io.session }, io));
  return { io, enter, say, create, add, deciders, edit };
}

const FIRST_QUESTIONS = [
  planQuestion('Q1', 'Warning wording: proposed `warning: option \'--old\' is deprecated: use --new instead` (without message: `warning: option \'--old\' is deprecated`). OK?', 'output.deprecatedWarningFormat', true),
  planQuestion('Q2', 'If the deprecated option is passed several times in one run, warn once (proposed) or on every occurrence?', 'behaviour.deprecatedWarnFrequency', false),
  planQuestion('Q3', 'Should a value coming from the option\'s env variable (.env()) also warn? Proposed: no, only command-line use.', 'behaviour.deprecatedEnvSource', false)];
const FIRST_REPLY = ['Answers from me (the developer):',
  '- About "is this warning wording OK?": Any clear wording, as long as it names the option and includes the message.',
  '- About "if the option is passed several times in one run, should it warn once (my suggestion) or every time?": One warning per parse, however many times the option is given.',
  '- About "should a value that comes from the option\'s environment variable (`.env()`) also warn?": Only when the person typed the option on the command line. A value from its environment variable (Option.env), a default or a preset gives no warning.',
  '- About "Please answer in your own words and say yes to the plan.": Yes, go ahead.'].join('\n');
const FIRST_SAID = { Q1: 'Any clear wording, as long as it names the option and includes the message.',
  Q2: 'One warning per parse, however many times the option is given.',
  Q3: 'Only when the person typed the option on the command line. A value from its environment variable (Option.env), a default or a preset gives no warning.' };

// the person answers in their own words; the AI records each answer in one add with the value it understood, and the product checks
// only that the words beside it are theirs
test('[I-31] the AI records the answers in one add with its own values, their words beside them, and it is READY', async () => {
  const w = await answerWorld();
  await w.say(ISSUE);
  const id = await w.create([...BODY, ...FIRST_QUESTIONS]);
  assert.deepEqual(await w.edit('lib/option.js'), ['deny', 'plan-draft-here'], 'before the person answered');
  await w.say(FIRST_REPLY);
  assert.deepEqual(w.deciders(id), {}, 'their message records nothing by itself');
  const res = await w.add(id, [theirAnswer('Q1', 'deprecatedWarningFormat', 'warning: option \'<flag>\' is deprecated[: <message>]', FIRST_SAID.Q1),
    theirAnswer('Q2', 'deprecatedWarnFrequency', 'once per parse', FIRST_SAID.Q2), theirAnswer('Q3', 'deprecatedEnvSource', 'cli only', FIRST_SAID.Q3)]);
  const decisions = planRecords(w.io, id).filter((r) => r.t === 'decision');
  assert.deepEqual(decisions.map((r) => [r.answers, r.by, r.said]), ['Q1', 'Q2', 'Q3'].map((q) => [q, 'Amy', storedOf(FIRST_REPLY, FIRST_SAID[q])]));
  assert.deepEqual(decisions.map((r) => r.value), ['warning: option \'<flag>\' is deprecated[: <message>]', 'once per parse', 'cli only'], 'the AI\'s reading');
  assert.equal(planRecords(w.io, id).filter((r) => r.t === 'confirm').length, 1, 'the yes their answers give is recorded by the product');
  assert.equal(stateOf(res), 'READY');
  assert.deepEqual(await w.edit('lib/option.js'), ['allow', 'gate-in-scope']);
  assert.deepEqual(lastN(w.io, 'decisionbook.add').bound, 3, 'the trace counts the answers recorded as theirs');
});

const SECOND_QUESTIONS = [
  planQuestion('Q1', 'Should a deprecated option also warn when its value comes from its environment variable (.env()), or only when passed on the command line?', 'deprecated.env', true),
  planQuestion('Q2', 'If the option is passed several times in one run, warn once or on each occurrence?', 'deprecated.repeat', true),
  planQuestion('Q3', 'Should help output mark a deprecated option (e.g. \'(deprecated)\' in its description), or leave help unchanged?', 'deprecated.help', true)];
const SECOND_REPLY = ['Answers from me (the developer):',
  '- About "Should it also warn when the option\'s value comes from its environment variable (`.env()`), or only when it\'s passed on the command line?": Only when the person typed the option on the command line. A value from its environment variable (Option.env), a default or a preset gives no warning.',
  '- About "If the option is passed more than once in one run, should it warn once or every time?": One warning per parse, however many times the option is given.',
  '- About "Should help output mark a deprecated option, for example by adding "(deprecated)" to its description, or stay unchanged?": Keep it in the help, and add " (deprecated)" at the end of its description there. Nothing else in the help changes.',
  '- About "Please answer Q1–Q3 and say whether the plan is OK to start.": Yes, go ahead.'].join('\n');
const SECOND_RECORDS = [
  theirAnswer('Q1', 'deprecated.env', 'warn only for command-line use; env, default, preset give no warning', FIRST_SAID.Q3),
  theirAnswer('Q2', 'deprecated.repeat', 'one warning per parse', FIRST_SAID.Q2),
  theirAnswer('Q3', 'deprecated.help', 'keep it in the help and add (deprecated) at the end of its description', 'Keep it in the help, and add " (deprecated)" at the end of its description there. Nothing else in the help changes.')];

test('an item of an answer list is theirs though another item holds a negation; READY, the gate opens', async () => {
  const w = await answerWorld();
  await w.say(ISSUE);
  const id = await w.create([...BODY, ...SECOND_QUESTIONS]);
  await w.say(SECOND_REPLY);
  const res = await w.add(id, SECOND_RECORDS);
  assert.deepEqual(w.deciders(id), { Q1: 'Amy', Q2: 'Amy', Q3: 'Amy' });
  assert.equal(stateOf(res), 'READY');
  assert.deepEqual(await w.edit('lib/command.js'), ['allow', 'gate-in-scope']);
});

// a record made as the person's quotes this session only (a prompt of another session could be one the AI started itself), so an
// answer typed in a session that died before the AI recorded it is asked again
test('an answer typed in a session that died is not quoted from the next one: the person is asked again', async () => {
  const w = await answerWorld();
  await w.say(ISSUE);
  const id = await w.create([...BODY, ...SECOND_QUESTIONS]);
  await w.say(SECOND_REPLY); // the session is cut here: the AI recorded nothing
  await w.enter('s2');
  assert.equal(await w.add(id, SECOND_RECORDS).then(() => null, (err) => err.code), 'said-not-theirs');
  assert.deepEqual(w.deciders(id), {}, 'nothing written');
  await w.say(SECOND_REPLY);
  assert.equal(stateOf(await w.add(id, SECOND_RECORDS)), 'READY');
  assert.deepEqual(w.deciders(id), { Q1: 'Amy', Q2: 'Amy', Q3: 'Amy' });
});

// a plan that runs as normal work, no question blocking: READY needs three forks settled by the person's answers and their yes
test('the answers settle the forks normal work needs; the full "About" line is as good as the sentence', async () => {
  const w = await answerWorld();
  await w.say(ISSUE);
  const body = recordsFor('normal', ['lib/option.js', 'lib/command.js']).filter((r) => !['question', 'decision', 'confirm'].includes(r.t));
  const id = await w.create([...body, ...FIRST_QUESTIONS.map((q) => ({ ...q, blocking: false }))], { ...HEAD, level: 'normal' });
  await w.say(FIRST_REPLY);
  const line = (n) => FIRST_REPLY.split('\n')[n];
  const res = await w.add(id, [theirAnswer('Q2', 'warnfrequency', 'one warning per parse', line(2)),
    theirAnswer('Q3', 'envsource', 'only on the command line; env, default, preset give no warning', line(3)),
    theirAnswer('Q1', 'warningtext', 'any clear wording that names the option and includes the message', line(1)),
    { t: 'confirm', by: 'the developer', said: 'Yes, go ahead.' }]);
  assert.deepEqual(w.deciders(id), { Q1: 'Amy', Q2: 'Amy', Q3: 'Amy' });
  assert.equal(stateOf(res), 'READY');
});

test('terse answers count when they answer the one question shown: a few words, a yes, a pick, a number', async () => {
  const cases = [['once per process', 'once per process'], ['yes, the first one', 'once'], ['2', '2'], ['Yes.', 'warn once'], ['evet', 'once']];
  for (const [said, value] of cases) {
    const w = await answerWorld();
    await w.say(ISSUE);
    const id = await w.create([...BODY, planQuestion('Q1', 'Warn once (proposed) or on every occurrence?', 'warn.frequency', true)]);
    await w.say(said);
    const res = await w.add(id, [theirAnswer('Q1', 'warn.frequency', value, said)]);
    assert.deepEqual([w.deciders(id).Q1, stateOf(res)], ['Amy', 'READY'], said);
  }
});

test('[I-31] the AI cannot quote words the person did not type: a word cut short, the question; a part is kept whole', async () => {
  const q1 = planQuestion('Q1', 'Warn once per process (proposed) or on every occurrence?', 'warn.frequency', true);
  const quoted = async (typed, said) => {
    const w = await answerWorld();
    await w.say(ISSUE);
    const id = await w.create([...BODY, q1]);
    await w.say(typed);
    return w.add(id, [theirAnswer('Q1', 'warn.frequency', 'every occurrence', said)]).then(() => w.deciders(id).Q1, (err) => err.code);
  };
  const ANSWER = 'About "warn once per process or on every occurrence?": every occurrence.';
  const NEVER = 'warn on every occurrence, never once';
  assert.deepEqual([await quoted(ANSWER, 'occurr'), await quoted(NEVER, 'warn on every occurrence, once'), await quoted('what time is it in Tokyo?', q1.text)],
    ['said-not-theirs', 'said-not-theirs', 'said-not-theirs']);
  assert.deepEqual([await quoted(ANSWER, 'every occurrence'), await quoted(NEVER, 'warn on every occurrence')], ['Amy', 'Amy'], 'a part of a sentence is theirs');
});

// READY is the freeze. The open READY plan is the work in progress whatever a new session's
// first message says; the session builds from it with no resume record; no word of the message drops it
test('a new session goes on with the open READY plan whatever its first message says: no resume is asked, one sent is history', async () => {
  const w = await answerWorld();
  await w.say(ISSUE);
  const id = await w.create([...BODY, ...SECOND_QUESTIONS]);
  await w.say(SECOND_REPLY);
  assert.equal(stateOf(await w.add(id, SECOND_RECORDS)), 'READY');
  const resume = () => w.add(id, [{ t: 'resume', why: 'the same task: the plan\'s steps are still open' }]).then((res) => res.out.code, (err) => err.code);
  const begun = await handlers.session({ hook_event_name: 'SessionStart', session_id: 's2', source: 'startup' }, w.io);
  await w.enter('s2');
  assert.equal(begun.code, 'session-ready');
  assert.match(begun.say[0].text, new RegExp(`^Plan ${id} READY on feat/export: [^\\n]*\\nFrozen: this plan is the settled intake of the work\\. Build from it`));
  assert.doesNotMatch(begun.say[0].text, /"t":"resume"|earlier session/, 'the start hands no resume call');
  assert.deepEqual(await w.edit('lib/option.js'), ['allow', 'gate-in-scope'], 'before any message of this session: the plan is frozen, it covers it');
  const told = await w.say('The option work goes on from where it stood.');
  assert.equal(told.code, 'prompt-passed', 'no word of a list is needed: the start gave the plan, the message changes nothing');
  assert.ok(!(told.say || []).some((s) => s.key === 'decisionbook.pack' || s.key === 'decisionbook.nudge'), 'never told to plan anew, never that nothing covers the work');
  assert.equal(await resume(), 'plan-recorded', 'a resume record is still taken, as history');
  assert.equal(lastN(w.io, 'decisionbook.add').records, 1);
  assert.deepEqual(await w.edit('lib/option.js'), ['allow', 'gate-in-scope']);
  assert.equal((w.io.fs.list('.decisionbook') || []).filter((name) => name.endsWith('.jsonl')).length, 1, 'one plan, never a second');
});

test('a blocking question no answer of a person can settle is the plan\'s defect: the AI writes it again under its q', async () => {
  const w = await answerWorld();
  await w.say(ISSUE);
  const id = await w.create([...BODY, planQuestion('Q1', 'Warn once (proposed) or on every occurrence?', 'warn.frequency', true)]);
  const gate = await handlers.preEdit({ ...editEvent('lib/option.js'), session_id: 's1' }, w.io);
  assert.match(gate.reason, /The person's: ask them all in one message, in plain words, each with the answer you propose \(its "proposal", word for word\), never the proposals as a whole: Q1: Warn once \(proposed\) or on every occurrence\?/);
  assert.match(gate.reason, /a question no answer of theirs can settle is a defect of the plan: send it again under the same "q"/);
  assert.match(gate.reason, /the person types no command/);
  await w.say('you decide that, it is not mine to answer');
  const res = await w.add(id, [planQuestion('Q1', 'Warn once or on every occurrence? Settled by the code: once, as the other warnings.', 'warn.frequency', false)]);
  assert.equal(stateOf(res), 'ready-no-confirm', 'the question blocks no more; the plan still waits for the person\'s yes');
  assert.equal((await verbs.show(w.io, { rest: [id, 'questions'] })).out.questions.length, 1, 'written again, it is the same question');
});
