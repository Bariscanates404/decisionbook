// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// a new judged above the level it proposed says why on its first line, in the gate's own words from the function that decides
// the level (core/level); the pack of a prompt that names no file says its level is from the words only and what raises it.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, wire } = require('./world.cjs');

const { verbs } = decisionbook;
const FILES = { 'lib/sched/index.js': 'x\n', 'lib/sched/parse.js': 'y\n', 'lib/sched/run.js': 'r\n', 'lib/pay/charge.js': 'c\n' };
const head = { title: 'Workers in the scheduler', why: 'runs compete', success: 'workers limit runs', kind: 'feature' };
const plans = (...to) => to.map((file) => ({ t: 'link', rel: 'plans', to: `file:${file}`, why: 'the workers' }));
const firstLine = async (io, level, records) => (await verbs.create(io, { rest: [wire({ ...head, level, records })] })).text.split('\n');

test('a new judged above its proposed level says the reason first, in the gate\'s words, before the fill-in add', async () => {
  const io = bookWorld({ files: FILES });
  writeConfig(io, { protect: ['lib/**'], danger: ['lib/pay/**'] });
  const three = await firstLine(io, 'micro', plans('lib/sched/index.js', 'lib/sched/parse.js', 'lib/sched/run.js'));
  assert.equal(three[0], 'level: normal work (proposed small fix: not a small fix: it runs as normal work: more than 2 files (3))');
  assert.ok(three.findIndex((l) => l.startsWith('atlasbound decisionbook add ')) > 0, 'the add comes after the reason');
  const glob = await firstLine(io, 'micro', plans('lib/sched/**'));
  assert.equal(glob[0], 'level: normal work (proposed small fix: not a small fix: it runs as normal work: a glob (lib/sched/**))');
  const zone = await firstLine(io, 'normal', plans('lib/pay/charge.js'));
  assert.equal(zone[0], 'level: critical work (proposed normal work: the level runs higher than proposed: code decides, going up is free: a danger zone '
    + '(lib/pay/charge.js))');
  const kept = await firstLine(io, 'micro', plans('lib/sched/parse.js'));
  assert.ok(!kept[0].startsWith('level: '), 'a new judged at its own level says no reason');
});

test('the pack of a prompt naming no file is laid out as normal work and names what keeps a plan from being a small fix', async () => {
  const io = bookWorld({ files: FILES });
  writeConfig(io, { protect: ['lib/**'] });
  const [words, small] = (await verbs.pack(io, { rest: ['tenants', 'and', 'quotas'] })).text.split('\n');
  assert.ok(words.startsWith('this task runs as normal work (the prompt names no file, so the plan is laid out for several files); READY there needs: '), words);
  assert.ok(small.startsWith('A small fix instead ("level":"micro") when none of these holds: more than 2 files, a glob, a shared or entry path, '
    + 'a danger zone, a schema path, a sensitive path, a risk word or 3+ shared consumers; it needs only: '), small);
  const risky = (await verbs.pack(io, { rest: ['a', 'payment', 'webhook'] })).text.split('\n');
  assert.ok(risky[0].startsWith('this task runs as critical work (from the prompt\'s words only: it names no file; more than 2 files, a glob, a shared or entry '
    + 'path, a danger zone, a schema path, a sensitive path, a risk word or 3+ shared consumers raise it: a risk word (payment)); '), risky[0]);
  assert.ok(risky[1].startsWith('If this request changes code'), 'no small form where the words already raise it');
  const named = (await verbs.pack(io, { rest: ['lib/sched/parse.js'] })).text.split('\n').find((l) => l.startsWith('this task runs as'));
  assert.ok(named.startsWith('this task runs as small fix (from its files and words, as the gate decides); '), named);
});
