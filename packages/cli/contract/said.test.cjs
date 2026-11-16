// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// the one context rule of the hook port, black box. Fake packages give say items; the host fires setup's rows. A text is said in full
// once per context, never again while unchanged, a changed one as its short form; a start that does not keep the transcript (startup, clear,
// compact) says it all again.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { makeWorld, makeRepo, run, portRow, fire, hookContextOf, hookDecisionOf, replyJson, git, traceRows } = require('./support.cjs');

const START = 'say: [{ key: "x.start", text: "START " + (process.env.V || "v1") + "\\nsecond line", short: "start changed: " + (process.env.V || "v1") }]';
const NOTE = 'say: [{ key: "x.note:A", text: "- A note\\n  why here: " + p.tool_input.file_path.split("/").pop(), short: "- A also here: " + ' +
  'p.tool_input.file_path.split("/").pop() }]';
const BODY = `{ handlers: {
  s: (p) => ({ ${START} }),
  e: () => ({ verdict: "allow", say: [{ key: "x.not-covered", text: "gate: not covered, not approval" }] }),
  w: () => ({ verdict: "deny", reason: "DENIED: call x first" }),
  u: (p) => ({ say: [{ key: "x.reminder", text: "REMINDER: ask the tools first" }], ...(p.prompt === "/resume-handoff" ? { context: "the resume answer" } : {}) }),
  r: (p) => ({ ${NOTE} }),
  t: () => ({ verdict: "deny", reason: "ASK: do the long thing " + (process.env.V || "v1") + ", then end your turn",
    key: "x.ask", short: "ASK again: " + (process.env.V || "v1") }),
} }`;
const ROWS = [['SessionStart', null, 's'], ['PreToolUse', 'Edit', 'e'], ['PreToolUse', 'Write', 'w'], ['UserPromptSubmit', null, 'u'], ['PostToolUse', 'Read',
  'r'], ['Stop', null, 't']];
const FAKE = { teller: { manifest: { hooks: ROWS.map(([event, matcher, handler]) => ({ event, matcher, handler, timeout: 15 })) }, body: BODY } };

const world = makeWorld({ fakes: FAKE, without: ['decisionbook'] });
function sayWorld() {
  const repo = makeRepo();
  const res = run(world.bin, ['setup', '--target', repo]);
  assert.equal(res.code, 0, res.err);
  const say = (event, value, payload, env) => fire(repo, portRow(repo, event, value), { session_id: 's1', cwd: repo, hook_event_name: event, ...payload }, env);
  return {
    repo,
    start: (source, env) => hookContextOf(say('SessionStart', source, { source }, env)),
    edit: (tool = 'Edit', extra = {}) => say('PreToolUse', tool, { tool_name: tool, tool_input: { file_path: path.join(repo, 'a.js') }, ...extra }),
    prompt: (text) => hookContextOf(say('UserPromptSubmit', '', { prompt: text })),
    read: (file) => hookContextOf(say('PostToolUse', 'Read', { tool_name: 'Read', tool_input: { file_path: path.join(repo, file) } })),
    stop: (env) => replyJson(say('Stop', '', { stop_hook_active: false }, env)),
  };
}

test('[I-65] a text is said in full the first time of a context and never again while unchanged', () => {
  const s = sayWorld();
  assert.equal(s.start('startup'), 'START v1\nsecond line');
  assert.equal(hookContextOf(s.edit()), 'gate: not covered, not approval', 'the first advisory of its kind, in full');
  assert.deepEqual([s.edit().out, s.edit().out], ['', ''], 'an allowed edit after it: silence');
  assert.equal(s.prompt('fix the bug'), 'REMINDER: ask the tools first');
  assert.equal(s.prompt('and the next one'), '', 'the same reminder is in the context already');
  assert.deepEqual(git(s.repo, 'status', '--porcelain', '--untracked-files=all').split('\n').filter((l) => l.includes('.atlasbound')), [],
    'the record is the store\'s, never committed');
  assert.match(git(s.repo, 'status', '--porcelain', '--ignored', '--untracked-files=all'), /^!! \.atlasbound\/cli\/said\/[0-9a-f]{16}\.jsonl$/m,
    'one ignored record of the session');
});

test('each item a hook said is one hook.said trace row: whose, its key, full or short, its characters, never its text', () => {
  const s = sayWorld();
  s.start('startup');
  s.start('resume'); // unchanged: nothing said, no row
  s.start('resume', { V: 'v2' });
  s.edit('Write');
  const rows = traceRows(s.repo);
  assert.deepEqual(rows.filter((r) => r.step === 'hook.said').map((r) => [r.ref.event, r.ref.pkg, r.ref.key, r.ref.as, r.n.chars]), [
    ['SessionStart', 'teller', 'x.start', 'full', 'START v1\nsecond line'.length], ['SessionStart', 'teller', 'x.start', 'short', 'start changed: v2'.length],
    ['PreToolUse', 'teller', undefined, 'full', 'DENIED: call x first'.length]], 'a reason has no key: it is said every time');
  const perRun = (step) => rows.filter((r) => r.step === step).reduce((sum, r) => ({ ...sum, [r.run]: (sum[r.run] || 0) + r.n.chars }), {});
  assert.deepEqual(perRun('hook.said'), Object.fromEntries(Object.entries(perRun('hook.out')).filter(([, chars]) => chars)), 'the rows of a run sum to its hook.out');
  assert.doesNotMatch(JSON.stringify(rows), /START|DENIED|second line|start changed/);
});

test('[I-65] resume keeps the context: unchanged says nothing, a changed text comes short; clear and compact say it all again', () => {
  const s = sayWorld();
  s.start('startup');
  s.edit();
  assert.equal(s.start('resume'), '', 'resume restores the transcript: the start text is there');
  assert.equal(s.start('resume', { V: 'v2' }), 'start changed: v2', 'what changed since the start, short');
  assert.equal(s.start('resume', { V: 'v2' }), '', 'and not twice');
  for (const source of ['clear', 'compact']) {
    assert.equal(s.start(source, { V: 'v2' }), 'START v2\nsecond line', `${source}: the full text once more`);
    assert.equal(hookContextOf(s.edit()), 'gate: not covered, not approval', `${source}: the first advisory again`);
    assert.equal(s.edit().out, '', `${source}: then silence again`);
  }
  assert.equal(s.start('some-new-source', { V: 'v2' }), 'START v2\nsecond line', 'a start that does not say it keeps the context is a new one');
});

test('[I-65] a deny reason and the answer to the person\'s own ask are said every time; the rule holds back only say items', () => {
  const s = sayWorld();
  s.start('startup');
  const denied = [hookDecisionOf(s.edit('Write')), hookDecisionOf(s.edit('Write'))];
  assert.deepEqual(denied.map((d) => [d.permissionDecision, d.permissionDecisionReason]), [['deny', 'DENIED: call x first'], ['deny', 'DENIED: call x first']]);
  assert.equal(s.prompt('/resume-handoff'), 'the resume answer\nREMINDER: ask the tools first', 'a decision\'s context, then its say items');
  assert.equal(s.prompt('/resume-handoff'), 'the resume answer', 'asked again: answered again');
});

test('[I-65] a keyed reason is said in full the first time of a context, then short, and in full after a compaction',
  () => {
  const s = sayWorld();
  s.start('startup');
  const asks = [s.stop(), s.stop(), s.stop({ V: 'v2' })];
  assert.deepEqual(asks.map((r) => [r.decision, r.reason]), [['block', 'ASK: do the long thing v1, then end your turn'], ['block', 'ASK again: v1'], ['block',
    'ASK again: v2']],
    'a refusal always carries its reason: the same one again is its short form, a changed one too');
  s.start('resume');
  assert.equal(s.stop().reason, 'ASK again: v1', 'a resume keeps the context');
  s.start('compact');
  assert.equal(s.stop().reason, 'ASK: do the long thing v1, then end your turn', 'a new context: in full once more');
  assert.equal(s.stop({ V: 'v3' }).reason, 'ASK again: v3');
});

test('[I-65] a note comes in full the first time, as a one-line pointer through another file, and not again for the same file', () => {
  const s = sayWorld();
  s.start('startup');
  assert.equal(s.read('a.js'), '- A note\n  why here: a.js');
  assert.equal(s.read('b.js'), '- A also here: b.js');
  assert.deepEqual([s.read('a.js'), s.read('b.js')], ['', '']);
  s.start('compact');
  assert.equal(s.read('b.js'), '- A note\n  why here: b.js', 'after compaction the full note once more');
});

test('[I-65] each session and each subagent is its own context; an event with no session is said in full every time', () => {
  const s = sayWorld();
  s.start('startup');
  assert.equal(hookContextOf(s.edit()), 'gate: not covered, not approval');
  assert.equal(hookContextOf(s.edit('Edit', { session_id: 's2' })), 'gate: not covered, not approval', 'another session');
  assert.deepEqual([s.edit('Edit', { agent_id: 'a1' }), s.edit('Edit', { agent_id: 'a1' })].map(hookContextOf), ['gate: not covered, not approval', ''],
    'a subagent is its own context');
  const bare = [s.edit('Edit', { session_id: undefined }), s.edit('Edit', { session_id: undefined })].map(hookContextOf);
  assert.deepEqual(bare, ['gate: not covered, not approval', 'gate: not covered, not approval']);
});
