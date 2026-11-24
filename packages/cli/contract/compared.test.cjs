// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Through the real bin, two people in two clones: Abe keeps a shipping limit, Zoe replaces it with 300, builds and commits it, pulls
// Abe's keep and, asked, keeps 150: her built plan's decision lost a conflict after it was built, one open item. Only a `compared` link on
// that plan naming the line that holds now, with the agent's why and the person's own words typed after that line, clears it; the gate
// denies until then and the product never changes the source file.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, makeRepo, knownIn, protect, git, run, typedYes, tmp, hookContextOf, hookDecisionOf } = require('./support.cjs');

const FILE = 'src/util.js';
const ANSWER = 'Gördüm, kod 300 TL diyor; 150 TL için yeni bir plan açalım.';
const shippingAsk = (decides, text, supersedes = []) => ({ t: 'question', q: 'Q1', text, decides, whyNotCode: 'a product decision', blocking: true,
  proposal: 'yes', supersedes });
const shippingPlan = (title, file, records) => JSON.stringify({ title, why: 'the team asked', success: 'the rule holds', kind: 'feature', level: 'micro',
  records: [{ t: 'link', rel: 'plans', to: `file:${file}`, why: 'here' }, { t: 'research', tool: 'read', asked: 'the limit', answer: 'read',
    source: `${file}:1` }, ...records, { t: 'confirm', by: 'the person', said: 'yes' }] });
const shippingAnswer = (key, value, said, file, more) => ({ t: 'decision', key, value, why: 'their answer', whose: 'person', said, answers: 'Q1',
  effect: [`file:${file}`], ...more });

const SECOND = 'Zoe'; // the second clone's person
/** Zoe's clone holding the item: its plans, the ref of the line that holds now and the calls; -> { b, pa, pk, pr, to, ai, say, … } */
function shippingClones() {
  const world = makeWorld();
  const a = makeRepo({ [FILE]: 'export const FREE_SHIPPING = 150;\n', 'index.html': '<p>kargo</p>\n' });
  protect(a, ['src/**', 'index.html']);
  git(a, 'add', '.decisionbook');
  git(a, 'commit', '-qm', 'protect');
  const b = path.join(tmp('compared-b-'), 'repo');
  git(path.dirname(b), 'clone', '-q', a, b);
  git(b, 'config', 'user.name', SECOND); // who works in the second clone: her records carry her name
  const [homeA, homeB] = [knownIn(a, tmp('compared-home-a-')), knownIn(b, tmp('compared-home-b-'), SECOND)];
  const person = (repo, home, ...args) => run(world.bin, [...args, '--target', repo], { env: { ...typedYes().env, HOME: home } });
  const made = (repo, home, title, file, records) => {
    const res = person(repo, home, 'decisionbook', 'new', shippingPlan(title, file, records));
    assert.equal(res.code, 0, res.err);
    git(repo, 'add', '.decisionbook');
    git(repo, 'commit', '-qm', title);
    return res.out.split(' ')[0];
  };
  const pa = made(a, homeA, 'Shipping limit', FILE, [shippingAsk('limit', 'Free shipping above?'), shippingAnswer('limit', '150 TL', 'Limit 150 TL olsun.', FILE)]);
  git(b, 'pull', '-q', '--no-rebase', '--no-edit');
  const pk = made(a, homeA, 'Shipping banner', 'index.html', [shippingAsk('limit-kalir', 'Does the limit stay?', [`${pa}/limit`]),
    shippingAnswer('limit-kalir', '150 TL stays', 'Evet, limit 150 TL kalsın.', 'index.html', { keeps: [`${pa}/limit`] })]);
  const pr = made(b, homeB, 'Shipping limit 300', FILE, [shippingAsk('limit', 'Does 300 replace 150?', [`${pa}/limit`]),
    shippingAnswer('limit', '300 TL', 'Evet, limit 300 TL olsun.', FILE, { supersedes: [`${pa}/limit`] })]);
  fs.writeFileSync(path.join(b, FILE), 'export const FREE_SHIPPING = 300;\n');
  git(b, 'commit', '-qam', 'limit 300');
  git(b, 'pull', '-q', '--no-rebase', '--no-edit');
  const env = { HOME: homeB, CLAUDE_CODE_SESSION_ID: 'z1' };
  const ai = (...args) => run(world.bin, [...args, '--target', b], { env, input: '' });
  const hook = (event, payload) => run(world.bin, ['hook', event], { cwd: b, env: { HOME: homeB, CLAUDE_PROJECT_DIR: b },
    input: JSON.stringify({ session_id: 'z1', cwd: b, hook_event_name: event, ...payload }) });
  const say = (prompt) => assert.equal(hook('UserPromptSubmit', { prompt }).code, 0);
  const lines = [`${pk}/limit-kalir`, `${pr}/limit`];
  assert.equal(ai('decisionbook', 'add', pr, JSON.stringify({ ...shippingAsk('limit', 'Abe said 150 stays, you said 300: which?', lines), q: 'Q2' })).code, 0);
  say('Abe haklı, eski karar kalsın: 150 TL.');
  const kept = ai('decisionbook', 'add', pr, JSON.stringify({ ...shippingAnswer('limit', '150 TL stays', 'Abe haklı, eski karar kalsın: 150 TL.', FILE,
    { supersedes: lines }), by: '', answers: 'Q2' }));
  assert.equal(kept.code, 0, kept.err);
  const rows = (id) => fs.readFileSync(path.join(b, '.decisionbook', `${id}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const lineOf = (id, holds) => rows(id).filter((r) => r.t === 'decision' && holds(r)).at(-1);
  const opening = `open: ${pr} was built and edited`;
  const found = (text) => text.split('\n').find((line) => line.startsWith(opening)) ?? null;
  const item = () => found(ai('decisionbook', 'show', pr).out);
  const readers = () => [item(), found(ai('decisionbook', 'inbox').out),
    found(hookContextOf(hook('SessionStart', { source: 'startup', session_id: 'z2' })))];
  const gate = () => hookDecisionOf(hook('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: path.join(b, FILE), old_string: '300',
    new_string: '150' } }));
  const to = `decision:${pr}/limit@${lineOf(pr, (r) => r.answers === 'Q2').at}`;
  return { b, pa, pk, pr, to, ai, say, item, readers, gate, rows, lineOf };
}

test('a compared link clears the lost item only with the agent\'s why and the person\'s words after the holding line', () => {
  const { b, pa, pk, pr, to, ai, say, item, readers, gate, rows, lineOf } = shippingClones();
  const source = fs.readFileSync(path.join(b, FILE), 'utf8');
  const before = readers();
  assert.ok(before[0] && before.every((line) => line === before[0]) && before[0].includes(`"to":"${to}"`), `one item in every reader:\n${before}`);
  const denied = gate();
  assert.deepEqual([denied.permissionDecision, denied.permissionDecisionReason.includes('plan-lost')], ['deny', true], 'the gate denies first');
  const compared = (more) => ({ t: 'link', rel: 'compared', to, why: 'src/util.js holds FREE_SHIPPING = 300', ...more });
  const refused = (id, records) => {
    const res = ai('decisionbook', 'add', id, JSON.stringify(records));
    return res.code === 0 ? 'written' : res.err.split(':')[1].trim();
  };
  // the agent alone: no words, its own words, and the person's words typed before the item (their answer to the conflict question)
  assert.equal(refused(pr, compared()), 'said-not-theirs', 'the agent\'s record with no words of the person');
  assert.equal(refused(pr, compared({ said: 'Kodu karşılaştırdım.' })), 'said-not-theirs', 'words the person never typed');
  assert.equal(refused(pr, compared({ said: 'Abe haklı, eski karar kalsın: 150 TL.' })), 'said-not-theirs', 'their words from before the line');
  assert.equal(item(), before[0], 'the item stays');
  say(ANSWER);
  // an empty or missing why: refused, a source is no why here
  assert.equal(refused(pr, compared({ why: '', said: ANSWER })), 'record-invalid', 'an empty why is no text');
  assert.equal(refused(pr, compared({ why: undefined, source: `${FILE}:1`, said: ANSWER })), 'link-unsourced');
  // the person's words, the right why, but not the line that holds now, or not on the affected plan: written, the item stays
  const at300 = lineOf(pr, (r) => r.value === '300 TL').at;
  const wrong = [`decision:limit`, `decision:${pr}/limit`, `decision:${pr}/limit@${at300}`, `decision:${pa}/limit@${lineOf(pa, () => true).at}`];
  assert.equal(refused(pr, wrong.map((ref) => compared({ to: ref, said: ANSWER }))), 'written');
  assert.equal(refused(pk, compared({ said: ANSWER })), 'written');
  assert.equal(item(), before[0], 'a key, a plan and key, the line that lost, another plan\'s line, another plan\'s file: none clears it');
  assert.equal(gate().permissionDecision, 'deny');
  // the person's answer to this comparison and the agent's why: gone from show, inbox and the session start; the edit's own verdict
  assert.equal(refused(pr, compared({ said: ANSWER })), 'written');
  assert.deepEqual(readers(), [null, null, null], 'cleared everywhere');
  assert.deepEqual(gate(), {}, 'the READY plan covers its edit again (silence)');
  assert.deepEqual(rows(pr).filter((r) => r.rel === 'compared' && r.to === to).map((r) => [r.by, r.said]), [[SECOND, ANSWER]]);
  assert.equal(fs.readFileSync(path.join(b, FILE), 'utf8'), source, 'the product never touches the source file');
  assert.equal(git(b, 'status', '--porcelain', '--', 'src'), '');
});
