// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// A first context can leave a DRAFT with rows missing; without what is tested here every later context reads the issue and the code
// again, tries an edit, is told what the plan lacks, and ends.
// An open plan is the first thing a new session does; it is not dropped on a word list; no filler fork is asked for. The first test
// uses a plan as a session writes one (its first write, the plan record and 13 records) and the person's messages.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, wire, planRecords, editEvent, ruling, sentBy, textOf, readyOne, starting, theirAnswer, stateOf, noForks, shows } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const { said: { clausesOf } } = require('@atlasbound/kit');
const ISSUE = '# Deprecated options\nPeople who keep a command line program built on this library want to retire an option without breaking the scripts that '
  + 'still pass it. Add a way to mark an option as deprecated.';
const CONTINUE = 'Continue the work on the issue.'; // the line a person sends at every new context
const FILES = { 'lib/option.js': 'a\nb\n', 'lib/command.js': 'c\nd\n', 'typings/index.d.ts': 't\n', 'tests/option.chain.test.js': 'x\n', 'Readme.md': 'r\n' };
const HEAD = { title: 'Option.deprecated(): warn when a deprecated option is used', why: 'Program authors want to retire an option without breaking scripts that still pass it.',
  success: 'Using an option marked .deprecated(msg) writes a warning naming the option and msg through writeErr; the value is stored as before.', kind: 'feature',
  level: 'micro' };
const Q1 = { t: 'question', q: 'Q1', text: 'Warn on every occurrence (--old a --old b warns twice) or once per parse? Recommendation: once per parse.',
  decides: 'deprecated.frequency', whyNotCode: 'Behavioural preference not specified in the task.', blocking: false };
const Q2 = { t: 'question', q: 'Q2', text: 'Should a value supplied by the option\'s .env() variable also warn, or only command-line use? Recommendation: command line only.',
  decides: 'deprecated.envVar', whyNotCode: 'Task says \'run with a deprecated option\'; env case is ambiguous.', blocking: false };
const link = (file, why) => ({ t: 'link', rel: 'plans', to: `file:${file}`, why });
const FIRST = [{ t: 'research', tool: 'read', asked: 'Where are CLI option values handled and where does error output go?',
  answer: 'Command.addOption registers an option listener calling handleOptionValue; error output goes through writeErr.', source: 'lib/command.js:1' },
{ t: 'item', kind: 'feature', text: 'Add Option.deprecated(message?) storing isDeprecated/deprecationMessage, returning this.' },
link('lib/option.js', 'new deprecated() method and fields'), link('lib/command.js', 'emit the warning when the option is used'),
link('typings/index.d.ts', 'declare deprecated(message?: string): this'), link('tests/options.deprecated.test.js', 'new tests'),
link('tests/option.chain.test.js', 'deprecated() returns this'), link('Readme.md', 'doc line'),
{ t: 'check', id: 'AC-1', text: 'New and chain tests pass under node --test', command: 'node --test tests/options.deprecated.test.js tests/option.chain.test.js' },
{ t: 'check', id: 'AC-2', text: 'Full node test suite still passes', command: 'node --test' },
{ t: 'item', kind: 'task', text: 'Implement deprecated() in option.js and warning in command.js addOption', covers: ['AC-1'] },
{ t: 'item', kind: 'task', text: 'Add typings, Readme line, tests; run full suite', covers: ['AC-1', 'AC-2'] }, Q1, Q2];
const REPLY_TEXT = ['Answers from me (the developer):',
  '- About "warn on every occurrence or once per parse?": One warning per parse, however many times the option is given.',
  '- About "should a value from the option\'s environment variable also warn?": Only when the person typed the option on the command line.',
  '- About "go ahead?": Yes, go ahead.'].join('\n');
const SAID = { Q1: 'One warning per parse, however many times the option is given.', Q2: 'Only when the person typed the option on the command line.' };
const answered = (q, key, value) => theirAnswer(q, key, value, SAID[q]);
const NO_FORK = { t: 'item', kind: 'no-fork', text: 'The task text settles the warning\'s wording, its output and the return value; nothing else is left to choose.' };

/** A started AI session on this world; `enter` begins a new one (a new context), `say` is a person's prompt in it. */
async function openWorld() {
  const io = bookWorld({ files: FILES, branch: 'main' });
  writeConfig(io, { protect: ['lib/**', 'typings/**'] });
  const enter = async (id) => {
    await handlers.start(starting(id), io);
    io.session = id;
    return handlers.session(starting(id), io);
  };
  await enter('s1');
  const say = (prompt) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: io.session, prompt }, io);
  const create = (records, head = HEAD) => verbs.create(io, { rest: [wire({ ...head, records })] }).then((res) => res.out.id, (err) => err.code);
  const add = (id, records) => verbs.add(io, { rest: [id, wire(records)] });
  const refused = (id, records) => add(id, records).then((res) => res.out.code, (err) => err.code);
  const edit = async (file = 'lib/option.js') => handlers.preEdit({ ...editEvent(file), session_id: io.session }, io);
  const codes = (step, back = 1) => io.fs.readText('.atlasbound/trace/r1.ndjson').trim().split('\n').map((line) => JSON.parse(line)).filter((r) => r.step === step)
    .at(-back).codes; // the codes of a step's last run, or of the one `back` before the end
  const plans = () => (io.fs.list('.decisionbook') || []).filter((name) => name.endsWith('.jsonl')).length;
  return { io, enter, say, create, add, refused, edit, codes, plans };
}

test('[I-32] a draft left open: a new session is shown the draft with its one call, finishes it, the gate opens', async () => {
  const w = await openWorld();
  await w.say(ISSUE);
  const id = await w.create(FIRST);
  // a new context: the first session died at the boundary
  const start = textOf(await w.enter('s2'));
  assert.match(start, new RegExp(`^Plan ${id} draft \\(normal\\) on main: [^\\n]+: the work in progress here\\. Finish this plan before any research or edit`, 'm'));
  // the light form: normal work asks no research count, gap, step, actor, edge or impact row; this plan lacks the answers and the yes
  assert.match(start, new RegExp(`^not READY: ${id} lacks answers, confirm\\. Yours to fill now, with no one asked: `
    + 'answers\\. The person\'s: ask them all in one message, in plain words, each with the answer you propose [^\\n]+: Q1: [^\\n]+; Q2: [^\\n]+'
    + `The one call that shows what is missing, as one add you fill and send: \`atlasbound decisionbook ready ${id}\`; the person types no command$`, 'm'));
  assert.equal(w.codes('decisionbook.session')['draft-shown'], 1, 'traced');
  // that line, and a first message with no word of any list: the same answer, the open plan, never "there is none" nor a new
  for (const first of [CONTINUE, 'The deprecated option of this library, where it stood.']) {
    const told = await w.say(first);
    assert.equal(told.code, 'prompt-earlier', first);
    assert.deepEqual(told.say.map((s) => [s.key, s.text === start]), [['decisionbook.start', true]], 'the start\'s own text under its key: said once a context');
    assert.ok(!/there is none|decisionbook new <</.test(textOf(told)), textOf(told));
  }
  // an edit before the plan is finished: the same sentence and the same one call, no fill-in pasted into the denial
  const denied = await w.edit();
  assert.deepEqual(ruling(denied), ['deny', 'plan-draft-here']);
  assert.ok(denied.reason.includes(start.split('\n')[1].slice('not READY: '.length)) && !denied.reason.includes('<<\'JSON\''), denied.reason);
  // the one call: what is missing as one add; no blank question and no blank no-fork item, the person's answers and yes
  const shown = await verbs.ready(w.io, { rest: [id] });
  const handed = sentBy(shown.text, `add ${id}`);
  assert.deepEqual(handed.map((r) => r.answers || r.t), ['Q1', 'Q2', 'confirm'], 'the person\'s part only: an answer to each question asked, and their yes');
  assert.match(shown.text, /ready-answers: ask the person every behaviour the task and the code leave open, one question each/);
  assert.match(shown.text, /forks counted: none \(normal work needs at least 3: a floor, never the target; every behaviour still open is one more question\)/);
  // the person's answers are bound by the product at their message. Two questions were
  // asked, fewer than the level's three, so the plan says of each planned file what was read there and why nothing in it is open
  const bound = await w.say(REPLY_TEXT);
  assert.equal(bound.code, 'answers-bound');
  assert.match(textOf(bound), new RegExp(`as their decisions on plan ${id}: Q1, Q2\\.[^]*\\n {2}forks counted: deprecated\\.frequency, deprecated\\.envVar \\(`));
  const decided = () => planRecords(w.io, id).filter((r) => r.t === 'decision').map((r) => [r.answers, r.by, r.value]);
  assert.deepEqual(decided(), [['Q1', 'the person', SAID.Q1], ['Q2', 'the person', SAID.Q2]], 'their own words, whole');
  const traced = w.codes('decisionbook.prompt');
  assert.deepEqual([traced['plan-continued'], traced['answer-bound']], [1, 2], JSON.stringify(traced));
  assert.deepEqual(ruling(await w.edit()), ['deny', 'plan-draft-here'], 'two answers of theirs and nothing said of the files: no READY yet');
  // an add of the same answers, in a value of their words, still stands as theirs and changes no row
  const fill = handed.map((r) => ({ ...r, ...(r.answers === 'Q1' && answered('Q1', 'deprecated.frequency', 'One warning per parse')),
    ...(r.answers === 'Q2' && answered('Q2', 'deprecated.envVar', 'Only when the person typed the option on the command line')),
    ...(r.t === 'confirm' && { by: 'the developer', said: 'Yes, go ahead.' }) }));
  const short = await w.add(id, fill.filter((r) => r.t !== 'confirm'));
  assert.equal(stateOf(short), 'ready-answers,ready-no-confirm', 'the row waits');
  assert.deepEqual([short.out.asAi, w.codes('decisionbook.add')['answer-bound']], [[], 2]);
  const done = await w.add(id, [...noForks(FIRST), ...fill.filter((r) => r.t === 'confirm')]);
  assert.equal(stateOf(done), 'READY', done.text);
  assert.deepEqual(decided().map(([q, by]) => [q, by]), [['Q1', 'the person'], ['Q2', 'the person'], ['Q1', 'the person'], ['Q2', 'the person']]);
  assert.deepEqual([w.codes('decisionbook.add')['no-fork-stated'], w.codes('decisionbook.add')['plan-ready']], [6, 1]);
  assert.deepEqual(ruling(await w.edit()), ['allow', 'gate-in-scope'], 'code can be written');
  assert.equal(w.plans(), 1, 'one plan: no re-plan');
});

test('[I-32] no filler fork: leave to edit a planned file is refused; "no further fork" says why and waits for each question', async () => {
  const w = await openWorld();
  await w.say(ISSUE);
  const id = await w.create(FIRST.filter((r) => r.t !== 'question'));
  const ask = (q, text) => ({ t: 'question', q, text, decides: `deprecated.${q.toLowerCase()}`, whyNotCode: 'not in the task', blocking: false });
  await assert.rejects(w.add(id, [ask('Q1', 'May I edit lib/option.js and lib/command.js?')]),
    (err) => err.code === 'question-permission' && /Q1 asks leave to edit lib\/option\.js: a question that asks leave to edit a file the plan already names is no fork/.test(err.message));
  assert.equal(await w.refused(id, [ask('Q1', 'lib/command.js dosyasını düzenleyebilir miyim?')]), 'question-permission', 'in another language of the list');
  assert.equal(await w.refused(id, [ask('Q1', 'Should lib/command.js warn once per parse or on every use of the option?')]), 'plan-recorded', 'a real fork may name the file');
  assert.equal(await w.refused(id, [{ t: 'item', kind: 'no-fork', text: 'none left' }]), 'no-fork-unsaid', 'it says why');
  // attack: "no further fork" on a plan that holds a choice of the person: it counts for nothing until they answered it
  const stated = await w.add(id, [NO_FORK]);
  assert.ok(stateOf(stated).split(',').includes('ready-answers'), stateOf(stated));
  assert.match(stated.text, /; Q1 still wait for the person's answer; no further fork is stated after 1 question\(s\), fewer than the level asks/);
  const own = await w.add(id, [theirAnswer('Q1', 'deprecated.q1', 'once per parse', 'Once per parse is what the developer wants.')]);
  assert.deepEqual([planRecords(w.io, id).at(-1).by, stateOf(own).split(',').includes('ready-answers')], ['ai', true], 'the AI\'s own answer to its question leaves it waiting');
  await w.say('Once per parse, please.');
  const theirs = await w.add(id, [theirAnswer('Q1', 'deprecated.q1', 'Once per parse', 'Once per parse, please.')]);
  // one question asked where the level asks three: the no-fork sentence alone no longer stands for the rest
  assert.ok(stateOf(theirs).split(',').includes('ready-answers'), theirs.text);
  assert.match(theirs.text, /each planned file needs its own no-fork item \("file", what you read there, why nothing in it is open\); none yet for: lib\/option\.js, lib\/command\.js, /);
  await assert.rejects(w.add(id, [{ ...NO_FORK, file: 'lib/help.js' }]), (err) => err.code === 'no-fork-unplanned' && /lib\/help\.js: a no-fork item speaks of a file the plan plans/.test(err.message));
  const some = await w.add(id, noForks(FIRST).slice(0, 5));
  assert.ok(stateOf(some).split(',').includes('ready-answers'), 'five of the six planned files named: the row still waits');
  const all = await w.add(id, noForks(FIRST).slice(5));
  assert.ok(!stateOf(all).split(',').includes('ready-answers'), `the person answered and every planned file is spoken of: the row holds\n${all.text}`);
});

// a plan that asks nothing, with a no-fork item of three words and the person's "ok", is not READY.
test('[I-33] ask what is open: zero questions, a no-fork sentence and the person\'s "ok" are not READY; no no-fork is handed', async () => {
  const w = await openWorld();
  await w.say(ISSUE);
  const id = await w.create(FIRST.filter((r) => r.t !== 'question'));
  const handed = sentBy((await verbs.ready(w.io, { rest: [id] })).text, `add ${id}`);
  assert.equal(handed.filter((r) => r.kind === 'no-fork').length, 0, 'the first fill-in of a plan that asked nothing pre-prints no no-fork item');
  const fill = handed.map((r, i) => ({ ...r, ...(r.t === 'research' && { tool: 'read', asked: `where options are added ${i}`, answer: 'addOption', source: 'lib/command.js:2' }),
    ...(r.kind === 'gap' && { text: 'checked in the code', source: 'lib/option.js:1' }), ...(r.kind === 'step' && { change: 'as planned' }),
    ...(['actor', 'edge', 'impact'].includes(r.kind) && { text: `${r.kind} of the deprecated option ${i}` }), ...(r.t === 'confirm' && { by: 'the developer', said: 'ok' }) }));
  await w.say('ok');
  const zero = await w.add(id, [...fill.filter((r) => r.t !== 'confirm'), { t: 'item', kind: 'no-fork', text: 'nothing further open' }, ...fill.filter((r) => r.t === 'confirm')]);
  assert.equal(stateOf(zero), 'ready-answers', `regression: this was READY\n${zero.text}`);
  assert.deepEqual(ruling(await w.edit()), ['deny', 'plan-draft-here'], 'no edit on a plan that asked nothing');
  // the two ways on: ask (three questions, each answered by the person), or say of every planned file what was read there
  const ask = (n) => ({ t: 'question', q: `Q${n}`, text: `Open behaviour ${n} of the deprecated warning: variant a${n} or variant b${n}?`, decides: `deprecated.b${n}`, whyNotCode: 'the task does not say', blocking: false });
  await w.add(id, [1, 2, 3].map(ask));
  assert.equal(w.codes('decisionbook.add')['question-asked'], 3, 'traced');
  await w.say('Q1: variant a1.\nQ2: variant b2.\nQ3: variant a3.');
  const answers = await w.add(id, [1, 2, 3].map((n) => theirAnswer(`Q${n}`, `deprecated.b${n}`, n === 2 ? 'variant b2' : `variant a${n}`, n === 2 ? 'Q2: variant b2.' : `Q${n}: variant a${n}.`)));
  assert.ok(!stateOf(answers).split(',').includes('ready-answers'), `asked the level's number, each answered by the person: the sentence stands for the rest\n${answers.text}`);
  // the person's answer names Q4: it is not stored as the AI's ("moved") because it
  // shares more words with a longer question; a sentence of theirs that names the question is that question's, and only that one's
  await w.add(id, [{ ...ask(4), text: 'Exact warning text?' }, { ...ask(5), text: 'If the deprecated option is passed several times in one run, warn once or on each use?' }]);
  const NAMED = '- About "Q4. What should the warning say?": Any clear wording, as long as it names the option and includes the message.';
  await w.say(NAMED);
  const value = 'Any clear wording, as long as it names the option and includes the message.';
  await w.add(id, [theirAnswer('Q5', 'deprecated.b5', value, NAMED)]);
  await w.add(id, [theirAnswer('Q4', 'deprecated.b4', value, NAMED)]);
  assert.deepEqual(planRecords(w.io, id).slice(-2).map((r) => [r.answers, r.by]), [['Q5', 'ai'], ['Q4', 'the person']]);
});

test('[I-32] an open plan is never dropped silently: a new is refused beside it, only the person\'s answer sets it aside', async () => {
  const w = await openWorld();
  await w.say(ISSUE);
  const id = await w.create(FIRST);
  await w.enter('s2');
  const told = await w.say('Fix the typo in the Readme first, it says "optoin" twice.');
  assert.equal(told.code, 'prompt-earlier', 'other work or not, the message alone decides nothing');
  assert.match(textOf(told), new RegExp(`Only if the person's message plainly names other work: ask them, in a message that names plan ${id} and ends your turn, whether it is set aside`));
  const other = { title: 'Readme typo', why: 'optoin twice', success: 'spelled right', kind: 'chore', level: 'micro' };
  assert.equal(await w.create([], other), 'plan-open', 'no second plan beside the open one');
  // attack rows: "set aside" without the person's answer
  const aside = (said, by = 'the developer') => w.refused(id, [{ t: 'aside', by, said }]);
  assert.equal(await aside('Yes, set the old plan aside.'), 'aside-not-asked', 'words the person never said');
  assert.equal(await aside('Fix the typo in the Readme first, it says "optoin" twice.', 'ai'), 'aside-not-asked', 'signed by the AI');
  assert.equal(await aside('People who keep a command line program built on this library want to retire an option without breaking the scripts that still pass it.'),
    'aside-not-asked', 'their sentence of an earlier session, from before this one was shown the plan');
  assert.equal(await aside('Fix the typo'), 'aside-not-asked', 'a piece of their sentence');
  assert.equal(w.plans(), 1);
  // a whole sentence of theirs in this session that the AI reads as "set it aside",
  // with no question put to them first, sets nothing aside; nor does a yes of theirs to something else
  assert.equal(await aside('Fix the typo in the Readme first, it says "optoin" twice.'), 'aside-not-asked', 'regression: their own whole sentence, never asked');
  await w.say('Yes, leave the deprecated option plan for now.');
  assert.equal(await aside('Yes, leave the deprecated option plan for now.'), 'aside-not-asked', 'regression: said before any question was shown');
  await shows(w.io, 'I will fix the typo. Shall I go ahead?');
  await w.say('Yes.');
  assert.equal(await aside('Yes.'), 'aside-not-asked', 'a yes to a message that did not name the plan');
  // the question shown first (the turn's last message names the plan and asks), then their answer in their next message
  await shows(w.io, `Plan ${id} (the deprecated option) is still open here. Is it set aside while I fix the Readme typo?`);
  assert.equal(w.codes('decisionbook.stop')['aside-asked'], 1, 'traced');
  await w.say('No, keep it, do the typo inside it.');
  assert.equal(await aside('No, keep it, do the typo inside it.'), 'aside-not-asked', 'their no is no yes');
  await shows(w.io, `Understood. Plan ${id} stays open. Set it aside after all?`);
  await w.say('Go on with it then.');
  assert.equal(await aside('Go on with it then.'), 'aside-not-asked', 'an answer that is no yes');
  // a message that names the plan to say it goes on and asks something else asked
  // nothing of it; a message that asked is not the one their yes replies to once a newer message asked something else
  await shows(w.io, `Plan ${id} goes on. Shall I fix the Readme typo inside it first?`);
  await w.say('Yes, do.');
  assert.equal(await aside('Yes, do.'), 'aside-not-asked', 'regression: it named the plan and asked another question');
  await shows(w.io, `Plan ${id}: set it aside?`);
  await shows(w.io, 'Which spelling should the Readme use, British or American?');
  await w.say('Yes, British.');
  assert.equal(await aside('Yes, British.'), 'aside-not-asked', 'regression: the newest message before their yes asked something else');
  await shows(w.io, `Plan ${id}: set it aside?`);
  await w.say('Yes, leave the deprecated option plan for now.');
  await w.say('And use British spelling.');
  const set = await w.add(id, [{ t: 'aside', by: 'the developer', said: 'Yes, leave the deprecated option plan for now.' }]); // their yes, in their next message
  assert.deepEqual([set.out.state.state, planRecords(w.io, id).at(-1).by, w.codes('decisionbook.add')['plan-set-aside']], ['aside', 'the person', 1]);
  assert.equal(set.text.trim().split('\n').at(-1), `${id} aside`);
  const made = await w.create([], other);
  assert.match(made, /readme-typo$/, 'now the other work is planned');
  assert.ok(!textOf(await w.enter('s3')).includes(id), 'the plan set aside is no session\'s work in progress');
  // a READY plan an earlier session left: the same rule. READY is the freeze, so a resume record of this session lifts nothing
  // (it is history); only the session that made the plan READY plans beside it
  const world = () => {
    const r = bookWorld({ files: { 'app/x.rb': 'class X\n' } });
    writeConfig(r, { protect: ['app/**'] });
    return r;
  };
  const again = (r) => verbs.create(r, { rest: [wire(other)] }).then((res) => res.out.code, (err) => err.code);
  const r = world();
  const ready = await readyOne(r, { plans: ['app/x.rb'] });
  await handlers.start(starting('s2'), r);
  r.session = 's2';
  await handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's2', prompt: 'Add a CSV download to the report page' }, r);
  assert.equal(await again(r), 'plan-open');
  await verbs.add(r, { rest: [ready.id, wire({ t: 'resume', why: 'the export work goes on' })] });
  assert.equal(await again(r), 'plan-open', 'a resume record opens no second plan: the READY plan stands until it is closed or set aside');
  const own = world();
  await readyOne(own, { plans: ['app/x.rb'] });
  own.session = 's1'; // the session whose start the world holds from its first instant: the plan became READY after it began
  assert.equal(await again(own), 'plan-created', 'a session that began before the plan was READY plans beside it, in sight');
});

// an AI's own message may invite 'or "go with the defaults"': a decision recorded on the person's reply to it
// is theirs, never stored `by: ai` with the gate shut.
test('[I-33] an invited reply is the person\'s: it decides each question the message before it showed with a proposal', async () => {
  const w = await openWorld();
  await w.say(ISSUE);
  const ask = (q, text, proposal) => ({ t: 'question', q, text, decides: `deprecated.${q.toLowerCase()}`, whyNotCode: 'the task does not say', blocking: true,
    ...(proposal && { proposal }) });
  const id = await w.create([...FIRST.filter((r) => r.t !== 'question'), ask('Q1', 'Warn on every occurrence or once per parse?', 'once per parse'),
    ask('Q2', 'Should a value from the environment variable also warn?', 'command line only'), ask('Q3', 'Where does the help output list a deprecated option?')]);
  const take = (q, value, said = 'Go with your suggestions.') => theirAnswer(q, `deprecated.${q.toLowerCase()}`, value, said);
  const last = (n) => planRecords(w.io, id).filter((r) => r.t === 'decision').slice(-n).map((r) => [r.answers, r.by, r.value]);
  const QUESTIONS = 'Q1: every occurrence or once per parse? I propose: once per parse.\nQ2: the environment variable too? I propose: command line only.\nQ3: where in the help output?';
  // attack: the reply came with no message of the AI before it that showed the proposals (stored as the AI's)
  await w.say('Go with your suggestions.');
  const blind = await w.add(id, [take('Q1', 'once per parse')]);
  assert.deepEqual([last(1), /Q1 was not among them/.test(blind.text)], [[['Q1', 'ai', 'once per parse']], true], blind.text);
  // the words of the proposals spread over sentences that show no proposal
  await shows(w.io, 'Q1: warn once, or on every occurrence, per parse of the command? Q2: is the environment variable read on one line only? Q3: where?');
  await w.say('Go with your suggestions.');
  await w.add(id, [take('Q1', 'once per parse'), take('Q2', 'command line only')]);
  assert.deepEqual(last(2), [['Q1', 'ai', 'once per parse'], ['Q2', 'ai', 'command line only']], 'regression: a proposal is shown as one run of its words');
  // the AI shows Q1 and Q2 with their proposals and Q3 with none; their reply takes the proposals whole
  await shows(w.io, QUESTIONS);
  assert.equal(w.codes('decisionbook.stop')['proposal-shown'], 1, 'traced');
  await w.say('Go with your suggestions.');
  await w.add(id, [take('Q2', 'on every use')]);
  assert.deepEqual(last(1), [['Q2', 'ai', 'on every use']], 'attack: a value that is not the proposal as shown');
  await w.add(id, [take('Q3', 'in the options list')]);
  assert.deepEqual(last(1), [['Q3', 'ai', 'in the options list']], 'attack: a question shown without a proposal');
  const taken = await w.add(id, [take('Q1', 'once per parse'), take('Q2', 'command line only')]);
  assert.deepEqual(last(2), [['Q1', 'the person', 'once per parse'], ['Q2', 'the person', 'command line only']], `regression: both by ai\n${taken.text}`);
  assert.equal(planRecords(w.io, id).filter((r) => r.t === 'decision').at(-1).said, 'Go with your suggestions.', 'in the person\'s sentence');
  assert.equal(w.codes('decisionbook.add')['proposals-taken'], 2, 'traced');
  assert.ok(stateOf(taken).split(',').includes('ready-open-question'), 'Q3 still waits for their own answer');
  // other invited forms, and what is no such reply: a negation, a reply two messages after the proposals were shown
  for (const [reply, by] of [['Yes to all.', 'the person'], ['Go with the defaults.', 'the person'], ['Önerdiğin gibi yap.', 'the person'], ['Do not go with your suggestions.', 'ai']]) {
    await shows(w.io, QUESTIONS);
    await w.say(reply);
    await w.add(id, [take('Q1', 'once per parse', reply)]);
    assert.deepEqual(last(1), [['Q1', by, 'once per parse']], reply);
  }
  await shows(w.io, QUESTIONS);
  await w.say('What does Q2 change for scripts?');
  await shows(w.io, 'It only changes when the warning is written.');
  await w.say('Go with your suggestions.');
  await w.add(id, [take('Q1', 'once per parse')]);
  assert.deepEqual(last(1), [['Q1', 'ai', 'once per parse']], 'the message before their reply showed no proposal');
});

// the person answers in a list, each item quoting the question as the AI asked it. Such an answer is theirs whole, never
// stored as the AI's (`moved`: it shares more words with another question) and theirs only once cut down to a side sentence;
// a second item about one question is in a record too.
test('[I-34] an answer given as a list item is their whole item, under the question it quotes; a side sentence is not', async () => {
  const w = await openWorld();
  await w.say(ISSUE);
  const ask = (q, text) => ({ t: 'question', q, text, decides: `deprecated.${q.toLowerCase()}`, whyNotCode: 'the task does not say', blocking: true });
  const id = await w.create([...FIRST.filter((r) => r.t !== 'question'), ask('Q1', 'Warn on every occurrence or once per parse?'),
    ask('Q2', 'Should a value from the environment variable also warn?'), ask('Q3', 'Where does the help output list a deprecated option?')]);
  const ITEMS = ['Once per parse, whatever the number of occurrences. A second parse in the same process warns again.',
    'Only when the person typed the deprecated option; the help output and its list stay silent.',
    'In the options list, marked (deprecated).', 'Yes, the description stays as it is.'];
  await w.say(['Answers from me (the developer):', `- About "Should it warn on every occurrence, or once per parse? I suggest once.": ${ITEMS[0]}`,
    `- About "Does a value from the environment variable warn too?": ${ITEMS[1]}`, `- About "Where does the help output list a deprecated option?": ${ITEMS[2]}`,
    `- About "Does the help output keep the option's description?": ${ITEMS[3]}`].join('\n'));
  const answer = (q, value, said) => w.add(id, [theirAnswer(q, `deprecated.${q.toLowerCase()}`, value, said)]);
  const last = () => planRecords(w.io, id).filter((r) => r.t === 'decision').slice(-1).map((r) => [r.answers, r.by, r.value])[0];
  // attack rows: a side sentence of their item; their item under another question than the one it quotes
  const side = await answer('Q1', 'A second parse in the same process warns again.', 'A second parse in the same process warns again.');
  assert.deepEqual([last(), side.out.asAi], [['Q1', 'ai', 'A second parse in the same process warns again.'], [{ key: 'deprecated.q1', q: 'Q1', why: 'part', items: [1] }]],
    'regression: a side sentence was the person\'s decision');
  assert.match(side.text, /"said" leaves out a part of the person's answer to Q1: their answer is the list items numbered 1 of their message; copy those into "said" whole/);
  const moved = await answer('Q3', 'the help output and its list stay silent', ITEMS[1]);
  assert.deepEqual([last()[1], moved.out.asAi[0].why], ['ai', 'moved']);
  // must pass: the whole item, with a value in its words; an item that shares more words with another question is still its own question's
  await answer('Q1', 'Once per parse', ITEMS[0]);
  assert.deepEqual(last(), ['Q1', 'the person', 'Once per parse']);
  const quoted = await answer('Q2', 'Only when the person typed the deprecated option', ITEMS[1]);
  assert.deepEqual(last(), ['Q2', 'the person', 'Only when the person typed the deprecated option'], `regression: moved\n${quoted.text}`);
  // two items quote Q3: their answer to it is both, so the second one is lost in no record
  const one = await answer('Q3', 'In the options list', ITEMS[2]);
  assert.deepEqual([last()[1], one.out.asAi[0].items], ['ai', [3, 4]], 'regression: the person\'s, with their fourth item in no record');
  const both = await answer('Q3', 'In the options list', `${ITEMS[2]}\n${ITEMS[3]}`);
  assert.deepEqual([last(), planRecords(w.io, id).filter((r) => r.t === 'decision').at(-1).said.includes('the description stays as it is')], [['Q3', 'the person', 'In the options list'], true]);
  assert.equal(stateOf(both).includes('ready-open-question'), false, 'every question has their answer');
});

// a message's clauses are kept whole: a cap of 80 clauses would make a longer answer lose its
// last items silently, and they could never be the person's
test('[I-34] a long answer is kept whole: their answer in the last items of a 200-clause message is theirs', async () => {
  const w = await openWorld();
  await w.say(ISSUE);
  const id = await w.create([...FIRST.filter((r) => r.t !== 'question'), { t: 'question', q: 'Q1', text: 'Warn on every occurrence or once per parse?',
    decides: 'deprecated.q1', whyNotCode: 'the task does not say', blocking: true }]);
  const ITEM = 'Once per parse, whatever the number of occurrences.';
  const notes = Array.from({ length: 196 }, (_, i) => `- Note ${i + 1}: the option table stays as it is.`);
  const message = ['Answers from me:', ...notes, `- About "Warn on every occurrence or once per parse?": ${ITEM}`].join('\n');
  assert.ok(clausesOf(message).length >= 200, `${clausesOf(message).length} clauses`);
  await w.say(message);
  const added = await w.add(id, [theirAnswer('Q1', 'deprecated.q1', 'Once per parse', ITEM)]);
  // the product bound the item itself at the prompt, whole; the AI's own add of the same answer is the person's too
  assert.deepEqual(planRecords(w.io, id).filter((r) => r.t === 'decision').map((r) => [r.answers, r.by, r.value]),
    [['Q1', 'the person', ITEM], ['Q1', 'the person', 'Once per parse']], `regression: the AI's (unsaid)\n${added.text}`);
});
