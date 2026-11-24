// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The module matrix of the open package alone: the cli, kit, telemetry, DecisionBook and Handoff on disk and no add-on package. Through
// the real bin and the port rows setup wrote. Each row follows one chain: the module's manifest, the choice in the install record, what
// the host is wired with, a normal command of the module that stays, and the data of the module that was switched off.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, makeRepo, run, typedYes, tmp, git, fire, portRow, hookDecisionOf, hookContextOf, readSettings, protect, fileJson } = require('./support.cjs');

const FILE = 'app/x.rb';
const PLAN = [{ t: 'research', tool: 'grep', asked: 'MAX_OPTIONS', answer: 'one constant', source: `${FILE}:1` }, { t: 'item', kind: 'feature', text: 'poll options' },
  { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the limit' }, { t: 'check', id: 'AC-1', text: 'the limit is read', command: 'rake test' },
  { t: 'item', kind: 'task', text: 'read the limit', covers: ['AC-1'] }];
const KEPT = 'Money math goes through lib/amount.js, never floats';
const OPEN = makeWorld({ real: ['handoff'] });

/** A repository set up by a plain `setup`, a person's home of its own, and how a person, the AI and the host reach it. */
function matrixRepo(world = OPEN) {
  const repo = makeRepo({ [FILE]: 'class X\nend\n' });
  const home = tmp('modules-open-home-');
  const typed = (...args) => run(world.bin, [...args, '--target', repo], { env: { HOME: home }, plain: true });
  const ai = (session, ...args) => run(world.bin, [...args, '--target', repo], { env: { HOME: home, CLAUDE_CODE_SESSION_ID: session }, ai: true });
  const said = (session, event, payload = {}) => fire(repo, portRow(repo, event, payload.tool_name || ''), { session_id: session, cwd: repo,
    hook_event_name: event, ...payload }, { HOME: home });
  const edit = (file) => ({ tool_name: 'Edit', tool_input: { file_path: path.join(repo, file), old_string: 'X', new_string: 'Y' } });
  const on = () => JSON.parse(typed('modules', '--json').out).modules.filter((m) => m.state === 'on').map((m) => m.name);
  // what the host is wired with: each hook row's event, the command files, the allow rules that name a module's verbs
  const wired = () => ({ events: Object.keys(readSettings(repo).hooks ?? {}).sort(),
    commands: fs.existsSync(path.join(repo, '.claude/commands')) ? fs.readdirSync(path.join(repo, '.claude/commands')).sort() : [],
    allow: (readSettings(repo).permissions?.allow ?? []).filter((rule) => /atlasbound (handoff|decisionbook)/.test(rule)).sort() });
  assert.equal(typed('setup').code, 0);
  return { repo, home, typed, ai, said, edit, on, wired };
}
const tree = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).filter((name) => fs.statSync(path.join(dir, name)).isFile()).sort()
  .map((name) => [name, fs.readFileSync(path.join(dir, name), 'utf8')]) : []);

test('default: with no add-on package on disk a plain setup wires DecisionBook and Handoff, and update changes nothing', () => {
  assert.deepEqual(fs.readdirSync(path.join(OPEN.dir, 'node_modules', '@atlasbound')).sort(), ['cli', 'decisionbook', 'handoff', 'kit', 'telemetry']);
  const { repo, typed, on, wired } = matrixRepo();
  assert.deepEqual([on(), fileJson(repo, '.atlasbound/cli/installed.json').modules], [['handoff', 'decisionbook'], ['handoff', 'decisionbook']]);
  const first = wired();
  assert.deepEqual(first.commands, ['decide.md', 'decisionbook.md', 'handoff.md', 'resume-handoff.md']);
  assert.ok(first.allow.some((rule) => rule.includes('atlasbound handoff')) && first.allow.some((rule) => rule.includes('atlasbound decisionbook')), first.allow.join());
  const settings = fs.readFileSync(path.join(repo, '.claude/settings.local.json'), 'utf8');
  assert.equal(typed('update').code, 0);
  assert.equal(fs.readFileSync(path.join(repo, '.claude/settings.local.json'), 'utf8'), settings, 'update wires the same rows');
  assert.match(typed('doctor').out, /^ {2}module handoff: on$[\s\S]*^ {2}module decisionbook: on$/m);
  assert.match(typed('setup', '--with', 'extra').err, /^atlasbound: module-refused: no module is called extra; the modules are handoff or decisionbook /,
    'a module no package on disk brings is no module here');
});

test('modules off handoff: its rows, command and rules go, its home data stays; DecisionBook plans, gates and shows as before', () => {
  const { repo, home, typed, ai, said, edit, on, wired } = matrixRepo();
  protect(repo, ['app/**']);
  assert.equal(said('s0', 'UserPromptSubmit', { prompt: `${KEPT}.` }).code, 0); // Handoff keeps the head of a message in the home
  const kept = tree(path.join(home, '.atlasbound'));
  assert.ok(kept.some(([name]) => name.startsWith('handoff-here')), 'Handoff holds data before it is switched off');
  const before = wired();
  const off = typed('modules', 'off', 'handoff');
  assert.equal(off.code, 0, off.err);
  assert.match(off.out, /removed command \.claude\/commands\/handoff\.md/);
  assert.deepEqual([on(), fileJson(repo, '.atlasbound/cli/installed.json').modules], [['decisionbook'], ['decisionbook']]);
  const now = wired();
  assert.deepEqual([now.commands, now.allow.filter((rule) => rule.includes('atlasbound handoff'))], [['decide.md', 'decisionbook.md', 'resume-handoff.md'], []]);
  assert.doesNotMatch(JSON.stringify(readSettings(repo).hooks), /handoff\./, 'no hook row reaches a handler of Handoff');
  assert.deepEqual(tree(path.join(home, '.atlasbound')).filter(([name]) => name.startsWith('handoff-here')),
    kept.filter(([name]) => name.startsWith('handoff-here')), 'its data in the home is kept as it was');
  // a new host session, the question, the decision, the gate and the history, with Handoff off
  const start = hookContextOf(said('s1', 'SessionStart', { source: 'startup' }));
  assert.ok(start.includes('No plan on this branch') && !start.includes('Handoff note'), start);
  assert.deepEqual([hookDecisionOf(said('s1', 'PreToolUse', edit(FILE))).permissionDecision], ['deny'], 'no plan yet: the gate holds');
  const ask = { t: 'question', q: 'Q1', text: 'How many options at most?', decides: 'poll.max', whyNotCode: 'a product limit', proposal: '4', blocking: true };
  const made = ai('s1', 'decisionbook', 'new', JSON.stringify({ title: 'Poll option limit', why: 'the limit is fixed', success: 'the env sets it', kind: 'feature',
    level: 'micro', records: [...PLAN, ask] }));
  assert.equal(made.code, 0, made.err);
  const id = made.out.split(' ')[0];
  assert.equal(said('s1', 'UserPromptSubmit', { prompt: 'Four options at most. Yes, go ahead.' }).code, 0);
  const answer = { t: 'decision', key: 'poll.max', value: '4', why: 'their limit', whose: 'person', said: 'Four options at most.', answers: 'Q1',
    effect: [`file:${FILE}`] };
  const added = ai('s1', 'decisionbook', 'add', id, JSON.stringify([answer, { t: 'confirm', by: 'the person', said: 'Yes, go ahead.' }]));
  assert.equal(added.code, 0, added.err);
  assert.match(ai('s1', 'decisionbook', 'ready', id).out, new RegExp(`^${id} READY`, 'm'));
  assert.deepEqual(hookDecisionOf(said('s1', 'PreToolUse', edit(FILE))), {}, 'inside the READY plan the gate is silent');
  assert.equal(hookDecisionOf(said('s1', 'PreToolUse', edit('app/y.rb'))).permissionDecision, 'ask', 'outside it the person is asked');
  assert.match(typed('decisionbook', 'show', id, 'decisions').out, /poll\.max = 4/, 'the history holds the decision');
  assert.match(typed('decisionbook', 'inbox').out, /READY plans not closed 1/);
  // setup and update again never turn it back on; its verb answers one line; a later session hears nothing of it
  assert.deepEqual([typed('setup').code, on(), typed('update').code, on()], [0, ['decisionbook'], 0, ['decisionbook']]);
  // read by an AI session, whose own `modules on` is refused: the line says who types it
  assert.match(typed('handoff', 'show').out,
    /^atlasbound handoff show: module handoff: off \(by choice\)[^\n]*; only the person turns it back on, in a terminal of their own: atlasbound modules on handoff\n$/);
  assert.ok(!hookContextOf(said('s2', 'SessionStart', { source: 'clear' })).includes('Handoff note'));
  assert.match(typed('modules', 'off', 'decisionbook').err, /^atlasbound: module-refused: /, 'the last module stays on');
  assert.equal(typed('modules', 'on', 'handoff').code, 0);
  assert.deepEqual(wired(), before, 'on again: the host is wired as the first setup left it');
  assert.ok(hookContextOf(said('s3', 'SessionStart', { source: 'startup' })).includes(KEPT), 'and the note it kept is said again');
});

test('modules off decisionbook: its rows, commands and rules go, .decisionbook stays; Handoff writes, shows and resumes', () => {
  const { repo, typed, ai, said, edit, on, wired } = matrixRepo();
  protect(repo, ['app/**']);
  assert.equal(hookDecisionOf(said('s1', 'PreToolUse', edit(FILE))).permissionDecision, 'deny', 'DecisionBook on: its gate holds a protected file');
  const [before, records] = [wired(), tree(path.join(repo, '.decisionbook'))];
  const off = typed('modules', 'off', 'decisionbook');
  assert.equal(off.code, 0, off.err);
  assert.deepEqual([on(), fileJson(repo, '.atlasbound/cli/installed.json').modules], [['handoff'], ['handoff']]);
  const now = wired();
  assert.deepEqual([now.commands, now.allow.filter((rule) => rule.includes('atlasbound decisionbook'))], [['handoff.md', 'resume-handoff.md'], []]);
  assert.doesNotMatch(JSON.stringify(readSettings(repo).hooks), /decisionbook\./, 'no hook row reaches a handler of DecisionBook');
  assert.deepEqual(tree(path.join(repo, '.decisionbook')), records, 'the policy and the plans are kept as they were');
  assert.deepEqual(hookDecisionOf(said('s1', 'PreToolUse', edit(FILE))), {}, 'its handler does not run: the plan gate says nothing');
  assert.match(typed('decisionbook', 'inbox').out, /^atlasbound decisionbook inbox: module decisionbook: off \(by choice\)[^\n]*; only the person turns it back on, in a terminal of their own: atlasbound modules on decisionbook\n$/);
  assert.deepEqual(tree(path.join(repo, '.decisionbook')), records, 'and its verb wrote nothing');
  // Handoff's write, show and resume, and a new host session, with DecisionBook off
  const start = hookContextOf(said('s1', 'SessionStart', { source: 'startup' }));
  assert.ok(!start.includes('Plan before code') && !start.includes('No plan on this branch'), start);
  assert.equal(said('s1', 'UserPromptSubmit', { prompt: `${KEPT}.` }).code, 0);
  const keep = ai('s1', 'handoff', 'keep', '--session', 's1', JSON.stringify({ now: 'the export route', next: ['wire the button'], kept: [`${KEPT} [m1]`] }));
  assert.match(keep.out, /^Kept\. /, keep.err);
  assert.match(typed('handoff', 'show').out, new RegExp(`k1 [^\\n]*${KEPT}`));
  assert.ok(hookContextOf(said('s1', 'UserPromptSubmit', { prompt: '/resume-handoff' })).includes(KEPT), 'the note is given on /resume-handoff');
  assert.ok(hookContextOf(said('s2', 'SessionStart', { source: 'startup' })).includes(KEPT), 'and said to the next session');
  assert.deepEqual([typed('setup').code, on(), typed('update').code, on()], [0, ['handoff'], 0, ['handoff']], 'setup and update keep the choice');
  assert.equal(typed('modules', 'on', 'decisionbook').code, 0);
  assert.deepEqual(wired(), before, 'on again: the host is wired as the first setup left it');
  assert.equal(hookDecisionOf(said('s3', 'PreToolUse', edit(FILE))).permissionDecision, 'deny', 'and the policy it kept guards the file again');
});

test('a module the person switched off is turned on again by the person only: an AI\'s setup --with and modules on are refused', () => {
  const { repo, home, typed, ai, on, wired } = matrixRepo();
  assert.equal(typed('modules', 'off', 'handoff').code, 0);
  const off = wired();
  for (const sent of [['setup', '--with', 'handoff'], ['setup', '--only', 'handoff,decisionbook'], ['modules', 'on', 'handoff']]) {
    const res = ai('s1', ...sent);
    assert.deepEqual([res.code, res.err.startsWith('atlasbound: person-only: '), on(), wired()], [1, true, ['decisionbook'], off], `${sent.join(' ')}: ${res.err}`);
  }
  assert.match(ai('s1', 'setup', '--with', 'handoff').err, /^atlasbound: person-only: setup turns handoff on again \(found: the AI, [^)]+\); the person types: /);
  const plain = (verb) => run(OPEN.bin, [verb, '--target', repo], { env: { HOME: home, CLAUDE_CODE_SESSION_ID: 's1' }, ai: true, plain: true }).code;
  assert.deepEqual([plain('setup'), plain('update'), on()], [0, 0, ['decisionbook']], 'a plain setup and update are anyone\'s, and keep it off');
  const helps = (...words) => run(OPEN.bin, [...words, '--help']).out.replace(/\n +/g, ' ');
  assert.ok(helps('modules', 'on').includes('to use a module here that is off: only you turn one on'), helps('modules', 'on'));
  assert.ok(helps('setup').includes('turning on again one that is off here'), helps('setup'));
  // the person names it at their own terminal: on again, with no phrase (nothing is taken away)
  const named = run(OPEN.bin, ['setup', '--with', 'handoff', '--target', repo], { env: { ...typedYes().env, HOME: home }, plain: true });
  assert.deepEqual([named.code, on()], [0, ['handoff', 'decisionbook']], named.err);
});

test('not shipped is not switched off: with no Handoff package on disk it is not installed and cannot be turned on', () => {
  const alone = makeWorld();
  assert.deepEqual(fs.readdirSync(path.join(alone.dir, 'node_modules', '@atlasbound')).sort(), ['cli', 'decisionbook', 'kit', 'telemetry']);
  const { repo, typed, said, edit, on } = matrixRepo(alone);
  const states = () => Object.fromEntries(JSON.parse(typed('modules', '--json').out).modules.map((m) => [m.name, m.state]));
  assert.deepEqual([states(), on()], [{ handoff: 'not-installed', decisionbook: 'on' }, ['decisionbook']]);
  const turned = typed('modules', 'on', 'handoff');
  assert.deepEqual([turned.code, /^atlasbound: module-refused: handoff is not installed/.test(turned.err), states().handoff], [1, true, 'not-installed'], turned.err);
  assert.match(typed('handoff', 'show').err, /^atlasbound: package-not-installed: handoff/, 'its verb says the package is not here, not that it is off');
  assert.match(typed('doctor').out, /^ {2}module handoff: not installed/m);
  protect(repo, ['app/**']);
  assert.equal(hookDecisionOf(said('s1', 'PreToolUse', edit(FILE))).permissionDecision, 'deny', 'the gate works with the one module');
  assert.deepEqual([typed('update').code, on()], [0, ['decisionbook']]);
  assert.equal(typed('uninstall').code, 0);
});

test('the install record is read as its own shape: another schema word or a module list that is none is refused', () => {
  const { repo, typed, said, edit, on } = matrixRepo();
  const file = path.join(repo, '.atlasbound', 'cli', 'installed.json');
  const record = fileJson(repo, '.atlasbound/cli/installed.json');
  const put = (over) => fs.writeFileSync(file, JSON.stringify({ ...record, ...over }));
  protect(repo, ['app/**']);
  for (const over of [{ schema: 'cli-install/9' }, { modules: 'decisionbook' }, { modules: {} }, { modules: [] }]) { // []: no module is no choice
    put(over);
    const refused = typed('modules');
    assert.deepEqual([refused.code, /^atlasbound: host-invalid: \.atlasbound\/cli\/installed\.json: /.test(refused.err)], [1, true], JSON.stringify(over) + refused.err);
    assert.equal(hookDecisionOf(said('s1', 'PreToolUse', edit(FILE))).permissionDecision, 'ask', `${JSON.stringify(over)}: the hook asks, as for a record cut short`);
  }
  put({ schema: 'cli-install/1', modules: undefined }); // a record from before modules: every module was wired
  assert.deepEqual(on(), ['handoff', 'decisionbook']);
  put({ modules: ['decisionbook', 'gone-with-its-package'] }); // a name no package here brings is no module here
  assert.deepEqual(on(), ['decisionbook']);
});

test('an install record git holds is another machine\'s: doctor says so, as every wiring verb refuses it', () => {
  const { repo, typed } = matrixRepo();
  assert.match(typed('doctor').out, /^doctor: ok/m);
  git(repo, 'add', '-f', '.atlasbound/cli/installed.json');
  git(repo, 'commit', '-qm', 'the record, committed by mistake');
  const doctor = typed('doctor');
  assert.equal(doctor.code, 1, doctor.out);
  assert.match(doctor.out, /^ {2}install record refused: state-tracked: \.atlasbound\/cli\/installed\.json: git tracks this file/m);
  assert.match(typed('update').err, /^atlasbound: state-tracked: \.atlasbound\/cli\/installed\.json/);
});
