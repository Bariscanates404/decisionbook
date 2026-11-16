// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// black box: READY is the freeze. A READY plan covers an edit, an Edit or a shell write, in whichever session it comes: the one that
// made it READY, a later one, one after /clear, one whose start was never kept. No session records a resume and the gate reads no
// session start. What a later session still does not get: a draft covers nothing, and a danger path outside the plan is the person's.
const test = require('node:test');
const assert = require('node:assert/strict');
const kit = require('@atlasbound/kit');
const decisionbook = require('@atlasbound/decisionbook');
const { ROOT, bookWorld, readyOne, begin, added, logFile, planRecords, editEvent, starting, writeConfig, lastN, ruling } = require('./world.cjs');

const { handlers, verbs } = decisionbook;
const editIn = (session, file = 'app/x.rb') => ({ ...editEvent(file), session_id: session });
const CAT = "cat > app/x.rb <<'EOF'\nclass X\nEOF";
const shellIn = (session, command = CAT) => ({ hook_event_name: 'PreToolUse', session_id: session, tool_name: 'Bash', tool_input: { command }, cwd: ROOT });
const RESUME = { t: 'resume', why: 'The same task: yesterday\'s per-option limit, its last step is still open.' };
/** app/** protected; `home: null` is a machine with no home. */
function guardedWorld(over = {}) {
  const io = bookWorld({ files: { 'app/x.rb': 'class X\n', 'docs/a.md': 'a\n' }, ...over });
  writeConfig(io, { protect: ['app/**'] });
  return io;
}
const phases = (io) => io.fs.readText('.atlasbound/trace/r1.ndjson').trim().split('\n').map((line) => JSON.parse(line))
  .filter((r) => r.step === 'plan.phase').map((r) => [Object.keys(r.codes)[0], r.ref.session]);

test('[I-28] a READY plan made before this session began covers its edits with no resume: READY is the freeze', async () => {
  const io = guardedWorld();
  const { id } = await readyOne(io, { plans: ['app/x.rb'] });
  const held = planRecords(io, id).length;
  assert.equal((await handlers.start(starting('s2'), io)).code, 'start-kept');
  assert.deepEqual(await handlers.preEdit(editIn('s2'), io), { verdict: 'allow', code: 'gate-in-scope', file: 'app/x.rb', plan: id },
    'a later session, in silence: no reason, no call to send');
  assert.deepEqual(lastN(io, 'decisionbook.gate'), { decision_allow: 1 }, 'the gate reads no session start: only the verdict is counted');
  assert.deepEqual(await handlers.preShell(shellIn('s2'), io), { verdict: 'allow', code: 'shell-allowed' });
  assert.equal('start' in lastN(io, 'decisionbook.shell'), false);
  assert.equal((await handlers.start(starting('s3', 'clear'), io)).code, 'start-kept');
  assert.deepEqual(ruling(await handlers.preEdit(editIn('s3'), io)), ['allow', 'gate-in-scope'], '/clear is a new session: it builds from the same plan');
  assert.deepEqual(ruling(await handlers.preEdit(editIn('s3', 'docs/a.md'), io)), ['allow', 'gate-not-protected'], 'an unprotected file is not read');
  assert.equal(planRecords(io, id).length, held, 'no session wrote a record to go on with it');
  assert.deepEqual(phases(io).filter(([code]) => code === 'phase-first-write'), [['phase-first-write', 's2'], ['phase-first-write', 's3']],
    'the trace keeps each session\'s first write under the plan, once');
});

test('[I-28] a plan made READY in this session covers its edits; a compacted session\'s start is kept once', async () => {
  const io = guardedWorld();
  assert.equal((await handlers.start(starting('s1'), io)).code, 'start-kept');
  await readyOne(io, { plans: ['app/x.rb'] });
  assert.deepEqual(ruling(await handlers.preEdit(editIn('s1'), io)), ['allow', 'gate-in-scope']);
  assert.deepEqual(lastN(io, 'decisionbook.gate'), { decision_allow: 1 });
  assert.deepEqual(ruling(await handlers.preShell(shellIn('s1'), io)), ['allow', 'shell-allowed']);
  assert.equal((await handlers.start(starting('s1', 'compact'), io)).code, 'start-kept');
  assert.equal(lastN(io, 'decisionbook.start').again, 1, 'the same session id: its start is kept once');
  assert.deepEqual(ruling(await handlers.preEdit(editIn('s1'), io)), ['allow', 'gate-in-scope'], 'after the compaction: the same plan covers it');
});

// The plan is what covers an edit, never a row of the session: with the start row gone, no session id or no home the READY plan
// covers its files as before, and what it does not cover is unchanged too.
test('[I-28] the gate needs no row of the session: no start row, no session id or no home change nothing a READY plan covers', async () => {
  const io = guardedWorld();
  assert.equal((await handlers.start(starting('s1'), io)).code, 'start-kept');
  const { id } = await readyOne(io, { plans: ['app/x.rb'] });
  io.home.remove(kit.paths.hereKey(io.root, 'decisionbook', `start-${kit.hash.sha256('s1').slice(0, 16)}.json`));
  assert.deepEqual(ruling(await handlers.preEdit(editIn('s1'), io)), ['allow', 'gate-in-scope'], 'the start row deleted');
  assert.deepEqual(ruling(await handlers.preEdit(editIn('s0'), io)), ['allow', 'gate-in-scope'], 'a session that began before the install');
  assert.deepEqual(ruling(await handlers.preEdit(editIn(undefined), io)), ['allow', 'gate-in-scope'], 'no session id');
  assert.deepEqual(ruling(await handlers.preShell(shellIn('s0'), io)), ['allow', 'shell-allowed']);
  const asked = await handlers.preEdit(editIn('s0', 'app/db/schema.rb'), io);
  assert.deepEqual([...ruling(asked), asked.plan], ['ask', 'plan-out-of-scope', id], 'a danger path outside the plan is still the person\'s');
  const homeless = guardedWorld({ home: null });
  await readyOne(homeless, { plans: ['app/x.rb'] });
  assert.equal((await handlers.start(starting('s1'), homeless)).code, 'start-unkept');
  assert.deepEqual(ruling(await handlers.preEdit(editIn('s1'), homeless)), ['ask', 'plan-not-here'],
    'no home: no yes of a person is kept here, so the plan is asked about, whichever session it is');
  assert.deepEqual(lastN(homeless, 'decisionbook.gate'), { decision_ask: 1 });
  assert.deepEqual(phases(homeless), [], 'no home: no phase is kept, no row written');
  const draft = guardedWorld();
  const open = await begin(draft);
  await handlers.start(starting('s2'), draft);
  const denied = await handlers.preEdit(editIn('s2'), draft);
  assert.deepEqual([...ruling(denied), denied.plan], ['deny', 'plan-draft-here', open], 'an earlier session\'s draft covers nothing: only READY freezes');
});

test('[I-28] a resume record is still read and kept as history: it holds its why and its time, and nothing reads it', async () => {
  const io = guardedWorld();
  const { id } = await readyOne(io, { plans: ['app/x.rb'] });
  await assert.rejects(added(io, id, { t: 'resume' }), { code: 'record-invalid' }, 'a resume says why');
  io.session = 's2'; // a session no person spoke in: the record opens nothing, so nobody is asked for it
  assert.match((await added(io, id, RESUME)).text, new RegExp(`^${id}: resume recorded\\n${id} READY as normal work\\. Frozen: `), 'the write says the state');
  const kept = JSON.parse(io.fs.readText(logFile(id)).trim().split('\n').at(-1));
  assert.deepEqual(Object.keys(kept), ['t', 'why', 'at']);
  const shown = await verbs.show(io, { rest: [id] });
  assert.equal(shown.out.state, 'ready', 'a resume changes no plan');
  assert.match(shown.text,
    new RegExp(`^resumed ${kept.at.replace(/\./g, '\\.')}: The same task: yesterday's per-option limit, its last step is still open\\.$`, 'm'));
  assert.deepEqual(Object.keys((await verbs.show(io, { rest: [id, 'resumes'] })).out).filter((key) => key === 'resumes' || key === 'why'), ['resumes'],
    'show picks it as a field');
  const row = io.fs.readText('.atlasbound/trace/r1.ndjson').trim().split('\n').map((line) => JSON.parse(line)).filter((r) => r.step === 'decisionbook.add').at(-1);
  assert.equal('plan-continued' in row.codes, false, 'the trace counts no session as going on by it');
  const torn = guardedWorld();
  const { id: other } = await readyOne(torn, { plans: ['app/x.rb'] });
  const lines = torn.fs.readText(logFile(other)).trim().split('\n').map((line) => JSON.parse(line));
  torn.fs.writeAtomic(logFile(other), `${lines.map(({ at, ...r }) => JSON.stringify(r.t === 'ready' ? r : { ...r, at })).join('\n')}\n`);
  await handlers.start(starting('s1'), torn);
  assert.deepEqual(ruling(await handlers.preEdit(editIn('s1'), torn)), ['ask', 'plan-not-here'],
    'a plan file rewritten by hand (its READY with no time) is not the plan the person said yes to: asked, never passed');
});
