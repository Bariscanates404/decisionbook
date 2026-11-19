// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// A plan's name and the words that find it: a title in any script names its plan in ASCII letters, find reads a word with or without its
// marks, a file is the same file in either slash, and a title with no word is refused.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { verbs } = decisionbook;
const { bookWorld, begin, added, readyOne, logFile } = require('./world.cjs');

test('[I-9] a title\'s letters are written in ASCII in its plan id, and find matches a word with or without its marks', async () => {
  const io = bookWorld();
  const id = await begin(io, { title: 'Çarpım fonksiyonu ekle: ğüşıöç İŞĞ' });
  assert.equal(id, '2026-11-02-carpim-fonksiyonu-ekle-gusioc-isg');
  assert.equal(await begin(io, { title: 'Straße für Übergrößen', why: 'a second plan' }), '2026-11-02-strasse-fur-ubergrossen');
  for (const word of ['Carpim', 'çarpım', 'ÇARPIM', 'gusioc']) {
    assert.deepEqual((await verbs.find(io, { rest: [word] })).out.hits.map((h) => h.id), [id], word);
  }
  const marked = await begin(io, { title: 'Sửa lỗi đăng nhập: Łódź, Ærø', why: 'letters of two marks, and letters Unicode does not take apart' });
  assert.equal(marked, '2026-11-02-sua-loi-dang-nhap-lodz-aero');
  assert.deepEqual((await verbs.find(io, { rest: ['sua'] })).out.hits.map((h) => h.id), [marked]);
});

test('[I-9] a title that holds no letter or digit is refused and writes nothing', async () => {
  const io = bookWorld();
  for (const title of ['   ', '-- ? --']) {
    await assert.rejects(begin(io, { title }), (err) => err.code === 'record-invalid' && /title holds no letter/.test(err.message), JSON.stringify(title));
  }
  assert.equal(io.fs.list('.decisionbook'), null, 'no plan file');
});

test('[I-4] show file: reads a path in either slash and with ./ as the same file', async () => {
  const io = bookWorld();
  const { id } = await readyOne(io, { plans: ['src/core/math.js'], title: 'Math helpers' });
  for (const ref of ['file:src/core/math.js', 'file:src\\core\\math.js', 'file:./src/core/math.js']) {
    assert.deepEqual((await verbs.show(io, { rest: [ref] })).out.links.map((l) => l.to), [`plan:${id}`], ref);
  }
});

test('[I-9] a yes no receipt here backs, hand-added to the file, shows as unverified in show, related and ready', async () => {
  const io = bookWorld({ files: { 'src/util.js': 'u\n' } });
  const id = await begin(io, { title: 'Fix util', level: 'micro' });
  await added(io, id, [{ t: 'research', tool: 'read', asked: 'what util does', answer: 'pads', source: 'src/util.js:1' },
    { t: 'link', rel: 'plans', to: 'file:src/util.js', why: 'the pad' }]);
  io.fs.append(logFile(id), `${JSON.stringify({ t: 'confirm', by: 'person', said: 'Yes, go ahead with this plan.', at: '2026-11-02T07:00:00.000Z' })}\n`);
  assert.match((await verbs.ready(io, { rest: [id] })).text, /not confirmed on this machine/);
  assert.match((await verbs.show(io, { rest: [id] })).text, /confirmed by person: Yes, go ahead with this plan\. \(unverified: no receipt of this yes on this machine\)/);
  io.state.branch = 'next'; // related names the earlier plans of a file, from another branch
  assert.match((await verbs.related(io, { rest: ['src/util.js'] })).text, new RegExp(`${id} ready \\(2026-11-02\\) \\(its yes unverified here\\)`));
  const own = bookWorld({ files: { 'src/util.js': 'u\n' } });
  const { id: kept } = await readyOne(own, { plans: ['src/util.js'], title: 'Pad util' });
  assert.doesNotMatch((await verbs.show(own, { rest: [kept] })).text, /unverified/, 'a yes the product recorded here is verified');
});

test('[I-9] a torn line in a plan file is named by show and by doctor with its file and line, never skipped in silence', async () => {
  const io = bookWorld();
  const id = await begin(io, { title: 'Fix util' });
  io.fs.append(logFile(id), '{"t":"note","text":');
  const shown = (await verbs.show(io, { rest: [id] })).text;
  assert.match(shown, new RegExp(`\\.decisionbook/${id}\\.jsonl: line 2 does not read \\(record-invalid\\), so it is left out`));
  const doctor = await decisionbook.doctor(io);
  assert.equal(doctor.ok, false);
  assert.match(doctor.says, new RegExp(`\\.decisionbook/${id}\\.jsonl line 2 \\(record-invalid\\)`));
});
