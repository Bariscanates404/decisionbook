// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// where a task prompt is told to plan (no READY plan of this
// session), DecisionBook pushes the plan pack once, in 2,400 characters: the area's binding decisions (a replaced one never), the assumptions no person confirmed,
// how the area is checked, its files, the level this task runs at with what READY needs there (the gate's own code), and the two calls in ONE sentence.
// Without the pack an AI asks related/show/find and greps for what it holds.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, readyOne, added, starting, writeConfig, textOf, lastN, readOf, sentBy, noForks, planRecords, readFor } = require('./world.cjs');

const { handlers, verbs } = decisionbook;
const PACK = { budget: 5000 }; // contracts/pack.json; the normal layout alone is 3,014 characters
const FILES = { 'lib/sched/index.js': 'x\n', 'lib/sched/parse.js': 'y\n', 'test/sched.test.js': 't\n' };
const TASK = 'Add tenants and quotas to lib/sched/index.js, with tests';
// the calls line says to plan every file, tests included (a plan otherwise names the source files only), and to send the plan with its
// questions in it before asking anything: an AI that asks first and writes the plan after makes the person say every decision twice
// words.json `packCalls`: the research steps are named and no question is asked before them; every question goes to the person in
// one message, each asked on its own (proposals offered as a whole get one yes over many questions); the product
// records their answers from their message; a question for someone else is parked
const RESEARCH = 'the issue thread whole; past plans: this pack; a sideways search: git log of the files, the issues; then the code';
const CALLS = `If this request changes code: research first, no question yet (${RESEARCH}), fill every "" of this \`new\` (plan EVERY file you will change, tests `
  + 'included; add a record of a row you need more of; every behaviour the task and the code leave open is a question to the person in it, one each, '
  + 'however many (what a user sees or reads: an output, a help or error text, a wording, a format; a default; a limit; an edge the task does not name; '
  + 'the level\'s number is a floor, never a ceiling: reaching it ends nothing): '
  + '{"t":"question","q":"Q1","text":"","decides":"<area.topic>","whyNotCode":"","proposal":"<the answer you propose>","blocking":true}) and send it once, before you ask the person anything and before your first edit; then show '
  + 'the person the plan and EVERY question in one message, each with your proposal, never the proposals as a whole, and stop. The product records their '
  + 'answers from their message (a list item quoting the question, or a reply taking your proposals whole) and says which; only one it could not place goes '
  + 'in an `add`: "answers" its q, "said" their '
  + 'sentence, "value" in their words. A question for someone else carries "to" and "source": parked, it blocks nothing. If it only asks or reads, go on.';
// a prompt naming no file is laid out as normal work, and ONE line says the small form in the gate's own words
const RAISERS = 'more than 2 files, a glob, a shared or entry path, a danger zone, a schema path, a sensitive path, a risk word or 3+ shared consumers';
// the light form: the rows a blank plan misses at each level
const UNNAMED = 'this task runs as normal work (the prompt names no file, so the plan is laid out for several files); READY there needs: success, plan, checks, '
  + 'command, answers 3, confirm';
const SMALL_FORM = `A small fix instead ("level":"micro") when none of these holds: ${RAISERS}; it needs only: plan, confirm`;
const CRITICAL_NEEDS = 'success, research 5, feature, plan, checks 2, command, tasks, actors, edges 3, impact, answers 5, risk, rollback, confirm';
// one line says what a
// blank must hold where its published type is not free text
const SHAPED = 'where a blank is not free text: `kind`: bug, feature, chore or refactor';
const NORMAL_NEW ='atlasbound decisionbook new <<\'JSON\'\n{"title":"","why":"","success":"","kind":"","level":"normal","records":[';
const SMALL = 'this task runs as small fix (from its files and words, as the gate decides); READY there needs: plan, confirm';
// the two calls a small fix sends, as the pack hands them (`file`: the path the prompt names, else "" to fill); each a quoted
// heredoc, its JSON on standard input
const MICRO = (file = '') => ['atlasbound decisionbook new <<\'JSON\'', `{"title":"","why":"","level":"micro","records":[{"t":"link","rel":"plans","to":"file:${file}","why":""}]}`,
  'JSON', 'atlasbound decisionbook add <id> <<\'JSON\'', '[{"t":"confirm","by":"","said":""}]', 'JSON'];
const askAt =(io, text = TASK, session = 's1') => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: session, prompt: text }, io);
const packOf = (said) => (said.say || []).find((s) => s.key === 'decisionbook.pack');
// the decisions a pack lists, `key = value` as it says them, the decider cut off
const listedOf = async (io) => packOf(await askAt(io)).text.split('\n').filter((line) => line.startsWith('- report.export.'))
  .map((line) => line.slice(2).replace(/ \(the person\)$/, ''));

/** Five earlier plans of lib/sched on another branch (three planned parse.js, two index.js); the fourth replaces a decision of the newest; one assumption no
 * person confirmed. The work is on a new branch with no plan. */
async function fiveEarlier() {
  const io = bookWorld({ files: FILES, branch: 'feat/old' });
  writeConfig(io, { protect: ['lib/**'] });
  const ids = [];
  for (const [i, title] of ['One', 'Two', 'Three', 'Four', 'Five'].entries()) {
    ids.push((await readyOne(io, { plans: [i % 2 ? 'lib/sched/index.js' : 'lib/sched/parse.js'], title })).id);
  }
  await added(io, ids[3], { t: 'decision', key: 'report.export.five.rule1', value: 'v9', why: 'changed', by: 'Ayse', supersedes: [`${ids[4]}/report.export.five.rule1`] });
  await added(io, ids[2], { t: 'assumption', text: 'ticks are whole numbers', why: 'the parser reads integers' });
  io.state.branch = 'feat/sched';
  return { io, ids };
}

// 2,700: room for the calls line, which leads with the duty to ask every open behaviour
test('a task prompt in an area of five earlier plans gets the plan pack, within 2,700 characters', async () => {
  const { io, ids } = await fiveEarlier();
  const said = await askAt(io);
  assert.equal(said.code, 'prompt-nudge');
  assert.deepEqual(said.say.map((s) => s.key), ['decisionbook.nudge', 'decisionbook.pack'], 'the nudge\'s head, then the pack; no recall card beside it');
  assert.equal(said.say[0].text, 'DecisionBook: protected files need a READY plan on this branch and there is none.');
  const lines = packOf(said).text.split('\n');
  assert.ok(packOf(said).text.length <= 2700, `within the budget: ${packOf(said).text.length}`);
  assert.equal(lines[0], 'Decisions that bind this area (data, settled; a person changes them, not you):');
  const decided = lines.filter((line) => /^- report\.export\./.test(line));
  assert.equal(decided.length, 8, 'at most 8 decisions');
  assert.deepEqual(decided.slice(0, 3), ['- report.export.five.rule1 = v9 (the person)', '- report.export.five.rule3 = v3 (the person)',
    '- report.export.five.rule2 = v2 (the person)'],'newest first: the one that replaced, then the newest DecisionBook\'s own');
  assert.ok(!lines.includes('- report.export.five.rule1 = v1 (the person)'),
    'a replaced decision is not listed, though it is among the newest');
  assert.equal(lines[9], 'more: atlasbound decisionbook show file:lib/sched/index.js', 'then where the rest are');
  // without this line an AI that has to replace a decision searches the help for supersede, then writes a second key beside the old one
  assert.equal(lines[10], 'a person replaces one, never you, with this record in the plan: {"t":"decision","key":"<key>","value":"","why":"","by":"","supersedes":'
    + '["<its plan id>/<key>"]}; the old one then shows as superseded (the plan id: atlasbound decisionbook show decision:<key>)');
  const replacing = { ...JSON.parse(lines[10].slice(lines[10].indexOf('{'), lines[10].indexOf('}') + 1)), key: 'report.export.five.rule3', value: 'v7', why: 'audit',
    by: 'Ayse', supersedes: [`${ids[4]}/report.export.five.rule3`] };
  await added(io, ids[3], replacing);
  assert.match((await verbs.show(io, { rest: ['decision:report.export.five.rule3'] })).text, new RegExp(`= v3 \\(.*\\) superseded by ${ids[3]}/report\\.export\\.five\\.rule3`),
    'the record the line gives, filled, is taken, and the old one shows as superseded');
  assert.equal(lines[11], `- ticks are whole numbers (assumed in ${ids[2]}, no person confirmed it)`, 'the unconfirmed assumption, marked');
  assert.equal(lines[12], 'how this area is checked: `npm test -- export` (5 plans)', 'the distinct check commands, most used first');
  assert.equal(lines[13], 'files earlier plans planned and built: lib/sched/parse.js (3), lib/sched/index.js (2)', 'files with the count of plans');
  assert.equal(lines[14], SMALL, 'the level line, from core/level and the rubric rows a plan with nothing yet misses at that level');
  // the small form's new holds no blank whose type is not free text, so no shapes line stands between the calls line and the calls
  assert.deepEqual(lines.slice(15), [CALLS, ...MICRO('lib/sched/index.js')], 'the two calls last, as fill-in JSON');
  assert.equal(lastN(io, 'decisionbook.prompt').packed, 1, 'the trace counts the pack');
});

// Two task prompts that name no file. Handed the small-fix skeleton for such a prompt, an AI writes its own `new` (eight
// unmet rows, then several adds). The task is normal work, so the skeleton handed is the normal one; the small form is one line.
const LOG_TASK = 'The scheduler needs a history. Keep a list of what it ran and add a way to print it:\n\n- `scheduler.history()` returns the list as '
  + 'text, one entry per line.\n- An entry it cannot print is reported to the caller by name.\n\nAdd tests in the style this repository already uses.';
const COST_TASK = 'Jobs should be able to wait for each other. Add two things to the job language:\n\n- `after <name>` on a job: it starts only when '
  + 'that job has ended.\n- `turns <n>` as a statement: at most n jobs start in one tick.\n\nAdd tests in the style this repository already uses.';
test('an empty area and a prompt that names no file: the level line of normal work, one line of the small form, the calls', async () => {
  const io = bookWorld({ files: FILES });
  writeConfig(io, { protect: ['lib/**'] });
  const lines = packOf(await askAt(io, LOG_TASK)).text.split('\n');
  assert.deepEqual([lines.slice(0, 4), lines.length], [[UNNAMED, SMALL_FORM, CALLS, SHAPED], 10]);
  assert.ok(lines.slice(4).join('\n').startsWith(NORMAL_NEW), lines[4]);
  assert.deepEqual(callsOf(lines.join('\n')).made.records.map((r) => [r.t, r.to ?? r.id]), [['link', 'file:'], ['check', 'AC-1']],
    'the skeleton holds the planned path to fill and one check with its command: no step row is asked');
  assert.ok(lines.join('\n').length <= PACK.budget, `${lines.join('\n').length}`);
});

test('where another package names the research to do first, the calls line sends the research there before the pack', async () => {
  const io = bookWorld({ files: FILES, research: 'the calls named above' });
  writeConfig(io, { protect: ['lib/**'] });
  const lines = packOf(await askAt(io, LOG_TASK)).text.split('\n');
  assert.equal(lines[2], CALLS.replace(`(${RESEARCH})`, `(the calls named above; then ${RESEARCH})`));
  assert.notEqual(lines[2], CALLS, 'the research named first is in the line');
});

test('the level line comes from the gate\'s own rule: a risk word or a hard path in the area raises it',
  async () => {
  const io = bookWorld({ files: FILES });
  writeConfig(io, { protect: ['lib/**'] });
  assert.equal(packOf(await askAt(io, 'Add a payment webhook to the scheduler language')).text.split('\n')[0], 'this task runs as critical work (from the '
    + 'prompt\'s words only: it names no file; more than 2 files, a glob, a shared or entry path, a danger zone, a schema path, a sensitive path, a risk word or '
    + `3+ shared consumers raise it: a risk word (payment)); READY there needs: ${CRITICAL_NEEDS}`); // tasks too, from the level's rows whole
  const hard = bookWorld({ files: { ...FILES, 'db/schema.rb': 's\n' }, branch: 'feat/old' });
  writeConfig(hard, { protect: ['lib/**', 'db/**'] });
  await readyOne(hard, { plans: ['db/schema.rb'], level: 'critical' });
  hard.state.branch = 'feat/new';
  assert.match(packOf(await askAt(hard, 'Change db/schema.rb so quotas have a column')).text, /^this task runs as critical work \(from its files and words, as the gate decides: a schema path \(db\/schema\.rb\)\); /m);
});

// the level line is what `new` for THIS prompt is judged on, the files it names and its words, never the area's history
test('a one-file, test-only prompt in an area of normal work: the pack says small fix, and a new runs as one',
  async () => {
  const files = { 'lib/sched/a.js': 'a\n', 'lib/sched/b.js': 'b\n', 'lib/sched/c.js': 'c\n', 'test/sched.test.js': 't\n' };
  const io = bookWorld({ files, branch: 'feat/old' });
  writeConfig(io, { protect: ['lib/**', 'test/**'] });
  await readyOne(io, { plans: Object.keys(files), title: 'Old' });
  io.state.branch = 'feat/new';
  io.state.changed = ['lib/sched/a.js', 'lib/sched/b.js', 'lib/sched/c.js']; // the branch's own changes seed the walk, not the level (the `files: seeds` mutant)
  const said = packOf(await askAt(io, 'Add a case for an empty source to test/sched.test.js'));
  assert.match(said.text, /\nfiles earlier plans planned and built: [^\n]*lib\/sched\/c\.js/, 'the area holds the normal plan\'s files');
  assert.match(said.text, /^this task runs as small fix \(from its files and words, as the gate decides\); /m, said.text);
  const made = await verbs.create(io, { rest: [JSON.stringify({ title: 'Empty source case', why: 'w', level: 'micro',
    records: [{ t: 'link', rel: 'plans', to: 'file:test/sched.test.js', why: 'the case' }] })] });
  assert.equal(made.out.state.level.level, 'micro', 'the gate judges the same plan as small fix');
});

test('eight earlier plans of long values give a pack cut to its budget, and the calls are never cut', async () => {
  const long = 'x'.repeat(300);
  // the light form's calls are about 1,000 characters shorter, and the prompt of three files (4,737 characters, nothing
  // cut) no longer reaches the budget. So the eight newest decisions are all long ones and the prompt names twelve files, each a link
  // of the `new` that is never cut
  const parts = Array.from({ length: 12 }, (_, i) => `lib/sched/part${i}.js`);
  const io = bookWorld({ files: { ...FILES, ...Object.fromEntries(parts.map((file) => [file, 'p\n'])) }, branch: 'feat/old' });
  writeConfig(io, { protect: ['lib/**'] });
  const ids = [];
  for (let i = 0; i < 8; i += 1) ids.push((await readyOne(io, { plans: ['lib/sched/parse.js'], title: `T${i}` })).id);
  for (const [i, id] of ids.entries()) {
    await added(io, id, [...['a', 'b', 'c'].map((n) => ({ t: 'decision', key: `sched.${'k'.repeat(70)}${i}${n}`, value: long, why: 'w', by: 'Ayse' })),
      { t: 'assumption', text: `${long} ${i}`, why: 'w' }, { t: 'check', id: `AC-${i}9`, text: 'c', command: `npm test -- ${long} ${i}` }]);
  }
  io.state.branch = 'feat/new';
  // normal work: its calls are the longest a small area gives, so the lists are cut (a small fix's fit whole in the budget)
  const lines = packOf(await askAt(io, `Add tenants to ${parts.join(', ')}`)).text.split('\n');
  assert.ok(lines.join('\n').length <= PACK.budget, `${lines.join('\n').length}`);
  assert.ok(lines.join('\n').length > PACK.budget - 300, `cut no further than the budget asks: ${lines.join('\n').length}`);
  const decided = lines.filter((line) => /^- (sched|report)\./.test(line)).length;
  assert.ok(decided >= 1 && decided < 8, `decisions cut last: ${decided} said`);
  assert.equal(JSON.parse(lines.at(-5)).records.filter((r) => r.rel === 'plans').length, 12, 'every file the prompt names is in the new');
  // a value cut at 80 can lose the part the AI then has to ask for again; a value keeps 160 characters
  assert.match(lines.find((line) => line.startsWith('- sched.')), / = x{159}~ \(the person\)$/, 'a decision\'s value keeps 160 characters');
  assert.equal(lines.filter((line) => line.endsWith('no person confirmed it)')).length, 0, 'the assumptions cut before the decisions');
  assert.ok(!lines.some((line) => line.startsWith('files earlier plans')), 'the files line cut first');
  assert.match(lines.at(-9), /^this task runs as normal work /);
  assert.deepEqual(lines.slice(-8, -6), [CALLS, SHAPED]);
  assert.deepEqual([lines.at(-6), lines.at(-4), lines.at(-3), lines.at(-1)], ['atlasbound decisionbook new <<\'JSON\'', 'JSON', 'atlasbound decisionbook add <id> <<\'JSON\'', 'JSON'],
    'the calls whole, last');
});

// the open READY plan is the work in progress whatever the message's words. It is frozen: the session's
// start gave it as the intake to build from, so a task prompt says nothing more, hands no resume call, and no pack sends the session
// to a new plan
test('an earlier session\'s READY plan is given by the start as the frozen intake; a task prompt adds nothing, with no pack', async () => {
  const io = bookWorld({ files: FILES });
  writeConfig(io, { protect: ['lib/**'] });
  const { id } = await readyOne(io, { plans: ['lib/sched/parse.js'] });
  await handlers.start(starting('s2'), io);
  const start = await handlers.session(starting('s2'), io);
  assert.deepEqual([start.code, start.say.map((s) => s.key)], ['session-ready', ['decisionbook.start']]);
  const intake = textOf(start).split('\n');
  assert.deepEqual(intake.slice(0, 2), [`Plan ${id} READY on feat/export: Report export is slow`, 'Frozen: this plan is the settled intake of the work. Build from it; '
    + 'edits inside it pass in silence and a file outside it joins it by itself (a danger path asks the person once). /clear if the context is full, then continue '
    + 'from it: the next session starts from this plan.']);
  assert.ok(intake.includes('files: lib/sched/parse.js') && intake.includes('- report.export.rule1 = v1 (support; by the person)'), textOf(start));
  assert.doesNotMatch(textOf(start), /"t":"resume"|earlier session/, 'no resume call, no word of an earlier session');
  const said = await askAt(io, TASK, 's2');
  assert.deepEqual(said, { code: 'prompt-passed' }, 'the task prompt says nothing: no pack, no nudge, no new handed while the plan is open');
});

// what the pack said is not said again in that session; a file card says only what is new for its file. The SessionStart text holds the
// branch's READY plan, which the walk never makes a card or a pack line (heldOf), so the pack does not repeat it.
test('a file card after the pack does not repeat a decision the pack listed; another session\'s card still says it', async () => {
  const { io } = await fiveEarlier();
  // `key = value` as the pack says it; a card says `key = value (by …)`; the replaced five.rule1 = v1 is history the pack does not list, so a card may say it
  const listed = await listedOf(io);
  assert.equal(listed.length, 8);
  const card = textOf(await handlers.recall(readOf('lib/sched/parse.js'), io));
  assert.match(card, /^- \S+ ready: Five$/m, 'the card still comes: its title, why here and what it built');
  assert.deepEqual(listed.filter((said) => card.includes(`${said} (by`)), [], 'no listed decision again');
  const other = textOf(await handlers.recall(readOf('lib/sched/parse.js', 's9'), io));
  assert.ok(listed.some((said) => other.includes(`${said} (by`)), 'a session the pack was not given to: the card says them');
});

// say-once is for the cards DecisionBook pushes; a verb asked always answers whole, and a compaction or clear forgets what the
// pack said, since the context that held it is gone
test('in the pack\'s session the related verb lists the decisions the pack said; after a compact a file card says them again',
  async () => {
  const { io } = await fiveEarlier();
  const listed = await listedOf(io);
  const named = (text) => listed.filter((said) => text.includes(`${said} (by`)).length;
  const asked = await verbs.related(Object.assign(io, { session: 's1' }), { rest: ['lib/sched/parse.js'] });
  assert.ok(named(asked.text) > 0, `a verb answers whole: ${asked.text}`);
  assert.equal(named(textOf(await handlers.recall(readOf('lib/sched/parse.js'), io))), 0, 'a pushed card of the same context does not');
  await handlers.session(starting('s1', 'compact'), io);
  assert.ok(named(textOf(await handlers.recall(readOf('lib/sched/index.js'), io))) > 0, 'after the compaction a pushed card says them again');
});

test('debug decisionbook lists the decision keys the pack said in the session, keys only, and none after a compaction', async () => {
  const { io } = await fiveEarlier();
  const keys = packOf(await askAt(io)).text.split('\n').filter((line) => line.startsWith('- report.export.')).map((line) => line.slice(2).split(' = ')[0]);
  io.session = 's1';
  const line = async () => (await decisionbook.debug.decisionbook(io, {})).text.split('\n').find((l) => l.startsWith('the pack said in session s1: '));
  assert.equal(await line(), `the pack said in session s1: ${keys.join(', ')}`);
  assert.ok(!(await line()).includes(' = '), 'keys, never values');
  await handlers.session(starting('s1', 'compact'), io);
  assert.equal(await line(), undefined, 'a compaction ended the context that held them');
});

// after a compaction, or when the prompt named no area, the same pack by hand
test('decisionbook plan <path|words> prints the pack the task prompt gives, read-only and traced', async () => {
  const { io, ids } = await fiveEarlier();
  const records = () => ids.map((id) => io.fs.readText(`.decisionbook/${id}.jsonl`)).join('');
  const before = records();
  const byHand = await verbs.pack(io, { rest: TASK.split(' ') });
  assert.equal(byHand.text, `${packOf(await askAt(io)).text}\n`);
  assert.equal(records(), before, 'nothing written');
  assert.equal(lastN(io, 'decisionbook.pack').packed, 1);
  const words = await verbs.pack(io, { rest: ['tenants', 'quotas'] });
  assert.deepEqual(words.text.split('\n').slice(0, 4), [UNNAMED, SMALL_FORM, CALLS, SHAPED], 'words no plan holds: the level, the small form and the calls');
  assert.ok(words.text.split('\n').slice(4).join('\n').startsWith(NORMAL_NEW));
});

// the pack hands the `new` the AI fills and sends once, built from the rubric rows of the level; the person's answers and yes are the `add`
const shapeName = (r) => (r.t === 'item' && ['step', 'gap'].includes(r.kind) ? { step: 'Step', gap: 'Gap' }[r.kind] : r.t);
const CHOSEN = { kind: 'feature' }; // the one enum a skeleton leaves to fill (a bug would ask repro too, which the reply then names)
/** Every "" filled as an AI would, by the field's published type (decisionbook.SHAPES): a word, a file:line that exists, the chosen value, else three words. */
let k = 0; // one count over every record, so two decisions never share a key
function fillIn(record, shape, cite) {
  return Object.fromEntries(Object.entries(record).map(([field, value]) => {
    if (value === 'file:') return [field, `file:${cite}`]; // the planned path a prompt naming no file leaves to fill, and its step's file
    if (value !== '') return [field, value];
    if (field === 'file') return [field, cite];
    if (shape === 'research' && field === 'source') return [field, `${cite}:1`]; // it cites the file the session read
    const type = String(decisionbook.SHAPES[shape][field]).replace(/\?$/, '');
    k += 1;
    const own = `${shape}${field}${k}`;
    return [field, (type === 'word' && `w.${own}`) || (type === 'ref' && `${cite}:1`) || CHOSEN[type] || `${own}a ${own}b ${own}c`];
  }));
}
const callsOf = (text) => ({ made: sentBy(text, 'new'), add: sentBy(text, 'add <id>') });
const SCHED = { 'lib/sched/index.js': 'x\n', 'lib/sched/parse.js': 'y\n', 'lib/sched/run.js': 'r\n', 'test/sched.test.js': 't\n' };
/** `records` with `more` set before the person's yes: the filled add of a plan that asked nothing says of each planned file what was read. */
const beforeYes = (records, more) => [...records.filter((r) => r.t !== 'confirm'), ...more, ...records.filter((r) => r.t === 'confirm')];
for (const [level, prompt] of [['micro', 'Fix the default priority in lib/sched/parse.js'], ['normal', 'Add workers to lib/sched/index.js, lib/sched/parse.js and lib/sched/run.js'],
  ['critical', 'Add a payment webhook to lib/sched/index.js'], ['normal', LOG_TASK], ['normal', COST_TASK]]) { // the two prompts that name no file
  test(`${level}: the pack's new with every blank filled is accepted at once, and its add makes it READY (${prompt.slice(0, 40)})`, async () => {
    const io = bookWorld({ files: SCHED });
    writeConfig(io, { protect: ['lib/**'] });
    const pack = packOf(await askAt(io, prompt)).text; // asked once: with its draft on the branch the prompt says that draft, no pack
    const { made, add } = callsOf(pack);
    assert.equal(made.level, level);
    const filledNew = { ...fillIn(made, 'plan', 'lib/sched/index.js'), records: made.records.map((r) => fillIn(r, shapeName(r), 'lib/sched/index.js')) };
    const created = await verbs.create(io, { rest: [JSON.stringify(filledNew)] });
    assert.equal(created.out.state.level.level, level, 'the gate runs it at the level the pack said');
    // no blank question is handed at any level (it made the AI invent one). No blank no-fork item either (it made
    // the cheapest plan the one that asks nothing): the answers row stays open until the plan asked, or says of each planned file what was read
    // critical research counts once it rests on a file read in the plan's sessions: not yet, so the row names the file
    const unread = level === 'critical' ? ['ready-research'] : [];
    assert.deepEqual(created.out.state.unmet.map((u) => u.code), level === 'micro' ? ['ready-no-confirm'] : [...unread, 'ready-answers', 'ready-no-confirm'], created.text);
    if (unread.length) assert.match(created.text, /0 of 5 research records cite a file read in this plan's sessions; the planned files here not read yet: lib\/sched\/index\.js/);
    if (unread.length) await readFor(io, created.out.id, ['lib/sched/index.js']);
    assert.equal(made.records.filter((r) => r.t === 'question').length, 0, 'no blank question in the pack');
    assert.equal(made.records.filter((r) => r.kind === 'no-fork').length, 0, 'no blank no-fork item in the pack');
    // the add the reply hands is the pack's own add, and it is the one sent here
    const handed = sentBy(created.text, `add ${created.out.id}`);
    assert.deepEqual(handed, add, 'the reply\'s add is the pack\'s add');
    // the shapes line names every blank whose published type is a word, a ref or the kind, in the pack and in the reply, and no other
    const typed = (records) => [...new Set(records.flatMap((r) => Object.keys(r).filter((f) => r[f] === ''
      && ['word', 'ref', 'kind'].includes(String(decisionbook.SHAPES[shapeName(r)][f]).replace('?', '')))))].sort();
    const named = (text) => [...(text.split('where a blank is not free text: ')[1] || '').split('\n')[0].matchAll(/`(\w+)`/g)].map((m) => m[1]).sort();
    assert.deepEqual([named(pack), named(created.text)], [typed([{ t: 'plan', ...made }, ...made.records, ...add]), typed(add)]);
    const second = await verbs.add(io, { rest: [created.out.id, JSON.stringify(beforeYes(handed.map((r) => fillIn(r, shapeName(r), 'lib/sched/index.js')),
      noForks(planRecords(io, created.out.id))))] });
    assert.equal(second.out.state.ready, true, second.text);
  });
}
// a small plan is READY, the first write meets a file it did not name, two added files would make it normal
// work, and the rubric would then come in pieces, over many calls and a third turn. READY is the freeze, so the plan that grows by
// plain files stays READY at the level of its yes; only a danger path that joins it raises the level and asks the person's yes again
test('a third file keeps a small fix READY; a danger path joining says in one reply why the level rose and asks a new yes', async () => {
  const io = bookWorld({ files: SCHED });
  writeConfig(io, { protect: ['lib/**'] });
  const small = [{ t: 'research', tool: 'read', asked: 'how runs start', answer: 'build() starts them', source: 'lib/sched/index.js:1' }, { t: 'item', kind: 'feature', text: 'workers' },
    { t: 'link', rel: 'plans', to: 'file:lib/sched/index.js', why: 'the limit' }, { t: 'check', id: 'AC-1', text: 'the limit holds', command: 'npm test' },
    { t: 'item', kind: 'task', text: 'limit runs', covers: ['AC-1'] }, { t: 'confirm', by: 'Ayse', said: 'yes' }];
  const { out: made } = await verbs.create(io, { rest: [JSON.stringify({ title: 'Workers', why: 'runs compete', success: 'a limit holds', kind: 'feature', level: 'micro', records: small })] });
  assert.equal(made.state.ready, true);
  await readFor(io, made.id, Object.keys(SCHED).slice(0, 3)); // its research and its no-fork items rest on files the session read
  const more = ['lib/sched/parse.js', 'lib/sched/run.js'].map((file) => ({ t: 'link', rel: 'plans', to: `file:${file}`, why: 'the statement' }));
  const grown = await verbs.add(io, { rest: [made.id, JSON.stringify(more)] });
  const stored = () => planRecords(io, made.id).filter((r) => r.t === 'ready').map((r) => [r.level, r.scope.length]);
  assert.deepEqual(grown.text.split('\n').slice(0, 2).map((line) => line.split('.')[0]), [`${made.id}: 2 records recorded (link)`, `${made.id} READY as small fix`]);
  assert.deepEqual([grown.out.state.ready, stored()], [true, [['micro', 1]]], 'frozen: READY at the level of its yes, and nothing stored again');
  const danger = await verbs.add(io, { rest: [made.id, JSON.stringify([{ t: 'link', rel: 'plans', to: 'file:db/migrate/1.rb', why: 'a column' }])] });
  const lines = danger.text.split('\n');
  assert.equal(lines[0], 'level: critical work (proposed small fix: the level runs higher than proposed: code decides, going up is free: a schema path (db/migrate/1.rb))');
  assert.equal(lines[2], `${made.id} not READY as critical work: 10 of 19 rows met`);
  assert.ok(lines.includes('  the yes on record came before these danger paths joined the plan: db/migrate/1.rb: show the person and ask; their yes is needed again'), danger.text);
  assert.deepEqual(danger.out.state.unmet.at(-1).yesFor, ['db/migrate/1.rb']);
  assert.equal(sentBy(danger.text, `add ${made.id}`), null, 'a reply to an add says the rows; the one add of them comes with `ready`');
  const handed = sentBy((await verbs.ready(io, { rest: [made.id] })).text, `add ${made.id}`);
  assert.deepEqual(handed.map((r) => r.kind || r.t), [...Array(4).fill('research'), 'check', 'task', 'actor', 'edge', 'edge', 'edge', 'impact', 'risk', 'rollback',
    'confirm'], 'every row the new level adds, at once');
  const sent = await verbs.add(io, { rest: [made.id, JSON.stringify(beforeYes(handed.map((r) => fillIn(r, shapeName(r), 'lib/sched/index.js')),
    noForks(planRecords(io, made.id))))] });
  assert.deepEqual([sent.out.state.ready, sent.out.state.level.level], [true, 'critical'], sent.text);
  assert.deepEqual(stored(), [['micro', 1], ['critical', 4]], 'the yes given again is a new READY, of the scope and level it covers');
});

for (const level of ['micro', 'normal', 'critical']) {
  test(`${level}: a new of the head alone is answered with one add of every missing row that, filled, is accepted and READY`, async () => {
    const io = bookWorld({ files: SCHED });
    writeConfig(io, { protect: ['lib/**'] });
    const { out, text } = await verbs.create(io, { rest: [JSON.stringify({ title: 'Workers in the scheduler', why: 'runs compete', level })] });
    await readFor(io, out.id, ['lib/sched/index.js']); // what the research will cite was read
    const filled = sentBy(text, `add ${out.id}`).map((r) => fillIn(r, shapeName(r), 'lib/sched/index.js'));
    const sent = await verbs.add(io, { rest: [out.id, JSON.stringify(beforeYes(filled, noForks(filled)))] });
    assert.deepEqual([sent.out.state.ready, sent.out.state.level.level], [true, level], sent.text);
  });
}
