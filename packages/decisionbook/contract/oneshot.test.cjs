// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// a refused or not-READY `new` costs one reply,
// never a hunt. A refusal names every problem of the batch with its place and field, and writes nothing; a valid not-READY `new` keeps one plan and its
// reply hands the one `add` that supplies what is missing, as fill-in JSON.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, sentBy } = require('./world.cjs');

const { verbs } = decisionbook;
const FILES = { 'lib/sched/index.js': 'x\n', 'lib/sched/parse.js': 'y\n', 'lib/sched/run.js': 'r\n' };
const made = (io, value) => verbs.create(io, { rest: [JSON.stringify(value)] });
const head = { title: 'Workers in the scheduler', why: 'runs compete', success: 'workers limit runs', kind: 'feature', level: 'normal' };
const plansHere = (io) => (io.fs.list('.decisionbook') || []).filter((name) => name.endsWith('.jsonl'));

test('a new with three shape errors names all three, each with its place and field, and writes nothing', async () => {
  const io = bookWorld({ files: FILES });
  writeConfig(io, { protect: ['lib/**'] });
  const records = [{ t: 'research', tool: 'read', asked: 'how runs start', answer: 'build() starts them', source: 'lib/sched/index.js:1' },
    { t: 'research', tool: 'read', asked: 'how options parse' },
    { t: 'link', rel: 'plans', to: 'file:lib/sched/parse.js', why: 'workers' },
    { t: 'item', kind: 'step', order: 1, file: 'lib/sched/parse.js', change: 'read workers' },
    { t: 'check', id: 'AC-1', command: 'npm test' }];
  const err = await made(io, { ...head, records }).then(() => null, (e) => e);
  assert.equal(err.code, 'record-invalid');
  assert.equal(err.message, 'record-invalid: nothing written: record 2 of 5: research.answer is not str; record 4 of 5: Step.verify is not str; '
    + 'record 5 of 5: check.text is not str');
  assert.deepEqual(plansHere(io), [], 'a refused new leaves nothing under .decisionbook/');
});

// the common `record-invalid` causes, each as an AI sends it, in ONE new. Refused one at a time, the head is refused
// alone, then record shapes, then citations and checks; and `decision-no-effect` must say what an effect is, not only `<key>: <effect>`
const EFFECT_IS = 'an effect is what the answer changed in the plan, each kind:value naming something the plan holds: file:<planned path>, check:<id> or '
  + '<item kind>:<item text> (any item kind but step and gap); name one and send these records again';
test('a new wrong in its head and in five records names every problem in one reply, and nothing is written', async () => {
  const io = bookWorld({ files: FILES });
  writeConfig(io, { protect: ['lib/**'] });
  const records = [{ t: 'research', tool: 'read', asked: 'how runs start', answer: 'build() starts them', source: 'lib/sched/index.js:1' },
    { t: 'research', tool: 'a code search', asked: 'who calls parse', answer: 'only index.js', source: 'lib/sched/index.js:99', settles: 'sched.callers' },
    { t: 'link', rel: 'plans', to: 'file:lib/sched/index.js', why: 'the run order' },
    { t: 'question', q: 'Q1', text: 'Which job runs first?', decides: 'run order within a tick', whyNotCode: 'a product rule' },
    { t: 'item', kind: 'gap', gap: 'scope-surfaces', status: 'evidence', text: 'lib/sched and its two tests only', source: 'lib/sched' },
    { t: 'item', kind: 'step', order: 1, file: 'lib/sched/index.js', text: 'order by priority then name', verify: 'AC-1' },
    { t: 'decision', key: 'priority order', value: 'lower runs first', why: 'like nice', by: 'developer', answers: 'Q1', effect: ['check:AC-2', 'step:2'] }]; // its key a phrase too
  const err = await made(io, { ...head, level: 'small', records }).then(() => null, (e) => e); // the level in the pack's words
  assert.equal(err.message, 'record-invalid: nothing written: the plan: plan.level is not one of micro, normal, critical; record 2 of 7: research.tool is '
    + 'not word, research-uncited: lib/sched/index.js:99: no such line here; record 4 of 7: question.decides is not word; record 5 of 7: Gap.source is not ref; '
    + `record 6 of 7: Step.change is not str; record 7 of 7: decision.key is not word, decision-no-effect: priority order: effect check:AC-2, step:2: ${EFFECT_IS}`);
  assert.deepEqual(plansHere(io), [], 'nothing under .decisionbook/');
});

// the light form: a small fix asks for its plan, no open question, no danger path and the yes; normal work adds a check with a
// command and the answers, and the answers are never a blank to fill
test('a valid new that is not READY keeps one plan, and the one add its reply names makes it READY', async () => {
  const fill = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === '' ? `${k} words here` : v]));
  const started = async (level) => {
    const io = bookWorld({ files: FILES });
    writeConfig(io, { protect: ['lib/**'] });
    const first = await made(io, { ...head, level, title: 'Default priority', records: [{ t: 'link', rel: 'plans', to: 'file:lib/sched/parse.js', why: 'the default' }] });
    assert.deepEqual(plansHere(io), [`${first.out.id}.jsonl`], 'one plan');
    const missing = sentBy(first.text, `add ${first.out.id}`); // the add as a quoted heredoc, the reply's last lines
    assert.ok(missing && first.text.endsWith('\nJSON\n'), first.text);
    const second = await verbs.add(io, { rest: [first.out.id, JSON.stringify(missing.map(fill))] });
    assert.deepEqual(plansHere(io), [`${first.out.id}.jsonl`], 'still one plan: no second new');
    return { first, missing: missing.map((r) => r.kind || r.t), second };
  };
  const small = await started('micro');
  assert.deepEqual([small.first.out.state.rows, small.missing], [{ met: 3, asked: 4 }, ['confirm']], 'the small form lacks the person\'s yes only');
  assert.equal(small.second.out.state.ready, true, small.second.text);
  const normal = await started('normal');
  assert.deepEqual(normal.first.out.state.unmet.map((u) => u.code), ['ready-checks', 'ready-no-command', 'ready-answers', 'ready-no-confirm']);
  assert.deepEqual(normal.missing, ['check', 'confirm'], 'the missing rows in rubric order, the person\'s yes last; the answers are asked, never a blank');
  assert.deepEqual(normal.second.out.state.unmet.map((u) => u.code), ['ready-answers'], 'the add filled every row it named');
  assert.match(normal.second.text, /not READY as normal work: 10 of 11 rows met\n {2}still missing, as said before: ready-answers\n$/,
    'a reply to an add says what changed, the row left by its code, and no fill-in again');
});

test('a JSON word that is neither an object nor a list is refused by name with the verb\'s usage, and nothing is written', async () => {
  const io = bookWorld({ files: FILES });
  for (const word of ['null', '5', '"title"', 'true']) {
    await assert.rejects(verbs.create(io, { rest: [word] }), (err) => err.code === 'plan-args' && /^plan-args: new <record>: \{"title"/.test(err.message), word);
    await assert.rejects(verbs.add(io, { rest: ['2026-11-02-x', word] }), (err) => err.code === 'plan-args' && /^plan-args: add <id> <record>/.test(err.message), word);
  }
  await assert.rejects(made(io, [head]), (err) => err.code === 'record-invalid' && /the plan: /.test(err.message), 'a list is no plan: named, no crash');
  await assert.rejects(made(io, { ...head, records: null }), { code: 'record-invalid' }, 'records that are no list');
  assert.deepEqual(plansHere(io), []);
});
