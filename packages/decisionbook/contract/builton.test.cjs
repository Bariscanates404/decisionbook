// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// a plan built with another plan's research or information is linked to it at once, only when the use is real: the
// session that adds the record read the earlier plan (a recall card given, decisionbook show of it or of one of its decisions, decisionbook related) AND the record uses it
// (names its id or decision:<key>, or decides a key it holds). Black box: the public entry and kit's fake io; a verb's session is the host's (io.session).
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, begin, added, refusedWith, logFile, lastN, readOf, textOf } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const STATUS = 'app/models/status.rb';
const REPLY = 'app/models/reply.rb';
const SCOPE = { t: 'decision', key: 'policy.scope', value: 'the top post decides at any depth', why: 'the team asked', by: 'ai', files: [STATUS] };
const ASKED = 'Who decides at any depth';
const linksIn = (io, id) => io.fs.readText(logFile(id)).trim().split('\n').map((line) => JSON.parse(line))
  .filter((r) => r.t === 'link' && r.rel === 'built-on');
const showLinks = async (io, id) => (await verbs.show(io, { rest: [id, 'links'] })).out.links.filter((l) => ['built-on',
  'used-by'].includes(l.rel)).map((l) => [l.from, l.rel, l.to, l.why]);
const states = async (io) => (await verbs.show(io, { rest: ['decision:policy.scope'] })).out.decisions.map((d) => [d.plan, d.scope, d.state,
  d.conflicts.length]);

/** An earlier plan (Reply controls: plans status.rb), then a later one (Reply requests, on its own branch: plans reply.rb), the work of session s1. */
async function chain(over = {}) {
  const io = { ...bookWorld({ files: { [STATUS]: 'class Status\n', [REPLY]: 'class Reply\n' }, branch: 'reply-controls', ...over }), session: 's1' };
  const older = await begin(io, { title: 'Reply controls' });
  await added(io, older, [{ t: 'link', rel: 'plans', to: `file:${STATUS}`, why: 'the policy' }, SCOPE]);
  io.state.branch = 'reply-requests';
  const newer = await begin(io, { title: 'Reply requests' });
  await added(io, newer, { t: 'link', rel: 'plans', to: `file:${REPLY}`, why: 'the requests' });
  return { io, older, newer };
}

test('[I-4] an earlier plan this session read and a record uses is linked at once, said by add and kept in the same append',
  async () => {
  const { io, older, newer } = await chain();
  const before = await states(io);
  await verbs.show(io, { rest: [older, 'decisions'] });
  const said = await added(io, newer, { t: 'research', tool: 'read', asked: ASKED, answer: 'the top post author, as decision:policy.scope settled',
    source: `${STATUS}:1` });
  const why = `research ${ASKED} ← decision policy.scope`;
  assert.deepEqual(said.out.linked, [{ id: older, why }]);
  assert.match(said.text, new RegExp(`^${newer}: research recorded\\nbuilt-on ${older}: research Who decides at any depth ← decision policy\\.scope\\n`));
  assert.deepEqual(linksIn(io, newer).map(({ to, why: w, source }) => [to, w, source]), [[`plan:${older}`, why, 'read: show']],
    'one link record, in the plan that used it');
  assert.equal(lastN(io, 'decisionbook.add').linked, 1);
  await added(io, newer, [{ t: 'note', text: `the rule of ${older} holds` }, { t: 'item', kind: 'edge', text: 'a reply at depth 5 follows decision:policy.scope' }]);
  assert.equal(linksIn(io, newer).length, 1, 'once per earlier plan');
  assert.deepEqual(await states(io), before, 'a link changes no decision');
});

test('[I-4] opening alone, a use of an unread DecisionBook, its own plan and a paraphrase are no link',
  async () => {
  const { io, older, newer } = await chain();
  io.state.branch = 'csv';
  const csv = await begin(io, { title: 'CSV export' });
  io.state.branch = 'reply-requests';
  await verbs.show(io, { rest: [older] });
  await verbs.show(io, { rest: [newer] });
  const paraphrase = await added(io, newer, [{ t: 'note', text: 'the top post decides, as settled before' }, { t: 'note', text: `${newer} goes on` }]);
  assert.deepEqual([paraphrase.out.linked, lastN(io, 'decisionbook.add').linked], [[], 0], 'read and not used; its own id');
  assert.equal((await refusedWith(io, newer, { t: 'link', rel: 'built-on', to: `plan:${older}`, why: 'by hand' }))[0], 'record-invalid',
    'only evidence writes it, never a hand');
  await added(io, newer, { t: 'note', text: `nothing like ${csv}` });
  assert.deepEqual(linksIn(io, newer), [], 'used and never read in this session: an unrelated plan stays apart');
  for (const away of [{ session: null }, { home: null }]) {
    const other = await chain();
    const lone = { ...other.io, ...away };
    await verbs.show(lone, { rest: [other.older] });
    await added(lone, other.newer, { t: 'note', text: `built on ${other.older}` });
    assert.deepEqual([linksIn(lone, other.newer), lastN(lone, 'decisionbook.add').linked, lastN(lone, 'decisionbook.add').readsUnkept], [[], undefined, 1],
      JSON.stringify(away));
  }
});

test('[I-4] a recall card given and a decided key reused link too, and the link shows on both plans',
  async () => {
  const { io, older, newer } = await chain();
  assert.equal((await handlers.recall(readOf(STATUS, 's1'), io)).code, 'recall-given', 'the earlier plan\'s card');
  await added(io, newer, { t: 'decision', key: 'policy.scope', scope: 'reply requests', value: 'the top post author decides on requests',
    why: 'it follows the reply policy', by: 'ai', files: [REPLY] });
  const why = 'decision policy.scope ← decision policy.scope';
  assert.deepEqual(linksIn(io, newer).map((l) => [l.to, l.why, l.source]), [[`plan:${older}`, why, 'read: card']]);
  assert.deepEqual(await showLinks(io, newer), [[`plan:${newer}`, 'built-on', `plan:${older}`, why]]);
  assert.deepEqual(await showLinks(io, older), [[`plan:${older}`, 'used-by', `plan:${newer}`, why]], 'read from the other end');
  assert.match((await verbs.show(io, { rest: [older, 'links'] })).text,
    new RegExp(`^- plan:${older} used-by plan:${newer}: decision policy\\.scope ← decision policy\\.scope\\n- plan:${older} plans file:`, 'm'),
    'the links between plans come first, so a long plan never hides them');
  io.state.branch = 'h4';
  const cards = textOf(await handlers.recall(readOf(STATUS, 's2'), io));
  assert.match(cards, new RegExp(`^- ${older} draft \\(2026-11-02\\): Reply controls\\n(?: {2}.*\\n)* {2}linked: used-by ${newer}: ${why}\\n`, 'm'));
  assert.match(cards, new RegExp(`^- ${newer} draft \\(2026-11-02\\): Reply requests\\n(?: {2}.*\\n)* {2}linked: built-on ${older}: ${why}\\n`, 'm'));
  const byHand = await verbs.related(io, { rest: [STATUS] });
  assert.match(byHand.text, new RegExp(`^ {2}linked: built-on ${older}: ${why}$`, 'm'));
  assert.deepEqual(byHand.out.cards.map((c) => [c.id, c.linked.map((l) => l.rel)]), [[older, ['used-by']], [newer, ['built-on']]]);
});

test('[I-4] decisionbook related only reads; a link the person removes is gone from both sides and no later use brings it back',
  async () => {
  const { io, older, newer } = await chain();
  await verbs.related(io, { rest: [STATUS] });
  await added(io, newer, { t: 'item', kind: 'gap', gap: 'existing-data', status: 'na', text: `old replies stay public, as ${older} decided` });
  assert.deepEqual(linksIn(io, newer).map((l) => [l.why, l.source]), [[`gap existing-data ← its id`, 'read: related']]);
  const before = await states(io);
  const unlink = { t: 'unlink', rel: 'built-on', to: `plan:${older}`, why: 'the gap was closed from the code, not from it' };
  assert.equal((await refusedWith(io, newer, { ...unlink, by: 'ai' }))[0], 'unlink-by-person');
  assert.equal((await refusedWith(io, newer, { ...unlink, by: 'Ayse' }))[0], 'unlink-by-person', 'a name is no person: no message of theirs');
  const prompt = { hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'that link is wrong, remove it' };
  await decisionbook.handlers.prompt(prompt, io);
  await added(io, newer, { ...unlink, by: 'Ayse' });
  assert.deepEqual([await showLinks(io, newer), await showLinks(io, older)], [[], []]);
  const again = await added(io, newer, { t: 'note', text: `see ${older}` });
  assert.deepEqual([again.out.linked, linksIn(io, newer).length], [[], 1], 'the person\'s removal holds');
  assert.deepEqual(await states(io), before);
  const debug = await decisionbook.debug.decisionbook(io, { rest: [] });
  assert.match(debug.text, new RegExp(`^read in session s1 by related: ${older}$`, 'm'));
});

// Two plans of other files each decided a bare key (a lesson's `layout`, another lesson's `layout`): the newer one showed a CONFLICT
// with the older one and was linked to it as built on it.
test('[I-3] one bare key in two plans of other files is no conflict and no link; a shared file or a key that names its area is', async () => {
  const { io, older, newer } = await chain();
  const layout = (value) => ({ t: 'decision', key: 'layout', value, why: 'the page', by: 'ai' });
  await added(io, older, layout('right of the title'));
  assert.equal((await handlers.recall(readOf(STATUS, 's1'), io)).code, 'recall-given', 'the earlier plan\'s card was read');
  await added(io, newer, layout('a new fourth tab'));
  const conflicts = async (key) => (await verbs.show(io, { rest: [`decision:${key}`] })).out.decisions.filter((d) => d.state === 'active').map((d) => d.conflicts);
  assert.deepEqual([await conflicts('layout'), linksIn(io, newer)], [[[], []], []], 'other files: two decisions that never meet');
  assert.ok(!(await verbs.show(io, { rest: [newer, 'decisions'] })).text.includes('CONFLICT'));
  await added(io, newer, { ...SCOPE, value: 'the reply author decides', files: [REPLY] });
  assert.deepEqual(await conflicts('policy.scope'), [[`${newer}/policy.scope`], [`${older}/policy.scope`]], 'a key that names its area is one concern in every plan');
  assert.deepEqual(linksIn(io, newer).map((l) => l.why), ['decision policy.scope ← decision policy.scope']);
  await added(io, newer, { t: 'link', rel: 'plans', to: `file:${STATUS}`, why: 'the policy too' });
  assert.deepEqual(await conflicts('layout'), [[`${newer}/layout`], [`${older}/layout`]], 'the plans share a file now: one key, two live values');
});

// A link an earlier build stored for a reused bare key between plans of other files (`yerlesim ← yerlesim` in a team's history) is read
// with the rule a write links by: it is no link until the two plans meet.
test('[I-3] a stored link of one bare key between plans that do not meet is not shown; once they share a file it is', async () => {
  const { io, older, newer } = await chain();
  const layout = (value) => ({ t: 'decision', key: 'layout', value, why: 'the page', by: 'ai' });
  await added(io, older, layout('right of the title'));
  await added(io, newer, layout('a new fourth tab'));
  const stored = { t: 'link', rel: 'built-on', to: `plan:${older}`, why: 'decision layout ← decision layout', source: 'read: card', at: '2026-11-02T06:00:00.900Z' };
  io.fs.append(logFile(newer), `${JSON.stringify(stored)}\n`);
  const card = async () => (await verbs.related(io, { rest: [STATUS] })).text;
  assert.deepEqual([await showLinks(io, newer), await showLinks(io, older)], [[], []], 'other files: no link either way');
  assert.ok(!(await card()).includes('layout ← decision layout'), await card());
  await added(io, newer, { t: 'link', rel: 'plans', to: `file:${STATUS}`, why: 'the policy too' });
  assert.deepEqual(await showLinks(io, older), [[`plan:${older}`, 'used-by', `plan:${newer}`, stored.why]], 'a shared file: the link stands');
});
