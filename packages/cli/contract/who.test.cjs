// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// through the real bin: kit's one answer to "who is acting" as `debug who` says it, and the trace row the root writes for it. A person is
// the test's terminal (tty-preload, no AI host above); the AI is a piped stdin, a session mark, or an AI host above the terminal.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld, makeRepo, setupRepo, typedYes, run, git, tmp, traceRows, snapshot, fire, portRow, hookDecisionOf } = require('./support.cjs');

const TTY = typedYes().env;
const WORLD = makeWorld();
const OPEN = makeWorld({ real: ['handoff'] }); // every open package: the rows they declare a person's
const AI_CALLERS = [[{}, 'no-terminal'], [{ ...TTY, CLAUDECODE: '1' }, 'ai-session-mark'],
  [{ ...TTY, TTY_PRELOAD_ABOVE: 'python3 -c pty.fork|claude --permission-mode auto' }, 'ai-host-above']];
const SHORT = 'only a person may run this, at a plain terminal of their own: ask them to type the command above; nothing was done';
// [the row as declared, the words sent, what a person's run answers: its exit code and the start of its out or err]
const PERSON_ROWS = [
  ['modules off', ['modules', 'off', 'handoff'], 0, /^atlasbound modules off handoff: /],
  ['uninstall', ['uninstall'], 0, /^atlasbound uninstall: /],
  ['telemetry on', ['telemetry', 'on'], 0, /^telemetry: ON /],
  ['protect', ['protect', '--none'], 0, /^protected paths: none/],
  ['handoff drop', ['handoff', 'drop', '1'], 1, /^type: drop kept line 1\n> atlasbound: drop-unknown: k1/], // past its phrase, its package ran
];

const REFUSED = 'from an AI is refused before its package runs, naming the command the person types; a person runs it';
const refusal = (row, why, sent) => `atlasbound: person-only: ${row} (found: the AI, ${why}); the person types: atlasbound ${sent.join(' ')}`;

for (const [row, args, code, said] of PERSON_ROWS) {
  test(`${args.slice(0, 2).join(' ')} ${REFUSED}`, () => {
    const { repo } = setupRepo(OPEN);
    const sent = [...args, '--target', repo];
    const before = snapshot(repo, { trace: false });
    for (const [env, why] of AI_CALLERS) {
      const refused = run(OPEN.bin, sent, { env, ai: true, input: 'yes\n' });
      assert.deepEqual([refused.code, refused.out], [1, ''], why);
      assert.equal(refused.err, `${refusal(row, why, sent)} (${SHORT})\n`);
    }
    assert.deepEqual(snapshot(repo, { trace: false }), before, 'every file of the repository as it was');
    const refusals = traceRows(repo).filter((one) => one.err && one.err.code === 'person-only');
    assert.deepEqual(refusals.map((one) => one.step), ['cli.verb', 'cli.verb', 'cli.verb'], 'each refusal is a coded trace row');
    const typed = run(OPEN.bin, sent, { input: 'yes\n', env: { ATLASBOUND_TELEMETRY: '' } }); // the worlds' telemetry switch lifted: `on` answers ON
    assert.equal(typed.code, code, typed.err);
    assert.match(code ? typed.err : typed.out, said);
  });
}

test('a wiring that takes a module out is a person\'s, and so is turning one on again; the first setup is anyone\'s', () => {
  const { repo } = setupRepo(OPEN);
  const narrowed = run(OPEN.bin, ['setup', '--only', 'decisionbook', '--target', repo]);
  assert.equal(narrowed.code, 1);
  assert.ok(narrowed.err.startsWith(refusal('setup takes handoff out', 'no-terminal', ['setup', '--only', 'decisionbook'])), narrowed.err);
  assert.match(run(OPEN.bin, ['modules', '--target', repo]).out, /^ {2}handoff +on /m, 'refused: both modules still on');
  const wrapped = run(OPEN.bin, ['setup', '--only', 'decisionbook', '--target', repo], { env: { ...TTY, TTY_PRELOAD_ABOVE: 'SCREEN -dmS s' } });
  assert.match(wrapped.err, /^atlasbound: person-wrapped: setup takes handoff out \(found: screen at this terminal\); the person types: /);
  const unsaid = run(OPEN.bin, ['setup', '--only', 'decisionbook', '--target', repo], { env: TTY, input: 'yes\n3\n' });
  assert.equal(unsaid.err, 'type: turn off handoff\n> atlasbound: phrase-not-typed (the phrase was not typed as shown, so nothing was done)\n');
  assert.match(run(OPEN.bin, ['modules', '--target', repo]).out, /^ {2}handoff +on /m, 'no phrase: both modules still on');
  const typed = run(OPEN.bin, ['setup', '--only', 'decisionbook', '--target', repo], { env: TTY, input: 'turn off handoff\n3\n' });
  assert.equal(typed.code, 0, 'the person narrows it, past the phrase that names what goes');
  const again = run(OPEN.bin, ['modules', 'on', 'handoff', '--target', repo], { ai: true });
  assert.ok(again.err.startsWith(refusal('modules on', 'no-terminal', ['modules', 'on', 'handoff'])), again.err);
  assert.equal(run(OPEN.bin, ['modules', 'on', 'handoff', '--target', repo]).code, 0, 'the person turns it on again, with no phrase: nothing is taken away');
});

// [the words sent, the phrase the terminal asks for]: the acts that take a protection away
const GRAVE = [[['modules', 'off', 'handoff'], 'turn off handoff'], [['uninstall'], 'uninstall'], [['uninstall', '--purge'], 'uninstall purge'],
  [['protect', '--none'], 'protect none'], [['handoff', 'drop', '1'], 'drop kept line 1']];
// what can type for a person, as the process listing shows it: a program of kit's list above the terminal (an ancestor's command line)
const TYPERS = [[{ TTY_PRELOAD_ABOVE: 'sh -c x|tmux new-session -d x' }, 'tmux'], [{ TTY_PRELOAD_ABOVE: 'SCREEN -dmS s' }, 'screen'],
  [{ TTY_PRELOAD_ABOVE: '/usr/bin/script -q /dev/null' }, 'script'], [{ TTY_PRELOAD_ABOVE: 'expect -c spawn' }, 'expect'],
  [{ TTY_PRELOAD_ABOVE: 'osascript -e x' }, 'osascript']];
// a terminal with no shell a person types into: opened for the command alone (it leads its own session), or for a command string or a script
const NO_SHELL = [{ TTY_PRELOAD_LEADS: '1', TTY_PRELOAD_SHELL: 'interpreter pty.py' }, { TTY_PRELOAD_SHELL: 'sh -c x' }, { TTY_PRELOAD_SHELL: 'bash /tmp/run.sh' }];

test('a terminal with no shell a person types into is no person\'s, for a verb that takes a protection away and any other', () => {
  const { repo } = setupRepo(OPEN);
  const before = snapshot(repo, { trace: false });
  for (const env of NO_SHELL) {
    for (const args of [['modules', 'off', 'handoff'], ['telemetry', 'on'], ['handoff', 'drop', '1']]) {
      const res = run(OPEN.bin, [...args, '--target', repo], { env: { ...TTY, ...env }, input: 'turn off handoff\n' });
      assert.ok(res.err.startsWith(`atlasbound: person-only: ${args.slice(0, 2).join(' ')} (found: the AI, no-typing-shell); the person types: `), res.err);
    }
  }
  assert.deepEqual(snapshot(repo, { trace: false }), before, 'every file of the repository as it was');
});

test('an act that takes a protection away waits for its typed phrase at a plain terminal; refused where a program can type', () => {
  const { repo } = setupRepo(OPEN, { 'src/a.js': 'x\n' });
  assert.equal(run(OPEN.bin, ['protect', '--source', '--target', repo]).code, 0);
  const before = snapshot(repo, { trace: false });
  const under = (env, args, input) => run(OPEN.bin, [...args, '--target', repo], { env: { ...TTY, ...env }, input });
  for (const [env, found] of TYPERS) {
    const wrapped = under(env, GRAVE[0][0], `${GRAVE[0][1]}\n`);
    assert.ok(wrapped.err.startsWith(`atlasbound: person-wrapped: modules off (found: ${found} at this terminal); the person types: `), wrapped.err);
  }
  for (const [args, phrase] of GRAVE) {
    assert.match(under(TYPERS[0][0], args, `${phrase}\n`).err, /^atlasbound: person-wrapped: [a-z ]+ \(found: tmux at this terminal\); the person types: /);
    const unsaid = run(OPEN.bin, [...args, '--target', repo], { env: TTY, input: 'y\n' });
    assert.deepEqual([unsaid.code, unsaid.err.includes(`type: ${phrase}\n> atlasbound: `)], [1, true], unsaid.err);
  }
  assert.deepEqual(snapshot(repo, { trace: false }), before, 'every file of the repository as it was');
  assert.ok(under(TYPERS[0][0], ['telemetry', 'on'], 'turn on telemetry\n').err.startsWith('atlasbound: person-wrapped: telemetry on (found: tmux'),
    'an act that sends something off this machine is grave too');
  const { acts, grave } = JSON.parse(run(OPEN.bin, ['debug', 'who', '--json', '--target', repo], { env: TTY }).out);
  assert.deepEqual(grave.map((row) => row.phrase), ['turn off', 'uninstall', 'turn on telemetry', 'drop kept line', 'protect'], 'the phrases, for whoever types one');
  assert.deepEqual([acts.length, acts[0].verb, acts[0].ended, acts[0].who, acts[0].above], [5, 'telemetry on: tmux at this terminal', 'person-wrapped', 'terminal',
    '-zsh < sh < tmux'],
    'the last runs of a person\'s verbs: what, how it ended, who the product took the sender for and what stood above');
  assert.deepEqual(acts.slice(1, 3).map((act) => act.ended), ['phrase-not-typed', 'person-wrapped']);
});

// a verb behind a wrapper, and the wrappers kit's list names: none runs its verb as "a person"
const WRAPPED = [
  ['modules off', 'atlasbound modules off decisionbook'],
  ['modules off', 'tmux -L x new-session -d "env -u CLAUDECODE -u AI_AGENT atlasbound modules off decisionbook"'],
  ['modules on', 'atlasbound modules on handoff'],
  ['protect --none', 'tmux new-session -d -s p "env -u CLAUDECODE atlasbound protect --none"; sleep 2; tmux send-keys -t p yes Enter'],
  ['uninstall', 'nohup sh -c "sleep 4; atlasbound uninstall --purge" >/dev/null 2>&1 &'],
  ['handoff drop', 'screen -dmS s sh -c \'atlasbound handoff drop 1\''],
  ['telemetry on', 'script -q /dev/null atlasbound telemetry on'],
  ['modules off', 'osascript -e \'tell application "Terminal" to do script "atlasbound modules off handoff"\''],
  ['modules off', 'launchctl submit -l x -- /bin/sh -c "atlasbound modules off handoff"'],
  ['modules off', 'python3 -c "import pty; pty.spawn([\'atlasbound\', \'modules\', \'off\', \'handoff\'])"'],
  ['handoff drop', 'cat > /tmp/x.sh <<EOF\natlasbound handoff drop 1\nEOF\nbash /tmp/x.sh'],
];
const FREE = ['atlasbound status', 'atlasbound modules', 'atlasbound protect --source', 'npm uninstall left-pad', 'git status'];

test('an AI\'s shell command that names a verb only a person runs is denied at the hook, bare or wrapped; any other passes', () => {
  const { repo } = setupRepo(OPEN);
  const narrowed = run(OPEN.bin, ['setup', '--only', 'handoff', '--target', repo], { env: TTY, input: 'turn off decisionbook\n' });
  assert.equal(narrowed.code, 0, 'DecisionBook off: no package gates a shell');
  const bash = (command) => hookDecisionOf(fire(repo, portRow(repo, 'PreToolUse', 'Bash'),
    { session_id: 's1', cwd: repo, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }));
  for (const [verb, command] of WRAPPED) {
    const said = bash(command);
    assert.equal(said.permissionDecision, 'deny', command);
    assert.ok(said.permissionDecisionReason.startsWith(`atlasbound: person-only: \`atlasbound ${verb}\`: a verb only a person runs, so a shell `), command);
  }
  for (const command of FREE) assert.deepEqual(bash(command), {}, command);
  const denied = traceRows(repo).filter((row) => row.err && row.err.code === 'person-only-shell');
  assert.deepEqual([denied.length, denied[0].step, denied[0].err.msg], [WRAPPED.length, 'cli.verb', 'modules off'], 'each denial is a coded trace row');
});

test('debug who says who acts and why: no terminal, a session mark and an AI host above are the AI, a bare terminal a person', () => {
  const { repo, out } = setupRepo(WORLD);
  assert.match(out, /^ {2}you are Ada here \(kept on this machine since 2026-11-02, from git\): what you decide is recorded under this name; /m,
    'setup says who the person is here');
  const who = (env) => {
    const res = run(WORLD.bin, ['debug', 'who', '--json', '--target', repo], { env });
    assert.equal(res.code, 0, res.err);
    return JSON.parse(res.out);
  };
  const said = (env) => [who(env).who, who(env).why];
  assert.deepEqual(said({}), ['ai', 'no-terminal']);
  assert.deepEqual(said({ ...TTY, CLAUDECODE: '1' }), ['ai', 'ai-session-mark']);
  assert.deepEqual(said({ ...TTY, TTY_PRELOAD_ABOVE: 'python3 -c pty.fork|claude --permission-mode auto' }), ['ai', 'ai-host-above']);
  assert.deepEqual(said(TTY), ['terminal', 'own-terminal']);
  const inSession = who({ CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'never-seen' });
  assert.deepEqual([inSession.who, inSession.why, inSession.seat, inSession.session], ['ai', 'no-prompt-row', 'ai-session-mark', 'never-seen'],
    'a session whose rows hold no prompt of a person: could not tell is the AI');
  const text = run(WORLD.bin, ['debug', 'who', '--target', repo], { env: TTY }).out;
  assert.match(text, /^ {2}who +terminal +a person acts: a terminal with no AI session mark and no AI host above it\n {2}why +own-terminal\n/);
  assert.match(text, /^ {2}person +Ada +the person working here, as kept on this machine \(atlasbound whoami\): every record of theirs carries this name$/m);
});

test('who the person is here is kept at setup from git\'s name, shown by whoami, and changed only by them at their own terminal', () => {
  const repo = makeRepo();
  const home = tmp('cli-home-'); // a machine where no setup ran yet for this repository
  const at = (args, more = {}) => run(WORLD.bin, [...args, '--target', repo], { ...more, env: { HOME: home, ...more.env } });
  assert.equal(JSON.parse(at(['debug', 'who', '--json']).out).person, null, 'before setup no name is kept');
  assert.match(at(['doctor']).out, /^ {2}person-unnamed: no name is kept for the person on this machine, /m, 'and doctor says so');
  assert.match(at(['setup']).out, /^ {2}you are Ada here \(kept on this machine since \d{4}-\d\d-\d\d, as git named you; no one was asked\): /m);
  git(repo, 'config', 'user.name', 'Emma (BA)'); // what an AI's shell could do after setup
  const shown = at(['whoami']).out;
  assert.match(shown, /^you are Ada here \(kept on this machine since [\d-]+, from git\): .*\ngit names Emma \(BA\) in this clone now; the kept name stands /);
  assert.match(at(['setup']).out, /^ {2}you are Ada here /m, 'a second setup keeps the name that was kept');
  for (const [env, why] of AI_CALLERS) {
    const refused = at(['whoami', '--name', 'Emma (BA)'], { env, ai: true });
    assert.match(refused.err, new RegExp(`^atlasbound: person-only: whoami \\(found: the AI, ${why}\\); the person types: atlasbound whoami --name 'Emma \\(BA\\)' `), why);
  }
  assert.match(at(['whoami', '--name', 'ai'], { env: TTY }).err, /^atlasbound: person-name-ai/, 'no person is kept under a name the AI signs with');
  assert.match(at(['whoami', '--name', 'Ada Park'], { env: TTY }).out, /^you are Ada Park here \(kept on this machine since [\d-]+, from you\): /);
  assert.equal(JSON.parse(at(['debug', 'who', '--json']).out).person, 'Ada Park');
});

test('setup at the person\'s own terminal asks them to keep git\'s name or type another, before any other question', () => {
  const [kept, typed] = [makeRepo(), makeRepo()];
  const first = (repo, input) => run(WORLD.bin, ['setup', '--target', repo], { env: { ...TTY, HOME: tmp('cli-home-') }, input });
  const asked = first(kept, '\n3\n');
  assert.match(asked.err, /^Your decisions here are recorded under your name\. git names you "Ada": press Enter to keep it, or type the name to record\n> /);
  assert.match(asked.out, /^ {2}you are Ada here \(kept on this machine since [\d-]+, from git\): /m, 'Enter keeps git\'s name');
  assert.match(first(typed, 'Ada Park\n3\n').out, /^ {2}you are Ada Park here \(kept on this machine since [\d-]+, from you\): /m, 'a typed name is theirs');
});

test('a verb that asks who acts leaves one trace row of that answer, who and why, in the cli\'s own step', () => {
  const { repo } = setupRepo(WORLD);
  const rows = () => traceRows(repo).filter((row) => row.step === 'actor');
  const before = rows().length;
  assert.equal(run(WORLD.bin, ['uninstall', '--purge', '--target', repo], { env: { CLAUDECODE: '1' }, input: 'yes\n' }).code, 1);
  const [row] = rows().slice(before);
  assert.deepEqual([row.pkg, row.ok, row.ref, row.codes], ['cli', true, { who: 'ai', why: 'ai-session-mark' }, { 'actor-ai': 1 }]);
  assert.equal(rows().length, before + 1, 'one row per answer of a process');
});
