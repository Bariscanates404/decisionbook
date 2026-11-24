// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// a new judged above the level it proposed says why on its first line, in the gate's own words from the function that decides
// the level (core/level); the level comes from the planned paths alone, so a plan's or a prompt's words raise nothing, and a level
// that runs as proposed says what keeps it there.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, wire, starting, LEVEL_KEPT } = require('./world.cjs');

const { verbs } = decisionbook;
const FILES = { 'lib/sched/index.js': 'x\n', 'lib/sched/parse.js': 'y\n', 'lib/sched/run.js': 'r\n', 'lib/pay/charge.js': 'c\n',
  'lib/billing/charge.js': 'b\n', 'src/billing/charge.js': 'b\n', 'src/pricing/quote.ts': 'q\n', 'src/utils/round.js': 'u\n' };
const RAISERS = 'more than 2 files, a glob, a shared or entry path, a danger zone, a schema path, a risk area in a planned path or 3+ shared consumers';
const head = { title: 'Workers in the scheduler', why: 'runs compete', success: 'workers limit runs', kind: 'feature' };
const plans = (...to) => to.map((file) => ({ t: 'link', rel: 'plans', to: `file:${file}`, why: 'the workers' }));
const firstLine = async (io, level, records) => (await verbs.create(io, { rest: [wire({ ...head, level, records })] })).text.split('\n');

test('a new judged above its proposed level says the reason first, in the gate\'s words, before the fill-in add', async () => {
  const io = bookWorld({ files: FILES });
  writeConfig(io, { protect: ['lib/**'], danger: ['lib/pay/**'] });
  const three = await firstLine(io, 'micro', plans('lib/sched/index.js', 'lib/sched/parse.js', 'lib/sched/run.js'));
  assert.equal(three[0], 'level: normal work (proposed small fix: not a small fix: it runs as normal work: more than 2 files (3))');
  assert.ok(three.findIndex((l) => l.startsWith('then run: atlasbound decisionbook add ')) > 0, 'the add comes after the reason');
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
  const [none, words, small] = (await verbs.pack(io, { rest: ['tenants', 'and', 'quotas'] })).text.split('\n');
  assert.equal(none, 'no record here: no earlier plan relates to this work', 'an area no earlier plan holds says so');
  assert.ok(words.startsWith('this task runs as normal work (the prompt names no file, so the plan is laid out for several files); READY there needs: '), words);
  assert.ok(small.startsWith(`A small fix instead ("level":"micro") when none of these holds: ${RAISERS}; it needs only: `), small);
  const risky = (await verbs.pack(io, { rest: ['a', 'payment', 'webhook'] })).text.split('\n').slice(1); // after no record here
  assert.equal(risky[0], words, 'a prompt\'s words raise nothing: the same layout as any prompt that names no file');
  assert.ok(risky[1].startsWith('A small fix instead'), 'and the small form beside it');
  const levelFor = async (file) => (await verbs.pack(io, { rest: [file] })).text.split('\n').find((l) => l.startsWith('this task runs as'));
  assert.ok((await levelFor('lib/sched/parse.js')).startsWith('this task runs as small fix (from its files, as the gate decides); '));
  assert.ok((await levelFor('lib/billing/charge.js')).startsWith('this task runs as critical work (from its files, as the gate decides: '
    + 'a risk area in a planned path (billing: lib/billing/charge.js)); '), 'a file the prompt names raises it, with the path that does');
});

test('a level a soft signal raised says so in every full reply, with the person\'s way to lower it; a danger zone has none', async () => {
  const io = bookWorld({ files: FILES });
  writeConfig(io, { protect: ['lib/**'], danger: ['lib/pay/**'] });
  const risky = { ...head, level: 'micro', records: plans('lib/billing/charge.js') };
  const made = await verbs.create(io, { rest: [wire(risky)] });
  const raised = 'level: critical work (proposed small fix: the level runs higher than proposed: code decides, going up is free: a risk area in a planned '
    + 'path (billing: lib/billing/charge.js)); only the person lowers it: where they say it is not that risky, record {"t":"waiver","reason":"<why it is not that risky>","by":"",'
    + '"said":"<their own words, copied from their message>"}';
  assert.equal(made.text.split('\n')[0], raised, 'the new says why and how');
  assert.equal((await verbs.ready(io, { rest: [made.out.id] })).text.split('\n')[0], raised, 'and so does ready, each time it is asked');
  const waived = await verbs.add(io, { rest: [made.out.id, wire({ t: 'waiver', reason: 'one constant, no payment code', by: 'Amy' })] });
  assert.ok(!waived.text.includes('level: critical work'), `their waiver lowered it: ${waived.text}`);
  const zone = await verbs.create(io, { rest: [wire({ ...head, level: 'normal', records: plans('lib/pay/charge.js') })] });
  assert.ok(!zone.text.includes('only the person lowers it'), 'a danger zone is never waived, so no waiver is offered');
});

test('one file gives one level and one reason whatever a plan says of itself, and a plan\'s words alone raise nothing', async () => {
  const io = bookWorld({ files: FILES });
  writeConfig(io, { protect: ['src/**'] });
  const levelOf = async (prose, file) => (await verbs.show(io, { rest: [(await verbs.create(io, { rest: [wire({ ...prose, kind: 'feature', level: 'normal',
    records: plans(file) })] })).out.id] })).text.split('\n').find((line) => line.startsWith('level: '));
  const proses = [{ title: 'One quote for an order', why: 'pricing owns the quote that billing and payment read', success: 'one total' },
    { title: 'A fee on late orders', why: 'some shops add a fee', success: 'the fee shows' },
    { title: 'Vouchers', why: 'shops hand out vouchers', success: 'a voucher lowers the total' }];
  const levels = [];
  for (const prose of proses) levels.push(await levelOf(prose, 'src/billing/charge.js'));
  assert.ok(levels[0].startsWith('level: critical work (proposed normal work: the level runs higher than proposed: code decides, going up is free: '
    + 'a risk area in a planned path (billing: src/billing/charge.js))'), levels[0]);
  assert.deepEqual(levels, [levels[0], levels[0], levels[0]], 'the same file: the same level, for the same reason');
  assert.equal(await levelOf({ title: 'Pricing rounding', why: 'the billing and payment totals round', success: 'pricing rounds down' }, 'src/utils/round.js'),
    LEVEL_KEPT, 'no path raises it: it runs as proposed, and says what keeps it there');
});

test('a risk area is a folder or a file of a planned path named so, whole; a word inside a name, a test or a doc is none', async () => {
  const io = bookWorld({ files: FILES });
  const signalsFor = async (...files) => (await verbs.create(io, { rest: [wire({ ...head, level: 'normal', records: plans(...files) })] })).out.state.level.signals;
  const AREA = 'a risk area in a planned path';
  assert.deepEqual(await signalsFor('app/auth/Token.rb', 'lib/Billing.js', 'src/payments/**'),
    [`${AREA} (auth: app/auth/Token.rb)`, `${AREA} (billing: lib/Billing.js)`, `${AREA} (payments: src/payments/**)`]);
  assert.deepEqual(await signalsFor('app/models/LoginSession.rb', 'lib/session-store.js', 'src/orders/price-label.ts', '.github/workflows/test.yml',
    'src/ci.ts', 'lib/authors.js'), [], 'a word inside a name, a session list, a price label, a workflow: none');
  assert.deepEqual(await signalsFor('test/auth/login.test.js', 'docs/billing.md'), [], 'a test or a doc names what it covers: no risk area');
});

test('the repository\'s own risk list decides in place of the built-in one, and the level line says that it did', async () => {
  const io = bookWorld({ files: FILES });
  writeConfig(io, { protect: ['src/**', 'lib/**'], risk: ['Pricing'] });
  const lineFor = async (level, file) => (await verbs.show(io, { rest: [(await verbs.create(io, { rest: [wire({ ...head, level,
    records: plans(file) })] })).out.id] })).text.split('\n').find((line) => line.startsWith('level: '));
  assert.ok((await lineFor('normal', 'src/pricing/quote.ts')).startsWith('level: critical work (proposed normal work: the level runs higher than proposed: '
    + 'code decides, going up is free: a risk area in a planned path (pricing: src/pricing/quote.ts, named in this repository\'s `risk` list)); '
    + 'only the person lowers it'), 'an area the repository names raises it, said as the repository\'s');
  assert.equal(await lineFor('normal', 'lib/billing/charge.js'), `${LEVEL_KEPT.slice(0, -1)}; this repository's \`risk\` list (.decisionbook/config.json) `
    + 'leaves out billing: lib/billing/charge.js)', 'a built-in area it leaves out raises nothing, and the line says what was left out');
  assert.equal(await lineFor('normal', 'src/utils/round.js'), LEVEL_KEPT, 'a path in no area says nothing of the list');
  writeConfig(io, { protect: ['src/**', 'lib/**'], risk: [] });
  assert.ok((await lineFor('micro', 'lib/billing/charge.js')).startsWith('level: small fix (as proposed: '), 'an empty list: no risk area here');
  writeConfig(io, { protect: ['src/**', 'lib/**'], risk: 'pricing' });
  assert.equal((await decisionbook.handlers.session(starting('s2'), io)).code, 'policy-unreadable', 'a list that does not read is never read as none');
});
