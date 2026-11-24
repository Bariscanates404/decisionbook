// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The intake is a preparation phase that ends frozen, then light work. Black box:
// READY is the freeze (a later session edits with no resume record; a file outside the plan joins it, a danger path asks once); the
// start of a READY plan is the intake itself; the AI records the person's answers in one add; the form is light; a reply says only
// what changed; a question parked with someone else; the plan's phases in the trace.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { PERSON, ROOT, bookWorld, writeConfig, wire, planRecords, writtenDecisions, recordsFor, editEvent, starting, ruling, lastN, textOf, readOf } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const [EXPORT, CSV, MIGRATION] = ['src/report/export.js', 'src/report/csv.js', 'db/migrate/001_add_rows.rb'];
const HEAD = { title: 'Stream the export', why: 'large exports time out', success: 'a 10,000 row export finishes in 5 s', kind: 'feature', level: 'normal' };
const findings = (n) => Array.from({ length: n }, (_, i) => ({ t: 'research', tool: 'read', asked: `how rows are read ${i}`,
  answer: `the export reads every row into memory at once (${i})`, source: `${EXPORT}:${i + 1}` }));
const planned = (...files) => recordsFor('micro', files).filter((r) => r.t === 'link'); // the plans links of these files
const CHECK = { t: 'check', id: 'AC-1', text: 'the export finishes in 5 s', how: 'e2e', command: 'npm test -- export' };
const QUESTIONS = [
  ['Q1', 'When a client cancels an export half way, should the partial file be kept or deleted?', 'report.cancel', 'Delete the partial file.'],
  ['Q2', 'Should the rows keep the order of the report or be sorted by date?', 'report.order', 'Keep the order of the report.'],
  ['Q3', 'What is the largest number of rows one export may hold before it is refused?', 'report.limit', 'One million rows.'],
].map(([q, text, decides, proposal]) => ({ t: 'question', q, text, decides, whyNotCode: 'a product rule the code does not hold', proposal, blocking: true }));
const DRAFT = [...findings(1), ...planned(EXPORT), CHECK, ...QUESTIONS];
// the person's reply as a careful developer writes it: each list item quotes the question it answers
const ANSWERS = ['Answers from me (the developer):',
  '- About "should the partial file be kept or deleted?": Delete it at once, and say so in the log.',
  '- About "Should the rows keep the order of the report or be sorted by date?": Keep the order of the report. Never sort.',
  '- About "the largest number of rows one export may hold before it is refused?": Two million rows, then it is refused with a clear message.'].join('\n');
// each answer as the AI records it: their list item's own words, the quoted question left out
const SAID = ANSWERS.split('\n').slice(1).map((line) => line.replace(/^- About "[^"]*": /u, ''));

/** A started AI session on a world that protects src/** and holds a database folder. */
async function dietWorld(session = 's1') {
  const io = bookWorld({ files: { [EXPORT]: 'a\nb\nc\n', [CSV]: 'x\n', 'src/report/rows.js': 'r\n', [MIGRATION]: 'm\n' } });
  writeConfig(io, { protect: ['src/**', 'db/**'] });
  const began = async (s, source = 'startup') => {
    await handlers.start(starting(s, source), io);
    io.session = s;
    return handlers.session(starting(s, source), io);
  };
  await began(session);
  const say = (prompt, s = io.session) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: s, prompt }, io);
  const edit = (file, s = io.session) => handlers.preEdit({ ...editEvent(file), session_id: s }, io);
  const create = async (records, head = HEAD) => (await verbs.create(io, { rest: [wire({ ...head, records })] }));
  return { io, began, say, edit, create };
}
/** The person's reply to plan `id`, and the AI's one add that records each answer as theirs: its reply. */
async function answeredAll(w, id) {
  await w.say(ANSWERS);
  return verbs.add(w.io, { rest: [id, wire(QUESTIONS.map((q, i) => ({ t: 'decision', key: q.decides, value: SAID[i], why: 'the person\'s answer',
    whose: 'person', answers: q.q, said: SAID[i], effect: ['check:AC-1'] })))] });
}
/** A plan made READY by the person's answers: the task, the plan, their reply, the AI's add of it. -> its id */
async function frozen(w) {
  await w.say('Make the report export stream its rows so a large report finishes.');
  const { out } = await w.create(DRAFT);
  return { id: out.id, recorded: await answeredAll(w, out.id) };
}
const phaseRows = (io) => io.fs.readText('.atlasbound/trace/r1.ndjson').trim().split('\n').map((line) => JSON.parse(line))
  .filter((row) => row.step === 'plan.phase');

test('READY is the freeze: a later session edits inside the plan with no resume record and no new yes', async () => {
  const w = await dietWorld();
  const { id } = await frozen(w);
  const before = planRecords(w.io, id).length;
  const start = await w.began('s2');
  assert.equal(start.code, 'session-ready');
  assert.deepEqual(ruling(await w.edit(EXPORT)), ['allow', 'gate-in-scope'], 'the session that never saw the plan made builds from it');
  assert.equal(planRecords(w.io, id).length, before, 'no record was needed: no resume, no confirm');
  assert.deepEqual(lastN(w.io, 'decisionbook.gate'), { decision_allow: 1 });
});

test('a file outside the frozen plan is asked and joins it on the person\'s yes, as theirs; a danger path asks once', async () => {
  const w = await dietWorld();
  const { id } = await frozen(w);
  await w.began('s2');
  const out = await w.edit(CSV);
  assert.deepEqual([...ruling(out), out.plan], ['ask', 'plan-outside', id]);
  assert.match(out.reason, /open a new plan for this file/);
  await handlers.postEdit({ hook_event_name: 'PostToolUse', session_id: 's2', tool_name: 'Edit', tool_input: { file_path: `${ROOT}/${CSV}` } }, w.io);
  assert.deepEqual(planRecords(w.io, id).at(-1), { t: 'link', rel: 'plans', to: `file:${CSV}`, by: 'Amy',
    source: 'the person\'s yes to the gate\'s ask', at: planRecords(w.io, id).at(-1).at }, 'the person\'s yes added the plans link');
  assert.deepEqual(ruling(await w.edit(CSV)), ['allow', 'gate-in-scope'], 'from then on it is inside: silent');
  assert.equal((await verbs.ready(w.io, { rest: [id] })).out.ready, true, 'the yes holds for the plan that grew within its level');
  w.io.state.changed = [EXPORT, CSV];
  const stopped = () => handlers.stop({ hook_event_name: 'Stop', session_id: 's2' }, w.io);
  assert.deepEqual([(await stopped()).code, (await stopped()).code], ['stop-unclosed', 'stop-clean'],
    'the Stop check sees both recorded: it holds the turn once for the close, never again on the same tree');
  const danger = await w.edit(MIGRATION);
  assert.deepEqual(ruling(danger), ['ask', 'plan-out-of-scope'], 'a migration outside the plan is the person\'s');
  assert.match(danger.reason, /a danger path \(a danger zone, a database schema or migration\) outside the READY plan is the person's, once/);
  assert.ok(!planRecords(w.io, id).some((r) => r.to === `file:${MIGRATION}`), 'the product adds no danger path by itself');
  const dry = await decisionbook.gateRead(w.io, { file: 'src/report/rows.js', session: 's2' });
  assert.equal(dry.code, 'plan-outside');
  assert.ok(!planRecords(w.io, id).some((r) => r.to === 'file:src/report/rows.js'), 'a debug reading adds nothing to the plan');
});

test('a danger path added to a frozen plan needs the person\'s yes again; another file the AI adds is asked at its write', async () => {
  const w = await dietWorld();
  const { id } = await frozen(w);
  const plain = await verbs.add(w.io, { rest: [id, wire(planned(CSV))] });
  assert.equal(plain.out.state.ready, true, 'a plain file the AI adds itself: the plan stays READY');
  assert.deepEqual(ruling(await w.edit(CSV)), ['ask', 'plan-outside'], 'but its link alone opens nothing');
  const risky = await verbs.add(w.io, { rest: [id, wire(planned(MIGRATION))] });
  assert.equal(risky.out.state.ready, false);
  assert.match(risky.text, new RegExp(`the yes on record came before these danger paths joined the plan: ${MIGRATION}: show the person and ask`));
  assert.deepEqual(ruling(await w.edit(MIGRATION)), ['ask', 'plan-out-of-scope'], 'and the gate keeps asking: the AI\'s own link opens no danger path');
  assert.deepEqual(ruling(await w.edit(EXPORT)), ['allow', 'gate-in-scope'], 'the rest of the frozen plan goes on');
});

test('on a critical READY plan too, a danger path the AI links itself stays the person\'s until their yes', async () => {
  const w = await dietWorld();
  await w.say('Add the rows table and stream the export from it.');
  const whole = recordsFor('critical', [EXPORT]).filter((r) => !['question', 'decision', 'confirm'].includes(r.t));
  const settled = ['report.memory', 'report.io'].map((settles, i) => ({ ...findings(2)[i], settles })); // two forks the code closed, three asked
  await handlers.recall(readOf(EXPORT, 's1'), w.io); // the session read the file its research cites
  const { out: { id } } = await w.create([...whole, ...settled, ...QUESTIONS], { ...HEAD, level: 'critical' });
  assert.match((await answeredAll(w, id)).text, / READY as critical work\. /);
  assert.deepEqual(ruling(await w.edit(MIGRATION)), ['ask', 'plan-out-of-scope'], 'outside the plan: asked');
  assert.equal((await verbs.add(w.io, { rest: [id, wire(planned(MIGRATION))] })).out.state.ready, false, 'linked by the AI: the yes is needed again');
  assert.deepEqual(ruling(await w.edit(MIGRATION)), ['ask', 'plan-out-of-scope'], 'the link alone opens nothing');
  await w.say('Yes, the migration too, go ahead.');
  const again = await verbs.add(w.io, { rest: [id, wire({ t: 'confirm', by: 'the developer', said: 'Yes, the migration too, go ahead.' })] });
  assert.equal(again.out.state.ready, true, 'their yes after seeing it: READY again, stored with the scope it covers');
  assert.deepEqual(ruling(await w.edit(MIGRATION)), ['allow', 'gate-in-scope']);
});

test('the start of a READY plan is the intake: frozen, the files, the findings, each decision in the person\'s words', async () => {
  const w = await dietWorld();
  const { id } = await frozen(w);
  const text = textOf(await w.began('s2'));
  const lines = text.split('\n');
  assert.equal(lines[0], `Plan ${id} READY on feat/export: Stream the export`);
  assert.match(lines[1], /^Frozen: this plan is the settled intake of the work\. Build from it; .*\/clear if the context is full, then continue from it/);
  assert.ok(lines.includes(`files: ${EXPORT}`), 'the files the work touches');
  assert.ok(lines.includes('found by the research:') && lines.includes(`- the export reads every row into memory at once (0) (${EXPORT}:1)`),
    'what the research found is carried, with where');
  assert.ok(lines.includes('- report.cancel = Delete it at once, and say so in the log.; Amy, 2026-11-02: "Answers from me (the developer): About "should the partial file be kept or deleted?": Delete it at once, and say so in the log."'), 'a decision is the person\'s own sentence');
  assert.doesNotMatch(text, /earlier session|resume|atlasbound decisionbook add/, 'no call to send before the work goes on');
  assert.ok(Buffer.byteLength(text) <= 4096, `inside its byte budget: ${Buffer.byteLength(text)}`);
  assert.equal(textOf(await w.say('Continue the work on the export.', 's2')), '', 'a task prompt adds nothing: the start gave the intake');
});

test('the form is light: a small fix needs its file and the yes; normal work no gap, step, actor, edge or impact', async () => {
  const w = await dietWorld();
  await w.say('Fix the typo in the export header.');
  const small = await w.create(planned(EXPORT), { title: 'Fix the header typo', why: 'a typo', level: 'micro' });
  assert.deepEqual(small.out.state.unmet.map((row) => row.code), ['ready-no-confirm'], 'only the yes is missing');
  assert.equal(small.out.state.rows.asked, 5);
  await w.say('yes, go ahead');
  assert.equal((await verbs.add(w.io, { rest: [small.out.id, wire({ t: 'confirm', by: 'the developer', said: 'yes, go ahead' })] })).out.state.ready, true);
  const n = await dietWorld();
  await n.say('Make the report export stream its rows so a large report finishes.');
  const normal = await n.create([]);
  assert.deepEqual(normal.out.state.unmet.map((row) => row.id), ['plan', 'checks', 'command', 'answers', 'confirm'], 'what normal work asks of a blank plan');
  assert.doesNotMatch(normal.text, /ready-gaps|ready-steps|ready-no-actor|ready-edges|ready-impact|ready-research|"kind":"gap"|"kind":"step"/);
  assert.match(normal.text, /\n {2}what to research, and to ask only where a human must decide \(a guide, never records to fill\): data that already exists/, 'the gap list guides the asking');
});

test('a reply says its progress and only what changed: no row said twice, no fill-in after an add', async () => {
  const w = await dietWorld();
  await w.say('Make the report export stream its rows so a large report finishes.');
  const made = await w.create([]);
  assert.match(made.text, /not READY as normal work: 7 of 12 rows met\n {2}ready-no-plan: plan the files/, 'a new says every missing row');
  assert.match(made.text, /\nthen run: atlasbound decisionbook add (\S+) --file \.atlasbound\/drafts\/[0-9a-f]{12}\/\1\.json\n/, 'and the one add that fills them');
  const id = made.out.id;
  const next = await verbs.add(w.io, { rest: [id, wire([...findings(1), ...planned(EXPORT)])] });
  const [recorded, state, ...rest] = next.text.trim().split('\n');
  assert.equal(recorded, `${id}: 2 records recorded (research, link)`);
  assert.equal(state, `${id} not READY as normal work: 8 of 12 rows met`);
  assert.deepEqual(rest, ['  still missing, as said before: ready-checks, ready-no-command, ready-answers, ready-no-confirm'],
    'rows that did not move are named by their code, their sentences are not said again; no fill-in');
  assert.deepEqual([next.out.state.rows, Object.keys(next.out.state.before), 'next' in next.out.state],
    [{ met: 8, asked: 12 }, ['plan', 'checks', 'command', 'answers', 'confirm'], false], 'the state holds what was unmet before, and no next call');
  const asked = await verbs.add(w.io, { rest: [id, wire([CHECK, QUESTIONS[0]])] });
  assert.match(asked.text, /9 of 12 rows met\n {2}ready-open-question: a blocking question has no answer from a person yet: [^\n]+\n {2}still missing, as said before: ready-answers, ready-no-confirm\n$/,
    'a row the write brought is said in full, once');
  const settled = await verbs.add(w.io, { rest: [id, wire({ ...findings(2)[1], settles: 'report.memory' })] });
  assert.match(settled.text, /9 of 12 rows met\n {2}ready-answers:\n {2}forks counted: report\.memory \(normal work needs at least 3[^\n]+\n {2}still missing, as said before: ready-open-question, ready-no-confirm\n$/,
    'a row that moved says what it counts now, under its code');
  assert.doesNotMatch(settled.text, /a fork counts when research settles it|--file /, 'never its sentence or the fill-in again');
  const full = await verbs.ready(w.io, { rest: [id] });
  assert.match(full.text, /ready-answers: a fork counts when research settles it.*\nthen run: atlasbound decisionbook add/s,
    '`ready` asked on its own says every row in full and the fill-in');
  assert.deepEqual(['next' in full.out, 'before' in full.out], [true, false], 'ready: the one add, and no list of what was unmet before');
});

test('a question for a colleague is parked with its source: it blocks nothing, every start names it', async () => {
  const w = await dietWorld();
  await w.say('Make the report export stream its rows so a large report finishes.');
  const parked = { t: 'question', q: 'Q9', text: 'Does the nightly job read the export while it is written?', decides: 'report.nightly',
    whyNotCode: 'the job is another team\'s', to: 'the operations colleague', source: 'the person: "go ask operations about the nightly job"' };
  const { out: { id } } = await w.create([...DRAFT, parked]);
  const { text } = await answeredAll(w, id);
  assert.match(text, / READY as normal work\. /, 'a parked question never keeps the plan from READY');
  assert.doesNotMatch(text, /Q9/, 'and is not asked of the person');
  const start = textOf(await w.began('s2'));
  assert.match(start, /\nquestions that wait for someone else \(remind the person; [^\n]+\n- \S+ Q9 for the operations colleague: Does the nightly job read the export while it is written\? \(from the person: "go ask operations about the nightly job"\)$/, 'with its plan');
  const guess = { t: 'decision', key: 'report.nightly', value: 'the job reads only finished files', why: 'their reply', whose: 'person',
    answers: 'Q9', effect: ['check:AC-1'] };
  const refused = (record) => verbs.add(w.io, { rest: [id, wire(record)] }).then(() => null, (err) => err.code);
  assert.equal(await refused(guess), 'said-not-theirs', 'an answer no one typed is no one\'s, whoever it is signed for');
  const theirs = { ...guess, whose: 'the operations colleague', said: 'We only pick up files once they are closed.' };
  assert.equal(await refused(theirs), 'said-unproven', 'words the person did not type here need a place the product can read them');
  assert.equal(await refused({ ...theirs, source: 'issue 3346, comment 7' }), 'said-unproven', 'and a place it cannot read proves nothing');
  assert.match(textOf(await w.began('s3')), /\nquestions that wait for someone else /, 'so it is still parked');
  const address = 'https://tracker.invalid/ops/jobs/issues/3346#issuecomment-7';
  w.io.tracker = { read: async (asked) => (asked === address ? { text: `${theirs.said} We never read a file that is open.`, author: 'ops-desk Operations colleague' } : null) };
  await verbs.add(w.io, { rest: [id, wire({ ...theirs, source: address })] });
  const { by, saidBy, source } = writtenDecisions(w.io, id).at(-1);
  assert.deepEqual([by, saidBy, source], [PERSON, 'the operations colleague', address], 'theirs, read by the product at its address');
  assert.doesNotMatch(textOf(await w.began('s4')), /questions that wait for someone else/, 'once answered it is reminded no more');
});

test('the plan\'s phases are trace rows: created, READY, the first allowed write, with seconds, turns and calls', async () => {
  const w = await dietWorld();
  const { id } = await frozen(w);
  await handlers.preShell({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'ls src' }, cwd: ROOT }, w.io);
  await w.edit(EXPORT);
  await w.edit(EXPORT);
  const rows = phaseRows(w.io);
  assert.deepEqual(rows.map((row) => Object.keys(row.codes)), [['phase-created'], ['phase-ready'], ['phase-first-write']], 'each phase once');
  assert.deepEqual(rows.map((row) => row.ref), Array(3).fill({ plan: id, session: 's1' }));
  assert.deepEqual(rows.map((row) => [row.n.turns, row.n.calls]), [[1, 0], [1, 0], [0, 1]],
    'the person\'s turns and the tool calls DecisionBook saw since the phase before');
  assert.ok(rows.every((row) => Number.isInteger(row.n.seconds)));
});
