// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// the answers row counts forks a person decided with an effect on the plan, or research settled citing file:line,
// never answers. The filler worlds stay not READY; the worlds of real forks reach READY. A Ruby repository: nothing here names a language.
const test = require('node:test');
const assert = require('node:assert/strict');
const { bookWorld, begin, added, unmetOf, leavesOthers, refusedWith, readFor, GAP_IDS } = require('./world.cjs');
const { verbs } = require('@atlasbound/decisionbook');

const RUBY = Object.fromEntries(['app/validators/pin_limit_validator.rb', 'app/models/status_pin.rb', 'config/settings.yml', 'spec/validators/pin_spec.rb']
  .map((key) => [key, Array.from({ length: 20 }, (_, i) => `# line ${i + 1}`).join('\n')]));
const pinsWorld = () => bookWorld({ files: RUBY, branch: 'e2e-main' });
const TASK = { title: 'Make the status pin limit configurable', why: 'an instance wants more than five pins', success: 'MAX_PINNED_STATUSES sets the limit' };
const pinResearch = (n) => Array.from({ length: n }, (_, i) => ({ t: 'research', tool: 'grep', asked: `pin limit ${i}`, answer: `LIMIT = 5 at line ${i + 1}`,
  source: `app/validators/pin_limit_validator.rb:${i + 1}` }));
/** Every row of normal work but the answers row, and the person's yes after the plan. */
const PLANNED = [...pinResearch(3), { t: 'item', kind: 'feature', text: 'status pins' },
  { t: 'link', rel: 'plans', to: 'file:app/validators/pin_limit_validator.rb', why: 'the limit' },
    { t: 'link', rel: 'plans', to: 'file:spec/validators/**', why: 'its spec' },
  { t: 'item', kind: 'step', order: 1, file: 'app/validators/pin_limit_validator.rb:3', change: 'LIMIT reads MAX_PINNED_STATUSES, 5 when unset',
    verify: 'AC-1' },
  { t: 'check', id: 'AC-1', text: 'the env var sets the limit', how: 'unit', command: 'bundle exec rspec spec/validators' },
    { t: 'check', id: 'AC-2', text: 'unset keeps 5', how: 'unit' },
  { t: 'item', kind: 'task', text: 'read the env var', covers: ['AC-1', 'AC-2'] }, { t: 'item', kind: 'actor', text: 'an admin' },
  { t: 'item', kind: 'edge', text: 'a non-number value' }, { t: 'item', kind: 'edge', text: 'zero' },
    { t: 'item', kind: 'impact', text: 'the pin API reads the same limit' },
  { t: 'item', kind: 'non-goal', text: 'a per-account limit' },
  ...GAP_IDS.map((gap) => ({ t: 'item', kind: 'gap', gap, status: 'na', text: 'the pin limit adds nothing of this kind' }))];
const askFork = (q, decides, text) => ({ t: 'question', q, text, decides, whyNotCode: 'a product trade-off: no file says which', blocking: true });
const personDecides = (q, key, effect, over = {}) => ({ t: 'decision', key, value: 'yes', why: 'the instance asked', whose: 'person', answers: q, effect,
  ...over });
const settledBy = (key, line) => ({ t: 'research', tool: 'read', asked: `${key}?`, answer: 'the code decides it',
  source: `app/validators/pin_limit_validator.rb:${line}`, settles: key });
async function pinPlanned(io, records, over = {}) {
  const id = await begin(io, { ...TASK, kind: 'feature', level: 'normal', ...over });
  for (const record of [...PLANNED, ...records, { t: 'confirm', by: 'the developer', said: 'yes' }]) await added(io, id, record);
  return id;
}

test('[I-19] filler earns nothing: one-word questions, a decision with no effect, the AI\'s own or a proposed answer', async () => {
  const io = pinsWorld();
  const id = await pinPlanned(io, []);
  assert.deepEqual(await unmetOf(io, id), ['ready-answers'], 'every other row of normal work holds');
  assert.equal((await refusedWith(io, id, { t: 'question', q: 'Q1', text: 'Limit?', blocking: true }))[0], 'record-invalid',
    'a question names what it decides and why the code cannot');
  await added(io, id, askFork('Q1', 'pins.limit', 'Which default when the variable is unset: 5 or unlimited?'));
  assert.equal((await refusedWith(io, id, personDecides('Q1', 'pins.limit', [])))[0], 'decision-no-effect');
  assert.equal((await refusedWith(io, id, personDecides('Q1', 'pins.limit', ['scope:everything'])))[0], 'decision-no-effect',
    'an effect is a planned file, a check or an item');
  await added(io, id, personDecides('Q1', 'pins.limit', ['check:AC-9'])); // no such check
  await added(io, id, askFork('Q2', 'pins.env', 'Read the variable once at boot or on every validation?'));
  await added(io, id, personDecides('Q2', 'pins.env', ['file:lib/elsewhere.rb'])); // not planned
  await added(io, id, { ...askFork('Q3', 'pins.zero', 'Does 0 mean no pins or no limit?'), blocking: false }); // open, so the questions row would say it
  await added(io, id, personDecides('Q3', 'pins.zero', ['check:AC-1'], { whose: 'assumed' }));
  await added(io, id, personDecides('Q3', 'pins.zero', ['check:AC-1'], { proposed: true }));
  const res = await verbs.ready(io, { rest: [id] });
  assert.deepEqual(res.out.unmet.map((u) => u.code), ['ready-answers']);
  assert.deepEqual(res.out.rows, { met: 11, asked: 12 });
  const FORKS = 'forks counted: none \\(normal work needs at least 3, or a no-fork item per planned file: ask only what a human must decide, never to reach the number\\)';
  assert.match(res.text, new RegExp(`not READY as normal work: 11 of 12 rows met\\n {2}ready-answers: [^\\n]+\\n {2}what to research, and to ask only where a human must decide [^\\n]+\\n {2}${FORKS}$`, 'm'));
});

test('[I-19] a question that restates the task, or a fork a person already decided on the same files, is refused and names it', async () => {
  const io = pinsWorld();
  const first = await pinPlanned(io, [askFork('Q1', 'spec.verification', 'Which spec proves the limit: the validator spec or a request spec?'),
    personDecides('Q1', 'spec.verification', ['check:AC-1'])]);
  const again = await pinPlanned(io, [], { title: 'Pin limit, take two' });
  const [code, message] = await refusedWith(io, again, askFork('Q1', 'spec.verification', 'What verification is required?'));
  assert.deepEqual([code, message.includes(`${first}/spec.verification = yes (by Amy)`)], ['question-settled', true], message);
  // the same reply hands the way on: the question again, naming that decision as what it asks the person to replace
  assert.ok(message.includes(`or, to ask the person to replace it, add "supersedes":["${first}/spec.verification"] to this question and send`), message);
  const [restates, said] = await refusedWith(io, first, askFork('Q2', 'pins.configurable', 'Should the status pin limit be configurable?'));
  assert.deepEqual([restates, /Q2 restates the title/.test(said)], ['question-restates', true], said);
  const elsewhere = await begin(io, { ...TASK, title: 'Reaction limit', kind: 'feature', level: 'normal' });
  await added(io, elsewhere, pinResearch(1)[0]);
  await added(io, elsewhere, { t: 'link', rel: 'plans', to: 'file:app/models/status_pin.rb', why: 'another file' });
  await added(io, first, personDecides('Q1', 'spec.verification', ['check:AC-1'], { files: ['spec/validators/**'] })); // the decision now governs its files
  assert.equal(await refusedWith(io, elsewhere, askFork('Q1', 'spec.verification', 'Which spec proves the reaction limit?')), null,
    'the same key on other files is another fork');
});

test('[I-19] real forks reach READY: research citing a real line, or one asked fork with its effect',
  async () => {
  const io = pinsWorld();
  const quiet = await pinPlanned(io, [settledBy('pins.default', 3), settledBy('pins.message', 7), settledBy('pins.scope', 9)]);
  assert.equal((await verbs.ready(io, { rest: [quiet] })).out.code, 'plan-ready', 'zero questions to a person: every fork closed by the code');
  const one = await pinPlanned(io, [askFork('Q1', 'pins.unset', 'Unset: keep 5 or no limit?'),
    personDecides('Q1', 'pins.unset', ['check:AC-2', 'non-goal:a per-account limit']),
    settledBy('pins.parse', 4), settledBy('pins.where', 5)], { title: 'Configurable pin cap' });
  assert.equal((await verbs.ready(io, { rest: [one] })).out.code, 'plan-ready');
  assert.equal((await refusedWith(io, one, settledBy('pins.x', 21)))[0], 'research-uncited', 'line 21 of a 20-line file');
  assert.equal((await refusedWith(io, one, { ...settledBy('pins.x', 1), source: 'app/nowhere.rb:1' }))[0], 'research-uncited');
  assert.equal((await refusedWith(io, one, { ...settledBy('pins.x', 1), source: 'the validator' }))[0], 'research-uncited');
  const critical = await pinPlanned(io, [...pinResearch(2), { t: 'item', kind: 'edge', text: 'negative' }, { t: 'item', kind: 'risk', text: 'r' },
    { t: 'item', kind: 'rollback', text: 'revert' },
    settledBy('pins.a', 1), settledBy('pins.b', 2), settledBy('pins.c', 3), settledBy('pins.d', 4)], { title: 'Critical pins', level: 'critical' });
  await readFor(io, critical, ['app/validators/pin_limit_validator.rb']); // critical research rests on a file read
  await leavesOthers(io, critical);
  assert.deepEqual(await unmetOf(io, critical), ['ready-answers'], 'the floor per level stays: critical work needs five');
});

test('[I-20] the fan-out signal counts only consumers outside the plan\'s own plan', async () => {
  const io = pinsWorld();
  const consumerItems = (paths) => paths.map((text) => ({ t: 'item', kind: 'consumer', text }));
  const own = await pinPlanned(io, consumerItems(['spec/validators/pin_spec.rb', 'app/validators/pin_limit_validator.rb', 'spec/validators/limit_spec.rb']));
  assert.deepEqual((await verbs.show(io, { rest: [own, 'plan'] })).out.level.code, null, 'its own spec and file are no shared callers');
  const shared = await pinPlanned(io, consumerItems(['app/models/status_pin.rb', 'app/controllers/pins_controller.rb', 'app/serializers/rest/status.rb']),
    { title: 'Shared pin limit' });
  const { code, signals } = (await verbs.show(io, { rest: [shared, 'plan'] })).out.level;
  assert.deepEqual([code, signals], ['level-raised', ['3+ shared consumers (3)']]); // in the gate's words
});

test('[I-22] a copied decisionbook file is refused by both names, never read as the one it copies', async () => {
  const io = bookWorld();
  const id = await begin(io, {});
  const original = io.fs.readText(`.decisionbook/${id}.jsonl`);
  io.fs.writeAtomic('.decisionbook/copy.jsonl', original);
  for (const verb of ['ready', 'close']) {
    await assert.rejects(verbs[verb](io, { rest: ['copy'] }), (err) => err.code === 'record-invalid' && err.message.includes('copy') && err.message.includes(id), verb);
  }
  assert.deepEqual([io.fs.readText(`.decisionbook/${id}.jsonl`), io.fs.readText('.decisionbook/copy.jsonl')], [original, original]);
});

test('[I-19] a settled question that names the decision, as the refusal says, is taken and binds nothing by itself', async () => {
  const io = pinsWorld();
  const first = await pinPlanned(io, [askFork('Q1', 'spec.verification', 'Which spec proves the limit: the validator spec or a request spec?'),
    personDecides('Q1', 'spec.verification', ['check:AC-1'])]);
  const again = await pinPlanned(io, [], { title: 'Pin limit, take two' });
  const [, message] = await refusedWith(io, again, askFork('Q1', 'spec.verification', 'What verification is required?'));
  const supersedes = JSON.parse(/"supersedes":(\[.*?\])/.exec(message)[1]);
  assert.equal(await refusedWith(io, again, { ...askFork('Q1', 'spec.verification', 'What verification is required?'), supersedes }), null);
  const states = (await verbs.show(io, { rest: ['decision:spec.verification'] })).out.decisions.map((d) => [d.plan, d.by, d.state]);
  assert.deepEqual(states, [[first, 'Amy', 'active']], 'the person\'s decision stands until a person replaces it');
});
