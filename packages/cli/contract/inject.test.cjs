// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// debug inject, black box through the real bin. A fake package plants texts of known length; the meter counts each exactly, counts a held text as held, reports an event the port refuses, and writes nothing in the repository.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, makeRepo, run, snapshot, tmp, PASSWD } = require('./support.cjs');

const BODY = `{ handlers: {
  s: () => ({ say: [{ key: "x.start", text: "S".repeat(123) }] }),
  r: () => ({ say: [{ key: "x.note", text: "C".repeat(77), short: "c".repeat(7) }] }),
  t: () => ({ verdict: "deny", reason: "R".repeat(50), say: [{ key: "x.tail", text: "T".repeat(20) }] }),
} }`;
const ROWS = [['SessionStart', null, 's'], ['PostToolUse', 'Read', 'r'], ['Stop', null, 't']];
const world = makeWorld({ fakes: { toy: { manifest: { hooks: ROWS.map(([event, matcher, handler]) => ({ event, matcher, handler, timeout: 15 })) }, body: BODY } },
  without: ['decisionbook'] });
const SCRIPT = [{ label: 'start', event: 'SessionStart', source: 'startup' },
  { label: 'read', event: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: 'lib/z.cjs' } },
  { label: 'read again', event: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: 'lib/z.cjs' } },
  { label: 'refused', event: 'NoSuchEvent' },
  { label: 'tool', event: 'PostToolUse', tool_name: 'mcp__some-server__read', tool_input: {} },
  { label: 'stop', event: 'Stop', stop_hook_active: false }];

function injected(script, extra = [], env = undefined) {
  const repo = makeRepo();
  assert.equal(run(world.bin, ['setup', '--target', repo]).code, 0);
  const file = path.join(tmp('inject-script-'), 'script.json');
  fs.writeFileSync(file, JSON.stringify(script));
  const before = snapshot(repo, { trace: false });
  const res = run(world.bin, ['debug', 'inject', '--script', file, '--target', repo, ...extra], { env });
  return { repo, before, res };
}

test('debug inject makes, fills and takes back its scratch copy with no program: no sh, tar, mktemp or rm, which Windows lacks', () => {
  const trap = path.join(tmp('inject-trap-'), 'no-shell.cjs');
  // as on Windows: a start of one of those programs is logged and finds no program
  fs.writeFileSync(trap, `const cp = require('node:child_process');\nfor (const k of ['spawn', 'spawnSync']) { const real = cp[k];
  cp[k] = (cmd, ...rest) => { if (!/(^|\\/)(sh|tar|mktemp|rm)$/.test(cmd)) return real(cmd, ...rest);
    require('node:fs').appendFileSync(${JSON.stringify(`${trap}.log`)}, cmd + '\\n'); return real('/nonexistent/' + cmd, ...rest); }; }\n`);
  const { res } = injected(SCRIPT, ['--json'], { NODE_OPTIONS: `${PASSWD} --require ${trap}` });
  assert.equal(res.code, 0, res.err);
  assert.equal(JSON.parse(res.out).events.length, SCRIPT.length);
  assert.equal(fs.existsSync(`${trap}.log`), false, 'no program was started for the copy');
});

test('a planted text is counted exactly, a held one as held, a Stop text as unsent, a refused event reported, nothing written', () => {
  const { repo, before, res } = injected(SCRIPT, ['--json']);
  assert.equal(res.code, 0, res.err);
  const view = JSON.parse(res.out);
  const by = Object.fromEntries(view.events.map((e) => [e.label, e]));
  assert.deepEqual(view.events.map((e) => e.label), SCRIPT.map((e) => e.label), 'every event of the script, in order, the refused one too');
  assert.deepEqual(by.start.agent, { toy: { said: 123, held: 0, unsent: 0 } });
  assert.deepEqual(by.read.agent, { toy: { said: 77, held: 0, unsent: 0 } });
  assert.deepEqual(by['read again'].agent, { toy: { said: 0, held: 77, unsent: 0 } }, 'the same text again: held, by the context rule');
  assert.deepEqual(by.stop.agent, { toy: { said: 50, held: 0, unsent: 20 } }, 'the reason reaches the agent; a Stop carries no context');
  assert.equal(by.stop.verdict, 'deny');
  assert.deepEqual(by.refused.notes, ['hook (hook-input-invalid)'], 'refused by the port, reported');
  assert.deepEqual(by.tool.notes, ['some-server is not wired here']);
  assert.deepEqual(view.totals.byPkg, { toy: { said: 250, held: 77 } });
  assert.deepEqual(view.totals.byModule, { toy: { said: 250, held: 77 } }, 'the module its own package brings');
  assert.equal(view.totals.silent, 3, 'read again, refused, tool');
  assert.deepEqual(view.standing, [], 'no MCP server is wired in this world');
  assert.deepEqual(snapshot(repo, { trace: false }), before, 'the run wrote nothing here but its own trace row: no said record, no store');
  assert.deepEqual(fs.readdirSync(path.join(repo, '.atlasbound/trace')).filter((f) => f.startsWith('hooks-')), [], 'no hook row: those stayed in the copy');
});

test('the text view names each event, the totals per module and the silent count, and its trace answers why', () => {
  const { res } = injected(SCRIPT, ['--keep']);
  assert.equal(res.code, 0, res.err);
  assert.match(res.out, /^ {2}2 {2}PostToolUse +read +77\/0 +- +-$/m);
  assert.match(res.out, /^per module \(said, held\):\n {2}toy +250 +77$/m);
  assert.match(res.out, /^events that said nothing: 3 of 6; said 250, held 77$/m);
  const copy = /the copy it ran on is kept: (\S+) /.exec(res.out)[1];
  const trace = run(world.bin, ['debug', 'trace', '--session', 'debug-inject', '--json', '--target', copy]);
  const outs = JSON.parse(trace.out).records.filter((r) => r.step === 'hook.out');
  fs.rmSync(path.dirname(copy), { recursive: true, force: true }); // the kept copy is the person's to remove; here the test's
  assert.deepEqual(outs.map((r) => [r.n.chars, r.n.held]).slice(0, 3), [[123, 0], [77, 0], [0, 77]], 'hook.out rows count what reached the agent');
});

test('a script that is not a list of events refuses, naming the shape; no copy stays', () => {
  const { res } = injected({ event: 'SessionStart' });
  assert.equal(res.code, 2);
  assert.match(res.err, /^atlasbound: args-invalid: debug inject: the script is a JSON list of host events/);
});
