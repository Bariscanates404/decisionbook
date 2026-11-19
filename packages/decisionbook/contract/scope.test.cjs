// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// A plan covers the files it names, no more: a file outside the READY plan asks the person and joins it only on their yes, a plan that
// grows past its level is read at that level again, and a draft holds back only its own files.
const test = require('node:test');
const assert = require('node:assert/strict');
const kit = require('@atlasbound/kit');
const { verbs, handlers } = require('@atlasbound/decisionbook');
const { ROOT, bookWorld, begin, added, editEvent, writeConfig, ruling, planRecords } = require('./world.cjs');

// a small fix READY with no more than it needs: its files, one reading, the person's yes
async function smallFix(io, plans, title = 'Fix add') {
  const id = await begin(io, { title, level: 'micro' });
  const res = await added(io, id, [{ t: 'research', tool: 'read', asked: 'what add does', answer: 'returns a+b', source: `${plans[0]}:1` },
    ...plans.map((to) => ({ t: 'link', rel: 'plans', to: `file:${to}`, why: 'the math code' })), { t: 'confirm', by: 'Ayse', said: 'yes, go ahead' }]);
  assert.equal(res.out.state.ready, true, 'READY as a small fix');
  return { id };
}
const ran = (file, session = 's1') => ({ hook_event_name: 'PostToolUse', session_id: session, tool_name: 'Edit', tool_input: { file_path: `${ROOT}/${file}` } });

test('[I-5] a file outside the READY plan asks, says to plan it apart, and joins the plan only on the person\'s yes', async () => {
  const io = bookWorld();
  writeConfig(io, { protect: ['src/**'] });
  const { id } = await smallFix(io, ['src/core/math.js']);
  const held = planRecords(io, id).length;
  const asked = await handlers.preEdit(editEvent('src/core/geometry.js'), io);
  assert.deepEqual([...ruling(asked), asked.plan], ['ask', 'plan-outside', id]);
  assert.match(asked.reason, /plan-outside: src\/core\/geometry\.js: .*open a new plan for this file/);
  assert.equal(planRecords(io, id).length, held, 'nothing joins at the ask');
  await handlers.postEdit(ran('src/core/geometry.js'), io); // the write ran: the person said yes
  const { at, ...link } = planRecords(io, id).at(-1);
  assert.ok(at, 'the product\'s line, with its time');
  assert.deepEqual(link, { t: 'link', rel: 'plans', to: 'file:src/core/geometry.js', by: 'the person', source: 'the person\'s yes to the gate\'s ask' });
  assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/core/geometry.js'), io)), ['allow', 'gate-in-scope']);
});

test('[I-5] a file the AI links to a READY plan by itself is still outside it until the person says yes', async () => {
  const io = bookWorld();
  writeConfig(io, { protect: ['src/**'] });
  const { id } = await smallFix(io, ['src/core/math.js']);
  await added(io, id, { t: 'link', rel: 'plans', to: 'file:src/core/geometry.js', why: 'area() too, signed for them', by: 'the person' });
  assert.equal(planRecords(io, id).at(-1).by, undefined, 'the product sets a link\'s by, never the sender');
  assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/core/geometry.js'), io)), ['ask', 'plan-outside']);
});

test('[I-11] a READY plan that grows past its level by the person\'s yes is read at the new level: no edit until it holds it', async () => {
  const io = bookWorld();
  writeConfig(io, { protect: ['src/**'] });
  const { id } = await smallFix(io, ['src/core/math.js', 'src/core/sub.js']);
  const asked = await handlers.preEdit(editEvent('src/core/geometry.js'), io);
  assert.match(asked.reason, /with it the plan is normal work/);
  await handlers.postEdit(ran('src/core/geometry.js'), io);
  const shown = (await verbs.show(io, { rest: [id] })).out;
  assert.equal(shown.level.level, 'normal', 'three files are normal work');
  assert.ok(shown.unmet.length > 0, 'normal work asks more than the small fix held');
  const after = await handlers.preEdit(editEvent('src/core/math.js'), io);
  assert.deepEqual(ruling(after), ['deny', 'plan-outgrown']);
  assert.match(after.reason, /normal work/);
});

test('[I-8] a draft holds back only the files it names; another protected file is told to plan', async () => {
  const io = bookWorld();
  writeConfig(io, { protect: ['src/**'] });
  const id = await begin(io, { title: 'Add sub', level: 'micro' });
  await added(io, id, { t: 'link', rel: 'plans', to: 'file:src/core/sub.js', why: 'the sub function' });
  assert.deepEqual(ruling(await handlers.preEdit(editEvent('src/core/sub.js'), io)), ['deny', 'plan-draft-here']);
  const other = await handlers.preEdit(editEvent('src/core/geometry.js'), io);
  assert.deepEqual(ruling(other), ['deny', 'plan-none']);
  assert.match(other.reason, new RegExp(`the branch's draft ${id} does not name it`), 'the draft of other files is named as no plan of this one');
});

test('[I-8] a later session plans a file the open READY plan does not cover: the new plan is not refused as a re-plan', async () => {
  const io = bookWorld({ begun: null });
  writeConfig(io, { protect: ['src/**'] });
  await smallFix(io, ['src/util.js'], 'Fix util');
  const later = { head: 'h0', dirty: [], at: '2026-11-03T06:00:00.000Z' }; // a session that began the next day, after that plan's READY
  io.home.writeAtomic(kit.paths.hereKey(ROOT, 'decisionbook', `start-${kit.hash.sha256('s2').slice(0, 16)}.json`), `${JSON.stringify(later)}\n`);
  io.session = 's2';
  const create = (plans) => verbs.create(io, { rest: [JSON.stringify({ title: 'Math mul', why: 'mul is missing', kind: 'feature', level: 'micro',
    records: plans.map((to) => ({ t: 'link', rel: 'plans', to: `file:${to}`, why: 'the math code' })) })] });
  await assert.rejects(create(['src/util.js']), { code: 'plan-open' }, 'the same files are the open plan\'s work');
  assert.equal((await create(['src/core/math.js'])).out.code, 'plan-created');
});
