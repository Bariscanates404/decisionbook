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
const { bookWorld, writeConfig, wire, planRecords, editEvent, ruling, sentBy, textOf, readyOne, starting, theirAnswer, stateOf, noForks, storedOf } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
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
  // a new context: the first session died at the boundary. Its start names the draft in one line that asks nothing of the person
  const start = textOf(await w.enter('s2'));
  assert.match(start, new RegExp(`^Plan ${id} draft on main: [^\\n]+: an open draft an earlier session left, not READY\\. Ask the person nothing about it first: `
    + `when their task goes on with it or is on its files, finish it \\(\`atlasbound decisionbook ready ${id}\` shows what it lacks;[^\\n]+$`));
  assert.equal(w.codes('decisionbook.session')['draft-shown'], undefined, 'not said as the work in progress before a message is on it');
  // a message that goes on with it in no word of the plan: that line under its own key and the pack, never "there is none"
  const going = await w.say(CONTINUE);
  assert.deepEqual([going.code, going.say.map((s) => [s.key, s.text === start])], ['prompt-nudge', [['decisionbook.draft', true], ['decisionbook.pack', false], ['decisionbook.answers', false]]]);
  assert.ok(!/there is none|decisionbook new <</.test(textOf(going)), textOf(going));
  // a message on its words: the draft whole, as the work in progress
  const told = await w.say('The deprecated option of this library, where it stood.');
  assert.deepEqual([told.code, told.say.map((s) => s.key), w.codes('decisionbook.prompt')['draft-shown']], ['prompt-earlier', ['decisionbook.start', 'decisionbook.answers'], 1]);
  const whole = textOf(told);
  assert.match(whole, new RegExp(`^Plan ${id} draft \\(normal\\) on main: [^\\n]+: the work in progress here\\. Finish this plan before any research or edit`, 'm'));
  // the light form: normal work asks no research count, gap, step, actor, edge or impact row; this plan lacks the answers and the yes
  assert.match(whole, new RegExp(`^not READY: ${id} lacks answers, confirm\\. Yours to fill now, with no one asked: `
    + 'answers\\. The person\'s: ask them all in one message, in plain words, each with the answer you propose [^\\n]+: Q1: [^\\n]+; Q2: [^\\n]+'
    + `The one call that shows what is missing, as one add you fill and send: \`atlasbound decisionbook ready ${id}\`; the person types no command$`, 'm'));
  assert.equal((await verbs.resume(w.io, { rest: [] })).out.text, start, 'resume says the start\'s line');
  // an edit before the plan is finished: the same sentence and the same one call, no fill-in pasted into the denial
  const denied = await w.edit();
  assert.deepEqual(ruling(denied), ['deny', 'plan-draft-here']);
  assert.ok(denied.reason.includes(whole.split('\n')[1].slice('not READY: '.length)) && !denied.reason.includes('<<\'JSON\''), denied.reason);
  // the one call: what is missing as one add; no blank question and no blank no-fork item, the person's answers and yes
  const shown = await verbs.ready(w.io, { rest: [id] });
  const handed = sentBy(shown.text, `add ${id}`);
  assert.deepEqual(handed.map((r) => r.answers || r.t), ['Q1', 'Q2', 'confirm'], 'the person\'s part only: an answer to each question asked, and their yes');
  assert.match(shown.text, /ready-answers: a fork counts when research settles it citing file:line/);
  assert.match(shown.text, /forks counted: none \(normal work needs at least 3, or a no-fork item per planned file: ask only what a human must decide, never to reach the number\)/);
  // the person answers; the AI records their answers in one add, the values as it read them, their words beside. Two questions were
  // asked, fewer than the level's three, so the plan says of each planned file what was read there and why nothing in it is open
  await w.say(REPLY_TEXT);
  const fill = handed.map((r) => ({ ...r, ...(r.answers === 'Q1' && answered('Q1', 'deprecated.frequency', 'One warning per parse')),
    ...(r.answers === 'Q2' && answered('Q2', 'deprecated.envVar', 'Only when the person typed the option on the command line')),
    ...(r.t === 'confirm' && { by: 'the developer', said: 'Yes, go ahead.' }) }));
  const short = await w.add(id, fill.filter((r) => r.t !== 'confirm'));
  assert.equal(stateOf(short), 'ready-answers,ready-no-confirm', 'the row waits');
  assert.match(short.text, /\n {2}forks counted: deprecated\.frequency, deprecated\.envVar \(/);
  const decided = () => planRecords(w.io, id).filter((r) => r.t === 'decision').map((r) => [r.answers, r.by, r.said]);
  assert.deepEqual(decided(), [['Q1', 'Amy', storedOf(REPLY_TEXT, SAID.Q1)], ['Q2', 'Amy', storedOf(REPLY_TEXT, SAID.Q2)]], 'their own words beside the values');
  const traced = w.codes('decisionbook.add');
  assert.deepEqual([traced['plan-continued'], traced['answer-bound']], [1, 2], JSON.stringify(traced));
  assert.deepEqual(ruling(await w.edit()), ['deny', 'plan-draft-here'], 'two answers of theirs and nothing said of the files: no READY yet');
  const done = await w.add(id, [...noForks(FIRST), ...fill.filter((r) => r.t === 'confirm')]);
  assert.equal(stateOf(done), 'READY', done.text);
  assert.deepEqual([w.codes('decisionbook.add')['no-fork-stated'], w.codes('decisionbook.add')['plan-ready']], [6, 1]);
  assert.deepEqual(ruling(await w.edit()), ['allow', 'gate-in-scope'], 'code can be written');
  assert.equal(w.plans(), 1, 'one plan: no re-plan');
});

// This machine's own draft, its questions waiting: every unrelated new session first asked the person to set it aside.
test('[I-32] a draft an earlier session here left stops no unrelated task: one line, no question, other work beside it', async () => {
  const w = await openWorld();
  await w.say(ISSUE);
  await w.create(FIRST);
  for (const [session, task] of [['s2', 'ortak/fizik.js\'e AU↔km dönüştüren bir yardımcı fonksiyon ekle.'], ['s3', 'Ders 16\'daki Jüpiter düğmesini kaldır.']]) {
    const start = textOf(await w.enter(session));
    const told = await w.say(task);
    assert.equal(told.code, 'prompt-nudge', task);
    assert.ok(!/Finish this plan|set aside|there is none/.test(start + textOf(told)), `${start}\n${textOf(told)}`);
  }
  const other = { title: 'AU to km', why: 'lessons convert', success: 'one helper', kind: 'feature', level: 'micro' };
  assert.match(await w.create([link('ortak/fizik.js', 'the helper')], other), /^2026-11-02-au-to-km-[0-9a-f]{4}$/, 'its plan opens beside the draft');
  const on = await w.say('In lib/option.js the deprecated warning should name the option.');
  assert.deepEqual([on.code, /the work in progress here\. Finish this plan/.test(textOf(on))], ['prompt-earlier', true], 'a message on its file: the draft whole');
});

// The record the start's own line shows sets a plan aside on the person's own word, with no question put to them first: `by` empty,
// `said` their words.
test('[I-32] the person\'s own "evet" sets a plan aside, sent as the product shows it: no question asked first', async () => {
  for (const yes of ['evet', 'Evet.']) {
    const w = await openWorld();
    await w.say(ISSUE);
    const id = await w.create(FIRST);
    await w.enter('s2');
    await w.say('ortak/fizik.js\'e AU↔km dönüştüren bir yardımcı fonksiyon ekle.');
    await w.say(yes);
    const set = await w.add(id, [{ t: 'aside', by: '', said: yes }]); // the record as the start's own line shows it
    assert.deepEqual([set.out.state.state, planRecords(w.io, id).at(-1).by], ['aside', 'Amy']);
  }
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
  assert.equal(await w.refused(id, [theirAnswer('Q1', 'deprecated.q1', 'once per parse', 'Once per parse is what the developer wants.')]), 'said-not-theirs',
    'an answer in words the person did not type is refused; the question still waits');
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
  assert.equal(stateOf(zero), 'ready-answers', `the answers still wait for the person: not READY\n${zero.text}`);
  assert.deepEqual(ruling(await w.edit()), ['deny', 'plan-draft-here'], 'no edit on a plan that asked nothing');
  // the two ways on: ask (three questions, each answered by Amy), or say of every planned file what was read there
  const ask = (n) => ({ t: 'question', q: `Q${n}`, text: `Open behaviour ${n} of the deprecated warning: variant a${n} or variant b${n}?`, decides: `deprecated.b${n}`, whyNotCode: 'the task does not say', blocking: false });
  await w.add(id, [1, 2, 3].map(ask));
  assert.equal(w.codes('decisionbook.add')['question-asked'], 3, 'traced');
  await w.say('Q1: variant a1.\nQ2: variant b2.\nQ3: variant a3.');
  const answers = await w.add(id, [1, 2, 3].map((n) => theirAnswer(`Q${n}`, `deprecated.b${n}`, n === 2 ? 'variant b2' : `variant a${n}`, n === 2 ? 'Q2: variant b2.' : `Q${n}: variant a${n}.`)));
  assert.ok(!stateOf(answers).split(',').includes('ready-answers'), `asked the level's number, each answered by the person: the sentence stands for the rest\n${answers.text}`);
});

test('[I-32] an open plan is never dropped silently: a new is refused beside it, only the person\'s own words set it aside', async () => {
  const w = await openWorld();
  await w.say(ISSUE);
  const id = await w.create(FIRST);
  await w.enter('s2');
  const told = await w.say('Fix the typo in the Readme first, it says "optoin" twice.');
  assert.equal(told.code, 'prompt-nudge', 'a message on none of its files or words: the draft in its one line, no question to settle first');
  assert.match(textOf(told), new RegExp(`^Plan ${id} draft on main: [^\\n]+Ask the person nothing about it first`, 'm'));
  const other = { title: 'Readme typo', why: 'optoin twice', success: 'spelled right', kind: 'chore', level: 'micro' };
  assert.equal(await w.create([], other), 'plan-open', 'no second plan beside the open one');
  // the first step of settling a conflict is a new that carries the question naming the open plan's line: that one is no second plan
  const asks = [{ t: 'research', tool: 'read', asked: 'the line', answer: 'one line', source: 'README.md:1' },
    { t: 'question', q: 'Q9', text: 'Which holds?', decides: 'which.holds', whyNotCode: 'theirs', supersedes: [`${id}/which.holds`] }];
  assert.notEqual(await w.create(asks, { ...other, title: 'Which holds' }), 'plan-open', 'the conflict text\'s own path is open');
  // attack rows: "set aside" in words the person did not type in this session
  const aside = (said, by = 'the developer') => w.refused(id, [{ t: 'aside', by, said }]);
  assert.equal(await aside('Yes, set the old plan aside.'), 'aside-not-asked', 'words the person never said');
  assert.equal(await aside('Fix the typo in the Readme first, it says "optoin" twice.', 'ai'), 'aside-not-asked', 'signed by the AI');
  assert.equal(await aside('People who keep a command line program built on this library want to retire an option without breaking the scripts that still pass it.'),
    'aside-not-asked', 'their sentence of an earlier session, from before this one was shown the plan');
  assert.equal(await aside('Fix the typ'), 'aside-not-asked', 'a word cut short is not theirs');
  assert.equal(w.plans(), 1);
  // their own words in this session, read by the AI as "set it aside", set it aside: no question is put to them first
  await w.say('Yes, leave the deprecated option plan for now.');
  await w.say('And use British spelling.');
  const set = await w.add(id, [{ t: 'aside', by: 'the developer', said: 'Yes, leave the deprecated option plan for now.' }]);
  assert.deepEqual([set.out.state.state, planRecords(w.io, id).at(-1).by, w.codes('decisionbook.add')['plan-set-aside']], ['aside', 'Amy', 1]);
  assert.equal(set.text.trim().split('\n').at(-1), `${id} aside`);
  const made = await w.create([], other);
  assert.match(made, /readme-typo-[0-9a-f]{4}$/, 'now the other work is planned');
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

// A shared branch holds a teammate's draft with a question that waits for someone else's word. Before, every new session of every
// teammate was told to finish it first and asked the person whether it is set aside, one turn per session for unrelated work.
test('[I-32] a teammate\'s open draft stops no one: one line that asks nothing, other work is planned beside it', async () => {
  const abe = await openWorld();
  await abe.say(ISSUE);
  const id = await abe.create(FIRST);
  const file = `.decisionbook/${id}.jsonl`;
  const world = (over) => {
    const made = abe.io.fs.readText(file).replaceAll('"at":"2026-11-02T', '"at":"2026-11-01T'); // written the day before
    const io = bookWorld({ files: { ...FILES, 'lib/suggest.js': 's\n', [file]: made }, branch: 'main', authors: { [file]: 'Abe' }, begun: null, ...over });
    writeConfig(io, { protect: ['lib/**', 'typings/**'] });
    return io;
  };
  const enter = async (io, session) => {
    await handlers.start(starting(session), io);
    io.session = session;
    return handlers.session(starting(session), io);
  };
  const codes = (io, step) => io.fs.readText('.atlasbound/trace/r1.ndjson').trim().split('\n').map((line) => JSON.parse(line)).filter((r) => r.step === step).at(-1).codes;
  const io = world(); // another machine: the draft came with the branch, no session here made it
  const start = textOf(await enter(io, 's9'));
  assert.equal(start, `Plan ${id} draft on main: ${HEAD.title} (lib/option.js, lib/command.js, typings/index.d.ts, tests/options.deprecated.test.js, `
    + 'tests/option.chain.test.js, Readme.md): a teammate\'s open draft that came with the branch, not this session\'s work. Ask the person nothing about it '
    + `and leave it as it is; only work on its files goes on in it (\`atlasbound decisionbook ready ${id}\` shows what it lacks). Any other work is planned `
    + 'with its own `atlasbound decisionbook new`', 'one line: no "finish this plan", no question to settle, no aside');
  assert.deepEqual(codes(io, 'decisionbook.session'), { 'session-draft': 1 }, 'not traced as a draft shown as the work in progress');
  const told = await handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's9', prompt: 'Add a --quiet flag to lib/suggest.js that hides the hints.' }, io);
  assert.equal(told.code, 'prompt-nudge', 'the task is planned as new work, with its pack');
  assert.ok(!/Finish this plan|set aside|not READY/.test(textOf(told)), textOf(told));
  assert.equal((await verbs.resume(io, { rest: [] })).out.text, start, 'resume says the same line');
  const other = { title: 'A quiet flag', why: 'hints are noise in scripts', success: 'no hint with --quiet', kind: 'feature', level: 'micro' };
  const create = (records) => verbs.create(io, { rest: [wire({ ...other, records })] }).then((res) => res.out.code, (err) => err.code);
  assert.equal(await create([link('lib/option.js', 'the flag')]), 'plan-open', 'a new that names the draft\'s file is that draft\'s work: refused, it goes on there');
  const denied = await handlers.preEdit({ ...editEvent('lib/option.js'), session_id: 's9' }, io);
  assert.deepEqual(ruling(denied), ['deny', 'plan-draft-here'], 'an edit of its file still meets the draft, with what it lacks');
  assert.equal(await create([]), 'plan-created', 'other work is planned beside it with no word about it');
  // this machine's own draft comes first, though the teammate's file sorts after it; a new session names it in its one line until a
  // message is on it
  const mine = (await verbs.create(io, { rest: [wire({ ...other, title: 'Hide hints quietly', records: [FIRST[0], link('lib/suggest.js', 'the flag'), FIRST[8], Q1] })] })).out.id;
  assert.ok(mine < id, 'the teammate\'s draft is the last plan file');
  const next = textOf(await enter(io, 's10'));
  assert.match(next, new RegExp(`^Plan ${mine} draft on main: Hide hints quietly \\(lib/suggest\\.js\\): an open draft an earlier session left`), next);
  assert.equal(await create([]), 'plan-open', 'and a new beside this machine\'s own open draft is refused as before');
  // this machine's own draft, committed: the line of a draft an earlier session here left, never a teammate's
  const theirs = world({ home: abe.io.home });
  assert.match(textOf(await enter(theirs, 's3')), new RegExp(`^Plan ${id} draft on main: [^\\n]+: an open draft an earlier session left, not READY\\.`));
  assert.equal(codes(theirs, 'decisionbook.session')['draft-shown'], undefined);
});
