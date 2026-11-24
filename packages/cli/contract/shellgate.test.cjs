// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Through the real bin: setup's own port rows; `atlasbound hook PreToolUse` with a Bash command and `atlasbound hook Stop`, JSON on stdin,
// in a temporary git repository with app/** protected. Three writes (a heredoc fed to cat, python3 fed inline code, sed -i) meet the
// DecisionBook gate; a read does not; Stop blocks once on a protected file changed with no plan and lets a covering READY plan through.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, makeRepo, run, tmp, git, setupRepo, fire, portRow, replyJson, hookDecisionOf, protect, writeFiles } = require('./support.cjs');
// a Stop block also tells the person it is a check, not a crash (the host shows it as a hook error)
const HELD = 'atlasbound: a deliberate check, not a crash: the session was held from finishing and the AI was told what to do first';

const WORLD = makeWorld();
const FILE = 'app/x.rb';
const SHELL_WRITES = (repo) => [[`cat > ${FILE} <<'EOF'\nclass X\nEOF`, repo], [`cat > ../${FILE} <<'EOF'\nclass X\nEOF`, path.join(repo, 'lib')],
  ["python3 - <<'EOF'\nopen('app/x.rb', 'w').write('x')\nEOF", repo], [`sed -i 's/X/Y/' ${FILE}`, repo], [`grep "X$" lib/a.rb > ${FILE}`, repo]];
/** A READY plan of `branch` planning FILE, as a team commits it (made on another machine: this machine holds no yes for it). */
const readyPlan = (id, branch, at = new Date().toISOString()) => [{ schema: 'decisionbook-record/1', t: 'plan', id, title: 'Poll options', why: 'the validator',
  branch },
  { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the validator' }, { t: 'ready', scope: [FILE], level: 'normal' }].map((r) => `${JSON.stringify({ at,
    ...r })}\n`).join('');

test('through the real bin a shell write of a protected file is denied with no plan and allowed inside one; Stop blocks once', () => {
  const { repo } = setupRepo(WORLD, { [FILE]: 'class X\nend\n' });
  protect(repo, ['app/**']);
  const env = { HOME: tmp('shellgate-home-') };
  const said = (event, payload) => fire(repo, portRow(repo, event, payload.tool_name || ''), { session_id: 's1', cwd: repo, hook_event_name: event,
    ...payload }, env);
  const bash = (command, cwd = repo) => hookDecisionOf(said('PreToolUse', { tool_name: 'Bash', tool_input: { command }, cwd }));
  assert.equal(said('SessionStart', { source: 'startup' }).code, 0);
  for (const [command, cwd] of SHELL_WRITES(repo)) {
    const decision = bash(command, cwd);
    assert.equal(decision.permissionDecision, 'deny', command);
    assert.match(decision.permissionDecisionReason,
      /^DecisionBook gate: plan-none: app\/x\.rb: [^\n]*\nthis shell command writes app\/x\.rb; once the branch's READY plan covers the file, the same command passes$/, command);
  }
  for (const command of ['echo hi > /tmp/x', `cat ${FILE}`]) assert.deepEqual(bash(command), {}, `${command}: a read is never asked`);
  fs.writeFileSync(path.join(repo, FILE), 'class X\n  # written around the gate\nend\n');
  const stop = (over = {}) => replyJson(said('Stop', { stop_hook_active: false, ...over }));
  assert.deepEqual(stop(), { systemMessage: HELD, decision: 'block',
    reason: 'DecisionBook: stop-unrecorded: app/x.rb: protected files changed in this session and no READY or closed plan of this branch covers them: ' +
      'record this change in a plan (why, the decisions, the files) before you finish' });
  assert.deepEqual(stop({ stop_hook_active: true }), {}, 'never twice in a row');
  const id = 'PLAN-20261105-poll-options';
  writeFiles(repo, { [`.decisionbook/${id}.jsonl`]: readyPlan(id, git(repo, 'symbolic-ref', '--short', 'HEAD').trim()) });
  assert.deepEqual(stop().reason, `DecisionBook: stop-unclosed: ${id}: this session's work under this READY plan is in the work tree and no close records `
    + 'it as it is now. Is the work finished? Run atlasbound decisionbook close with this plan\'s id (where less or other than its title shipped, add --subject "<what shipped, in one line>"), '
    + 'then give the person the one commit it prints, as printed. '
    + 'Is it not finished? Tell the person what is left. This is said once for the work tree as it is', 'a READY plan of this branch covers the change: the turn is held for its close');
  assert.deepEqual(stop(), {}, 'once for the tree as it is');
  const edit = { tool_name: 'Edit', tool_use_id: 'tu1', tool_input: { file_path: path.join(repo, FILE), old_string: 'X', new_string: 'Y' } };
  assert.equal(hookDecisionOf(said('PreToolUse', edit)).permissionDecision, 'ask', 'a READY plan that came with the repository asks the person once');
  assert.equal(said('PostToolUse', { ...edit, tool_response: { filePath: path.join(repo, FILE) } }).code, 0, 'the person said yes');
  for (const [command, cwd] of SHELL_WRITES(repo)) assert.deepEqual(bash(command, cwd), {}, `${command}: inside the READY plan`);
  // READY is the freeze: a shell write of another protected file joins the plan, said in one line, once; a whole folder still asks
  const planLines = () => fs.readFileSync(path.join(repo, '.decisionbook', `${id}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const folder = bash('rm -rf app');
  assert.deepEqual([folder.permissionDecision, /^DecisionBook gate: shell-unplaced: app\/: /.test(folder.permissionDecisionReason), planLines().length],
    ['ask', true, 3], 'a folder is asked and adds nothing to the plan');
  const outside = bash("echo 'class Y' > app/y.rb");
  assert.deepEqual([outside.permissionDecision, /^DecisionBook gate: plan-outside: app\/y\.rb: [^\n]*open a new plan for this file/.test(outside.permissionDecisionReason),
    planLines().length], ['ask', true, 3], 'a file outside the frozen plan is asked, and nothing joins it');
});

test('[I-71] the product\'s own files are sealed at the port: its store refused, its host entries and records asked', () => {
  const { repo } = setupRepo(WORLD, { [FILE]: 'class X\nend\n' });
  protect(repo, ['app/**']);
  const home = tmp('shellgate-home-');
  const said = (payload) => hookDecisionOf(fire(repo, portRow(repo, 'PreToolUse', payload.tool_name), { session_id: 's1', cwd: repo,
    hook_event_name: 'PreToolUse', permission_mode: 'default', ...payload }, { HOME: home }));
  const ruled = (payload) => {
    const { permissionDecision: verdict, permissionDecisionReason: why = '' } = said(payload);
    return [verdict, (/(?:^|; )atlasbound: own-file: /.test(why) && 'own') || (/^STORE_SEALED: [^\n]* — /.test(why) && 'sealed') || why];
  };
  const write = (file, content = '{}') => ({ tool_name: 'Write', tool_input: { file_path: path.isAbsolute(file) ? file : path.join(repo, file), content } });
  const edit = (file, old, now) => ({ tool_name: 'Edit', tool_input: { file_path: path.join(repo, file), old_string: old, new_string: now } });
  const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
  const settings = fs.readFileSync(path.join(repo, '.claude/settings.local.json'), 'utf8');
  const ignore = fs.readFileSync(path.join(repo, '.gitignore'), 'utf8');
  const OWN = ['ask', 'own'];
  const SEALED = ['deny', 'sealed'];
  for (const [payload, want] of [[write('.claude/settings.local.json'), OWN], [write('.claude/settings.local.json', settings.replace(/"allow": \[/, '"allow": ["Bash(rm:*)", ')), OWN],
    [edit('.gitignore', '.claude/settings.local.json\n', ''), OWN], [write('.decisionbook/fake.jsonl', '{"t":"confirm"}\n'), OWN],
    [edit('.decisionbook/config.json', '"app/**"', '"app/**","lib/**"'), OWN], [bash('echo x > .decisionbook/fake.jsonl'), OWN],
    [bash("echo '{}' > .claude/settings.local.json"), OWN], [bash('echo x >> .gitignore'), OWN], [bash('rm -rf .claude'), OWN],
    [bash('cd .decisionbook && rm config.json'), OWN], [write('.atlasbound/cli/installed.json'), SEALED],
    [write(path.join(home, '.atlasbound', 'decisionbook-here', 'abcd', 'trust.json')), SEALED]]) {
    assert.deepEqual(ruled(payload), want, JSON.stringify(payload).slice(0, 160));
  }
  // what can switch the gate off or rewrite what the AI is told: the host's settings files here and in the home, a command file setup placed
  const [command] = fs.readdirSync(path.join(repo, '.claude/commands'));
  const off = '{"disableAllHooks": true}';
  const gateOff = [['Write', write('.claude/settings.json', off)], ['Edit', edit('.claude/settings.local.json', '{', '{"disableAllHooks": true,')],
    ['Write, home', write(path.join(home, '.claude', 'settings.json'), off)], ['Bash, home', bash(`echo '${off}' > ~/.claude/settings.local.json`)],
    ['PowerShell', { tool_name: 'PowerShell', tool_input: { command: `Set-Content -Path .claude\\settings.json -Value '${off}'` } }],
    ['MultiEdit, command', { tool_name: 'MultiEdit', tool_input: { file_path: path.join(repo, '.claude/commands', command), edits: [{ old_string: 'a', new_string: 'b' }] } }]];
  assert.deepEqual(gateOff.map(([name, payload]) => [name, ...ruled(payload)]), gateOff.map(([name]) => [name, ...OWN]));
  assert.match(said(write('.decisionbook/x.jsonl')).permissionDecisionReason, /^atlasbound: own-file: \.decisionbook\/x\.jsonl: /);
  const free = [write('.claude/settings.local.json', JSON.stringify({ ...JSON.parse(settings), env: { MINE: '1' } }, null, 2)),
    edit('.gitignore', ignore.split('\n')[0], `node_modules\n${ignore.split('\n')[0]}`), write('lib/new.cjs', 'x'), write('.atlasbound/doctor-probe', ''),
    bash('cat .decisionbook/config.json .gitignore'), bash('git log --oneline -3 > /tmp/log')];
  for (const payload of free) assert.deepEqual(said(payload), {}, JSON.stringify(payload).slice(0, 160));
  const unasked = hookDecisionOf(fire(repo, portRow(repo, 'PreToolUse', 'Write'), { session_id: 's1', cwd: repo, hook_event_name: 'PreToolUse',
    permission_mode: 'bypassPermissions', ...write('.decisionbook/x.jsonl') }, { HOME: home }));
  assert.equal(unasked.permissionDecision, 'deny', 'where no one is asked, the ask is a refusal');
});

test('with DecisionBook switched off the port still seals the store, here and in the home, and the records DecisionBook keeps', () => {
  const world = makeWorld({ real: ['handoff'] });
  const record = 'printf x > .atlasbound/cli/installed.json';
  const repo = makeRepo({ [FILE]: 'class X\nend\n', 'w.sh': `${record}\n`, 'package.json': JSON.stringify({ scripts: { w: record } }) });
  const home = tmp('shellgate-home-');
  const typed = (...args) => run(world.bin, [...args, '--target', repo], { env: { HOME: home } });
  assert.equal(typed('setup').code, 0);
  protect(repo, ['app/**']);
  const ruled = (payload) => {
    const { permissionDecision: verdict, permissionDecisionReason: why = '' } = hookDecisionOf(fire(repo, portRow(repo, 'PreToolUse', payload.tool_name),
      { session_id: 's1', cwd: repo, hook_event_name: 'PreToolUse', permission_mode: 'default', ...payload }, { HOME: home }));
    return [verdict, (/(?:^|; )atlasbound: own-file: /.test(why) && 'own') || (/^STORE_SEALED: [^\n]* — /.test(why) && 'sealed') || why.split(':')[1]?.trim()];
  };
  const write = (file) => ({ tool_name: 'Write', tool_input: { file_path: path.isAbsolute(file) ? file : path.join(repo, file), content: '{}' } });
  const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
  const [SEALED, OWN, FREE] = [['deny', 'sealed'], ['ask', 'own'], [undefined, undefined]];
  // a script the command runs is read too: what `sh w.sh` or `npm run w` writes is judged as if it were typed
  const kept = [[bash(record), SEALED], [bash('cd .atlasbound/cli && rm installed.json'), SEALED],
    [bash('sh w.sh'), SEALED], [bash('bash ./w.sh'), SEALED], [bash('npm run w'), SEALED],
    [bash('printf x > ~/.atlasbound/handoff-here/forged.json'), SEALED], [bash(`printf x > ${home}/.atlasbound/handoff-here/forged.json`), SEALED],
    [write('.atlasbound/cli/installed.json'), SEALED], [write(path.join(home, '.atlasbound', 'handoff-here', 'forged.json')), SEALED],
    [bash('echo "{}" > .decisionbook/config.json'), OWN], [write('.decisionbook/config.json'), OWN], [bash('rm -rf .decisionbook'), OWN],
    [bash('cat .atlasbound/cli/installed.json .decisionbook/config.json'), FREE], [write('lib/new.cjs'), FREE]];
  const answers = () => kept.map(([payload]) => ruled(payload));
  assert.deepEqual(ruled(bash(`echo x > ${FILE}`)), ['deny', 'plan-none'], 'DecisionBook on: its gate judges a protected file');
  assert.deepEqual(answers(), kept.map(([, want]) => want), 'both modules on');
  assert.equal(typed('modules', 'off', 'decisionbook').code, 0);
  assert.deepEqual(ruled(bash(`echo x > ${FILE}`)), FREE, 'DecisionBook off: its gate does not run');
  assert.deepEqual(answers(), kept.map(([, want]) => want), 'DecisionBook off: the seal is the port\'s, so nothing of it left with the module');
  assert.equal(typed('modules', 'on', 'decisionbook').code, 0);
  assert.deepEqual(ruled(bash(`echo x > ${FILE}`)), ['deny', 'plan-none'], 'on again: the policy it kept is read as the person left it');
});
