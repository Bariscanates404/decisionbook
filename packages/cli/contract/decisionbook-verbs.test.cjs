// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// the decisionbook group through the real bin; the package is THE DecisionBook. One world, one repository, one walk.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeWorld, makeRepo, git, run, typedYes, cleanEnv, tmp } = require('./support.cjs');

test('the short word db stands for the first word decisionbook, and a word the table does not hold is no verb', () => {
  const world = makeWorld();
  const repo = makeRepo({ 'src/report/export.rb': 'x\n' });
  const ab = (...args) => run(world.bin, [...args, '--target', repo]);
  const [short, full, old] = ['db', 'decisionbook', 'notaverb'].map((word) => ab(word, 'resume'));
  assert.deepEqual([short.code, short.out], [full.code, full.out], short.err);
  assert.match(short.out, /^No plan on this branch\. Plan before code: one `atlasbound decisionbook new`\.$/m, 'the text says the full word');
  assert.deepEqual([old.code, /verb-unknown/.test(old.err)], [1, true], old.err);
});

test('[I-5] the decisionbook group reaches the package: new, add, ready after the person\'s confirm, show, resume, close', () => {
  const world = makeWorld();
  const repo = makeRepo({ 'src/report/export.rb': 'x\n' });
  const ab = (...args) => run(world.bin, [...args, '--target', repo], { env: typedYes().env }); // a person typing the verbs at their terminal
  const made = ab('decisionbook', 'new', JSON.stringify({ title: 'Export rounding', why: 'totals are off by a cent', success: 'totals match', kind: 'bug',
    level: 'micro' }));
  assert.equal(made.code, 0, made.err);
  const id = made.out.split(' ')[0];
  for (const record of [{ t: 'research', tool: 'grep', asked: 'round(', answer: 'one call', source: 'src/report/export.rb:1' }, { t: 'item', kind: 'feature',
    text: 'export' },
    { t: 'link', rel: 'plans', to: 'file:src/report/export.rb', why: 'the rounding' }, { t: 'check', id: 'AC-1', text: 'totals match', command: 'rake test' },
    { t: 'item', kind: 'task', text: 'round once', covers: ['AC-1'] }, { t: 'decision', key: 'report.rounding', value: 'half-even', why: 'audit',
      by: 'developer' }]) {
    assert.equal(ab('decisionbook', 'add', id, JSON.stringify(record)).code, 0);
  }
  assert.match(ab('decisionbook', 'ready', id).out, /not READY as small fix: 3 of 4 rows met\n {2}ready-no-confirm: show the person the plan/,
    'the person\'s yes comes before READY');
  for (const record of [{ t: 'confirm', by: 'developer', said: 'yes' }]) {
    assert.equal(ab('decisionbook', 'add', id, JSON.stringify(record)).code, 0);
  }
  assert.match(ab('decisionbook', 'ready', id).out, new RegExp(`${id} READY as small fix`));
  assert.match(ab('decisionbook', 'show', 'file:src/report/export.rb').out, new RegExp(`file:src/report/export.rb planned-in plan:${id}`));
  assert.match(ab('decisionbook', 'resume').out, /report\.rounding = half-even/);
  fs.writeFileSync(path.join(repo, 'src/report/export.rb'), 'y\n');
  git(repo, 'commit', '-qam', 'round half-even');
  // a copy at the tip; git cannot tell whose the commit is, so the bin says it and what the person can do, a line each
  git(repo, 'branch', 'backup');
  const b = git(repo, 'symbolic-ref', '--short', 'HEAD').trim();
  // a route that moves the branch brings it back; a shape nothing can close is a lesson
  const back = `then close, then git checkout -B ${b} <the tip you left>`;
  const routes = [`rebased, or synced onto backup after backup merged ${b}, no commit since? git checkout -B ${b} <its tip before that, in git reflog ` +
    `${b}>, ${back}`,
    `its name reused after backup merged ${b}? git checkout -B ${b} <that merge: on backup's line, merging ${b}>^2, ${back}`,
      `a copy of ${b}? delete it, then close`,
    `cut from ${b}, or merged into backup? nothing can be closed (next time: close before you cut or merge it)`,
    'synced before the work, or committed after a sync? nothing can be closed (next time: close before you sync; sync, then make it READY)'];
  const held = ab('decisionbook', 'close', id);
  assert.deepEqual([held.code, held.out, held.err], [1, '',
    `atlasbound: plan-close-merged: ${id}: backup holds HEAD too: own commits unknown, nothing recorded\n${routes.map((r) => `  ${r}\n`).join('')}`]);
  git(repo, 'branch', '-D', 'backup');
  const closed = JSON.parse(ab('decisionbook', 'close', id, '--json').out);
  assert.deepEqual([closed.own.length, closed.files], [1, ['src/report/export.rb']]);
  assert.match(ab('decisionbook').out, /^Plan before code: one `atlasbound decisionbook new`/, 'the bare group is the plan line');
  assert.ok(fs.existsSync(path.join(repo, '.decisionbook', `${id}.jsonl`)), 'the history is a plain file in the repository');
});

// A normal-level task (a poll limit from the environment): its repository, its plan of every row, and its gap sweep (optional records).
const pollRepo = () => makeRepo({ 'src/poll/limit.rb': 'MAX = 4\n', 'spec/poll/limit_spec.rb': 'x\n' });
const POLL_TASK = JSON.stringify({ title: 'Poll option limit from the environment', why: 'the limit is hard-coded to 4', success: 'MAX_POLL_OPTIONS sets it',
  kind: 'feature', level: 'normal' });
const PROBE = 'ruby -e "p Integer(%q(abc), exception: false)"';
const settles = ['poll.limit-source', 'poll.limit-readers', 'poll.limit-load'].map((key) => ({ t: 'research', tool: 'read', asked: key,
  answer: 'one constant', source: 'src/poll/limit.rb:1', settles: key }));
const plan = [...settles, { t: 'research', tool: 'run', command: PROBE, observed: 'nil: a bad value gives nil' },
  { t: 'item', kind: 'feature', text: 'poll limit' }, { t: 'item', kind: 'actor', text: 'an instance admin' },
  { t: 'link', rel: 'plans', to: 'file:src/poll/limit.rb', why: 'the limit' }, { t: 'link', rel: 'plans', to: 'file:spec/poll/limit_spec.rb', why: 'its spec' },
  { t: 'item', kind: 'step', order: 1, file: 'src/poll/limit.rb:1', change: 'MAX = Integer(ENV.fetch("MAX_POLL_OPTIONS", "4"), exception: false) || 4',
    verify: 'AC-1' },
  { t: 'item', kind: 'step', order: 2, file: 'src/poll/limit.rb:1', change: 'cap at 20, floor at 2', verify: 'AC-2', after: 1 },
  { t: 'item', kind: 'step', order: 3, file: 'spec/poll/limit_spec.rb', change: 'unset, abc, 1, 50', verify: 'rspec spec/poll/limit_spec.rb', after: 2 },
  { t: 'check', id: 'AC-1', text: 'the env sets it', how: 'unit', command: 'rspec spec/poll/limit_spec.rb' }, { t: 'check', id: 'AC-2', text: 'bounded 2..20',
    how: 'unit' },
  { t: 'item', kind: 'task', text: 'read the limit', covers: ['AC-1', 'AC-2'] }, { t: 'item', kind: 'edge', text: 'abc gives 4' }, { t: 'item', kind: 'edge',
    text: '50 gives 20' },
  { t: 'item', kind: 'impact', text: 'the API reports the same limit' }, { t: 'note', text: 'one call' }, { t: 'assumption', text: 'a restart reads it',
    why: 'a constant' },
  { t: 'confirm', by: 'developer', said: 'yes' }];
const gap = (id, status, over) => ({ t: 'item', kind: 'gap', gap: id, status, ...over });
const SWEEP = [{ t: 'question', q: 'Q1',
  text: 'Polls that already have more options than a lowered limit: keep them and their votes, or refuse their edit? Default: keep.',
  decides: 'gap.existing-data', whyNotCode: 'a product rule: no file says which', blocking: true },
{ t: 'decision', key: 'poll.existing-options', value: 'keep', why: 'no vote is lost', by: 'developer', answers: 'Q1', effect: ['check:AC-2'] },
gap('existing-data', 'asked', { q: 'Q1', text: 'existing polls above a lowered limit' }), gap('invalid-input', 'evidence', { run: PROBE,
  text: 'a bad value gives nil: fall back to 4' }),
gap('config-docs', 'evidence', { source: 'src/poll/limit.rb:1', text: 'the limit is defined here only' }),
gap('compat-rollout', 'na', { text: 'no other service or client reads this constant' }), gap('failure-visibility', 'na',
  { text: 'a bad value falls back to the default, never an error' }),
gap('scope-surfaces', 'na', { text: 'the validator is the only entry point that reads it' }), gap('tests-proof', 'evidence',
  { source: 'spec/poll/limit_spec.rb:1', text: 'the limit spec' })];

test('[I-5] a whole normal plan of 20 records in one add through the real bin is READY; a refused batch writes nothing', () => {
  const world = makeWorld();
  const repo = pollRepo();
  const ab = (...args) => run(world.bin, [...args, '--target', repo], { env: typedYes().env }); // a person typing the verbs at their terminal
  const id = ab('decisionbook', 'new', POLL_TASK).out.split(' ')[0];
  const UNCITED = gap('tests-proof', 'evidence', { source: 'spec/poll/limit_spec.rb:2', text: 'one line only' }); // the spec has one line
  const refused = ab('decisionbook', 'add', id, JSON.stringify([plan[0], UNCITED]));
  assert.deepEqual([refused.code !== 0, /gap-uncited: nothing written: record 2 of 2/.test(refused.err + refused.out)], [true, true], refused.err);
  const lines = () => fs.readFileSync(path.join(repo, '.decisionbook', `${id}.jsonl`), 'utf8').trim().split('\n').length;
  assert.equal(lines(), 1, 'all or nothing');
  // a step that names a file the plan does not plan is a record like any other: no row of the form reads the steps
  const aside = ab('decisionbook', 'add', id, JSON.stringify({ t: 'item', kind: 'step', order: 9, file: 'src/other.rb', change: 'x', verify: 'AC-1' }));
  assert.deepEqual([aside.code, lines()], [0, 2], aside.err);
  const added = ab('decisionbook', 'add', id, JSON.stringify(plan));
  assert.deepEqual([plan.length, added.code, lines()], [20, 0, 23], added.err); // the task, the step, the 20 and the READY record the add stored
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, '.decisionbook', `${id}.jsonl`), 'utf8').trim().split('\n').at(-1)).t, 'ready');
  assert.match(added.out, new RegExp(`^${id}: 20 records recorded`));
  assert.match(added.out, new RegExp(`^${id} READY as normal work\\. Frozen: `, 'm'), 'the add that brings the last row says READY itself');
  assert.match(ab('decisionbook', 'ready', id).out, new RegExp(`^${id} READY as normal work\\. Frozen: `, 'm'));
  assert.match(ab('decisionbook', 'resume').out,
    new RegExp(/\nsteps:\n- step 1 src\/poll\/limit\.rb:1: MAX = Integer[^\n]+\(verify AC-1\)\n- step 2 src\/poll\/limit\.rb:1, after 1: cap at 20, f/.source +
      /loor at 2 \(verify AC-2\)\n- step 3 spec\/poll\/limit_spec\.rb, after 2: [^\n]+\n- step 9 src\/other\.rb: x \(verify AC-1\)\nfound by the research:\n/.source));
});

test('[I-5] through the real bin, normal work is READY with no gap item named; a gap cites a line that exists; show lists them', () => {
  const world = makeWorld();
  const repo = pollRepo();
  const ab = (...args) => run(world.bin, [...args, '--target', repo], { env: typedYes().env }); // a person typing the verbs at their terminal
  const made = ab('decisionbook', 'new', POLL_TASK);
  const id = made.out.split(' ')[0];
  assert.match(made.out, new RegExp(`^${id} not READY as normal work: 6 of 11 rows met$`, 'm'));
  assert.doesNotMatch(made.out, /ready-gaps|ready-steps|gaps not closed/, 'no row of the form asks for a gap or a step');
  assert.equal(ab('decisionbook', 'add', id, JSON.stringify(plan)).code, 0);
  const ready = ab('decisionbook', 'ready', id).out;
  assert.match(ready, new RegExp(`^${id} READY as normal work\\. Frozen: `), 'READY with no gap item recorded');
  assert.doesNotMatch(ready, /gap/);
  const missing = ab('decisionbook', 'add', id, JSON.stringify([gap('tests-proof', 'evidence', { source: 'spec/poll/limit_spec.rb:2', text: 'one line only' })]));
  assert.deepEqual([missing.code !== 0, /gap-uncited/.test(missing.err + missing.out)], [true, true], missing.err);
  assert.equal(ab('decisionbook', 'add', id, JSON.stringify(SWEEP)).code, 0); // gap items are still taken, and the plan stays READY
  assert.match(ab('decisionbook', 'ready', id).out, new RegExp(`^${id} READY as normal work\\. Frozen: `));
  const shown = ab('decisionbook', 'show', id, 'gaps').out.split('\n').filter((line) => line.startsWith('gap '));
  assert.deepEqual(shown.map((line) => line.split(':')[0]), ['gap existing-data', 'gap invalid-input', 'gap config-docs', 'gap compat-rollout',
    'gap failure-visibility', 'gap scope-surfaces', 'gap tests-proof'], 'as written, in the order they were recorded');
  assert.match(shown[1], /^gap invalid-input: evidence: a bad value gives nil: fall back to 4 \(run: ruby -e /);
});

// A long add in single quotes breaks the shell on an apostrophe in a text, so no fill-in prints that form.
// The JSON rides on standard input, as a quoted heredoc, the one form every fill-in prints
test('new and add take their JSON from standard input when the JSON word is not given, a quoted heredoc untouched', () => {
  const world = makeWorld();
  const repo = makeRepo({ 'src/report/export.rb': 'x\n' });
  const TEXT = 'the run\'s "done" event isn\'t logged';
  const call = `"${process.execPath}" "${world.bin}" decisionbook new --target "${repo}" <<'JSON'\n${JSON.stringify({ title: 'Done events', why: TEXT, level: 'micro' })}\nJSON`;
  const made = spawnSync('/bin/sh', ['-c', call], { encoding: 'utf8', env: cleanEnv() });
  assert.equal(made.status, 0, made.stderr);
  const id = made.stdout.split(' ')[0];
  const lines = () => fs.readFileSync(path.join(repo, '.decisionbook', `${id}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines()[0].why, TEXT, 'as written');
  const piped = run(world.bin, ['decisionbook', 'add', id, '--target', repo], { input: `${JSON.stringify([{ t: 'note', text: TEXT }])}\n` });
  assert.deepEqual([piped.code, lines().at(-1).text], [0, TEXT], piped.err);
  const worded = run(world.bin, ['decisionbook', 'add', id, JSON.stringify({ t: 'note', text: 'by word' }), '--target', repo], { input: 'not read' });
  assert.deepEqual([worded.code, lines().at(-1).text], [0, 'by word'], 'a JSON word given: standard input is not read');
  const none = run(world.bin, ['decisionbook', 'add', id, '--target', repo], { input: '' });
  assert.deepEqual([none.code, none.err.split('\n')[0]], [1, 'atlasbound: plan-args: add <id> <record> | add <id> [<record>, ...], or the JSON on standard input']);
});

test('a question a person settled is refused with the record that proposes replacing it; one more call waits for the person', () => {
  const world = makeWorld();
  const repo = makeRepo({ 'lib/errors.js': 'module.exports = {};\n' });
  const home = tmp('cli-home-');
  const person = (...args) => run(world.bin, [...args, '--target', repo], { env: { ...typedYes().env, HOME: home } });
  const ai = (args, input) => run(world.bin, [...args, '--target', repo], { input, env: { HOME: home, CLAUDE_CODE_SESSION_ID: 'a1' } });
  const prompted = (text) => run(world.bin, ['hook', 'UserPromptSubmit'], { cwd: repo, env: { HOME: home, CLAUDE_PROJECT_DIR: repo },
    input: JSON.stringify({ session_id: 'a1', cwd: repo, hook_event_name: 'UserPromptSubmit', prompt: text }) });
  const records = [{ t: 'research', tool: 'read', asked: 'what is thrown', answer: 'a plain Error', source: 'lib/errors.js:1' },
    { t: 'item', kind: 'feature', text: 'the error type' }, { t: 'link', rel: 'plans', to: 'file:lib/errors.js', why: 'the errors' },
    { t: 'check', id: 'AC-1', text: 'the type is thrown', command: 'node --test' }, { t: 'item', kind: 'task', text: 'throw it', covers: ['AC-1'] }];
  const head = { why: 'callers need to tell errors apart', success: 'the type is thrown', kind: 'feature', level: 'micro' };
  // an earlier task: a person decided the error type on this file, at their terminal
  const first = person('decisionbook', 'new', JSON.stringify({ ...head, title: 'Error type', records: [...records,
    { t: 'decision', key: 'errortype', value: 'a plain Error with a code', why: 'small', by: 'developer', files: ['lib/errors.js'] },
    { t: 'confirm', by: 'developer', said: 'yes' }] }));
  assert.equal(first.code, 0, first.err);
  const old = first.out.split(' ')[0];
  // this task reverses it: the AI's new holds a question on that key
  const asked = { t: 'question', q: 'Q1', text: 'should a class replace the plain Error here?', decides: 'errortype', whyNotCode: 'a team rule' };
  const refused = ai(['decisionbook', 'new'], JSON.stringify({ ...head, title: 'Error class', records: [...records, asked] }));
  assert.equal(refused.code, 1);
  assert.equal(refused.err, `atlasbound: question-settled: nothing written: record 6 of 6: Q1: ${old}/errortype = a plain Error with a code `
    + '(by the person); to propose replacing it, send this record in the plan in place of the question, its "" filled: '
    + `{"t":"decision","key":"errortype","value":"","why":"","by":"ai","proposed":true,"supersedes":["${old}/errortype"]}; `
    + 'show the person the plan: their answer, after their next message, is the same record in their words without "proposed", '
    + 'and it replaces the old decision\n');
  // ONE further call: the same new with the handed record, its blanks filled, in place of the question
  const handed = JSON.parse(/(\{"t":"decision".*?\]\})/.exec(refused.err)[1]);
  const proposal = { ...handed, value: 'an AppError class', why: 'the task asks for it' };
  const made = ai(['decisionbook', 'new'], JSON.stringify({ ...head, title: 'Error class', records: [...records, proposal] }));
  assert.equal(made.code, 0, made.err);
  const id = made.out.split(' ')[0];
  assert.match(made.out, new RegExp(`^${id} not READY as small fix: 3 of 4 rows met$`, 'm'));
  assert.deepEqual(made.out.split('\n').filter((line) => /^ {2}ready-/.test(line)).map((line) => line.trim().split(':')[0]), ['ready-no-confirm'],
    'the plan waits for the person and for nothing else');
  assert.match(ai(['decisionbook', 'show', 'decision:errortype']).out, /= a plain Error with a code \(small; by the person\) active/, 'a proposal binds nothing');
  // the person answers: the same record in their words under their name without "proposed", and their yes
  const ANSWER = 'yes, use the class, the plain error is not enough any more';
  assert.equal(prompted(ANSWER).code, 0);
  const theirs = { ...handed, value: 'an AppError class', why: 'callers switch on it', by: 'developer', said: ANSWER };
  delete theirs.proposed;
  const yes = { t: 'confirm', by: 'developer', said: 'yes' };
  for (const said of [undefined, 'yes', 'use the class']) { // no words of theirs, a word on nothing, a part of a sentence with a negation
    const unsaid = ai(['decisionbook', 'add', id], JSON.stringify([{ ...theirs, said }, yes]));
    assert.match(unsaid.err, /^atlasbound: supersede-not-asked: nothing written: record 1 of 2: [^\n]*no whole sentence of the person about this decision/, said);
  }
  const done = ai(['decisionbook', 'add', id], JSON.stringify([theirs, yes]));
  assert.match(done.out, new RegExp(`^${id} READY as small fix; parked: ${old}\\. Frozen: `, 'm'), done.err);
  assert.match(ai(['decisionbook', 'show', 'decision:errortype']).out, new RegExp(`a plain Error with a code \\(small; by the person\\) superseded by ${id}/errortype`));
});
