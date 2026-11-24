// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Two people's plans on two branches each replace one old person decision (the text of a line on the home page), and the branches
// merge: the two new person decisions stand in two plans, a conflict across plans. Every reader names it like a conflict in one plan
// (who, words, line, none holds), both plans are held (not READY, the gate denies), and the person's answer must name every line of
// it: an answer that names one is refused with the full list (it would make a new conflict), one that names both ends it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verbs, handlers, debug, answers } = require('@atlasbound/decisionbook');
const { bookWorld, writeConfig, begin, added, logFile, editEvent, waitsForAnswer, starting, planRecords } = require('./world.cjs');

const FILE = 'index.html';
const KEY = 'metin.bicimi';
const OLD = 'Son güncelleme: 19 Kasım 2026';
const updateAsk = (supersedes = []) => ({ t: 'question', q: 'Q1', text: 'Which words does the update line use?', decides: KEY, whyNotCode: 'wording',
  proposal: 'as asked', blocking: true, supersedes });
const personSaid = (value, said, supersedes, key = KEY) => ({ t: 'decision', key, value, why: 'their words', whose: 'person', said, answers: 'Q1',
  effect: [`file:${FILE}`], supersedes });
const pagePlan = async (io, title, records) => {
  const id = await begin(io, { title, level: 'micro' });
  await added(io, id, [{ t: 'research', tool: 'read', asked: 'the page', answer: 'a footer line', source: `${FILE}:1` },
    { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the page' }, ...records, { t: 'confirm', by: 'Amy', said: 'yes' }]);
  return id;
};
const pageWorld = () => {
  const io = bookWorld({ files: { [FILE]: 'a\n' }, branch: 'main' });
  writeConfig(io, { protect: ['index.html'] });
  return io;
};

/** The old plan, then plan A on one copy and plan B on another, both files kept by the merge. */
async function mergedPlans(keyOfA = KEY) {
  const [io, other] = [pageWorld(), pageWorld()];
  const old = await pagePlan(io, 'Add the last update line', [updateAsk(), personSaid(OLD, OLD, [])]);
  await pagePlan(other, 'Add the last update line', [updateAsk(), personSaid(OLD, OLD, [])]);
  const a = await pagePlan(io, 'Last update text as a date', [updateAsk([`${old}/${KEY}`]),
    personSaid('Güncellendi: 19.11.2026', 'Hepsi olur, devam et.', [`${old}/${KEY}`], keyOfA)]);
  const b = await pagePlan(other, 'Last update text in words', [updateAsk([`${old}/${KEY}`]),
    personSaid('Son değişiklik: 19 Kasım 2026', 'Evet, eski kararı değiştiriyorum.', [`${old}/${KEY}`])]);
  io.fs.writeAtomic(logFile(b), other.fs.readText(logFile(b)));
  return { io, a, b };
}

test('a conflict across plans: every reader names it like one in a plan, and both plans are held', async () => {
  const { io, a, b } = await mergedPlans();
  const across = 'CONFLICT (2 person decisions across plans, none replacing another; none holds until the person says which)';
  for (const [verb, rest] of [['show', [`decision:${KEY}`]], ['show', [a, 'decisions']], ['show', [b, 'decisions']], ['pr', [a]], ['inbox', []]]) {
    const text = (await verbs[verb](io, { rest })).text;
    for (const part of [across, `of ${a}, by Amy: "Hepsi olur, devam et."`, `of ${b}, by Amy: "Evet, eski kararı değiştiriyorum."`,
      `record the replace question first ({"t":"question","supersedes":${JSON.stringify([`${a}/${KEY}`, `${b}/${KEY}`].sort())}})`,
      `record the answer they type after it there, under "${KEY}": it names every line, in "supersedes", or the one line whose decision they take as it is in "keeps", its value copied as this answer's (words typed before that question is on record are refused)`]) assert.ok(text.includes(part), `${verb} ${rest}: ${part}\n${text}`);
    assert.doesNotMatch(text, /metin\.bicimi = (Güncellendi|Son değişiklik)/, `${verb}: no line holds`);
  }
  const inbox = await verbs.inbox(io, {});
  assert.deepEqual([inbox.out.here.filter((row) => row.conflict).map((row) => row.id), inbox.text.split('\n')[0]],
    [[a], 'Waiting for you on main: open questions 1, questions parked with someone 0, READY plans not closed 3, set aside 0'], `one conflict is one row and one question:\n${inbox.text}`);
  assert.deepEqual([await waitsForAnswer(io, a), await waitsForAnswer(io, b)], [true, true], 'neither plan is READY while it stands');
  assert.equal((await handlers.preEdit({ ...editEvent(FILE), session_id: 's1' }, io)).code, 'plan-conflict');
});

test('the person\'s answer names every line of the conflict: one that names only the other plan\'s is refused with the full list', async () => {
  const { io, a, b } = await mergedPlans();
  const answer = (supersedes) => added(io, a, { t: 'decision', key: KEY, value: 'Güncellendi: 19.11.2026 geçerli; \'Son değişiklik\' kalkar',
    why: 'their answer', whose: 'person',
    said: '\'Güncellendi: 19.11.2026\' geçerli olsun, \'Son değişiklik\' olan kalksın.', effect: [`file:${FILE}`], supersedes });
  const half = await answer([`${b}/${KEY}`]).then(() => null, (err) => err.message);
  assert.ok(half.startsWith('decision-unnamed: nothing written:') && half.includes(`${a}/${KEY}`) && half.includes(`${b}/${KEY}`), half);
  await answer([`${a}/${KEY}`, `${b}/${KEY}`]);
  const show = (await verbs.show(io, { rest: [`decision:${KEY}`] })).text;
  assert.ok(!show.includes('CONFLICT'), show);
  assert.deepEqual([await waitsForAnswer(io, a), await waitsForAnswer(io, b)], [false, false]);
});

test('two plans replacing one old decision under two key names are a conflict the same way: rivalry follows what was replaced', async () => {
  const { io, a, b } = await mergedPlans('metin');
  for (const id of [a, b]) {
    const text = (await verbs.show(io, { rest: [id, 'decisions'] })).text;
    for (const part of ['CONFLICT (2 person decisions', '"Hepsi olur, devam et."', '"Evet, eski kararı değiştiriyorum."']) assert.ok(text.includes(part), text);
  }
  assert.deepEqual([await waitsForAnswer(io, a), await waitsForAnswer(io, b)], [true, true]);
  assert.equal((await handlers.preEdit({ ...editEvent(FILE), session_id: 's1' }, io)).code, 'plan-conflict');
});

/** The old plan, then on one copy a plan whose person keeps the old decision (under `keyOfKeep`), on another a plan whose person
 * replaces it; both files kept by the merge. */
async function keptAndReplaced(keyOfKeep, otherBranch = 'main') {
  const [io, other] = [pageWorld(), pageWorld()];
  const old = await pagePlan(io, 'Add the last update line', [updateAsk(), personSaid(OLD, OLD, [])]);
  await pagePlan(other, 'Add the last update line', [updateAsk(), personSaid(OLD, OLD, [])]);
  const ref = `${old}/${KEY}`;
  const keep = { t: 'decision', key: keyOfKeep, value: OLD, why: 'their words', whose: 'person', said: 'Kalsın, devam et.', answers: 'Q1',
    effect: [`file:${FILE}`], keeps: [ref] };
  const a = await pagePlan(io, 'Keep the update line', [updateAsk([ref]), keep]);
  other.state.branch = otherBranch;
  const b = await pagePlan(other, 'Change the update line', [updateAsk([ref]), personSaid('Son değişiklik: 19 Kasım 2026', 'Evet, değiştir.', [ref])]);
  io.fs.writeAtomic(logFile(b), other.fs.readText(logFile(b)));
  return { io, a, b, old, keyOfKeep };
}

test('one person keeps an old decision, another replaces it, two plans merged: a conflict in every reader, one key or two', async () => {
  for (const keyOfKeep of [KEY, 'metin']) {
    const { io, a, b } = await keptAndReplaced(keyOfKeep);
    for (const [verb, rest] of [['show', [`decision:${KEY}`]], ['show', [a, 'decisions']], ['show', [b, 'decisions']], ['pr', [b]], ['inbox', []]]) {
      const text = (await verbs[verb](io, { rest })).text;
      for (const part of ['CONFLICT (2 person decisions across plans', `of ${a}, by Amy: "Kalsın, devam et."`,
        `of ${b}, by Amy: "Evet, değiştir."`]) assert.ok(text.includes(part), `${keyOfKeep} ${verb} ${rest}: ${part}\n${text}`);
    }
    assert.deepEqual([await waitsForAnswer(io, a), await waitsForAnswer(io, b)], [true, true], `${keyOfKeep}: neither plan holds while it stands`);
    const gate = await handlers.preEdit({ ...editEvent(FILE), session_id: 's1' }, io);
    assert.equal(gate.code, 'plan-conflict', keyOfKeep);
    for (const key of new Set([KEY, keyOfKeep])) assert.match(gate.reason, new RegExp(`under ("[^"]+" or )?"${key}"`), `the reason names the key ${key}`);
    await added(io, b, { t: 'decision', key: KEY, value: 'Son değişiklik: 19 Kasım 2026', why: 'their answer', whose: 'person',
      said: 'Değişsin.', effect: [`file:${FILE}`], supersedes: [`${a}/${keyOfKeep}`, `${b}/${KEY}`] });
    assert.ok(!(await verbs.show(io, { rest: [`decision:${KEY}`] })).text.includes('CONFLICT'), `${keyOfKeep}: the person's answer naming both ends it`);
    assert.deepEqual([await waitsForAnswer(io, a), await waitsForAnswer(io, b)], [false, false], keyOfKeep);
  }
});

test('in one copy, replacing a decision a person keeps names their keep too, so a write never makes the conflict a merge would', async () => {
  const io = pageWorld();
  const old = await pagePlan(io, 'Add the last update line', [updateAsk(), personSaid(OLD, OLD, [])]);
  const ref = `${old}/${KEY}`;
  const a = await pagePlan(io, 'Keep the update line', [updateAsk([ref]), { t: 'decision', key: 'metin', value: OLD, why: 'their words',
    whose: 'person', said: 'Kalsın.', answers: 'Q1', effect: [`file:${FILE}`], keeps: [ref] }]);
  const change = (supersedes) => pagePlan(io, 'Change the update line', [updateAsk(supersedes), personSaid('Son değişiklik', 'Değiştir.', supersedes)]);
  const half = await change([ref]).then(() => null, (err) => err.message);
  assert.ok(half && half.includes('decision-unnamed') && half.includes(`${a}/metin`), half);
  const b = await change([ref, `${a}/metin`]);
  assert.ok(!(await verbs.show(io, { rest: [b, 'decisions'] })).text.includes('CONFLICT'));
});

test('in a session no write ends a merged conflict but the answer to a question naming every line, whatever its key', async () => {
  const shapes = [['the keep side, under the keeper\'s key', async () => { const w = await keptAndReplaced('metin'); return { ...w, key: 'metin', on: w.a }; }],
    ['two replacements, a third key', async () => { const w = await mergedPlans('metin'); return { ...w, key: 'cikti', on: w.b }; }]];
  for (const [shape, made] of shapes) {
    const { io, a, b, key, on } = await made();
    await handlers.start(starting('s1'), io);
    io.session = 's1';
    const say = (prompt) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt }, io);
    const lines = [`${a}/metin`, `${b}/${KEY}`];
    const answer = (said, more = {}) => added(io, on, { t: 'decision', key, value: OLD, why: 'their answer', whose: 'person', said,
      effect: [`file:${FILE}`], supersedes: lines, ...more }).then(() => 'written', (err) => err.code);
    await say('Pull main and go on.');
    assert.equal(await answer('Pull main and go on.'), 'conflict-unasked', `${shape}: no question, any words`);
    await added(io, on, { ...updateAsk(lines), q: 'Q7', text: 'Two answers were merged: which update line holds?', decides: key });
    assert.equal(await answer('Pull main and go on.', { answers: 'Q7' }), 'conflict-unasked', `${shape}: their words from before the question`);
    assert.equal(await answer('Keep both lines.', { answers: 'Q7' }), 'said-not-theirs', `${shape}: words they never typed`);
    await say('Keep the old line.');
    assert.equal(await answer('Keep the old line.', { answers: 'Q7' }), 'written', `${shape}: their answer to it`);
    assert.ok(!(await verbs.show(io, { rest: [`decision:${KEY}`] })).text.includes('CONFLICT'), shape);
  }
});

test('a READY plan that edited and then lost a conflict is one open item in show, inbox, ready, the pack and the gate', async () => {
  const lostIn = async (io, id) => {
    const says = await Promise.all([verbs.show(io, { rest: [id] }), verbs.inbox(io, {}), verbs.pack(io, { rest: [FILE] }), verbs.resume(io, {})]);
    return says.map((s) => s.text.split('\n').find((l) => l.startsWith(`open: ${id} was built and edited`)) ?? null);
  };
  // the answer written into the losing plan under the losing key, so `<b>/<KEY>` names the line that lost and the one that holds
  const keep = (io, a, b) => added(io, b, { t: 'decision', key: KEY, value: OLD, why: 'their answer', whose: 'person',
    said: 'Eski karar kalsın.', effect: [`file:${FILE}`], supersedes: [`${a}/metin`, `${b}/${KEY}`] });
  const quiet = await keptAndReplaced('metin');
  await keep(quiet.io, quiet.a, quiet.b);
  assert.deepEqual(await lostIn(quiet.io, quiet.b), [null, null, null, null], 'the replacing plan made no edit: nothing to compare');
  const { io, a, b } = await keptAndReplaced('metin', 'y'); // the replacing plan on its own branch, READY there
  io.state.commits = [{ sha: 'c1', subject: 'remove the update line', body: '', files: [FILE], after: 'h0' }];
  io.state.branch = 'y';
  assert.deepEqual(await lostIn(io, b), [null, null, null, null], 'a conflict not yet answered is the conflict, not this item');
  await keep(io, a, b);
  const said = await lostIn(io, b);
  assert.ok(said[0] && said.every((line) => line === said[0]), `one line in every reader:\n${said.join('\n')}`);
  for (const part of [`${b}/${KEY}`, `"Son değişiklik: 19 Kasım 2026"`, `"${OLD}"`, FILE]) assert.ok(said[0].includes(part), part);
  const [, lostLine, heldLine, heldPlan] = said[0].match(/\(line (\d+): .* lost a conflict; line (\d+) of (\S+) holds now/);
  assert.ok(heldPlan === b && lostLine !== heldLine, `the line that lost and the one that holds are told apart:\n${said[0]}`);
  const records = planRecords(io, b).length;
  for (const run of [1, 2]) {
    const ready = (await verbs.ready(io, { rest: [b] })).text;
    assert.ok(ready.startsWith(`${b} covers no new edit: its decision lost a conflict`) && ready.includes(said[0]), `ready ${run}: ${ready}`);
    assert.ok(!ready.includes('pass in silence'), ready);
  }
  assert.equal(planRecords(io, b).length, records, 'ready on it stores nothing');
  assert.ok(!(await verbs.resume(io, {})).text.includes('pass in silence'), 'nor the session start');
  const gate = await handlers.preEdit({ ...editEvent(FILE), session_id: 's1' }, io);
  assert.deepEqual([gate.verdict, gate.code, gate.reason.includes(said[0])], ['deny', 'plan-lost', true], 'it covers no new edit');
  await pagePlan(io, 'Another change of the page', [{ ...updateAsk(), text: 'Which footer colour?', decides: 'footer' },
    personSaid('Footer colour', 'Grey.', [], 'footer')]);
  assert.deepEqual(await lostIn(io, b), said, 'another plan of its files, made READY, clears nothing');
  const added0 = (await added(io, b, { t: 'note', text: 'written while the item stands' })).text;
  assert.ok(added0.includes(said[0]) && !added0.includes('pass in silence'), `a write says the item too:\n${added0}`);
  const holding = said[0].match(/"to":"([^"]+)"/)[1];
  assert.match(holding, new RegExp(`^decision:${b}/${KEY}@`), 'the record to write names the line that holds, with its time');
  for (const to of [`decision:${b}/${KEY}`, `decision:${KEY}`, `decision:${a}/metin`]) {
    await added(io, b, { t: 'link', rel: 'compared', to, why: 'compared with another line', said: 'Kod eski satırı tutuyor.' });
    assert.deepEqual(await lostIn(io, b), said, `${to}: not the line that holds now`);
  }
  await assert.rejects(added(io, b, { t: 'link', rel: 'compared', to: holding, why: 'the line is back' }), { code: 'said-not-theirs' }, 'no answer');
  await added(io, b, { t: 'link', rel: 'compared', to: holding, why: 'the line is back in the page', said: 'Kod eski satırı tutuyor.' });
  assert.deepEqual(await lostIn(io, b), [null, null, null, null], 'cleared by the record that the code was compared with what holds');
  assert.ok((await verbs.ready(io, { rest: [b] })).text.includes('pass in silence'), 'and the plan reads as before');
});

test('a lost plan\'s item follows the line that holds now: the winner written again moves it, only its comparison clears it', async () => {
  const { io, a, b } = await keptAndReplaced('metin', 'y');
  io.state.commits = [{ sha: 'c1', subject: 'remove the update line', body: '', files: [FILE], after: 'h0' }];
  io.state.branch = 'y';
  const theirs = (value, said) => ({ t: 'decision', key: KEY, value, why: 'their answer', whose: 'person', said, effect: [`file:${FILE}`] });
  await added(io, b, { ...theirs(OLD, 'Eski karar kalsın.'), supersedes: [`${a}/metin`, `${b}/${KEY}`] });
  const item = async () => (await verbs.show(io, { rest: [b] })).text.split('\n').find((l) => l.startsWith(`open: ${b} was built and edited`)) ?? null;
  const toOf = (line) => line.match(/"to":"([^"]+)"/)[1];
  const first = await item();
  assert.ok(first.includes(`holds now ("${OLD}")`), first);
  const NEWER = 'Güncelleme: Kasım 2026';
  await added(io, b, { ...theirs(NEWER, 'Güncelleme: Kasım 2026 olsun.'), supersedes: [`${b}/${KEY}`] }); // the person changes what holds
  const moved = await item();
  assert.ok(moved.includes(`holds now ("${NEWER}")`) && toOf(moved) !== toOf(first), `the item names the line that holds now:\n${moved}`);
  await added(io, b, { t: 'link', rel: 'compared', to: toOf(first), why: 'compared with the line that held before', said: 'Baktım.' });
  assert.equal(await item(), moved, 'a comparison with the line that no longer holds clears nothing');
  const gate = await handlers.preEdit({ ...editEvent(FILE), session_id: 's1' }, io);
  assert.deepEqual([gate.verdict, gate.code], ['deny', 'plan-lost'], gate.reason);
  await added(io, b, { t: 'link', rel: 'compared', to: toOf(moved), why: 'the page says it', said: 'Baktım.' });
  assert.equal(await item(), null, 'cleared by the comparison with the line that holds now');
});

test('a plain change of a built plan\'s decision by a later plan is no lost conflict', async () => {
  const [io, other] = [pageWorld(), pageWorld()];
  io.state.commits = [{ sha: 'c1', subject: 'the update line', body: '', files: [FILE], after: 'h0' }];
  const old = await pagePlan(io, 'Add the last update line', [updateAsk(), personSaid(OLD, OLD, [])]);
  await pagePlan(other, 'Add the last update line', [updateAsk(), personSaid(OLD, OLD, [])]);
  const ref = `${old}/${KEY}`;
  await pagePlan(io, 'Change the update line', [updateAsk([ref]), personSaid('Son değişiklik', 'Değiştir.', [ref])]);
  for (const text of [(await verbs.show(io, { rest: [old] })).text, (await verbs.inbox(io, {})).text]) assert.doesNotMatch(text, /^open: /m);
  // the plan list Handoff's note reads: the replaced line is history there, the line that replaced it is what the person decided
  const decided = Object.fromEntries((await answers.plans(io)).map((plan) => [plan.id, plan.decided.map((d) => d.value)]));
  assert.deepEqual([decided[old], Object.values(decided).flat()], [[], ['Son değişiklik']], 'a replaced value is never listed as decided');
  // a merge brings a third plan's line of the key on the same page; then the old plan writes its key again, after the line that replaced it
  const third = await begin(other, { title: 'Another wording of it', level: 'micro' });
  await added(other, third, [{ t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the page' }, { ...personSaid('Güncel', 'Güncel.', []), answers: undefined }]);
  io.fs.writeAtomic(logFile(third), other.fs.readText(logFile(third)));
  await added(io, old, personSaid('Yeniden', 'Yeniden yazdım.', [ref]));
  assert.doesNotMatch((await verbs.show(io, { rest: [old] })).text, /^open: /m, 'a line that did not stand when the answer was written lost nothing');
});

test('a plan lost only where its line stood in a conflict with another plan\'s and the answer took another value', async () => {
  const NEW = 'Son değişiklik: 19 Kasım 2026';
  const edited = (io) => { io.state.commits = [{ sha: 'c1', subject: 'edit the update line', body: '', files: [FILE], after: 'h0' }]; };
  const answer = (io, on, key, value, supersedes) => added(io, on, { t: 'decision', key, value, why: 'their answer', whose: 'person',
    said: 'Bu geçerli olsun.', effect: [`file:${FILE}`], supersedes });
  const lost = async (io, ids) => Promise.all(ids.map(async (id) => /^open: /m.test((await verbs.show(io, { rest: [id] })).text)));
  const gateOn = async (io, branch) => { io.state.branch = branch; return (await handlers.preEdit({ ...editEvent(FILE), session_id: 's1' }, io)).code; };

  const keeper = await keptAndReplaced('metin', 'y'); // the keeping side answers in its own plan, naming only the other line
  edited(keeper.io);
  await answer(keeper.io, keeper.a, 'metin', OLD, [`${keeper.b}/${KEY}`]);
  assert.deepEqual(await lost(keeper.io, [keeper.old, keeper.a, keeper.b]), [false, false, true], 'the replaced side alone lost');
  assert.equal(await gateOn(keeper.io, 'y'), 'plan-lost');

  const winner = await keptAndReplaced('metin', 'y'); // the replacing side answers with its own value, naming both lines
  edited(winner.io);
  await answer(winner.io, winner.b, KEY, NEW, [`${winner.a}/metin`, `${winner.b}/${KEY}`]);
  assert.deepEqual(await lost(winner.io, [winner.a, winner.b]), [false, false], 'the plan whose value the person took did not lose');
  assert.notEqual(await gateOn(winner.io, 'y'), 'plan-lost');

  const two = await mergedPlans(); // two replacements, both built and edited
  edited(two.io);
  await answer(two.io, two.a, KEY, NEW, [`${two.a}/${KEY}`, `${two.b}/${KEY}`]); // written in a, taking b's value
  assert.deepEqual(await lost(two.io, [two.a, two.b]), [true, false], 'the value decides who lost, not the plan the answer is written in');

  const half = await mergedPlans();
  edited(half.io);
  await answer(half.io, half.b, KEY, NEW, [`${half.a}/${KEY}`]); // b's own words again, naming only a
  assert.deepEqual(await lost(half.io, [half.a, half.b]), [true, false]);

  const io = pageWorld(); // one answer replacing two plans' decisions on purpose: no conflict ever stood
  const ask = (key, supersedes = []) => ({ ...updateAsk(supersedes), text: `Which ${key} does the page end with?`, decides: key });
  const p1 = await pagePlan(io, 'Add a credit line', [ask('footer.text'), personSaid('Made with care', 'Made with care', [], 'footer.text')]);
  const p2 = await pagePlan(io, 'Paint the bottom bar', [ask('footer.colour'), personSaid('Grey', 'Grey', [], 'footer.colour')]);
  edited(io);
  const refs = [`${p1}/footer.text`, `${p2}/footer.colour`];
  await pagePlan(io, 'Drop the bottom area', [ask('footer', refs), personSaid('No footer at all', 'No footer at all', refs, 'footer')]);
  assert.deepEqual(await lost(io, [p1, p2]), [false, false], 'a plain replacement of two decisions is no lost conflict');
});

test('every reader of a lost plan says its one open item, the inbox counts it, and a session start keeps its byte limit', async () => {
  const { io, a, b } = await keptAndReplaced('metin', 'y');
  io.state.commits = [{ sha: 'c1', subject: 'remove the update line', body: '', files: [FILE], after: 'h0' }];
  io.state.branch = 'y';
  io.git.blame = async () => [{ sha: 'c1', subject: 'remove the update line' }];
  await added(io, a, { t: 'decision', key: 'metin', value: OLD, why: 'their answer', whose: 'person', said: 'Eski karar kalsın.',
    effect: [`file:${FILE}`], supersedes: [`${a}/metin`, `${b}/${KEY}`] });
  const item = (await verbs.show(io, { rest: [b] })).text.split('\n').find((line) => line.startsWith(`open: ${b} was built and edited`));
  const says = { close: await verbs.close(io, { rest: [b] }), pr: await verbs.pr(io, { rest: [b] }), find: await verbs.find(io, { rest: ['update'] }),
    related: await verbs.related(io, { rest: [FILE] }), node: await verbs.show(io, { rest: [`decision:${KEY}`] }),
    why: await verbs.why(io, { rest: [FILE] }), debug: await debug.decisionbook(io, {}) };
  for (const [reader, { text }] of Object.entries(says)) assert.ok(text.split('\n').includes(item), `${reader}:\n${text}`);
  const inbox = await verbs.inbox(io, {});
  assert.match(inbox.text.split('\n')[0], /^Waiting for you on y: .*, open items 1$/, inbox.text);
  assert.deepEqual(inbox.out.here.filter((row) => row.waits === 'lost').map((row) => row.id), [b], 'a row of its own, as data too');
  const read = Array.from({ length: 12 }, (_, i) => ({ t: 'research', tool: 'read', asked: `part ${i} of the page`, source: `${FILE}:1`,
    answer: `part ${i} holds ${'a line of the footer and what stands around it, '.repeat(3)}` }));
  const c = await pagePlan(io, 'Footer colour', [...read, { ...updateAsk(), text: 'Grey or navy in the bottom strip?', decides: 'footer' },
    personSaid('Grey', 'Grey.', [], 'footer'), { t: 'item', kind: 'non-goal', text: 'the update line stays as it is', covers: [`${a}/metin`] }]);
  const start = (await verbs.resume(io, { room: 2100 })).text; // the plan's head lines and the item are never cut: a room that holds them
  assert.ok(start.startsWith(`Plan ${c} READY on y`) && !start.includes('covers no new edit'), `the open plan is not told it lost:\n${start}`);
  assert.ok(start.split('\n').includes(item) && Buffer.byteLength(start) <= 2100, `${Buffer.byteLength(start)} bytes:\n${start}`);
  const tight = (await verbs.resume(io, { room: 700 })).text.trimEnd().split('\n'); // an item over half the room is pointed at, never appended
  assert.deepEqual([tight.includes(item), tight.at(-1)], [false, '+1 more: atlasbound decisionbook inbox --json'], tight.join('\n'));
});

test('a READY plan carrying the open item blocks no new plan of its files, and setting it aside keeps the item', async () => {
  const { io, a, b } = await keptAndReplaced('metin', 'y');
  io.state.commits = [{ sha: 'c1', subject: 'remove the update line', body: '', files: [FILE], after: 'h0' }];
  io.state.branch = 'y';
  await added(io, b, { t: 'decision', key: KEY, value: OLD, why: 'their answer', whose: 'person', said: 'Eski karar kalsın.',
    effect: [`file:${FILE}`], supersedes: [`${a}/metin`, `${b}/${KEY}`] });
  await handlers.start(starting('s2'), io);
  io.session = 's2';
  await handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's2', prompt: 'Bring the old update line back with a new plan.' }, io);
  const made = await begin(io, { title: 'Bring the update line back', level: 'micro', records: [{ t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the page' }] })
    .then((id) => id, (err) => err.code);
  assert.match(made, /^2026-11-02-bring-the-update-line-back-/, 'the restoring plan opens beside it');
  io.session = undefined;
  await added(io, b, { t: 'aside', by: 'Amy', said: 'Set it aside.' });
  assert.match((await verbs.show(io, { rest: [b] })).text, new RegExp(`^open: ${b} was built and edited`, 'm'), 'aside keeps the item');
  const inbox = await verbs.inbox(io, {});
  assert.match(inbox.text.split('\n')[0], /, set aside 1, open items 1$/, `the plan set aside is counted beside its item:\n${inbox.text}`);
  assert.deepEqual(inbox.out.here.filter((row) => row.id === b).map((row) => row.waits), ['lost', 'aside']);
});
