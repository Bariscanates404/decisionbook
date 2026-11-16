// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The package is THE DecisionBook: its hooks, its texts, who answered, what it protects.
// Black box: the public entry, its published manifest and texts, kit's fake io. Every [I-n] names an invariant of this package.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld: world, begin, added, recordsFor, readyOne, unmetOf, editEvent, writeConfig, textOf } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const PKG = path.dirname(require.resolve('@atlasbound/decisionbook'));

test('[I-13] who, when and why on every answer; an AI assumption is its own record and never a person\'s answer',
  async () => {
  const io = world();
  const id = await begin(io);
  for (const record of recordsFor('normal', ['src/report/**']).filter((r) => r.t !== 'confirm')) await added(io, id, record);
  await added(io, id, { t: 'question', q: 'Q9', text: 'keep the old column?', decides: 'report.export.column', whyNotCode: 'a customer rule', blocking: true });
  await added(io, id, { t: 'decision', key: 'report.export.column', value: 'keep', why: 'seems safe', by: 'ai', answers: 'Q9', effect: ['check:AC-2'] });
  await added(io, id, { t: 'assumption', text: 'nobody reads the old column', why: 'no reader found by grep', q: 'Q9' });
  assert.deepEqual(await unmetOf(io, id), ['ready-open-question', 'ready-no-confirm'], 'neither the AI\'s decision nor its assumption answers for a person');
  await added(io, id, { t: 'decision', key: 'report.export.column', value: 'drop', why: 'the BI team moved off it', by: 'Ayse', answers: 'Q9',
    effect: ['check:AC-2'] });
  await assert.rejects(added(io, id, { t: 'confirm', by: 'ai', said: 'looks good' }), { code: 'confirm-by-person' });
  await added(io, id, { t: 'confirm', by: 'Ayse', said: 'yes' }); // the last row: the plan is READY, frozen
  await added(io, id, { t: 'link', rel: 'plans', to: 'file:src/other/extra.js', why: 'grew after the yes' });
  await added(io, id, { t: 'item', kind: 'step', order: 9, file: 'src/other/extra.js', change: 'the extra column', verify: 'AC-2' });
  assert.deepEqual(await unmetOf(io, id), [], 'the yes holds for the plan it saw and for what the READY plan grew by since');
  const readies = () => io.fs.readText(`.decisionbook/${id}.jsonl`).trim().split('\n').map((line) => JSON.parse(line)).filter((r) => r.t === 'ready');
  assert.deepEqual(readies().map((r) => r.scope), [['src/report/**']], 'a READY plan that holds is told, never stored again');
  await added(io, id, { t: 'confirm', by: 'Ayse', said: 'yes, with extra.js' });
  assert.equal((await verbs.ready(io, { rest: [id] })).out.code, 'plan-ready');
  assert.deepEqual(readies().map((r) => r.scope), [['src/report/**'], ['src/report/**', 'src/other/extra.js']], 'a newer yes: READY once more, with what it saw');
  const lines = io.fs.readText(`.decisionbook/${id}.jsonl`).trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(lines.filter((r) => r.t === 'decision').every((r) => r.by && r.why && /^2026-/.test(r.at)), 'who, why and when on every decision');
  const said = (await verbs.resume(io, { rest: [] })).text;
  assert.match(said, /\n- report\.export\.column = drop \(the BI team moved off it; by the person\)\n/);
  assert.match(said, /assumed by the AI, not a person's answer:\n- nobody reads the old column \(no reader found by grep\)/);
  assert.match(said, /confirmed by the person: yes, with extra\.js/);
  const ai = await begin(io, { title: 'AI answers only' });
  for (const record of recordsFor('normal', ['src/report/**'], '.ai').map((r) => (r.t === 'decision' ? { ...r, by: 'ai' } : r))) await added(io, ai, record);
  assert.deepEqual(await unmetOf(io, ai), ['ready-open-question', 'ready-answers'], 'questions the AI answered itself are not a person\'s answers');
});

test('[I-13] a yes holds for the plan it saw: a draft that grew after it, a READY plan a danger path joined, need a new yes', async () => {
  const io = world();
  const draft = await begin(io, { title: 'Yes before the plan grew' });
  const records = recordsFor('normal', ['src/report/**'], '.grew');
  const bare = (r) => (r.id === 'AC-1' ? { t: 'check', id: 'AC-1', text: r.text, how: 'e2e' } : r); // no command yet: a draft at the yes
  for (const record of records.map(bare)) await added(io, draft, record);
  assert.deepEqual(await unmetOf(io, draft), ['ready-no-command'], 'the yes is on record');
  await added(io, draft, { t: 'link', rel: 'plans', to: 'file:src/other/extra.js', why: 'grew after the yes' });
  const filled = await added(io, draft, { t: 'check', id: 'AC-3', text: 'the export runs', command: 'npm test -- export' });
  assert.deepEqual([filled.out.state.ready, filled.out.state.unmet.map((u) => u.code)], [false, ['ready-no-confirm']],
    'no READY was made: the yes was given to a smaller plan, and nothing froze it');
  const { id } = await readyOne(io, { title: 'Frozen one' });
  await added(io, id, { t: 'link', rel: 'plans', to: 'file:src/other/more.js', why: 'grew under READY' });
  assert.deepEqual(await unmetOf(io, id), [], 'a READY plan\'s yes covers a plain file it grew by');
  await added(io, id, { t: 'link', rel: 'plans', to: 'file:src/db/schema.sql', why: 'the export needs a column' });
  const res = await verbs.ready(io, { rest: [id] });
  const row = res.out.unmet.find((u) => u.code === 'ready-no-confirm');
  assert.deepEqual([res.out.ready, res.out.level.level, row && row.yesFor], [false, 'critical', ['src/db/schema.sql']],
    'a danger path joined after the yes: the yes no longer holds, and the plan is read at the level code decides again');
  assert.match(res.text, /\n {2}the yes on record came before these danger paths joined the plan: src\/db\/schema\.sql: show the person and ask; their yes is needed again\n/);
});

test('[I-15] a danger zone is guarded even outside protect; a danger or schema file needs a READY plan of critical level', async () => {
  const io = world();
  writeConfig(io, { protect: ['src/**'], danger: ['ops/**'] });
  assert.equal((await handlers.preEdit(editEvent('ops/run.sh'), io)).code, 'plan-none');
  const { id } = await readyOne(io);
  assert.equal((await handlers.preEdit(editEvent('src/report/a.js'), io)).code, 'gate-in-scope');
  const hard = await handlers.preEdit(editEvent('src/report/db/schema.sql'), io);
  assert.deepEqual([hard.verdict, hard.code, hard.plan], ['deny', 'plan-not-critical', id]);
  assert.match(hard.reason, /plan-not-critical: src\/report\/db\/schema\.sql: .*critical/);
});

test('[I-16] at a prompt, /resume-handoff adds DecisionBook\'s shared part, and a task prompt with no READY plan is nudged', async () => {
  const io = world();
  const prompt = (text) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: text }, io);
  writeConfig(io, { protect: ['src/**'] });
  const nudge = await prompt('please make the export stream its rows instead of buffering');
  assert.deepEqual([nudge.code, /^atlasbound decisionbook new <<'JSON'\n\{/m.test(textOf(nudge))], ['prompt-nudge', true], 'the plan pack\'s calls (as fill-in JSON)');
  for (const text of ['ok', '/decisionbook export', '/handoff']) assert.equal((await prompt(text)).code, 'prompt-passed', text);
  const { id } = await readyOne(io);
  await added(io, id, { t: 'question', q: 'Q7', text: 'a cap on rows?', decides: 'report.export.cap', whyNotCode: 'a product rule', blocking: false });
  const resumed = await prompt('/resume-handoff');
  assert.equal(resumed.code, 'prompt-resume');
  assert.match(textOf(resumed),
    new RegExp(`^## DecisionBook's shared part\\nPlan ${id} READY[^]*settled, do not re-ask[^]*report\\.export\\.rule1 = v1[^]*open questions:\\n- Q7: a cap on rows\\?`));
  assert.equal((await prompt('please make the export stream its rows instead of buffering')).code, 'prompt-passed', 'a READY plan needs no nudge');
});

test('[I-17] protect: candidates come from tracked files by kit\'s roles, and each answer is kept with its door and time',
  async () => {
  const io = world({ tracked: ['src/a.js', 'src/b/c.py', 'test/a.test.js', 'README.md', 'docs/x.md', 'main.go'] });
  const listed = await verbs.protect(io, {});
  assert.deepEqual(listed.out.candidates, [{ glob: 'src/**', files: 2, testFiles: 0 }, { glob: 'test/**', files: 1, testFiles: 1 }]);
  assert.deepEqual([listed.out.answer, listed.out.current], [null, null]);
  const quiet = await handlers.session({ hook_event_name: 'SessionStart', source: 'startup' }, io);
  assert.deepEqual([quiet.code, /protects nothing[^]*atlasbound protect/.test(textOf(quiet))], ['session-unprotected', true]);
  const source = await verbs.protect(io, { flags: { source: true } });
  assert.match(source.text, /protected paths: src\/\*\*, test\/\*\*/);
  const config = JSON.parse(io.fs.readText('.decisionbook/config.json'));
  assert.deepEqual([config.protect, config.answer.answer, config.answer.door, /^2026-/.test(config.answer.at)],
    [['src/**', 'test/**'], 'source', 'protect-command', true]);
  await verbs.protect(io, { rest: ['docs/**,main.go'], door: 'setup-terminal' });
  assert.deepEqual(JSON.parse(io.fs.readText('.decisionbook/config.json')).protect, ['src/**', 'test/**', 'docs/**', 'main.go']);
  await assert.rejects(verbs.protect(io, { flags: { none: true } }), { code: 'protect-person' },
    'no terminal, no person to ask: taking protection away is refused');
  const asked = [];
  const typed = (answer) => async (info) => {
    asked.push(info);
    return answer;
  };
  for (const answer of [false, 'yes']) {
    await assert.rejects(verbs.protect(io, { flags: { none: true }, ask: typed(answer) }), { code: 'protect-person' }, 'only the typed phrase');
  }
  assert.equal(JSON.parse(io.fs.readText('.decisionbook/config.json')).protect.length, 4, 'a refusal writes nothing');
  await verbs.protect(io, { flags: { none: true }, ask: typed(true) }); // the root's question answers whether the phrase was typed
  assert.equal(asked[0], 'this takes protection away from src/**, test/**, docs/**, main.go: an AI session may then edit them with no plan');
  assert.deepEqual([JSON.parse(io.fs.readText('.decisionbook/config.json')).protect, JSON.parse(io.fs.readText('.decisionbook/config.json')).answer.door],
    [[], 'protect-terminal']);
  assert.equal((await handlers.preEdit(editEvent('src/a.js'), io)).code, 'gate-off');
  assert.match((await verbs.notice(io, {})).text, /protected paths: none, as a person answered[^]*atlasbound protect/);
  await assert.rejects(verbs.protect(world({ tracked: ['README.md'] }), { flags: { source: true } }), { code: 'protect-refused' });
  await assert.rejects(verbs.protect(io, { rest: ['**'] }), (err) => err.code === 'protect-refused' && /whole repository/.test(err.message));
  assert.deepEqual(JSON.parse(io.fs.readText('.decisionbook/config.json')).protect, [], 'a refusal writes nothing');
});

test('[I-18] the manifest declares the eight hooks and the three commands, and the texts research first',
  async () => {
  const { atlasbound: manifest } = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.hooks.map((h) => [h.event, h.handler]), [['SessionStart', 'session'], ['UserPromptSubmit', 'prompt'], ['PreToolUse', 'preEdit'],
    ['PostToolUse', 'postEdit'], ['PostToolUse', 'recall'],
    ['PreToolUse', 'preShell'], ['SessionStart', 'start'], ['Stop', 'stop']]);
  assert.deepEqual(manifest.hooks.slice(5).map((h) => h.matcher), ['Bash', null, null],
    'Bash only, so the port is not spawned on every tool call');
  assert.ok(manifest.hooks.every((h) => typeof handlers[h.handler] === 'function'));
  [2, 3].forEach((i) => assert.deepEqual(manifest.hooks[i].matcher.split('|').sort(), ['Edit', 'MultiEdit', 'NotebookEdit', 'Write']));
  assert.deepEqual(manifest.hooks[4].matcher.split('|').sort(), ['Edit', 'MultiEdit', 'NotebookEdit', 'Read', 'Write'],
    'a read is a first touch, the gate never sees one');
  assert.deepEqual(manifest.commands.map((c) => c.dest), ['.claude/commands/decisionbook.md', '.claude/commands/decide.md', '.claude/commands/resume-handoff.md',
    '.claude/commands/resume-handoff.md']);
  assert.deepEqual(manifest.commands.slice(2).map((c) => [c.src, c.with, c.without]),
    [['commands/resume-handoff.md', 'handoff', undefined], ['commands/resume-handoff-alone.md', undefined, 'handoff']], '/resume-handoff: one file beside Handoff, one without it');
  const texts = manifest.commands.map((c) => fs.readFileSync(path.join(PKG, c.src), 'utf8'));
  const runs = texts.join('\n').match(/`[^`\n]*`/g).map((s) => s.slice(1, -1)).filter((s) => /^(atlasbound|node|npx|bash|sh) /.test(s));
  assert.ok(runs.length > 8 && runs.every((cmd) => /^atlasbound (decisionbook|protect)\b/.test(cmd)), runs.join('\n'));
  const [plan] = texts;
  // the records the pack's two calls carry are shaped there once (`decisionbook plan`), never a second copy here
  for (const word of [/Research first, zero questions/, /A question before any research is refused/, /"decides":/, /"whyNotCode":/, /`"effect"`/,
    /"settles":/, /`git log`/, /only points you at a file to open/, /small fix/, /normal work/, /critical work/, /atlasbound decisionbook plan <path\|words>/,
    /one per shell call/]) assert.match(plan, word);
  // the research steps by name, every question at once and none offered as a whole, the colleague, the freeze
  for (const word of [/the issue or task thread, read whole/, /past plans of the area/, /a sideways search/, /Ask every open question in one message/,
    /do not offer to take your proposals as a whole/,
    /Ask a colleague/, /"to":"<who>"/, /READY is the freeze/]) assert.match(plan, word);
  assert.doesNotMatch(plan, /"t":"resume"|"kind":"gap"|earlier session/, 'no resume call and no gap record is asked of a session');
  assert.doesNotMatch(plan, /"t":"confirm"|"kind":"step"|"rel":"plans"/, 'no second copy of a shape the pack hands');
});

test('the /decisionbook command\'s last step closes only after its commits exist', () => {
  const last = fs.readFileSync(path.join(PKG, 'commands', 'decisionbook.md'), 'utf8').split('\n').filter((l) => /^\d+\. /.test(l)).at(-1);
  assert.match(last, /^9\. When the work is done and its commits exist, on its branch .*`atlasbound decisionbook close <id>`/);
});
