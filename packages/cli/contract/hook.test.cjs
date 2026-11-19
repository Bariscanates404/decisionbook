// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The one hook port, black box: fake packages declare handlers in their manifests, setup wires, and the settings file is fired the way the host fires it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, makeRepo, run, tmp, readSettings, commandsFor, fire, editOf, traceRows } = require('./support.cjs');

const hook = (event, matcher, handler) => ({ event, matcher, handler, timeout: 15 });
const fake = (hooks, handlers) => ({ manifest: { hooks }, body: `{ handlers: ${handlers} }` });
const allowing = (name) => `{ h: (p, io) => { mark('${name} ' + process.pid); return { verdict: 'allow' }; } }`;
const portOf = (commands) => commands.filter((c) => c.includes(' hook '));
const replyOf = (res) => (res.out.trim() ? JSON.parse(res.out) : {});

/** A port test of fake packages only: the real DecisionBook every install has is left out, so its own handlers add nothing here. */
function wired(fakes) {
  const world = makeWorld({ fakes, without: ['decisionbook'] });
  const repo = makeRepo();
  const res = run(world.bin, ['setup', '--target', repo]);
  assert.equal(res.code, 0, res.err);
  return { world, repo };
}

const THREE = {
  gatekeeper: fake([hook('PreToolUse', 'Edit|Write', 'h')], allowing('gatekeeper')),
  telemetry: fake([hook('PreToolUse', 'Edit', 'h')], allowing('telemetry')),
  handoff: fake([hook('PreToolUse', '^Notebook.*', 'h')], allowing('handoff')),
};

test('[I-1] one port process per event while three packages declare PreToolUse, no row but the port, and no twin launch',
  () => {
  const { repo } = wired(THREE);
  const marks = path.join(tmp('cli-marks-'), 'marks');
  const commands = commandsFor(readSettings(repo), 'PreToolUse', 'Edit');
  assert.equal(portOf(commands).length, 1, commands.join('\n'));
  assert.deepEqual(commands.filter((c) => !c.includes(' hook ')), [], 'every row is the port');
  assert.equal(new Set(commands).size, commands.length, 'twin launch: one command twice');
  const res = fire(repo, portOf(commands)[0], editOf(repo, 'README.md'), { MARK: marks });
  assert.equal(res.code, 0, res.err);
  const rows = fs.readFileSync(marks, 'utf8').trim().split('\n').map((l) => l.split(' '));
  assert.deepEqual(rows.map(([name]) => name).sort(), ['gatekeeper', 'telemetry'], 'each handler whose own matcher fires, and only those');
  assert.equal(new Set(rows.map(([, pid]) => pid)).size, 1, 'all handlers in one process');
});

test('[I-1] a tool no handler declares starts no port process; a regex declaration still reaches its tool', () => {
  const { repo } = wired(THREE);
  assert.deepEqual(portOf(commandsFor(readSettings(repo), 'PreToolUse', 'Read')), []);
  assert.equal(portOf(commandsFor(readSettings(repo), 'PreToolUse', 'NotebookEdit')).length, 1);
  assert.deepEqual(portOf(commandsFor(readSettings(repo), 'Stop', 'x')), [], 'no declared handler, no row');
});

test('[I-6] a throwing handler: the others still run, and its lost verdict on a write asks in its place with a visible line', () => {
  const { repo, world } = wired({
    gatekeeper: fake([hook('PreToolUse', 'Edit', 'h')], '{ h: () => { throw new Error("secret file content"); } }'),
    telemetry: fake([hook('PreToolUse', 'Edit', 'h')], allowing('telemetry')),
  });
  const marks = path.join(tmp('cli-marks-'), 'marks');
  const res = fire(repo, portOf(commandsFor(readSettings(repo), 'PreToolUse', 'Edit'))[0], editOf(repo, 'README.md'), { MARK: marks });
  assert.equal(res.code, 0, 'fails open');
  assert.match(fs.readFileSync(marks, 'utf8'), /^telemetry /, 'the other handler ran');
  const reply = replyOf(res);
  assert.deepEqual(reply.hookSpecificOutput, { hookEventName: 'PreToolUse', permissionDecision: 'ask',
    permissionDecisionReason: 'atlasbound: hook-lost: gatekeeper.h (hook-handler-threw): a gate formed no verdict on this write, so it asks: allow it ' +
      'only if you meant it' }, 'the other handler allowed; the lost one asks, naming why');
  assert.match(reply.systemMessage, /no verdict formed.*gatekeeper\.h/);
  const seen = run(world.bin, ['debug', 'trace', '--session', 's1', '--json', '--target', repo]);
  assert.equal(seen.code, 0, seen.err);
  const failed = JSON.parse(seen.out).records.filter((r) => r.step === 'hook.handler' && !r.ok);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].ref.handler, 'gatekeeper.h');
  assert.ok(!seen.out.includes('secret file content'), 'an uncoded error records only its name');
});

test('[I-6] a hanging handler cannot take the others down: the deny still arrives, and the timeout is named', () => {
  const { repo } = wired({
    gatekeeper: { manifest: { hooks: [{ event: 'PreToolUse', matcher: 'Edit', handler: 'h', timeout: 1 }] },
      body: '{ handlers: { h: () => new Promise(() => setInterval(() => {}, 1000)) } }' },
    telemetry: fake([hook('PreToolUse', 'Edit', 'h')], '{ h: () => ({ verdict: "deny", reason: "no" }) }'),
  });
  const t0 = process.hrtime.bigint();
  const res = fire(repo, portOf(commandsFor(readSettings(repo), 'PreToolUse', 'Edit'))[0], editOf(repo, 'README.md'));
  assert.ok(Number(process.hrtime.bigint() - t0) / 1e9 < 14, 'bound by the shorter deadline of the event, not left to the host kill');
  const reply = replyOf(res);
  assert.equal(reply.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(reply.systemMessage, /gatekeeper\.h.*hook-timeout/);
});

test('[I-6] broken stdin fails open with the visible line and exit 0', () => {
  const { repo, world } = wired(THREE);
  const res = run(world.bin, ['hook', 'PreToolUse'], { cwd: repo, input: 'not json', env: { CLAUDE_PROJECT_DIR: repo } });
  assert.equal(res.code, 0);
  assert.match(replyOf(res).systemMessage, /no verdict formed.*hook-input-invalid/);
  const rowIn = traceRows(repo).find((r) => r.step === 'hook.in');
  assert.deepEqual([rowIn.ok, rowIn.err], [false, { code: 'hook-input-invalid', msg: 'hook-input-invalid: SyntaxError' }], 'traced, with why: not JSON');
});


test('[I-6] a trace store that cannot be written still answers: the deny stands and the line names it', () => {
  const { repo } = wired({ gatekeeper: fake([hook('PreToolUse', 'Edit', 'h')], '{ h: () => ({ verdict: "deny", reason: "no" }) }') });
  fs.rmSync(path.join(repo, '.atlasbound', 'trace'), { recursive: true });
  fs.symlinkSync(tmp('cli-elsewhere-'), path.join(repo, '.atlasbound', 'trace'));
  const res = fire(repo, portOf(commandsFor(readSettings(repo), 'PreToolUse', 'Edit'))[0], editOf(repo, 'README.md'));
  assert.equal(res.code, 0, res.err);
  const reply = replyOf(res);
  assert.equal(reply.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(reply.systemMessage, /path-link/);
});

test('[I-7] a PreToolUse line reaches the agent with no decision of its own: an unexamined edit is never silent', () => {
  const { repo } = wired({ gatekeeper: fake([hook('PreToolUse', 'Edit', 'h')], '{ h: () => ({ verdict: "allow", context: "gate not active" }) }') });
  const reply = replyOf(fire(repo, portOf(commandsFor(readSettings(repo), 'PreToolUse', 'Edit'))[0], editOf(repo, 'README.md')));
  assert.deepEqual(reply.hookSpecificOutput, { hookEventName: 'PreToolUse', additionalContext: 'gate not active' });
});

test('[I-7] a context never overwrites a deny from another handler: both arrive in one object', () => {
  const { repo } = wired({
    gatekeeper: fake([hook('PreToolUse', 'Edit', 'h')], '{ h: () => ({ verdict: "allow", context: "not covered" }) }'),
    telemetry: fake([hook('PreToolUse', 'Edit', 'h')], '{ h: () => ({ verdict: "deny", reason: "no" }) }'),
  });
  const reply = replyOf(fire(repo, portOf(commandsFor(readSettings(repo), 'PreToolUse', 'Edit'))[0], editOf(repo, 'README.md')));
  assert.deepEqual(reply.hookSpecificOutput, { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'no',
    additionalContext: 'not covered' });
});

const VERDICTS = [
  [['deny', 'ask', 'allow'], 'deny'],
  [['allow', 'ask'], 'ask'],
  [['ask', 'deny'], 'deny'],
];
for (const [verdicts, winner] of VERDICTS) {
  test(`[I-7] ${verdicts.join(' + ')} -> ${winner}`, () => {
    const names = ['gatekeeper', 'telemetry', 'handoff'];
    const fakes = Object.fromEntries(verdicts.map((v, i) => [names[i], fake([hook('PreToolUse', 'Edit', 'h')],
      `{ h: () => ({ verdict: '${v}', reason: 'because ${v}' }) }`)]));
    const { repo } = wired(fakes);
    const reply = replyOf(fire(repo, portOf(commandsFor(readSettings(repo), 'PreToolUse', 'Edit'))[0], editOf(repo, 'README.md')));
    assert.equal(reply.hookSpecificOutput.permissionDecision, winner);
    assert.match(reply.hookSpecificOutput.permissionDecisionReason, new RegExp(`because ${winner}`));
    assert.doesNotMatch(reply.hookSpecificOutput.permissionDecisionReason, new RegExp(`because ${verdicts.find((v) => v !== winner)}`));
  });
}

test('[I-7] allow alone writes no decision: a hook allow would skip the host\'s own permission prompt', () => {
  const { repo } = wired({ gatekeeper: fake([hook('PreToolUse', 'Edit', 'h')], '{ h: () => { mark("allow-ran"); return { verdict: "allow" }; } }') });
  const marks = path.join(tmp('hook-allow-'), 'marks');
  const res = fire(repo, portOf(commandsFor(readSettings(repo), 'PreToolUse', 'Edit'))[0], editOf(repo, 'README.md'), { MARK: marks });
  assert.deepEqual([res.code, res.out], [0, ''], 'silence on stdout: no decision, no line');
  assert.equal(fs.readFileSync(marks, 'utf8'), 'allow-ran\n',
    'the handler did run and allow, so the silence is the port holding the allow back');
});

test('[I-7] only PreToolUse and Stop can block: a deny on another event is not passed on, a Stop deny blocks', () => {
  const { repo } = wired({ gatekeeper: fake([hook('UserPromptSubmit', null, 'h'), hook('Stop', null, 'h'), hook('SessionStart', 'startup', 'c')],
    '{ h: () => ({ verdict: "deny", reason: "stop" }), c: () => ({ context: "seed text" }) }') });
  const settings = readSettings(repo);
  const prompt = replyOf(fire(repo, portOf(commandsFor(settings, 'UserPromptSubmit', 'x'))[0], { session_id: 's', hook_event_name: 'UserPromptSubmit',
    prompt: 'p' }));
  assert.equal(prompt.decision, undefined);
  const stop = replyOf(fire(repo, portOf(commandsFor(settings, 'Stop', 'x'))[0], { session_id: 's', hook_event_name: 'Stop' }));
  assert.equal(stop.decision, 'block');
  assert.equal(stop.reason, 'stop');
  assert.match(stop.systemMessage, /^atlasbound: a deliberate check, not a crash: /, 'the host shows a Stop block as a hook error: the person reads why');
  const seed = replyOf(fire(repo, portOf(commandsFor(settings, 'SessionStart', 'startup'))[0], { session_id: 's', hook_event_name: 'SessionStart',
    source: 'startup' }));
  assert.equal(seed.hookSpecificOutput.additionalContext, 'seed text');
});

test('[I-11] debug trace gives the records of a hook run in order, by session and by package; a torn line is counted', () => {
  const { repo, world } = wired({ gatekeeper: fake([hook('PreToolUse', 'Edit', 'h')], '{ h: () => ({ verdict: "deny", reason: "no" }) }') });
  fire(repo, portOf(commandsFor(readSettings(repo), 'PreToolUse', 'Edit'))[0], editOf(repo, 'README.md'));
  const view = JSON.parse(run(world.bin, ['debug', 'trace', '--session', 's1', '--json', '--target', repo]).out);
  assert.equal(view.schema, 'ab-debug/1');
  assert.deepEqual(view.records.map((r) => r.step), ['hook.in', 'hook.handler', 'hook.out', 'hook.said']); // the deny reason is the item said
  assert.deepEqual(view.records.map((r) => r.seq), [1, 2, 3, 4]);
  assert.deepEqual(view.records[1].codes, { 'hook-deny': 1 });
  assert.ok(!JSON.stringify(view).includes('old_string'), 'digests and counts, never content');
  const last = run(world.bin, ['debug', 'trace', '--session', 's1', '--target', repo]);
  assert.equal(last.code, 0, last.err);
  assert.match(last.out, /hook\.handler .*hook-deny/);
  assert.doesNotMatch(run(world.bin, ['debug', 'trace', '--last', '--target', repo]).out, /hook\./, 'a hook is no work run; --session shows it');
  assert.deepEqual(JSON.parse(run(world.bin, ['debug', 'trace', '--session', 's1', '--pkg', 'nobody', '--json', '--target', repo]).out).records, []);
  const store = path.join(repo, '.atlasbound', 'trace');
  fs.appendFileSync(path.join(store, fs.readdirSync(store).find((f) => f.startsWith('hooks-'))), '{"torn\n');
  run(world.bin, ['doctor', '--target', repo], { env: { CLAUDE_CODE_SESSION_ID: 's1' } }); // a verb the host's session ran; setup ran with none
  const story = JSON.parse(run(world.bin, ['debug', 'trace', '--session', 's1', '--json', '--target', repo]).out);
  assert.equal(story.unreadable, 1);
  assert.deepEqual(story.records.map((r) => [r.pkg, r.step, r.ref.verb || r.ref.event]), [['cli', 'hook.in', 'PreToolUse'], ['cli', 'hook.handler',
    'PreToolUse'], ['cli', 'hook.out', 'PreToolUse'], ['cli', 'hook.said', 'PreToolUse'], ['cli', 'doctor', 'doctor']],
      'the session\'s verb in order with its hooks; a verb with no session is under none');
  const none = run(world.bin, ['debug', 'trace', 'no-such-run', '--target', repo]);
  assert.equal(none.code, 1);
  assert.match(none.err, /not-found/);
});

test('a hook run that formed no verdict has a hook.out row with a code and the handler that lost it, never a bare failed', () => {
  const { repo, world } = wired({ gatekeeper: fake([hook('Stop', null, 'h')], '{ h: () => { throw require("@atlasbound/kit").errors.fail("io-read-failed", "cfg"); } }') });
  fire(repo, portOf(commandsFor(readSettings(repo), 'Stop', 'x'))[0], { session_id: 's9', hook_event_name: 'Stop' });
  const out = JSON.parse(run(world.bin, ['debug', 'trace', '--session', 's9', '--json', '--target', repo]).out).records.find((r) => r.step === 'hook.out');
  assert.deepEqual([out.ok, out.err], [false, { code: 'hook-noted', msg: 'hook-noted: gatekeeper.h (io-read-failed)' }], 'the note is the run\'s err, never null');
  assert.match(run(world.bin, ['debug', 'trace', '--session', 's9', '--target', repo]).out, /hook\.out +hook-noted +hook-noted: gatekeeper\.h \(io-read-failed\)/);
});

test('[I-12] io.config: a key a package\'s hooks read reaches its handler, frozen, and no other key; a new major is refused', () => {
  const said = fake([hook('SessionStart', 'startup', 'c')],
    '{ c: (p, io) => ({ context: `${io.config.gateSwitch}|${io.config.other}|${Object.isFrozen(io.config)}` }) }');
  const { repo, world } = wired({ switches: { ...said, manifest: { ...said.manifest, hookConfig: ['gateSwitch'] } } });
  const command = portOf(commandsFor(readSettings(repo), 'SessionStart', 'startup'))[0];
  const payload = { session_id: 's', hook_event_name: 'SessionStart', source: 'startup' };
  assert.equal(replyOf(fire(repo, command, payload)).hookSpecificOutput.additionalContext, 'undefined|undefined|true');
  fs.mkdirSync(path.join(repo, '.atlasbound', 'cli'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.atlasbound', 'cli', 'config.json'), JSON.stringify({ schema: 'config/1', gateSwitch: null, other: 1 }));
  assert.equal(replyOf(fire(repo, command, payload)).hookSpecificOutput.additionalContext, 'null|undefined|true');
  fs.writeFileSync(path.join(repo, '.atlasbound', 'cli', 'config.json'), JSON.stringify({ schema: 'config/2' }));
  assert.match(run(world.bin, ['status', '--target', repo]).err, /^atlasbound: schema-major: config config\/2/m);
  assert.match(run(world.bin, ['doctor', '--target', repo]).out, /^ {2}config refused: schema-major: config config\/2: this view read the shipped config/m);
});

test('a cli config that does not read: the hook still writes its coded rows, doctor degrades naming the file', () => {
  const { repo, world } = wired({ gatekeeper: fake([hook('Stop', null, 'h')], allowing('gatekeeper')) });
  const config = path.join(repo, '.atlasbound', 'cli', 'config.json');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, '{}');
  const traceDir = path.join(repo, '.atlasbound', 'trace');
  const days = Array.from({ length: 20 }, (_, i) => `hooks-2026-10-${String(i + 1).padStart(2, '0')}.ndjson`);
  days.forEach((name) => fs.writeFileSync(path.join(traceDir, name), ''));
  fs.chmodSync(config, 0);
  try {
    const said = replyOf(fire(repo, portOf(commandsFor(readSettings(repo), 'Stop', 'x'))[0], { session_id: 's7', hook_event_name: 'Stop' }));
    assert.equal(said.systemMessage, 'atlasbound: no verdict formed by hook (io-read-failed: .atlasbound/cli/config.json: EACCES)');
    const rows = JSON.parse(run(world.bin, ['debug', 'trace', '--session', 's7', '--json', '--target', repo]).out).records;
    assert.deepEqual(rows.map((r) => [r.step, r.ok, r.err && r.err.msg]), [['hook.in', true, null],
      ['hook.out', false, 'hook-noted: hook (io-read-failed: .atlasbound/cli/config.json: EACCES)']], 'the unread config leaves its row');
    assert.deepEqual(days.filter((name) => !fs.existsSync(path.join(traceDir, name))), [], 'the shipped 14 days prune nothing a config that does not read may keep longer');
    const doctor = run(world.bin, ['doctor', '--target', repo]);
    assert.equal(doctor.code, 1, doctor.err);
    assert.match(doctor.out, /^ {2}config refused: io-read-failed: \.atlasbound\/cli\/config\.json: EACCES: this view read the shipped config/m);
    assert.deepEqual(JSON.parse(run(world.bin, ['debug', 'doctor', '--target', repo]).out).problems.filter((p) => p.from === 'config'),
      [{ from: 'config', name: '.atlasbound/cli/config.json', says: 'io-read-failed: .atlasbound/cli/config.json: EACCES' }]);
    const status = run(world.bin, ['status', '--target', repo]);
    assert.deepEqual([status.code, status.err.split('\n')[0]], [1, 'atlasbound: io-read-failed: .atlasbound/cli/config.json: EACCES (a file could not be read)']);
    const uninstalled = run(world.bin, ['uninstall', '--target', repo]);
    assert.deepEqual([uninstalled.code, fs.existsSync(config)], [1, true], 'uninstall names the refused config first and removes nothing');
  } finally {
    fs.chmodSync(config, 0o644);
  }
});
