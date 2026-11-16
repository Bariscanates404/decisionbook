// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// A real person's plain answer opens the plan (were every answer stored as the AI's, nothing could be edited). An
// answer binds to the question it answers; the first tests run one task over three sessions: the person's prompts, the AI's records.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, wire, planRecords, recordsFor, editEvent, ruling, lastN, theirAnswer, stateOf } = require('./world.cjs');

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

// the product binds the person's answers at their prompt, in their own words, before the AI's add; what the AI then
// sends in its own words is still stored as the AI's with its fix, and changes nothing of what the person decided
test('[I-31] the answers are bound at the prompt and it is READY; a value in the AI\'s words is named with its fix', async () => {
  const w = await answerWorld();
  await w.say(ISSUE);
  const id = await w.create([...BODY, ...FIRST_QUESTIONS]);
  assert.deepEqual(await w.edit('lib/option.js'), ['deny', 'plan-draft-here'], 'before the person answered');
  const told = await w.say(FIRST_REPLY);
  assert.deepEqual([told.code, told.say.map((s) => s.key)], ['answers-bound', [`decisionbook.bound.${id}`]]);
  assert.match(told.say[0].text, new RegExp(`as their decisions on plan ${id}: Q1, Q2, Q3\\. Do not send them again[^]*\\n${id} READY as small fix\\. Frozen:`));
  const decisions = () => planRecords(w.io, id).filter((r) => r.t === 'decision');
  assert.deepEqual(decisions().map((r) => [r.answers, r.by, r.value, r.said]), ['Q1', 'Q2', 'Q3'].map((q) => [q, 'the person', FIRST_SAID[q], FIRST_SAID[q]]),
    'each answer whole, in their words, under the question it quotes back');
  assert.equal(planRecords(w.io, id).filter((r) => r.t === 'confirm').length, 1, 'the yes the answers give is recorded by the product');
  assert.deepEqual(await w.edit('lib/option.js'), ['allow', 'gate-in-scope'], 'READY at their message: no add of the AI was needed');
  const first = await w.add(id, [theirAnswer('Q1', 'deprecatedWarningFormat', 'warning: option \'<flag>\' is deprecated[: <message>]', FIRST_SAID.Q1),
    theirAnswer('Q2', 'deprecatedWarnFrequency', 'once per parse', FIRST_SAID.Q2), theirAnswer('Q3', 'deprecatedEnvSource', 'cli only', FIRST_SAID.Q3)]);
  assert.deepEqual(decisions().slice(3).map((r) => [r.key, r.by]), [['deprecatedWarningFormat', 'ai'], ['deprecatedWarnFrequency', 'ai'],
    ['deprecatedEnvSource', 'ai']], 'the AI\'s own values (a format the person never said, `once`, `cli`) are no answer of theirs');
  assert.deepEqual(first.out.asAi.map(({ key, why }) => [key, why]), [['deprecatedWarningFormat', 'foreign'], ['deprecatedWarnFrequency', 'foreign'],
    ['deprecatedEnvSource', 'foreign']]);
  assert.match(first.text, /deprecatedWarnFrequency: "value" holds words that are not in the person's answer; write it in the words of their answer/);
  assert.deepEqual(decisions().slice(0, 3).map((r) => r.by), ['the person', 'the person', 'the person'], 'what the product bound stands as written');
  const second = await w.add(id, [theirAnswer('Q1', 'deprecatedWarningFormat', 'any clear wording that names the option and includes the message', FIRST_SAID.Q1),
    theirAnswer('Q2', 'deprecatedWarnFrequency', 'one warning per parse', FIRST_SAID.Q2),
    theirAnswer('Q3', 'deprecatedEnvSource', 'only when the person typed the option on the command line', FIRST_SAID.Q3)]);
  assert.deepEqual(second.out.asAi, []);
  assert.deepEqual(decisions().slice(6).map((r) => [r.key, r.by]), [['deprecatedWarningFormat', 'the person'], ['deprecatedWarnFrequency', 'the person'],
    ['deprecatedEnvSource', 'the person']], 'in the words of their answer the AI\'s later add is theirs too');
  assert.equal(stateOf(second), 'READY');
  assert.equal(planRecords(w.io, id).filter((r) => r.t === 'confirm').length, 1, 'no second yes is written');
  assert.deepEqual(await w.edit('lib/option.js'), ['allow', 'gate-in-scope']);
  assert.deepEqual(lastN(w.io, 'decisionbook.add').bound, 3, 'the trace counts the answers bound');
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
  assert.deepEqual(w.deciders(id), { Q1: 'the person', Q2: 'the person', Q3: 'the person' });
  assert.equal(stateOf(res), 'READY');
  assert.deepEqual(await w.edit('lib/command.js'), ['allow', 'gate-in-scope']);
});

// the answers do not wait for an AI's add, so a session cut right after the person's message loses nothing
test('a session that died: the answers were bound at their prompt, the next session finds the plan READY', async () => {
  const w = await answerWorld();
  await w.say(ISSUE);
  const id = await w.create([...BODY, ...SECOND_QUESTIONS]);
  assert.equal((await w.say(SECOND_REPLY)).code, 'answers-bound'); // the session is cut here: the AI recorded nothing
  assert.deepEqual(w.deciders(id), { Q1: 'the person', Q2: 'the person', Q3: 'the person' }, 'the product wrote them at the message');
  await w.enter('s2');
  assert.equal((await w.say('Continue the work on the issue.')).code, 'prompt-passed', 'nothing left to bind or to plan');
  assert.deepEqual(await w.edit('lib/option.js'), ['allow', 'gate-in-scope'], 'the READY plan covers the next session');
  const res = await w.add(id, SECOND_RECORDS);
  assert.deepEqual(res.out.asAi, [], 'the AI\'s own add of the same answers still stands as theirs');
  assert.deepEqual(w.deciders(id), { Q1: 'the person', Q2: 'the person', Q3: 'the person' }, 'their words stand in whichever session of this repository heard them');
  assert.equal(stateOf(res), 'READY');
  assert.deepEqual(await w.edit('lib/option.js'), ['allow', 'gate-in-scope']);
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
  assert.deepEqual(w.deciders(id), { Q1: 'the person', Q2: 'the person', Q3: 'the person' });
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
    assert.deepEqual([w.deciders(id).Q1, stateOf(res)], ['the person', 'READY'], said);
  }
});

test('[I-31] the AI cannot: answer before the question, move an answer, record a value it does not hold, or flip it', async () => {
  const two = [planQuestion('Q1', 'Warn once per process (proposed) or on every occurrence?', 'warn.frequency', true),
    planQuestion('Q2', 'Should a value from the environment variable also warn?', 'warn.env', true)];
  const refused = async ({ before = [], questions = two, after = [], record }) => {
    const w = await answerWorld();
    await w.say(ISSUE);
    const id = await w.create(BODY);
    for (const prompt of before) await w.say(prompt);
    await w.add(id, questions);
    for (const prompt of after) await w.say(prompt);
    const res = await w.add(id, [record]);
    return [w.deciders(id)[record.answers], res.out.asAi.map((one) => one.why).join(), stateOf(res).includes('ready-open-question')];
  };
  const ANSWERS = 'About "warn once per process or on every occurrence?": every occurrence.\nAbout "should the environment variable also warn?": no, only the command line.';
  assert.deepEqual(await refused({ before: ['warn once per process'], record: theirAnswer('Q1', 'warn.frequency', 'once per process', 'warn once per process') }),
    ['ai', 'early', true], 'said before the question was written');
  assert.deepEqual(await refused({ after: [ANSWERS], record: theirAnswer('Q2', 'warn.env', 'every occurrence', 'About "warn once per process or on every occurrence?": every occurrence.') }),
    ['ai', 'moved', true], 'the answer to Q1 under Q2');
  assert.deepEqual(await refused({ after: ['Q1: every occurrence. Q2: only the command line.'], record: theirAnswer('Q2', 'warn.env', 'every occurrence', 'Q1: every occurrence.') }),
    ['ai', 'moved', true], 'an answer that names another question');
  assert.deepEqual(await refused({ after: [ANSWERS], record: theirAnswer('Q1', 'warn.frequency', 'once per process', 'About "warn once per process or on every occurrence?": every occurrence.') }),
    ['ai', 'foreign', true], 'the value the question proposed, which the answer did not choose');
  assert.deepEqual(await refused({ after: ['Do not warn for the environment variable.'], questions: [two[1]],
    record: theirAnswer('Q2', 'warn.env', 'warn for the environment variable', 'Do not warn for the environment variable.') }), ['ai', 'flipped', true]);
  assert.deepEqual(await refused({ after: ['No.'], questions: [two[1]], record: theirAnswer('Q2', 'warn.env', 'the environment variable also warns', 'No.') }),
    ['ai', 'foreign', true], 'a no never lends the question\'s words');
  assert.deepEqual(await refused({ after: ['thanks, also what is 2+2?'], questions: [two[0]], record: theirAnswer('Q1', 'warn.frequency', 'once per process', 'thanks, also what is 2+2?') }),
    ['ai', 'foreign', true], 'a message on another subject');
  assert.deepEqual(await refused({ after: ['what time is it in Tokyo?'], questions: [two[0]],
    record: theirAnswer('Q1', 'warn.frequency', 'once per process', 'Warn once per process (proposed) or on every occurrence?') }), ['ai', 'unsaid', true],
  'the question quoted as if the person had said it');
  assert.deepEqual(await refused({ after: [ANSWERS], record: theirAnswer('Q1', 'warn.frequency', 'occurrence', 'occurrence') }),
    ['ai', 'unsaid', true], 'a piece of their clause');
  // the question quoted back held "(not the command line)"; the answer alone was sent three times, the whole line passes
  const QUOTED = 'About "Should a value from the environment variable (not the command line) also warn?": Only when typed on the command line.';
  const typed = (said) => refused({ after: [QUOTED], questions: [two[1]], record: theirAnswer('Q2', 'warn.env', 'only when typed on the command line', said) });
  assert.deepEqual([await typed('Only when typed on the command line.'), await typed(QUOTED)], [['ai', 'cut', true], ['the person', '', false]]);
  assert.deepEqual(await refused({ after: [ANSWERS], record: theirAnswer('Q1', 'warn.frequency', 'every occurrence', 'every occurrence') }),
    ['the person', '', true], 'must pass: the clause they set off with a colon is their answer (Q2 is still open)');
  assert.deepEqual(await refused({ after: ['warn on every occurrence, never once'], questions: [two[0]], record: theirAnswer('Q1', 'warn.frequency', 'warn once', 'warn on every occurrence, never once') }),
    ['ai', 'flipped', true], 'the negated half of their sentence');
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
