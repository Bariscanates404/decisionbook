// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Through the real bin, two people with two homes and two clones of one bare remote, as a live team works: Ali's request sets a shipping
// fee, Zeynep's sets another, Ali says his stays. Each one's AI session records what its person said; no session closes the teammate's
// plan or writes over the teammate's line; after the merge every reader of both clones shows ONE conflict naming both people's lines.
// After a pull, a keep of the decision a teammate replaced is told the line that holds now and takes the old one back by naming both.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, makeRepo, protect, git, run, typedYes, tmp, hookContextOf, hookDecisionOf } = require('./support.cjs');

const FEE_FILE = 'src/kargo.js';
const KEY = 'kargo.ucreti';
const feeLink = { t: 'link', rel: 'plans', to: `file:${FEE_FILE}`, why: 'the fee is here' };
const feeSaid = (value, said, more) => ({ t: 'decision', key: KEY, value, why: 'their words', by: '', said, ...more });
const feePlan = (title, records) => JSON.stringify({ title, why: 'the person asked', level: 'micro', records: [feeLink, ...records] });
const yesOf = (said) => JSON.stringify({ t: 'confirm', by: '', said });
const saidCode = (res) => (res.code === 0 ? 'written' : res.err.slice('atlasbound: '.length).split(':')[0]);
const startedId = (res) => res.out.split(' ')[0];

/** One person of the team: their clone, their home, the mail git commits as there, their AI sessions and the host's events. */
function teamPerson(bin, name, repo) {
  const home = tmp(`teamwork-home-${name}-`);
  const own = (...args) => git(repo, '-c', `user.email=${name}@example.com`, '-c', `user.name=${name}`, ...args);
  own('config', 'user.email', `${name}@example.com`);
  const hook = (session, event, payload) => run(bin, ['hook', event], { cwd: repo, env: { HOME: home, CLAUDE_PROJECT_DIR: repo },
    input: JSON.stringify({ session_id: session, cwd: repo, hook_event_name: event, ...payload }) });
  const session = (id) => {
    assert.equal(hook(id, 'SessionStart', { source: 'startup' }).code, 0);
    return { hears: (prompt) => assert.equal(hook(id, 'UserPromptSubmit', { prompt }).code, 0),
      ai: (...args) => run(bin, ['decisionbook', ...args, '--target', repo], { env: { HOME: home, CLAUDE_CODE_SESSION_ID: id }, input: '' }),
      gate: (file = FEE_FILE) => hookDecisionOf(hook(id, 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: path.join(repo, file),
        old_string: '1', new_string: '2' } })) };
  };
  const commits = (subject, fee = null, files = {}) => {
    if (fee) fs.writeFileSync(path.join(repo, FEE_FILE), `export const KARGO_UCRETI = ${fee};\n`);
    Object.entries(files).forEach(([key, text]) => fs.writeFileSync(path.join(repo, key), text));
    own('add', '-A');
    own('commit', '-qm', subject);
  };
  const rows = (id) => fs.readFileSync(path.join(repo, '.decisionbook', `${id}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  /** How many CONFLICT lines each reader of this clone shows: the plans' show, the inbox, resume and a new session's start. */
  const conflictLines = (plans, id) => {
    const reader = { ai: (...args) => run(bin, ['decisionbook', ...args, '--target', repo], { env: { HOME: home, CLAUDE_CODE_SESSION_ID: id }, input: '' }) };
    const count = (text) => text.split('\n').filter((line) => line.includes('CONFLICT (2 person decisions across plans')).length;
    return [...plans.map((plan) => count(reader.ai('show', plan).out)), count(reader.ai('inbox').out), count(reader.ai('resume').out),
      count(hookContextOf(hook(id, 'SessionStart', { source: 'startup' })))];
  };
  const typed = (...args) => run(bin, ['decisionbook', ...args, '--target', repo], { env: { ...typedYes().env, HOME: home } }); // at their terminal
  const startSays = (id) => hookContextOf(hook(id, 'SessionStart', { source: 'startup' }));
  return { own, session, typed, commits, rows, conflictLines, startSays };
}

/** Ali's clone, Zeynep's clone of the same bare remote, and Ali's READY plan of the fee (100, in his own words), pushed and pulled. */
function teamClones() {
  const { bin } = makeWorld();
  const a = makeRepo({ [FEE_FILE]: 'export const KARGO_UCRETI = 50;\n', '.gitattributes': '.decisionbook/*.jsonl merge=union\n', '.gitignore': '.atlasbound/\n' });
  protect(a, ['src/**']);
  const ali = teamPerson(bin, 'ali', a);
  ali.commits('protect');
  const bare = path.join(tmp('teamwork-bare-'), 'shop.git');
  const b = path.join(tmp('teamwork-b-'), 'shop');
  git(path.dirname(bare), 'clone', '-q', '--bare', a, bare);
  ali.own('remote', 'add', 'origin', bare);
  const branch = git(a, 'symbolic-ref', '--short', 'HEAD').trim();
  git(path.dirname(b), 'clone', '-q', bare, b);
  const zeynep = teamPerson(bin, 'zeynep', b);
  const pushes = (who) => who.own('push', '-q', 'origin', branch);
  const pulls = (who) => who.own('pull', '-q', '--no-rebase', '--no-edit', 'origin', branch);
  const a1 = ali.session('a1');
  a1.hears('Kargo ücreti 100 TL olsun.');
  const made = a1.ai('new', feePlan('Kargo ücretini 100 TL yap', [feeSaid('100 TL', 'Kargo ücreti 100 TL olsun.')]));
  assert.equal(made.code, 0, made.err);
  const pa = startedId(made);
  a1.hears('Onaylıyorum.');
  assert.match(a1.ai('add', pa, yesOf('Onaylıyorum.')).out, / READY as small fix\. /);
  return { ali, zeynep, pa, pushes, pulls };
}

test('two people, two plans: no session closes or overwrites the teammate\'s; the merge shows one conflict in both clones', () => {
  const { ali, zeynep, pa, pushes, pulls } = teamClones();
  ali.commits('Ali: kargo 100', 100);
  pushes(ali);
  pulls(zeynep);
  const z1 = zeynep.session('z1');
  z1.hears('Kargo ücreti 200 TL olsun.');
  const hers = feeSaid('200 TL', 'Kargo ücreti 200 TL olsun.', { supersedes: [`${pa}/${KEY}`] });
  // what an AI session must never do to the teammate's open plan: close it, write the replacement into it
  assert.equal(saidCode(z1.ai('close', pa)), 'plan-close-theirs');
  assert.equal(saidCode(z1.ai('add', pa, JSON.stringify(hers))), 'decision-teammates');
  assert.deepEqual(zeynep.rows(pa).map((r) => r.t), ['plan', 'link', 'decision', 'confirm', 'ready'], 'Ali\'s plan is as he left it');
  // her task is planned beside his plan, her decision names his
  const beside = z1.ai('new', feePlan('Kargo ücretini 200 TL yap', [hers]));
  assert.equal(beside.code, 0, beside.err);
  const pz = startedId(beside);
  z1.hears('Evet, onaylıyorum.');
  assert.match(z1.ai('add', pz, yesOf('Evet, onaylıyorum.')).out, / READY as small fix; parked: \S+\. /);
  assert.deepEqual(z1.gate(), {}, 'her READY plan covers her edit');
  zeynep.commits('Zeynep: kargo 200', 200);
  // Ali has not pulled: his code is still 100, and "it stays" is recorded all the same, beside the decision it keeps
  const a2 = ali.session('a2');
  a2.hears('100 TL kalsın, değişmesin.');
  const keep = (key) => JSON.stringify({ ...feeSaid('100 TL', '100 TL kalsın, değişmesin.', { keeps: [`${pa}/${KEY}`] }), key });
  assert.equal(saidCode(a2.ai('add', pa, JSON.stringify(feeSaid('100 TL', '100 TL kalsın, değişmesin.')))), 'keep-own-key', 'his own value said again');
  assert.equal(saidCode(a2.ai('add', pa, keep(`${KEY}.kept`))), 'written');
  assert.deepEqual(a2.gate(), {}, 'a keep of a line his plan never named to replace takes no yes of his back');
  ali.commits('Ali: kargo 100 kalsın');
  pushes(ali);
  pulls(zeynep);
  pushes(zeynep);
  pulls(ali);
  // one conflict, said by each plan's show, the inbox, resume and a new session's start, the same in both clones
  assert.deepEqual([ali.conflictLines([pa, pz], 'a3'), zeynep.conflictLines([pa, pz], 'z2')], [[1, 1, 1, 1, 1], [1, 1, 1, 1, 1]]);
  const held = zeynep.session('z3').gate();
  assert.deepEqual([held.permissionDecision, held.permissionDecisionReason.includes('plan-conflict')], ['deny', true], 'no edit under it until a person answers');
});

test('after the pull, a keep of the decision a teammate replaced names the line that holds now and takes the old one back', () => {
  const { ali, zeynep, pa, pushes, pulls } = teamClones();
  ali.commits('Ali: kargo 100', 100);
  assert.equal(saidCode(ali.typed('close', pa)), 'written');
  assert.equal(ali.rows(pa).at(-1).by, 'the person', 'the record says who closed it');
  ali.commits('Ali: close');
  pushes(ali);
  pulls(zeynep);
  const z1 = zeynep.session('z1');
  z1.hears('Kargo ücreti 200 TL olsun.');
  const pz = startedId(z1.ai('new', feePlan('Kargo ücretini 200 TL yap', [feeSaid('200 TL', 'Kargo ücreti 200 TL olsun.', { supersedes: [`${pa}/${KEY}`] })])));
  z1.hears('Evet, onaylıyorum.');
  assert.match(z1.ai('add', pz, yesOf('Evet, onaylıyorum.')).out, / READY as small fix\. /);
  zeynep.commits('Zeynep: kargo 200', 200);
  pushes(zeynep);
  pulls(ali);
  const a2 = ali.session('a2');
  a2.hears('Kargo neden 200 olmuş? 100 TL kalsın, değişmesin.');
  assert.equal(saidCode(a2.ai('close', pz)), 'plan-close-theirs', 'her plan is not his session\'s to close');
  const back = (more) => a2.ai('new', feePlan('Kargo ücreti 100 TL kalsın', [feeSaid('100 TL', '100 TL kalsın, değişmesin.', more)]));
  const unknown = back({ keeps: [`${pa}/${KEY}`] });
  assert.deepEqual([saidCode(unknown), unknown.err.includes(`${pa}/${KEY} was replaced by ${pz}/${KEY}, which holds now: name ${pz}/${KEY}`)],
    ['supersede-unknown', true], unknown.err);
  const taken = back({ keeps: [`${pa}/${KEY}`], supersedes: [`${pz}/${KEY}`] });
  assert.equal(taken.code, 0, taken.err);
  const pk = startedId(taken);
  a2.hears('Evet, 100 yap.');
  assert.match(a2.ai('add', pk, yesOf('Evet, 100 yap.')).out, / READY as small fix; parked: \S+\. /);
  ali.commits('Ali: kargo 100 kalsın', 100);
  pushes(ali);
  pulls(zeynep);
  // his decision replaced hers knowingly: no conflict; her clone reads who replaced it, by name, and in which words
  assert.deepEqual(zeynep.conflictLines([pa, pz, pk], 'z2'), [0, 0, 0, 0, 0, 0]);
  const hers = zeynep.session('z3').ai('show', pz, 'decisions').out;
  assert.ok(hers.includes(`superseded by ${pk}/${KEY} (ali, `) && hers.includes('"100 TL kalsın, değişmesin."'), hers);
});

test('one person is no teammate of their own: under an author.email or a .mailmap, and in a home that holds no row of the plan', () => {
  const { bin } = makeWorld();
  const mailmap = { '.mailmap': 'Solo <solo@work.example> <solo@example.com>\n' };
  for (const [how, files, config] of [['author.email', {}, ['author.email', 'solo@work.example']], ['.mailmap', mailmap, null]]) {
    const repo = makeRepo({ [FEE_FILE]: 'export const KARGO_UCRETI = 50;\n', '.gitignore': '.atlasbound/\n', ...files });
    protect(repo, ['src/**']);
    const solo = teamPerson(bin, 'solo', repo);
    if (config) solo.own('config', ...config);
    const a1 = solo.session('a1');
    a1.hears('Kargo ücreti 100 TL olsun.');
    const pa = startedId(a1.ai('new', feePlan('Kargo ücretini 100 TL yap', [feeSaid('100 TL', 'Kargo ücreti 100 TL olsun.')])));
    solo.commits('the plan, a draft');
    // the same person in a home with no row of the plan (another machine): git names who wrote each line, as blame reads it
    const elsewhere = teamPerson(bin, 'solo', repo);
    const start = elsewhere.startSays('b0');
    assert.deepEqual([start.startsWith(`Plan ${pa} draft`), start.includes('a teammate\'s open draft')], [true, false], `${how}: their own draft: ${start}`);
    a1.hears('Onaylıyorum.');
    assert.match(a1.ai('add', pa, yesOf('Onaylıyorum.')).out, / READY as small fix\. /, how);
    solo.commits('kargo 100', 100);
    const b1 = elsewhere.session('b1');
    b1.hears('Kargo ücreti 150 TL olsun.');
    const revised = b1.ai('add', pa, JSON.stringify(feeSaid('150 TL', 'Kargo ücreti 150 TL olsun.', { supersedes: [`${pa}/${KEY}`] })));
    assert.equal(saidCode(revised), 'written', `${how}: their own committed line is theirs to change: ${revised.err}`);
    const closed = b1.ai('close', pa);
    assert.deepEqual([saidCode(closed), solo.rows(pa).at(-1).by], ['written', 'ai'], `${how}: their own plan is their session's to close: ${closed.err}`);
  }
});

const research = { t: 'research', tool: 'read', asked: 'the fee', answer: 'one constant', source: `${FEE_FILE}:1` };
const whichAsk = (refs) => ({ t: 'question', q: 'Q9', text: 'Two people set the fee: which holds?', decides: KEY, whyNotCode: 'two people decided',
  blocking: true, proposal: '100 TL', supersedes: refs });
const lastAt = (who, plan) => who.rows(plan).filter((r) => r.t === 'decision').at(-1).at;

test('two plans, one key: readers name the teammate, the answer keeps the line it takes, each clears their own plan\'s item', () => {
  const { ali, zeynep, pa, pushes, pulls } = teamClones();
  ali.commits('Ali: kargo 100', 100);
  pushes(ali);
  const z1 = zeynep.session('z1'); // she has not pulled: her plan knows nothing of his
  z1.hears('Kargo ücreti 200 TL olsun.');
  const hers = z1.ai('new', JSON.stringify({ title: 'Sepette kargo 200 TL', why: 'the person asked', level: 'micro', records: [
    { ...feeLink, to: 'file:src/sepet.js' }, { ...research, source: 'src/sepet.js:1' }, feeSaid('200 TL', 'Kargo ücreti 200 TL olsun.')] }));
  assert.equal(hers.code, 0, hers.err);
  const pz = startedId(hers);
  z1.hears('Evet, onaylıyorum.');
  assert.match(z1.ai('add', pz, yesOf('Evet, onaylıyorum.')).out, / READY as small fix\. /);
  zeynep.commits('Zeynep: sepette kargo 200', null, { 'src/sepet.js': 'export const SEPET_KARGO = 200;\n' });
  pulls(zeynep);
  // her readers say whose each line is, and where her answer goes: his line is never written over
  const shown = zeynep.session('z2').ai('show', pz, 'decisions').out;
  assert.ok(shown.includes(', by ali: "Kargo ücreti 100 TL olsun."') && shown.includes(', by the person: "Kargo ücreti 200 TL olsun."'), shown);
  assert.ok(shown.includes(`in ${pz} or a new plan of this clone's own`), shown);
  // she takes his: her line is replaced, his is kept as it is, so his plan lost nothing
  const z3 = zeynep.session('z3');
  assert.equal(z3.ai('add', pz, JSON.stringify(whichAsk([`${pa}/${KEY}`, `${pz}/${KEY}`]))).code, 0);
  z3.hears('Ali\'ninki olsun, 100 TL.');
  const answer = (value) => z3.ai('add', pz, JSON.stringify({ ...feeSaid(value, 'Ali\'ninki olsun, 100 TL.', { supersedes: [`${pz}/${KEY}`], keeps: [`${pa}/${KEY}`] }),
    answers: 'Q9', effect: ['file:src/sepet.js'] }));
  // a keep takes the kept line's decision as it is: with another value two live lines of one key would disagree unseen
  const other = answer('100 tl'); // near miss: another spelling is another value; the refusal hands the one string to copy, whole
  assert.deepEqual([saidCode(other), other.err.split('\n')[0].endsWith('; the value to copy: "100 TL"')], ['keep-other-value', true], other.err);
  const took = answer('100 TL');
  assert.equal(saidCode(took), 'written', took.err);
  zeynep.commits('Zeynep: Ali\'ninki');
  pushes(zeynep);
  pulls(ali);
  const items = (who, id) => who.session(id).ai('inbox').out.split('\n').filter((line) => line.includes('was built and edited'));
  const [his] = [items(ali, 'a3')];
  assert.deepEqual([his.length, his[0].includes(`${pz} `), his.some((line) => line.includes(`${pa} was built`))], [1, true, false], `the winner lost nothing: ${his}`);
  assert.ok(his[0].includes('zeynep'), `his reader says whose plan the item is: ${his[0]}`);
  // her plan's item holds back her edits of her plan's file, never his edits, and never a file her plan does not name
  const reasonOf = (who, id, file) => who.session(id).gate(file).permissionDecisionReason ?? '';
  assert.deepEqual([reasonOf(ali, 'a5', FEE_FILE).includes('plan-lost'), reasonOf(zeynep, 'z6', FEE_FILE).includes('plan-lost'),
    reasonOf(zeynep, 'z7', 'src/sepet.js').includes('plan-lost')], [false, false, true]);
  // his words do not clear her plan's item; hers do
  const compared = (said) => JSON.stringify({ t: 'link', rel: 'compared', to: `decision:${pz}/${KEY}@${lastAt(zeynep, pz)}`, why: 'src/sepet.js holds 200', said });
  const a4 = ali.session('a4');
  a4.hears('Evet, karşılaştırdım, kod 200 diyor.');
  assert.equal(saidCode(a4.ai('add', pz, compared('Evet, karşılaştırdım, kod 200 diyor.'))), 'compared-theirs');
  const z4 = zeynep.session('z4');
  z4.hears('Kod 200 diyor, biliyorum; sonra düzeltirim.');
  assert.equal(saidCode(z4.ai('add', pz, compared('Kod 200 diyor, biliyorum; sonra düzeltirim.'))), 'written');
  assert.deepEqual(items(zeynep, 'z5'), [], 'her answer cleared her own plan\'s item');
});

test('two answers to one question of one plan: the reader says where this person\'s answer goes, and that place takes it', () => {
  const { bin } = makeWorld();
  const a = makeRepo({ [FEE_FILE]: 'export const KARGO_UCRETI = 50;\n', '.gitattributes': '.decisionbook/*.jsonl merge=union\n', '.gitignore': '.atlasbound/\n' });
  protect(a, ['src/**']);
  const ali = teamPerson(bin, 'ali', a);
  const asked = { ...whichAsk([]), q: 'Q1', text: 'What is the fee?', whyNotCode: 'a product decision' };
  const pq = startedId(ali.session('a0').ai('new', feePlan('Kargo ücreti', [research, asked])));
  ali.commits('the question');
  const b = path.join(tmp('teamwork-b2-'), 'shop');
  git(path.dirname(b), 'clone', '-q', a, b);
  const zeynep = teamPerson(bin, 'zeynep', b);
  const answers = (who, id, said, value) => {
    const session = who.session(id);
    session.hears(said);
    assert.equal(saidCode(session.ai('add', pq, JSON.stringify({ ...feeSaid(value, said), answers: 'Q1', effect: [`file:${FEE_FILE}`] }))), 'written');
    who.commits(said);
  };
  answers(ali, 'a1', '100 TL olsun.', '100 TL');
  answers(zeynep, 'z1', '200 TL olsun.', '200 TL');
  zeynep.own('pull', '-q', '--no-rebase', '--no-edit', 'origin');
  const shown = zeynep.session('z2').ai('show', pq, 'decisions').out;
  assert.ok(shown.includes('CONFLICT (2 person decisions in this plan') && shown.includes(', by ali: "100 TL olsun."'), shown);
  assert.ok(shown.includes('in a new plan of this clone\'s own'), `his line stands in this plan, so her answer goes in a plan of her own: ${shown}`);
  const z3 = zeynep.session('z3');
  const own = z3.ai('new', feePlan('Kargo ücreti: hangisi', [research, whichAsk([`${pq}/${KEY}`])]));
  assert.equal(own.code, 0, own.err);
  z3.hears('Ali\'ninki, 100 TL.');
  const taken = z3.ai('add', startedId(own), JSON.stringify({ ...feeSaid('100 TL', 'Ali\'ninki, 100 TL.', { supersedes: [`${pq}/${KEY}`] }), answers: 'Q9',
    effect: [`file:${FEE_FILE}`] }));
  assert.equal(saidCode(taken), 'written', taken.err);
  assert.ok(!zeynep.session('z4').ai('show', pq, 'decisions').out.includes('CONFLICT ('), 'the conflict is ended');
});
