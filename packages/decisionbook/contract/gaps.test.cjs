// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The gaps of a change are one fixed list of seven: a guide for what to research and what to ask the person, said with the answers
// row, never records a plan must fill. No level's READY asks for a gap item. One a plan still holds is read, checked where it cites
// a line, and shown as it was written. Only the public entry and kit's fake io. Every [I-n] names an invariant of this package.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, begin, added, refusedWith, recordsFor, unmetOf, readFor, GAP_IDS: GAPS } = require('./world.cjs'); // the list, frozen there

const { verbs } = decisionbook;
const { WORDS } = decisionbook.codes;
const FILE = 'src/poll/limit.rb';
const pollWorld = () => bookWorld({ files: { [FILE]: Array.from({ length: 20 }, (_, i) => `# line ${i + 1}`).join('\n') } });
const gapless = (level, tag) => recordsFor(level, [FILE], tag).filter((r) => r.kind !== 'gap'); // a level's every row, and no gap item
const na = (gap, text = 'the change adds nothing of this kind') => ({ t: 'item', kind: 'gap', gap, status: 'na', text });
const evidence = (gap, over) => ({ t: 'item', kind: 'gap', gap, status: 'evidence', text: 'found', ...over });
const askedGap = (gap, q) => ({ t: 'item', kind: 'gap', gap, status: 'asked', q, text: 'the person decides it' });
const question = (q, gap, text = 'Lowering the limit: polls with more options keep them, or edits are refused? Default: keep.') => ({ t: 'question', q, text,
  decides: `gap.${gap}`, whyNotCode: 'a product rule: no file says which', blocking: false });
const gapAnswer = (q, by = 'Ayse') => ({ t: 'decision', key: 'poll.existing-options', value: 'keep', why: 'no vote is lost', by, answers: q,
  effect: ['check:AC-2'] });
const codeOf = async (io, id, record) => ((await refusedWith(io, id, record)) || [null])[0];

test('[I-27] no level\'s READY asks for a gap item: normal and critical work are READY with none, and no reply names a gap row', async () => {
  const io = pollWorld();
  const id = await begin(io);
  const made = await added(io, id, gapless('normal'));
  assert.deepEqual([made.out.state.ready, made.out.state.unmet], [true, []], 'every row of normal work holds with no gap item');
  const critical = await begin(io, { title: 'Critical poll limit', level: 'critical' });
  await readFor(io, critical, ['src/report/export.js']); // critical research rests on a file read
  await added(io, critical, gapless('critical', '.critical'));
  assert.deepEqual(await unmetOf(io, critical), []);
  const small = await begin(io, { title: 'Small poll fix', level: 'micro' });
  await added(io, small, gapless('micro', '.small'));
  assert.deepEqual(await unmetOf(io, small), [], 'a small fix needs no gap');
  const bare = await begin(io, { title: 'Bare poll plan' });
  const res = await verbs.ready(io, { rest: [bare] });
  assert.ok(!res.out.unmet.some((u) => u.id === 'gaps' || u.code === 'ready-gaps') && !/ready-gaps|gaps not closed/.test(res.text), res.text);
  assert.equal(decisionbook.codes.isCode('ready-gaps'), false, 'the code is gone');
});

test('[I-27] the seven gaps are a guide said with the answers row, in the list\'s order, with the shape the person asked for', async () => {
  const io = pollWorld();
  const id = await begin(io);
  const res = await verbs.ready(io, { rest: [id] });
  const lines = res.text.split('\n');
  const at = lines.findIndex((line) => line.startsWith('  ready-answers: '));
  assert.deepEqual([lines[at + 1], lines[at + 2].startsWith('  forks counted: none')], [`  ${WORDS.askGuide}`, true],
    'under the row that asks for questions: what to ask about, then what was counted');
  const [head, guide] = WORDS.askGuide.split(': ');
  assert.equal(head, 'what to ask about and research (a guide, never records to fill)');
  const parts = guide.split('; ');
  const words = [/already exists under the old behaviour/, /unset, empty, malformed or hostile input/, /defined, defaulted and documented/,
    /other consumers and the upgrade path/, /the user and the operator see when it fails/, /every entry point and the shape the person asked for/,
    /which tests prove each decision/]; // one part per gap, in GAPS' order
  assert.deepEqual([parts.length, parts.map((part, i) => words[i].test(part))], [GAPS.length, GAPS.map(() => true)]);
  const quiet = await added(io, id, { t: 'note', text: 'a write that moves no row' });
  assert.ok(!quiet.text.includes(WORDS.askGuide), 'a write\'s reply does not say the guide again');
});

test('[I-27] a gap item is still read: only a gap of the list, a cited line that exists; unproven it holds nothing back', async () => {
  const io = pollWorld();
  const id = await begin(io);
  await added(io, id, gapless('normal').slice(0, -1)); // every row but the yes: a draft
  assert.equal(await codeOf(io, id, evidence('existing-data', { source: 'src/poll/nowhere.rb:3' })), 'gap-uncited', 'a file that does not exist');
  assert.equal(await codeOf(io, id, evidence('existing-data', { source: `${FILE}:21` })), 'gap-uncited', 'line 21 of a 20-line file');
  assert.equal(await codeOf(io, id, evidence('existing-data', { source: 'the poll model' })), 'record-invalid', 'a source is <file>:<line>');
  assert.equal(await codeOf(io, id, { ...na('existing-data'), gap: 'existing-records' }), 'record-invalid', 'only a gap of the list');
  assert.equal(await codeOf(io, id, { ...na('existing-data'), status: 'done' }), 'record-invalid');
  for (const gap of GAPS) assert.equal(await codeOf(io, id, na(gap)), null, `${gap}: of the list`);
  // a run no research ran, evidence with nothing cited, a question that does not exist, a why of two words: kept, none is judged
  const loose = await added(io, id, [evidence('existing-data', { run: 'bin/console "p Poll.count"' }), evidence('invalid-input'), askedGap('config-docs', 'Q9'),
    na('compat-rollout', 'n/a')]);
  assert.deepEqual(loose.out.state.unmet.map((u) => u.code), ['ready-no-confirm'], 'the plan lacks its yes, as before them');
  const res = await added(io, id, gapless('normal').at(-1));
  assert.deepEqual([res.out.state.ready, res.out.state.unmet], [true, []]);
});

test('[I-27] a question deciding gap.<id> is like any other: refused when settled or restating the task; its answer is a fork', async () => {
  const io = pollWorld();
  const first = await begin(io, { title: 'Poll limit from the environment' });
  await added(io, first, [...gapless('normal').slice(0, 3), { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the limit' },
    { t: 'check', id: 'AC-2', text: 'polls keep their options' }]);
  assert.equal(await codeOf(io, first, question('Q1', 'scope-surfaces', 'Poll limit from the environment')), 'question-restates',
    'naming a gap excuses no question that restates the task');
  await added(io, first, [question('Q1', 'scope-surfaces'), { ...gapAnswer('Q1'), key: 'gap.scope-surfaces', files: [FILE] }]);
  const again = await begin(io, { title: 'Poll limit, take two' });
  await added(io, again, [...gapless('normal').slice(0, 3), { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the limit' }]);
  assert.equal(await codeOf(io, again, question('Q1', 'scope-surfaces')), 'question-settled', 'a person\'s standing decision of that key on these files');
  assert.equal(await codeOf(io, again, { ...question('Q2', 'scope-surfaces', 'Poll limit, take two'), decides: 'poll.take-two' }), 'question-restates');
  const id = await begin(io, { title: 'Poll limit, the forks' });
  await added(io, id, [...gapless('normal').filter((r) => !['question', 'decision'].includes(r.t)), question('Q1', 'existing-data'),
    askedGap('existing-data', 'Q1'), gapAnswer('Q1')]);
  const row = (await verbs.ready(io, { rest: [id] })).out.unmet.find((u) => u.code === 'ready-answers');
  assert.deepEqual(row.forks, ['poll.existing-options'], 'the gap\'s decision counts as a fork like any other');
});

test('[I-27] show <id> gaps lists the gap items a plan recorded, as written: how each was closed, its text and what it cites', async () => {
  const io = pollWorld();
  const id = await begin(io);
  await added(io, id, [{ t: 'research', tool: 'grep', asked: 'limit', answer: 'one constant', source: `${FILE}:1` },
    question('Q1', 'existing-data'), askedGap('existing-data', 'Q1'), evidence('invalid-input', { text: 'nothing cited yet' }),
    na('tests-proof', 'the spec file covers every case already'), evidence('invalid-input', { source: `${FILE}:2`, text: 'abc raises' })]);
  const shown = await verbs.show(io, { rest: [id, 'gaps'] });
  assert.deepEqual(shown.out.gaps, [{ gap: 'existing-data', status: 'asked', text: 'the person decides it', source: null, run: null, q: 'Q1' },
    { gap: 'tests-proof', status: 'na', text: 'the spec file covers every case already', source: null, run: null, q: null },
    { gap: 'invalid-input', status: 'evidence', text: 'abc raises', source: `${FILE}:2`, run: null, q: null }],
    'the recorded ones only: a later item of a gap replaces it; no status is judged and no gap is said to be missing');
  assert.deepEqual(shown.text.split('\n').filter((line) => line.startsWith('gap ')), ['gap existing-data: asked Q1: the person decides it',
    'gap tests-proof: na: the spec file covers every case already', 'gap invalid-input: evidence: abc raises (src/poll/limit.rb:2)']);
  assert.deepEqual((await verbs.show(io, { rest: [id, 'gaps.tests-proof'] })).out.gaps.map((g) => g.gap), ['tests-proof'], 'gaps.<gap> picks that gap');
});
