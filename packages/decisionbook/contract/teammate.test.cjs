// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Two people on one branch. A teammate's plan came with their commit: a session of this clone plans its own task beside it, never closes
// it and never writes the person's decision over a line the teammate wrote, so both people's lines stand in the records and a merge can
// show that they disagree. Whose a line is, git says (the commit that holds it against the mail this clone commits as).
const test = require('node:test');
const assert = require('node:assert/strict');
const kit = require('@atlasbound/kit');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, wire, planRecords, logFile, starting, begin, added } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const FILE = 'src/kargo.js';
const FEE = 'Kargo ücreti 200 TL olsun.';
const ALI = { author: 'Ali', mail: 'ali@example.com' };
const ZEYNEP = { author: 'Zeynep', mail: 'zeynep@example.com' };
const planned = { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the fee is here' };
const feeOf = (value, more) => ({ t: 'decision', key: 'kargo.ucreti', value, why: 'their words', by: '', ...more });

/** Zeynep's clone holding a plan of the fee, READY, whose every line `wrote` committed (Ali: a teammate's; Zeynep: her own; null: git
 * names no one here); then her AI session `z1`, begun after it. */
async function feeClone(wrote, world = {}) {
  const authors = {};
  const io = bookWorld({ files: { [FILE]: 'export const KARGO_UCRETI = 100;\n' }, branch: 'main', authors, begun: null, ...world });
  writeConfig(io, { protect: ['src/**'] });
  const id = await begin(io, { title: 'Kargo ücretini 100 TL yap', level: 'micro' });
  await added(io, id, [planned, { ...feeOf('100 TL'), by: 'Ali' }, { t: 'confirm', by: 'Ali', said: 'Onaylıyorum.' }]);
  authors[logFile(id)] = (wrote ?? ZEYNEP).author;
  const everyLine = Array.from({ length: 20 }, () => ({ sha: 'c1', subject: 'the fee', ...(wrote ?? ZEYNEP) })); // one commit holds the file
  Object.assign(io.git, { me: async () => (wrote ? ZEYNEP.mail : null), blame: async () => everyLine });
  io.state.commits = [{ sha: 'c1', subject: 'the fee is 100', body: '', files: [FILE], after: 'h0' }];
  if (io.home) io.home = kit.testing.memoryFs(); // the plan came with a commit: this clone's home holds no yes to it and no row of it
  await handlers.start(starting('z1'), io);
  io.session = 'z1';
  await handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 'z1', prompt: FEE }, io);
  const sent = (run) => run.then((res) => res.out.code, (err) => err.message); // a refusal's message starts with its code
  const stateOfPlan = async (plan) => (await verbs.show(io, { rest: [plan] })).out.state;
  return { io, id, sent, stateOfPlan, last: () => planRecords(io, id).at(-1) };
}

test('beside a teammate\'s READY plan a new plan of its file opens; beside this clone\'s own READY plan it is refused', async () => {
  const mine = await feeClone(ZEYNEP);
  assert.match(await mine.sent(verbs.create(mine.io, { rest: [wire({ title: 'Kargo ücretini 200 TL yap', level: 'micro', records: [planned] })] })),
    /^plan-open: /, 'her own open plan is the work in progress');
  // her change of mind on record is no second plan of the same work: a new whose decision names that plan's decision opens beside it
  const changed = feeOf('200 TL', { said: FEE, supersedes: [`${mine.id}/kargo.ucreti`] });
  assert.equal(await mine.sent(verbs.create(mine.io, { rest: [wire({ title: 'Kargo ücretini 200 TL yap', level: 'micro', records: [planned, changed] })] })),
    'plan-created');
  const theirs = await feeClone(ALI);
  const made = await verbs.create(theirs.io, { rest: [wire({ title: 'Kargo ücretini 200 TL yap', level: 'micro', records: [planned] })] });
  assert.deepEqual([made.out.code, await theirs.stateOfPlan(theirs.id)], ['plan-created', 'ready'], 'her task has its own plan; Ali\'s stays as he left it');
});

test('an AI session never closes a teammate\'s plan; a person does, and the record says who closed it', async () => {
  const theirs = await feeClone(ALI);
  const refused = await theirs.sent(verbs.close(theirs.io, { rest: [theirs.id] }));
  assert.ok(refused.startsWith(`plan-close-theirs: ${theirs.id} (it came with a commit from Ali): closing a teammate's plan ends their open work`), refused);
  assert.deepEqual([theirs.last().t, await theirs.stateOfPlan(theirs.id)], ['ready', 'ready'], 'nothing was written');
  theirs.io.session = null; // the person, at their terminal
  assert.equal(await theirs.sent(verbs.close(theirs.io, { rest: [theirs.id] })), 'plan-closed');
  assert.equal(theirs.last().by, 'the person');
  assert.match((await verbs.show(theirs.io, { rest: [theirs.id, 'closed'] })).text, /^closed by the person: 1 own commit, /m);
  // near miss: the session of the clone that made the plan closes it as before, and the record says an AI did
  const mine = await feeClone(ZEYNEP);
  assert.equal(await mine.sent(verbs.close(mine.io, { rest: [mine.id] })), 'plan-closed');
  assert.equal(mine.last().by, 'ai');
});

test('a person\'s decision is never written over a teammate\'s line of that key: it goes in a plan of its own, naming it', async () => {
  const theirs = await feeClone(ALI);
  const ref = `${theirs.id}/kargo.ucreti`;
  const over = feeOf('200 TL', { said: FEE, supersedes: [ref] });
  const refused = await theirs.sent(added(theirs.io, theirs.id, over));
  assert.ok(refused.startsWith(`decision-teammates: nothing written: ${ref} (it came with a commit from Ali): a teammate wrote the line`), refused);
  assert.equal(theirs.last().t, 'ready', 'nothing was written');
  // the way on the refusal names: her own plan, the same key, naming his line; his line then reads as replaced by hers
  const own = await verbs.create(theirs.io, { rest: [wire({ title: 'Kargo ücretini 200 TL yap', level: 'micro', records: [planned, over] })] });
  assert.equal(own.out.code, 'plan-created');
  const [his] = (await verbs.show(theirs.io, { rest: [theirs.id, 'decisions'] })).out.decisions;
  assert.deepEqual([his.value, his.state, his.replacing, his.supersededBy], ['100 TL', 'active', [], null], 'pending until her plan is READY: nothing is replaced yet');
  // near misses: her own line, and a clone where git names no one, are changed in place as before
  for (const wrote of [ZEYNEP, null]) {
    const mine = await feeClone(wrote);
    assert.equal(await mine.sent(added(mine.io, mine.id, feeOf('200 TL', { said: FEE, supersedes: [`${mine.id}/kargo.ucreti`] }))), 'plan-recorded');
  }
});

const KEEP = '100 TL kalsın, değişmesin.';
const hears = (io, prompt) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: io.session, prompt }, io);
const decisionsOf = async (io, id) => (await verbs.show(io, { rest: [id, 'decisions'] })).out.decisions;

test('"it stays" is a keep beside the decision: under that decision\'s own key it is refused, under a key of its own it stands', async () => {
  const { io, id, sent } = await feeClone(ZEYNEP);
  await hears(io, KEEP);
  const keep = (key) => feeOf('100 TL', { key, said: KEEP, keeps: [`${id}/kargo.ucreti`] });
  const ownKey = new RegExp(`^keep-own-key: nothing written: ${id}/kargo\\.ucreti: a keep stands beside the decision it keeps.* \\(<key>\\.kept\\) with "keeps":`);
  for (const own of [keep('kargo.ucreti'), feeOf('100 TL', { said: KEEP })]) assert.match(await sent(added(io, id, own)), ownKey, 'named in keeps, or its value said again');
  assert.equal(await sent(added(io, id, keep('kargo.ucreti.kept'))), 'plan-recorded', 'no code changes, and the keep is on record');
  assert.deepEqual((await decisionsOf(io, id)).map((d) => [d.key, d.state, d.kept?.by ?? null]),
    [['kargo.ucreti', 'active', 'the person'], ['kargo.ucreti.kept', 'kept', null]], 'the decision stands, kept by the person');
});

test('a keep of a decision a teammate replaced since is told the line that holds now, and takes the old one back naming both', async () => {
  const { io, id, sent } = await feeClone(ALI);
  const [old, key] = [`${id}/kargo.ucreti`, 'kargo.ucreti'];
  io.session = null; // the pull brought the teammate's READY plan that replaced it
  const theirs = await begin(io, { title: 'Kargo ücretini 200 TL yap', level: 'micro' });
  await added(io, theirs, [planned, { ...feeOf('200 TL', { supersedes: [old] }), by: 'Zeynep' }, { t: 'confirm', by: 'Zeynep', said: 'Evet.' }]);
  io.session = 'z1';
  await hears(io, KEEP);
  const back = (more) => verbs.create(io, { rest: [wire({ title: 'Kargo ücreti 100 TL kalsın', level: 'micro', records: [planned, feeOf('100 TL', { said: KEEP, ...more })] })] });
  const refused = await sent(back({ keeps: [old] }));
  assert.ok(refused.includes(`. ${old} was replaced by ${theirs}/${key}, which holds now: name ${theirs}/${key}, in "supersedes" where the person's words `
    + `replace it; "keeps" may then name ${old}, which they take back from it`), refused);
  const mine = (await back({ keeps: [old], supersedes: [`${theirs}/${key}`] })).out.id;
  assert.deepEqual((await decisionsOf(io, mine)).map((d) => [d.value, d.state, d.replacing, d.keeps, d.conflict]),
    [['100 TL', 'active', [`${theirs}/${key}`], [old], null]], 'on record, naming both; it replaces theirs once this plan is READY, and no conflict is written');
});

test('a plan made READY with no decision of the person says so once; a value their message set is recorded in a small fix too', async () => {
  const io = bookWorld({ files: { [FILE]: 'export const KARGO_UCRETI = 50;\n' }, branch: 'main', begun: null });
  writeConfig(io, { protect: ['src/**'] });
  await handlers.start(starting('a1'), io);
  io.session = 'a1';
  await hears(io, 'Kargo ücreti 100 TL olsun.');
  const fix = (title, records) => verbs.create(io, { rest: [wire({ title, level: 'micro', records: [{ ...planned, to: `file:src/${title}.js` }, ...records] })] });
  const note = 'note: this plan holds no decision of the person. Where their message set a value';
  const [bare, stated] = [await fix('yazim', []), await fix('ucret', [feeOf('100 TL', { said: 'Kargo ücreti 100 TL olsun.' })])];
  assert.deepEqual(stated.out.theirs, [{ key: 'kargo.ucreti', said: 'Kargo ücreti 100 TL olsun.' }], 'their words, in a small fix, with no question asked');
  await hears(io, 'Onaylıyorum.');
  const yes = { t: 'confirm', by: '', said: 'Onaylıyorum.' };
  const [statedReady, bareReady] = [await added(io, stated.out.id, yes), await added(io, bare.out.id, yes)];
  assert.deepEqual([bareReady.out.state.ready, bareReady.text.includes(note)], [true, true], bareReady.text);
  assert.deepEqual([statedReady.out.state.ready, statedReady.text.includes('note: ')], [true, false], statedReady.text);
  assert.ok(!(await verbs.ready(io, { rest: [bare.out.id] })).text.includes('note: '), 'said when it is made READY, never again');
});

test('whose a plan is has one answer: a teammate made it and no session here took it up; the person\'s yes here takes it up', async () => {
  const { io, id, sent, last } = await feeClone(ALI);
  assert.match(await sent(verbs.close(io, { rest: [id] })), /^plan-close-theirs: /, 'not taken up: a teammate\'s');
  await hears(io, 'Evet, bu planla devam et.');
  assert.equal(await sent(added(io, id, { t: 'confirm', by: '', said: 'Evet, bu planla devam et.' })), 'plan-recorded');
  assert.equal(await sent(verbs.close(io, { rest: [id] })), 'plan-closed', 'taken up here by the person\'s yes: this clone\'s work');
  assert.equal(last().by, 'ai');
});

test('a record an AI adds to a teammate\'s plan takes nothing up: its close stays refused; no home opens it either', async () => {
  const { io, id, sent, last } = await feeClone(ALI);
  const read = { t: 'research', tool: 'read', asked: 'the fee', answer: 'one constant', source: `${FILE}:1` };
  assert.equal(await sent(added(io, id, read)), 'plan-recorded', 'the plan is READY as before, and the AI wrote under it');
  assert.match(await sent(verbs.close(io, { rest: [id] })), /^plan-close-theirs: /, 'no yes of the person here: still a teammate\'s');
  assert.equal(last().t, 'research');
  const homeless = await feeClone(ALI, { home: null }); // no home folder: no yes can be kept here, so git alone says whose it is
  assert.match(await homeless.sent(verbs.close(homeless.io, { rest: [homeless.id] })), /^plan-close-theirs: /);
});

test('a mail that differs only in its letters\' case is the same author, as git reads it', async () => {
  const { io, id, sent } = await feeClone(ZEYNEP);
  io.git.me = async () => ZEYNEP.mail.toUpperCase();
  assert.equal(await sent(verbs.close(io, { rest: [id] })), 'plan-closed', 'her own plan');
});
