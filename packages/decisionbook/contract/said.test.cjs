// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The person's own AI decides what they meant and records it; the product checks one thing on a record made as the person's: its
// `said` is whole clauses of a message they typed in this session. Replace or keep is the AI's reading, said in `supersedes` or `keeps`.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { paths: { hereKey } } = require('@atlasbound/kit');
const { bookWorld, writeConfig, wire, planRecords, logFile, starting, theirAnswer, stateOf, editEvent, ruling, sentBy } = require('./world.cjs');
const { REPLIES, oneWordChanged } = require('./replies.cjs');

const { verbs, handlers } = decisionbook;
const LESSON = 'lessons/orbit.html';
const HEAD = { why: 'the lesson needs it', success: 'the calculator shows it', kind: 'feature', level: 'micro' };
const DRAFT = [{ t: 'research', tool: 'read', asked: 'the presets', answer: 'a PRE list', source: `${LESSON}:1` },
  { t: 'item', kind: 'precedent', text: 'the PRE list' }, { t: 'link', rel: 'plans', to: `file:${LESSON}`, why: 'the calculator' },
  { t: 'check', id: 'AC-1', text: 'it shows', command: 'node --check x' }];
const jupiterAsk = (q, decides, text, proposal, more = {}) => ({ t: 'question', q, text, decides, whyNotCode: 'a product choice', blocking: true, proposal, ...more });
const OLD = 'Sadece Dünya, Venüs ve Mars.';
const NEW = 'Dünya, Venüs, Mars ve Jüpiter.';

/** A teammate's READY plan on another branch holds the person's decisions `inputs` and `range`; then an AI session on this branch
 * (`home`: null, no home folder) where the person typed the task. `asks` are the new plan's questions; `leaves`: the old keys its
 * non-goal says the change leaves as they are (a key it asks to replace or keep is placed by the person's answer instead). */
async function saidWorld({ home, asks = [jupiterAsk('Q1', 'calc.presets', 'Jüpiter eklensin mi?', NEW)], before = [], olds = [],
  leaves = ['inputs', 'range', ...olds.map((d) => d.key)] } = {}) {
  const io = bookWorld({ files: { [LESSON]: 'a\nb\n' }, branch: 'master', ...(home === null && { home: null, begun: null }) });
  writeConfig(io, { protect: ['lessons/**'] });
  const old = (await verbs.create(io, { rest: [wire({ ...HEAD, title: 'Hohmann calculator', records: [...DRAFT,
    { t: 'decision', key: 'inputs', value: OLD, why: 'scope', by: 'Elif', said: OLD }, { t: 'decision', key: 'range', value: '0.4–5 AU', why: 'scope', by: 'Elif' },
    ...olds, { t: 'confirm', by: 'Elif', said: 'yes' }] })] })).out.id;
  io.state.branch = 'lesson-change';
  await handlers.start(starting('s1'), io);
  io.session = 's1';
  const say = (prompt, session = 's1') => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: session, prompt }, io);
  for (const said of ['Hesaplayıcıya Jüpiter ön ayarını ekle.', ...before]) await say(said); // the task, and what they typed before the plan
  const ref = `${old}/inputs`;
  const left = { t: 'item', kind: 'non-goal', text: 'the presets are their own key', covers: leaves.map((key) => `${old}/${key}`) };
  const id = (await verbs.create(io, { rest: [wire({ ...HEAD, title: 'Jupiter preset', records: [...DRAFT, ...asks, ...(leaves.length ? [left] : [])] })] }))
    .out.id;
  const add = (records) => verbs.add(io, { rest: [id, wire(records)] });
  const bytes = () => io.fs.readText(logFile(id));
  const refused = async (records) => {
    const before = bytes();
    const code = await add(records).then(() => null, (err) => [err.code, err.message]);
    assert.equal(bytes(), before, 'nothing written');
    return code;
  };
  const decided = () => planRecords(io, id).filter((r) => r.t === 'decision');
  const states = async (key = 'inputs') => (await verbs.show(io, { rest: [`decision:${key}`] })).out.decisions.filter((d) => d.state !== 'revised')
    .map((d) => [d.plan === old ? 'old' : 'new', d.state, d.meets.length]);
  const edit = async () => ruling(await handlers.preEdit({ ...editEvent(LESSON), session_id: 's1' }, io));
  return { io, old, id, ref, say, add, refused, decided, states, edit };
}
const inputsAnswer = (said, more = {}) => ({ ...theirAnswer('Q1', 'inputs', NEW, said), ...more });
const confirms = (w) => planRecords(w.io, w.id).filter((r) => r.t === 'confirm').length;

test('a reply is recorded as the person\'s in one add with the AI\'s value, and the product\'s confirm makes it READY', async () => {
  for (const said of ['Tamam, devam.', 'Önerilerini kabul ediyorum.']) {
    const w = await saidWorld();
    assert.deepEqual(await w.edit(), ['deny', 'plan-draft-here']);
    await w.say(said);
    const res = await w.add([theirAnswer('Q1', 'calc.presets', NEW, said)]);
    assert.deepEqual(w.decided().map((d) => [d.by, d.value, d.said]), [['the person', NEW, said]], 'the value as the AI sent it, their words beside it');
    assert.deepEqual([confirms(w), stateOf(res), await w.edit()], [1, 'READY', ['allow', 'gate-in-scope']]);
    assert.deepEqual(res.out.theirs, [{ key: 'calc.presets', said }]);
    assert.ok(res.text.includes(`recorded as the person's: calc.presets: "${said}"`), res.text);
  }
});

/** `w`'s plan asks Q1 (and `more` questions) naming the standing decisions `refs` as what it asks the person to replace. */
const askToReplace = (w, refs = [w.ref], more = []) => w.add([{ ...jupiterAsk('Q1', 'calc.presets', 'Eski kararı değiştirelim mi?', NEW), supersedes: refs }, ...more]);

test('a reply that replaces names the old decision in supersedes, with or without a question that named it', async () => {
  const named = await saidWorld({ asks: [] });
  await askToReplace(named);
  for (const [w, said] of [[named, 'Evet, Jüpiter eklensin.'], [await saidWorld(), 'Evet, eski kararı değiştiriyorum: Jüpiter düğmesi olmasın.']]) {
    await w.say(`1. ${said}`);
    const res = await w.add([inputsAnswer(said, { supersedes: [w.ref] })]);
    assert.deepEqual([w.decided().map((d) => [d.by, d.supersedes]), stateOf(res)], [[['the person', [w.ref]]], 'READY']);
    assert.deepEqual(await w.states(), [['old', 'superseded', 0], ['new', 'active', 0]], 'one live decision of the key');
    assert.ok(res.text.includes(`recorded as the person's: inputs: "${said}", replaces ${w.ref}`), res.text);
  }
});

test('a keep holds the plan until their yes: neither a yes recorded before it nor another blocking answer after it makes READY', async () => {
  const w = await saidWorld({ asks: [] });
  await askToReplace(w, [w.ref], [jupiterAsk('Q2', 'calc.color', 'Hangi renk?', 'turuncu')]);
  await w.say('Evet, uygula.');
  await w.add([{ t: 'confirm', by: '', said: 'Evet, uygula.' }]); // the yes first, a keep in a later message after it
  await w.say('Eski karar kalsın.');
  await w.add([inputsAnswer('Eski karar kalsın.', { value: OLD, keeps: [w.ref] })]);
  await w.say('Renk turuncu olsun.');
  const later = await w.add([theirAnswer('Q2', 'calc.color', 'turuncu', 'Renk turuncu olsun.')]);
  assert.deepEqual([stateOf(later), await w.edit()], ['ready-no-confirm', ['deny', 'plan-draft-here']], 'a keep waits for their yes in words');
});

test('a keep after a replace takes it back: the old decision stands again, and the READY plan covers no edit until their yes', async () => {
  const w = await saidWorld({ asks: [] });
  await askToReplace(w);
  await w.say('Evet, Jüpiter eklensin.');
  assert.equal(stateOf(await w.add([inputsAnswer('Evet, Jüpiter eklensin.', { supersedes: [w.ref] })])), 'READY');
  await w.say('Hayır, eski karar kalsın.');
  await w.add([inputsAnswer('Hayır, eski karar kalsın.', { value: OLD, keeps: [w.ref] })]);
  assert.deepEqual([await w.states(), await w.edit()], [[['old', 'active', 0], ['new', 'kept', 0]], ['deny', 'plan-yes-taken']]);
  // the session's start and the inbox read the gate's own answer: held, never "edits pass in silence"
  const told = async () => [(await verbs.resume(w.io, {})).text, (await verbs.inbox(w.io, {})).text];
  const [start, inbox] = await told();
  assert.ok(start.includes('READY, held: their yes was taken back,') && !start.includes('pass in silence'), start);
  assert.ok(inbox.includes('READY, held: their yes was taken back, not closed'), inbox);
  await w.say('Evet, böyle devam et.');
  await w.add([{ t: 'confirm', by: '', said: 'Evet, böyle devam et.' }]);
  assert.deepEqual(await w.edit(), ['allow', 'gate-in-scope']);
  const [freed, counted] = await told();
  assert.ok(freed.includes('pass in silence') && !counted.includes('held'), 'their yes again frees it in every reader');
});

test('a keep written after the yes takes it back: where only a decision named the kept line, and in the yes\'s word typed again', async () => {
  const replaced = 'Evet, eski kararı değiştiriyorum: Jüpiter düğmesi olmasın.';
  const named = await saidWorld(); // no question names the old decision: the plan's own decision is what was to replace it
  await named.say(`1. ${replaced}`);
  assert.equal(stateOf(await named.add([inputsAnswer(replaced, { supersedes: [named.ref] })])), 'READY');
  await named.say('Hayır, eski karar kalsın.');
  await named.add([inputsAnswer('Hayır, eski karar kalsın.', { value: OLD, keeps: [named.ref] })]);
  const twice = await saidWorld({ asks: [] }); // "Tamam." answers the replace; a later "Tamam." settles the AI's proposal to keep after all
  await askToReplace(twice);
  await twice.say('Tamam.');
  assert.equal(stateOf(await twice.add([inputsAnswer('Tamam.', { supersedes: [twice.ref] })])), 'READY');
  await twice.say('Tamam.');
  assert.equal(stateOf(await twice.add([inputsAnswer('Tamam.', { value: OLD, keeps: [twice.ref] })])), 'ready-no-confirm');
  assert.deepEqual([await named.edit(), await twice.edit()], [['deny', 'plan-yes-taken'], ['deny', 'plan-yes-taken']]);
});

test('a keep and a replace of one decision, merged from two copies of the plan, are a conflict in either order', async () => {
  for (const order of [[0, 1], [1, 0]]) {
    const w = await saidWorld({ asks: [] });
    await askToReplace(w);
    const base = w.io.fs.readText(logFile(w.id));
    const sides = [];
    for (const [said, more] of [['Evet, Jüpiter eklensin.', { supersedes: [w.ref] }], ['Hayır, eski karar kalsın.', { value: OLD, keeps: [w.ref] }]]) {
      w.io.fs.writeAtomic(logFile(w.id), base);
      await w.say(said);
      await w.add([inputsAnswer(said, more)]);
      sides.push(w.io.fs.readText(logFile(w.id)).slice(base.length));
    }
    w.io.fs.writeAtomic(logFile(w.id), base + order.map((i) => sides[i]).join(''));
    assert.ok((await verbs.show(w.io, { rest: [w.id, 'decisions'] })).text.includes('CONFLICT ('), `${order}`);
    assert.deepEqual(await w.edit(), ['deny', 'plan-conflict'], `${order}`);
  }
});

test('an answer to a question that names decisions places each one in supersedes or keeps, never both', async () => {
  const [w, said] = [await saidWorld({ asks: [] }), 'Evet, eski karar kalsın.'];
  await askToReplace(w);
  await w.say(said);
  assert.equal((await w.refused([inputsAnswer(said, {})]))[0], 'replace-unplaced', 'placed nowhere');
  assert.equal((await w.refused([inputsAnswer(said, { supersedes: [w.ref], keeps: [w.ref] })]))[0], 'placed-twice', 'nor in both');
  assert.match((await w.refused([inputsAnswer(said, {})]))[1], /"supersedes":\["<ref>"\] where their answer replaces it, "keeps":\["<ref>"\] where they keep it/u);
  assert.equal((await w.refused([inputsAnswer(said, { supersedes: [w.ref, 'decision:inputs'] })]))[0], 'supersede-unknown', 'read as a keep is');
});

const keepOf = (key, said, keeps, more = {}) => ({ t: 'decision', key, value: 'outputs kalsın', why: 'kept', by: 'the person', said,
  answers: 'Q1', keeps, ...more });
test('a keep, its question naming the decision or not, needs no effect, replaces nothing and is no yes', async () => {
  for (const [decides, key, said, named] of [['outputs.faz-acisi', 'outputs.faz-acisi', 'Evet, eski karar kalsın.'],
    ['hesaplayici.outputs', 'outputs-keep', 'Hayır, değiştirme.'], ['outputs', 'outputs.faz-acisi', 'Evet, eski karar kalsın.', true]]) {
    const w = await saidWorld({ olds: [{ t: 'decision', key: 'outputs', value: 'faz açısı', why: 'scope', by: 'Elif' }], asks: [], before: [said] });
    const ref = `${w.old}/outputs`;
    await w.add([{ ...jupiterAsk('Q1', decides, 'Faz açısı kalksın mı?', 'kaldır'), ...(named && { supersedes: [ref] }) }]);
    assert.match((await w.refused([keepOf(key, said, ['decision:outputs'])])).join(' '), /^supersede-unknown .*decision:outputs: .*<plan id>\/<key>/u);
    assert.match((await w.refused([keepOf(key, said, [ref], { by: 'ai' })])).join(' '), /^keep-theirs (?!.*asks the person)/u);
    const kept = await w.add([keepOf(key, said, [ref])]);
    assert.deepEqual([w.decided().map((d) => [d.by, d.said, d.keeps, d.supersedes ?? []]), confirms(w), stateOf(kept), await w.edit(),
      kept.text.includes(`, keeps ${ref}`)], [[['the person', said, [ref], []]], 0, 'ready-no-confirm', ['deny', 'plan-draft-here'], true]);
    await w.say('Tamam, böyle devam.');
    const yes = await w.add([{ t: 'confirm', by: '', said: 'Tamam, böyle devam.' }]);
    assert.deepEqual([stateOf(yes), await w.states('outputs'), await w.states(key)], ['READY', [['old', 'active', 0]], [['new', 'kept', 0]]]);
  }
});

test('a decision that keeps one standing decision and replaces another stands beside the kept one with no conflict', async () => {
  const w = await saidWorld({ asks: [] });
  const range = `${w.old}/range`;
  await askToReplace(w, [w.ref, range]);
  await w.say('Ön ayarlar kalsın, aralık değişsin.');
  const res = await w.add([{ ...theirAnswer('Q1', 'inputs', OLD, 'Ön ayarlar kalsın, aralık değişsin.'), supersedes: [range], keeps: [w.ref] }]);
  assert.deepEqual([stateOf(res), await w.states(), await w.states('range')], ['READY', [['old', 'active', 0], ['new', 'active', 0]], [['old', 'superseded', 0]]],
    'the kept decision of its own key is no rival');
});

test('words the person did not type in this session are refused, and nothing is written', async () => {
  const w = await saidWorld();
  await w.say('Önerilerini kabl ediyrum.'); // their typo stands: a corrected word is not theirs
  await w.say('Başka bir oturumda evet dedim.', 's2');
  for (const said of ['Evet, Jüpiter eklensin.', 'Önerilerini kabul ediyorum.', 'Başka bir oturumda evet dedim.']) {
    const [code, message] = await w.refused([theirAnswer('Q1', 'calc.presets', NEW, said)]);
    assert.deepEqual([code, message.includes('whole clauses of a message they typed in this session')], ['said-not-theirs', true], message);
  }
  w.io.session = 's3'; // a session the product holds no message of
  assert.match((await w.refused([theirAnswer('Q1', 'calc.presets', NEW, 'Önerilerini kabl ediyrum.')]))[1], /could not see a person's message/u);
  const homeless = await saidWorld({ home: null });
  assert.equal((await homeless.refused([theirAnswer('Q1', 'calc.presets', NEW, 'Hesaplayıcıya Jüpiter ön ayarını ekle.')]))[0], 'said-not-theirs');
});

test('words from before the plan answer its question, but its yes and a waiver come only from a message after it', async () => {
  const early = 'Evet, Jüpiter eklensin.'; // the live shape: the AI asked in chat, they answered before the plan was written
  const [w, answer] = [await saidWorld({ before: [early] }), theirAnswer('Q1', 'calc.presets', NEW, early)];
  assert.match((await w.refused([answer, { t: 'confirm', by: 'Ayşe', said: early }]))[1], /^confirm-not-asked: .*again now without the confirm/u);
  const res = await w.add([answer]); // sent again as the refusal says: their own sentence stays on the record
  assert.deepEqual([w.decided().map((d) => [d.by, d.said]), confirms(w), stateOf(res)], [[['the person', early]], 0, 'ready-no-confirm']);
  await w.say('Evet, devam.');
  assert.equal((await w.refused([{ t: 'confirm', by: 'Ayşe', said: early }]))[0], 'said-not-theirs');
  assert.equal((await w.refused([{ t: 'waiver', reason: 'small', by: 'Ayşe', said: early }]))[0], 'said-not-theirs');
  assert.equal(stateOf(await w.add([{ t: 'confirm', by: 'Ayşe', said: 'Evet, devam.' }])), 'READY');
});

test('the person sets a plan aside in their own words with no question asked first; invented words are refused', async () => {
  const w = await saidWorld();
  await w.say('Bu planı bir kenara bırak.');
  assert.equal((await w.refused([{ t: 'aside', by: '', said: 'Bu planı kenara koy.' }]))[0], 'aside-not-asked');
  await w.add([{ t: 'aside', by: '', said: 'Bu planı bir kenara bırak.' }]);
  assert.deepEqual(planRecords(w.io, w.id).filter((r) => r.t === 'aside').map((r) => r.by), ['the person']);
});

test('an AI decision cannot replace a person\'s; a person\'s beside one of the same key waits for the replace question\'s answer', async () => {
  const w = await saidWorld();
  const own = { t: 'decision', key: 'inputs', value: NEW, why: 'mine', by: 'ai', supersedes: [w.ref], effect: ['check:AC-1'] };
  assert.equal((await w.refused([own]))[0], 'supersede-theirs');
  await w.say('Evet, Jüpiter eklensin.');
  const beside = await w.add([inputsAnswer('Evet, Jüpiter eklensin.')]);
  assert.equal(stateOf(beside), 'ready-replace-unasked');
  assert.ok(beside.text.includes('CONFLICT (2 person decisions across plans') && beside.text.includes(`"${OLD}"`), beside.text);
  assert.equal((await w.refused([inputsAnswer('Evet, Jüpiter eklensin.', { supersedes: [w.ref] })]))[0], 'conflict-unasked', 'not asked');
  await askToReplace(w);
  await w.say('Evet, eski kararı değiştiriyorum.');
  const again = await w.add([inputsAnswer('Evet, eski kararı değiştiriyorum.', { supersedes: [w.ref] })]);
  assert.deepEqual([stateOf(again), await w.states()], ['READY', [['old', 'superseded', 0], ['new', 'active', 0]]]);
});

test('saidBy stays on a person\'s decision and goes from the AI\'s, and a stored said is cut at 500 characters to a word', async () => {
  const w = await saidWorld({ asks: [jupiterAsk('Q1', 'calc.presets', 'Jüpiter?', NEW), jupiterAsk('Q2', 'calc.color', 'Renk?', 'turuncu', { blocking: false })] });
  const long = `Evet ${'Jüpiter de eklensin ve '.repeat(30)}tamam`;
  await w.say(long);
  await w.add([{ ...theirAnswer('Q1', 'calc.presets', NEW, long), saidBy: 'Elif' },
    { t: 'decision', key: 'calc.color', value: 'turuncu', why: 'mine', by: 'ai', answers: 'Q2', saidBy: 'Elif', effect: ['check:AC-1'] }]);
  const [theirs, ai] = w.decided();
  assert.deepEqual([theirs.saidBy, ai.saidBy, ai.by], ['Elif', undefined, 'ai']);
  assert.ok(theirs.said.length <= 500 && theirs.said.endsWith('~') && long.startsWith(theirs.said.slice(0, -1).trimEnd()), theirs.said);
  const yes = planRecords(w.io, w.id).find((r) => r.t === 'confirm');
  assert.ok(yes.said.length <= 500, 'the product\'s own confirm is bounded the same way');
});

test('the prompt hook keeps no word of the person\'s message and says nothing about answers', async () => {
  const w = await saidWorld();
  const told = await w.say('Tamam, zebercet rengi olsun.');
  assert.deepEqual([told.code, (told.say ?? []).map((s) => s.key)], ['prompt-earlier', ['decisionbook.start']], 'what any prompt gets, no answer line');
  const rows = (w.io.home.list(hereKey(w.io.root, 'decisionbook')) || [])
    .map((name) => w.io.home.readText(hereKey(w.io.root, 'decisionbook', name)) || '').join('\n');
  assert.ok(rows.includes('"t":"prompt"') && !/zebercet/iu.test(rows), 'the row holds a flag, a time and digests');
});

test('replies people type are their answers verbatim and are refused with one word changed', async () => {
  for (const said of REPLIES) {
    const w = await saidWorld();
    await w.say(said);
    assert.equal((await w.refused([theirAnswer('Q1', 'calc.presets', NEW, oneWordChanged(said))]))?.[0], 'said-not-theirs', said);
    await w.add([theirAnswer('Q1', 'calc.presets', NEW, said)]);
    assert.deepEqual(w.decided().map((d) => d.by), ['the person'], said);
  }
});

test('a question parked with the person is answered only in their typed words; no parked answer replaces or rivals theirs', async () => {
  const w = await saidWorld();
  const parked = (to) => ({ t: 'question', q: 'Q9', text: 'Renk?', decides: 'calc.color', whyNotCode: 'taste', to, source: 'chat' });
  const answer = (said, more = {}) => ({ ...theirAnswer('Q9', 'calc.color', 'mor', said), source: 'chat', ...more });
  await w.add([parked('the person')]);
  assert.equal((await w.refused([answer('Mor olsun, bunu hiç yazmadım.')]))[0], 'said-not-theirs');
  await w.say('Mor olsun.');
  await w.add([answer('Mor olsun.')]);
  assert.deepEqual(w.decided().at(-1).by, 'the person');
  await w.add([parked('Bora (PM)')]);
  assert.equal((await w.refused([answer('Bora: mor.', { supersedes: [w.ref] })]))[0], 'supersede-theirs', 'a colleague\'s answer replaces no person\'s');
  assert.equal((await w.refused([answer('Bora: mor değil, mavi.', { value: 'mavi' })]))[0], 'decision-theirs', 'nor stands beside it as a rival');
  assert.equal((await w.refused([{ t: 'decision', key: 'inputs', value: NEW, why: 'mine', by: 'ai', keeps: [w.ref], effect: ['check:AC-1'] }]))[0],
    'keep-theirs', 'keeps is the person\'s answer only');
});

test('a keep is no yes the product writes; the AI may record the yes from the keep\'s own message, in one write or after', async () => {
  for (const shape of ['after', 'yes first', 'keep first']) {
    const w = await saidWorld({ asks: [] });
    await askToReplace(w);
    const handed = sentBy((await verbs.ready(w.io, { rest: [w.id] })).text, `add ${w.id}`);
    assert.deepEqual(handed.map((r) => r.t), ['decision'], 'their answer first; their yes only once they have seen what a keep does');
    await w.say('Hepsi olur, devam et.');
    const [keep, yes] = [inputsAnswer('Hepsi olur, devam et.', { value: OLD, keeps: [w.ref] }), { t: 'confirm', by: '', said: 'Hepsi olur, devam et.' }];
    if (shape === 'after') assert.equal(stateOf(await w.add([keep])), 'ready-no-confirm', 'no yes of the product\'s from a keep');
    const res = await w.add({ after: [yes], 'yes first': [yes, keep], 'keep first': [keep, yes] }[shape]);
    assert.deepEqual([stateOf(res), await w.edit()], ['READY', ['allow', 'gate-in-scope']], shape);
  }
});

test('the product\'s own confirm comes only from answers typed after the plan: task words sent again wait for a yes', async () => {
  const w = await saidWorld();
  const task = 'Hesaplayıcıya Jüpiter ön ayarını ekle.';
  await w.add([theirAnswer('Q1', 'calc.presets', NEW, task)]);
  await w.say('Dur, bekle.');
  const again = await w.add([theirAnswer('Q1', 'calc.presets', NEW, task)]);
  assert.deepEqual([confirms(w), stateOf(again)], [0, 'ready-no-confirm']);
});

test('a kept answer is no standing decision of its own: the area\'s cards list the decision it keeps once', async () => {
  const w = await saidWorld({ asks: [] });
  await askToReplace(w);
  await w.say('Evet, eski karar kalsın.');
  await w.add([inputsAnswer('Evet, eski karar kalsın.', { value: OLD, keeps: [w.ref] })]);
  await w.say('Tamam, böyle devam.');
  await w.add([{ t: 'confirm', by: 'Ayşe', said: 'Tamam, böyle devam.' }]);
  w.io.state.branch = 'next-work'; // a later branch's cards: both plans of the lesson
  const card = (await verbs.related(w.io, { rest: [LESSON] })).text;
  assert.equal(card.split(`inputs = ${OLD}`).length - 1, 1, card);
});
