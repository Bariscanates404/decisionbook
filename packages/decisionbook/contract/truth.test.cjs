// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// DecisionBook's flows against answers written by hand from each fixture,
// never computed with the product's helpers: the exact row, card, commit or verdict a careful person gives for that input, each with a near miss that must
// not come back, and the side effect read where it lands (the record file, the gate's verdict). Black box: the public entry over kit's fake io.
const test = require('node:test');
const assert = require('node:assert/strict');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const kit = require('@atlasbound/kit');
const decisionbook = require('@atlasbound/decisionbook');
const { bookWorld, begin, added, recordsFor, editEvent, writeConfig, planRecords, onDay } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const timeless = (record) => Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'at')); // a record as written, less its time
const gateSays = async (io, file) => {
  const said = await handlers.preEdit(editEvent(file), io);
  return [said.verdict, said.code, said.plan ?? null];
};

// One near miss per row: the whole normal-work plan of two files but one record, the row a careful reader names, what that row then lists, and the record that closes it.
const PLANS = ['src/report/export.ts', 'src/report/format.rb'];
const QUESTION = { t: 'question', q: 'Q9', text: 'which date format do the rows carry?', decides: 'report.export.dates', whyNotCode: 'a product rule',
  blocking: true };
// the light form: normal work asks no task, gap or step row any more (their near misses are the next test's: READY without them);
// the rows it does ask each have their near miss here: the one check with a command, the third fork, an open question, the yes
const THIRD_FORK = [{ t: 'question', q: 'Q3', text: 'rule 3?', decides: 'report.export.rule3', whyNotCode: 'a product rule', blocking: true },
  { t: 'decision', key: 'report.export.rule3', value: 'v3', why: 'support', by: 'Ayse', answers: 'Q3', effect: ['check:AC-1'] }];
const NEAR_MISSES = [
  { row: 'ready-no-command', drop: (r) => r.id === 'AC-1', add: [{ t: 'check', id: 'AC-1', text: 'the export finishes in 5 s', how: 'e2e' }],
    fix: [{ t: 'check', id: 'AC-3', text: 'the whole export suite passes', command: 'npm test -- export' }] },
  { row: 'ready-answers', drop: (r) => [r.decides, r.key].includes('report.export.rule3'), fix: THIRD_FORK },
  { row: 'ready-open-question', add: [QUESTION], fix: [{ t: 'decision', key: 'report.export.dates', value: 'ISO 8601', why: 'support', by: 'Ayse',
    answers: 'Q9', effect: ['check:AC-2'] }] },
  { row: 'ready-no-confirm', early: true, fix: [{ t: 'confirm', by: 'Ayse', said: 'yes, both files' }] },
];
// what the light form does not ask for, so a plan without one of them is still whole: the task, one gap, one planned file's step
const NOT_ASKED = [['the task', (r) => r.kind === 'task'], ['a gap', (r) => r.gap === 'config-docs'],
  ['a file\'s step', (r) => r.kind === 'step' && r.file === 'src/report/format.rb']];
/** The plan's records with one near miss: a dropped record, an added one before the yes, or the yes given before the last planned path. */
function nearMiss({ drop, add = [], early }) {
  const records = recordsFor('normal', PLANS).filter((r) => !(drop && drop(r)));
  const [yes, rest] = [records.at(-1), records.slice(0, -1)];
  if (!early) return [...rest, ...add, yes];
  const last = rest.findLastIndex((r) => r.rel === 'plans');
  return [...rest.slice(0, last), yes, ...rest.slice(last)];
}

test('[I-2] a plan one record short is not READY: the missing row is named and the gate stays shut',
  async () => {
  for (const miss of NEAR_MISSES) {
    const io = bookWorld();
    writeConfig(io, { protect: ['src/**'] });
    const id = await begin(io);
    for (const record of nearMiss(miss)) await added(io, id, record);
    const res = await verbs.ready(io, { rest: [id] });
    assert.deepEqual(res.out.unmet.map(({ code }) => code), [miss.row], miss.row);
    assert.match(res.text, new RegExp(`not READY as normal work: 11 of 12 rows met\\n {2}${miss.row}: `), `${miss.row}: the text names the row`);
    assert.deepEqual(planRecords(io, id).filter((r) => r.t === 'ready'), [], `${miss.row}: nothing READY on disk`);
    assert.deepEqual(await gateSays(io, 'src/report/export.ts'), ['deny', 'plan-draft-here', id], `${miss.row}: the gate stays shut, naming this session's draft (the world's session began first)`);
    for (const record of miss.fix) await added(io, id, record);
    const fixed = await verbs.ready(io, { rest: [id] });
    assert.deepEqual([fixed.out.ready, timeless(planRecords(io, id).at(-1))], [true, { t: 'ready', head: 'h0', scope: PLANS, level: 'normal' }],
      `${miss.row}: closed, READY on disk`);
    assert.deepEqual(await gateSays(io, 'src/report/export.ts'), ['allow', 'gate-in-scope', id], `${miss.row}: the gate opens for its plan`);
  }
});

test('[I-2] the light form: a plan without its task, one gap or one file\'s step is READY at the yes, and the gate opens', async () => {
  for (const [what, drop] of NOT_ASKED) {
    const io = bookWorld();
    writeConfig(io, { protect: ['src/**'] });
    const id = await begin(io);
    const records = nearMiss({ drop });
    assert.equal(records.length, recordsFor('normal', PLANS).length - 1, `${what}: one record short of the full plan`);
    let last = null;
    for (const record of records) last = await added(io, id, record);
    assert.deepEqual([last.out.state.ready, last.out.state.unmet], [true, []], `${what}: no row asks for it`);
    assert.deepEqual(timeless(planRecords(io, id).at(-1)), { t: 'ready', head: 'h0', scope: PLANS, level: 'normal' }, `${what}: READY on disk`);
    assert.deepEqual(await gateSays(io, 'src/report/export.ts'), ['allow', 'gate-in-scope', id], `${what}: the gate opens for its plan`);
  }
});

// A team's history, hand-built, each plan's records as a team commits them. The work: src/billing/retry.ts on branch feat/retry, whose own draft is HELD.
function teamLog({ id, title, n, branch = 'main', plans = [], decisions = [], links = [], closed = false, tags }) {
  const rows = [{ schema: 'decisionbook-record/1', t: 'plan', id, title, why: 'the team wants it', branch, head: 'h0', tags },
    ...plans.map((to) => ({ t: 'link', rel: 'plans', to: `file:${to}`, why: 'code' })),
    ...links.map(([rel, to]) => ({ t: 'link', rel, to, why: 'fixture' })), ...decisions.map(([key, value, files = []]) => ({ t: 'decision', key, value,
      why: 'a rule', by: 'Ayse', files })),
    ...(closed ? [{ t: 'closed', head: 'h1', own: [], files: plans, tests: [], other: 0 }] : [])];
  return rows.map((r) => `${JSON.stringify({ ...r, at: onDay(n) })}\n`).join('');
}
const TEAM = [
  { id: 'retry-limit', title: 'Billing retry limit', n: 1, plans: ['src/billing/retry.ts'],
    decisions: [['billing.retry-limit', '3 tries', ['src/billing/retry.ts']]], closed: true },
  { id: 'invoice-layout', title: 'Invoice PDF layout', n: 2, plans: ['src/billing/invoice.ts'] }, // the same folder
  { id: 'legacy-csv', title: 'Legacy CSV import', n: 3, plans: ['src/billing-old/csv.ts'] }, // a folder whose name only starts the same: another area
  { id: 'webhook-timeout', title: 'Payment webhook', n: 4, plans: ['app/payments/webhook.rb'],
    decisions: [['billing.webhook-timeout', '10 s', ['app/payments/webhook.rb']]] }, // the same concern
  // another concern
  { id: 'export-rows', title: 'Reporting export rows', n: 5, plans: ['app/reports/export.rb'], decisions: [['reporting.export-rows', 'streamed']] },
  { id: 'retry-faq', title: 'Billing retry FAQ', n: 6 }, // words only, no file
  { id: 'retry-banner', title: 'Retry banner', n: 7, plans: ['web/banner.ts'] }, // one word of two
  { id: 'dev-port', title: 'Dev server port', n: 8, plans: ['config/port.ts'] },
  { id: 'held-retry', title: 'Faster billing retry', n: 9, branch: 'feat/retry', plans: ['src/billing/retry.ts'] }, // the work's own draft: never a card
];
const teamWorld = () => bookWorld({ branch: 'feat/retry', files: { 'src/billing/retry.ts': 'export const retry = 1;\n',
  ...Object.fromEntries(TEAM.map((i) => [`.decisionbook/${i.id}.jsonl`, teamLog(i)])) } });
const cardRanks = (res) => res.out.cards.map((c) => [c.id, c.rank]);

test('[I-21] the related verb of a file returns exactly the plans of its area, by file, folder and concern, and no near miss',
  async () => {
  const io = teamWorld();
  const res = await verbs.related(io, { rest: ['src/billing/retry.ts'] });
  assert.deepEqual(cardRanks(res), [['retry-limit', 'file'], ['invoice-layout', 'near'], ['webhook-timeout', 'concern']],
    'not legacy-csv (src/billing-old is another folder), export-rows (area reporting), the FAQ (no file), the banner, the port, nor the held draft');
  assert.deepEqual(res.out.cards.map((c) => c.path), ['src/billing/retry.ts ← planned-in retry-limit',
    'src/billing/retry.ts → same folder src/billing/invoice.ts ← planned-in invoice-layout',
    'src/billing/retry.ts ← planned-in retry-limit → decides billing.retry-limit → area billing → billing.webhook-timeout']);
  const words = await verbs.related(io, { rest: ['billing', 'retry'] });
  assert.deepEqual(cardRanks(words), [['retry-faq', 'words'], ['retry-limit', 'words']],
    'both words, newer first; one word of two is no card; the held draft never');
});

test('[I-6] decisionbook find returns every plan holding a word, the ones holding both first, and none holding neither', async () => {
  const io = teamWorld();
  const hits = (await verbs.find(io, { rest: ['billing', 'retry'] })).out.hits;
  assert.deepEqual(hits.map((h) => [h.id, h.score]), [['held-retry', 2], ['retry-faq', 2], ['retry-limit', 2], ['retry-banner', 1], ['webhook-timeout', 1],
    ['legacy-csv', 1], ['invoice-layout', 1]],
    'newer first within a score; export-rows and dev-port hold neither word');
  assert.deepEqual(hits.find((h) => h.id === 'legacy-csv').matched, ['links'], 'the word it holds is in its planned path');
});

test('decisionbook find holds a whole word or a declared tag, never a word inside another word',
  async () => {
  const io = bookWorld({ files: Object.fromEntries([
    { id: 'dev-port', title: 'Dev server port', n: 1, plans: ['config/port.ts'] }, // the word, and a word of its path
    { id: 'tunnel', title: 'Local tunnel', n: 2, plans: ['cmd/tunnel/main.go'], tags: ['port'] }, // a declared tag
    { id: 'export-rows', title: 'Reporting export rows', n: 3, plans: ['app/reports/export.rb'] }, // inside report and export
    { id: 'support', title: 'Support inbox', n: 4, plans: ['app/support/inbox.py'] }, // inside support
    { id: 'pasaport', title: 'Pasaport doğrulama', n: 5, plans: ['app/pasaport/check.go'] }, // inside a word of another language
  ].map((i) => [`.decisionbook/${i.id}.jsonl`, teamLog(i)])) });
  const hits = (await verbs.find(io, { rest: ['port'] })).out.hits;
  assert.deepEqual(hits.map((h) => [h.id, h.matched]), [['tunnel', ['tags']], ['dev-port', ['title', 'links']]],
    'newer first; the three that hold port only inside a word are not found');
  assert.deepEqual((await verbs.find(io, { rest: ['doğru'] })).out.hits, [], 'doğru is inside doğrulama: a word of any script is matched whole');
});

// Closeout: the work is for issue 42; the hand-read answer per commit is in its comment.
// the commits of the work of plan `id`
const commitsOf = (id) => [
  // own: names the id
  { sha: 'c1', subject: `stream the rows (${id})`, body: '', files: ['src/report/export.ts', 'test/report/export.test.ts', 'spec/report/export_spec.rb'] },
  { sha: 'c2', subject: 'keep the row order, fixes #42', body: '', files: ['lib/csv.rb'] }, // own: names its issue
  { sha: 'c3', subject: 'teammate tweak', body: '', files: ['src/report/format.ts'] }, // own: a planned file
  { sha: 'c4', subject: `docs for ${id}-2`, body: '', files: ['docs/export.md'] }, // another plan whose id only starts the same
  { sha: 'c5', subject: 'login copy', body: '', files: ['app/login.rb'] }, // unrelated
].map((c) => ({ ...c, after: 'h0' }));

test('[I-7] close records exactly the commits of the work, their files and their tests, and counts the rest unattributed', async () => {
  const io = bookWorld();
  const id = await begin(io);
  const COMMITS = commitsOf(id);
  io.state.commits = COMMITS;
  await added(io, id, { t: 'link', rel: 'plans', to: 'file:src/report/**', why: 'the export' });
  await added(io, id, { t: 'link', rel: 'for', to: 'issue:42', why: 'the ticket' });
  const res = await verbs.close(io, { rest: [id] });
  assert.deepEqual(timeless(planRecords(io, id).at(-1)), { t: 'closed', head: 'h0',
    own: [{ sha: 'c1', subject: COMMITS[0].subject }, { sha: 'c2', subject: COMMITS[1].subject }, { sha: 'c3', subject: 'teammate tweak' }],
    files: ['lib/csv.rb', 'spec/report/export_spec.rb', 'src/report/export.ts', 'src/report/format.ts', 'test/report/export.test.ts'],
      tests: ['spec/report/export_spec.rb', 'test/report/export.test.ts'], other: 2, by: 'the person' });
  assert.equal(res.text, `${id} closed: 3 own commits, 5 files, 2 tests; 2 other commits not attributed; `
    + `commit this record: git add .decisionbook/${id}.jsonl, then git commit -m "DecisionBook: close ${id}" .decisionbook/${id}.jsonl\n`);
});

test('close credits a commit by the whole issue token, never by a number that only contains it',
  async () => {
  const commits = [{ sha: 'c1', subject: 'keep the row order, fixes #42', files: ['lib/csv.rb'] },
    { sha: 'c6', subject: 'login copy, fixes #142', files: ['app/login.rb'] },
    { sha: 'c7', subject: 'release 1.42 of the csv gem', files: ['Gemfile.lock'] },
      { sha: 'c8', subject: 'the header row stays, see #42.', files: ['lib/header.rb'] }].map((c) => ({ ...c, body: '', after: 'h0' }));
  const io = bookWorld({ commits });
  const id = await begin(io);
  await added(io, id, { t: 'link', rel: 'plans', to: 'file:src/report/**', why: 'the export' });
  await added(io, id, { t: 'link', rel: 'for', to: 'issue:42', why: 'the ticket' });
  await verbs.close(io, { rest: [id] });
  const closed = planRecords(io, id).at(-1);
  assert.deepEqual([closed.own.map((c) => c.sha), closed.files, closed.other], [['c1', 'c8'], ['lib/csv.rb', 'lib/header.rb'], 2],
    'issue 142 and a version are not issue 42');
});

/** A real repository, main its first branch (the fake git has no branches): { root, git(...args), commit(file, text, subject) -> its sha, that file only, io:
 * the package's io on it }. */
function realRepo() {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'fxplan-close-'));
  const env = { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@x' };
  // a route's git step as written, its chatter kept out
  const git = (...args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (file, text, subject) => {
    nodeFs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    nodeFs.writeFileSync(path.join(root, file), text);
    git('add', '--', file); // never a plan's file written before it
    git('commit', '-q', '-m', subject);
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q', '-b', 'main');
  return { root, git, commit, io: { ...bookWorld(), fs: kit.io.createFs(root), root,
    git: kit.io.createGit({ proc: kit.io.proc, root, env: { PATH: process.env.PATH } }) } };
}
/** A plan of `branch` made READY at `head`, planning `plan`, as its file holds it; written after the last commit, so no commit carries it. */
function writePlan(root, { id, title, head, plan, day, branch = 'feat/export' }) {
  const rows = [{ schema: 'decisionbook-record/1', t: 'plan', id, title, branch, head }, { t: 'link', rel: 'plans', to: `file:${plan}`, why: 'code' },
    { t: 'ready', head, scope: [plan], level: 'normal' }];
  nodeFs.mkdirSync(path.join(root, '.decisionbook'), { recursive: true });
  nodeFs.writeFileSync(path.join(root, `.decisionbook/${id}.jsonl`), rows.map((r) => `${JSON.stringify({ ...r, at: onDay(day) })}\n`).join(''));
}

/** feat/export forks from main; a teammate's commit on main touches a planned file and is merged in after the feature's own commit. DecisionBook A was made READY at
 * the fork, B (src/stream/**) at the merge, so A is parked and its card says what it built. */
function mergedRepo() {
  const { root, git, commit, io } = realRepo();
  const fork = commit('src/report/export.ts', 'export const a = 1;\n', 'start');
  git('checkout', '-q', '-b', 'feat/export');
  git('checkout', '-q', 'main');
  const teammate = commit('src/report/export.ts', 'export const a = 2;\n', 'teammate: rename a constant');
  git('checkout', '-q', 'feat/export');
  const own = commit('src/report/stream.ts', 'export const s = 1;\n', 'stream the rows');
  git('merge', '-q', '--no-edit', 'main');
  writePlan(root, { id: 'a-export', title: 'Report export', head: fork, plan: 'src/report/**', day: 1 });
  writePlan(root, { id: 'b-stream', title: 'Stream rows', head: git('rev-parse', 'HEAD'), plan: 'src/stream/**', day: 2 });
  return { io, root, teammate, own };
}

test('close and the card count only the branch\'s own commits: a teammate\'s merged commit is not this plan\'s work',
  async () => {
  const { io, root, teammate, own } = mergedRepo();
  const [card] = (await verbs.related(io, { rest: ['src/report/export.ts'] })).out.cards;
  assert.deepEqual([card.id, card.built.own.map((c) => c.sha), card.built.files], ['a-export', [own], ['src/report/stream.ts']],
    'the parked plan\'s card: what it built on this branch');
  await verbs.close(io, { rest: ['a-export'] });
  const closed = JSON.parse(nodeFs.readFileSync(path.join(root, '.decisionbook/a-export.jsonl'), 'utf8').trim().split('\n').at(-1));
  assert.deepEqual([closed.own, closed.files, closed.other], [[{ sha: own, subject: 'stream the rows' }], ['src/report/stream.ts'], 0],
    `not the teammate's ${teammate.slice(0, 7)}`);
});

/** The work done on `branch` right after the fork, nothing anywhere else (main has not moved): one own commit names the plan (a Ruby file outside the plan),
 * one
 * touches a planned file. HEAD on `branch`, its plan made READY at the fork. */
function ownRepo(branch) {
  const { root, git, commit, io } = realRepo();
  const fork = commit('src/report/export.ts', 'export const a = 1;\n', 'start');
  if (branch !== 'main') git('checkout', '-q', '-b', branch);
  const named = commit('lib/export.rb', 'EXPORT = 1\n', 'export rows (a-export)');
  const planned = commit('src/report/stream.ts', 'export const s = 1;\n', 'stream the rows');
  writePlan(root, { id: 'a-export', title: 'Report export', head: fork, plan: 'src/report/**', day: 1, branch });
  return { io, root, git, commit, fork, named, planned, file: path.join(root, '.decisionbook/a-export.jsonl') };
}
/** feat/export's work and main's apart: a teammate's commit on main touches a planned file too. HEAD ends on main, nothing merged yet. */
function forkedRepo() {
  const repo = ownRepo('feat/export');
  repo.git('checkout', '-q', 'main');
  return { ...repo, teammate: repo.commit('src/report/format.ts', 'export const f = 1;\n', 'teammate: format the dates') };
}
/** The work of feat/export merged into main by a merge commit (`merge`): HEAD on main, where the merge brought the work in by its second parent. */
function mergedOutRepo() {
  const repo = forkedRepo();
  repo.git('merge', '-q', '--no-ff', '--no-edit', 'feat/export');
  return { ...repo, merge: repo.git('rev-parse', 'HEAD') };
}

// what every close refusal tells the person to do, written by hand (the route back holds: a branch made at the merge's second parent closes)
const BACK = 'close it on its branch feat/export as it was when the work was done (if it is gone: git branch feat/export <its merge>^2)';

test('close runs on its plan\'s branch as it was when the work was done; elsewhere it is refused naming that branch',
  async () => {
  const { io, root, git, named, planned, teammate } = mergedOutRepo();
  const file = path.join(root, '.decisionbook/a-export.jsonl');
  const before = nodeFs.readFileSync(file, 'utf8');
  const [reads, commitsOf] = [[], io.git.commits];
  io.git.commits = (...args) => reads.push(args[0]) && commitsOf(...args);
  const [card] = (await verbs.related(io, { rest: ['src/report/format.ts'] })).out.cards;
  assert.deepEqual([card.id, card.built, reads], ['a-export', undefined, []],
    'on main: what feat/export built is not on main\'s line, so no built line and no git read for it');
  const refused = { code: 'plan-close-off-branch', message: `plan-close-off-branch: a-export: ${BACK}; HEAD: main` };
  await assert.rejects(verbs.close(io, { rest: ['a-export'] }), refused);
  git('checkout', '-q', '--detach', 'feat/export');
  await assert.rejects(verbs.close(io, { rest: ['a-export'] }), { ...refused, message: refused.message.replace('HEAD: main', 'HEAD: detached') });
  assert.equal(nodeFs.readFileSync(file, 'utf8'), before, 'nothing appended');
  git('checkout', '-q', 'feat/export');
  await verbs.close(io, { rest: ['a-export'] });
  const closed = JSON.parse(nodeFs.readFileSync(file, 'utf8').trim().split('\n').at(-1));
  assert.deepEqual([closed.head, closed.own, closed.files, closed.other], [planned,
    [{ sha: planned, subject: 'stream the rows' }, { sha: named, subject: 'export rows (a-export)' }],
    ['lib/export.rb', 'src/report/stream.ts'], 0], `newest first, by the planned file and by the id; never the teammate's ${teammate.slice(0, 7)}`);
});

/** close as the person runs it: [its code, the own commits it credited or the refusal's message and the routes the cli prints under it, whether the plan's
 * file is byte-identical after]. */
async function closeOf({ io, file, id = 'a-export' }) {
  const before = nodeFs.readFileSync(file, 'utf8');
  const said = await verbs.close(io, { rest: [id] }).then((res) => [res.out.code, res.out.own.map((c) => c.sha)],
    (err) => [err.code, [err.message, ...(err.routes || [])]]);
  return [...said, nodeFs.readFileSync(file, 'utf8') === before];
}
/** git cannot tell whose a commit another branch's line holds is (a sync after a merge, a copy, a branch cut from it and a fast-forward merge of
 * it leave the
 * same lines), so the person is told what they can do only as conditions they can check, each with its route, written by hand; the reader is a
 * coding AI that
 * follows the words: a route that moves the branch brings it back to the tip it left, and a shape nothing can close gets a lesson for next time, never an
 * action. */
const routesOf = (ref, b = 'feat/export', to = `git checkout -B ${b}`) => [
  `rebased, or synced onto ${ref} after ${ref} merged ${b}, no commit since? ${to} <its tip before that, in git reflog ${b}>, then close, then ${to} <the tip you left>`,
  `its name reused after ${ref} merged ${b}? ${to} <that merge: on ${ref}'s line, merging ${b}>^2, then close, then ${to} <the tip you left>`,
    `a copy of ${b}? delete it, then close`,
  `cut from ${b}, or merged into ${ref}? nothing can be closed (next time: close before you cut or merge it)`,
  'synced before the work, or committed after a sync? nothing can be closed (next time: close before you sync; sync, then make it READY)'];
/** The refusal when `ref`'s line holds HEAD itself (of a plan on `b`, moved back by `to`). */
const holdsHead = (ref, b, to) => ['plan-close-merged', [`plan-close-merged: a-export: ${ref} holds HEAD too: own commits unknown, nothing recorded`,
  ...routesOf(ref, b, to)], true];
/** The refusal when `ref`'s line holds `sha`, a commit under HEAD (of the plan `id`). */
const holdsUnder = (sha, ref, id = 'a-export') => ['plan-close-merged', [`plan-close-merged: ${id}: HEAD's line holds ${sha.slice(0,
  8)}, which ${ref}'s line holds too: own commits unknown, nothing recorded`, ...routesOf(ref)], true];
/** close as the person runs it, then (refused) its route `n` (1: the reflog, 2: a reused name) followed word for word as a coding AI reads it, whether its
 * condition holds or
 * not (the caller's hand answer): the steps after `? `, split at `, then `; `close` is the verb, a git step runs as written with its <place> filled by hand
 * from `places`
 * (the tip you left: b's tip before the route) -> [the refusal, what close said on the route, the sha b ends on] */
async function follow(repo, n, places, b = 'feat/export') {
  const [refusal, fill] = [await closeOf(repo), { '<the tip you left>': repo.git('rev-parse', b), ...places }];
  let said = null;
  for (const step of refusal[1][n].slice(refusal[1][n].indexOf('? ') + 2).split(', then ')) {
    if (step === 'close') said = await closeOf(repo);
    else repo.git(...step.replace(/<[^>]+>/, (place) => fill[place]).split(' ').slice(1));
  }
  return [refusal, said, repo.git('rev-parse', b)];
}
/** The reflog route, `tip` the hand answer for b's tip before its last move, which git reflog really holds there. */
function viaReflog(repo, tip, b = 'feat/export') {
  assert.equal(repo.git('rev-parse', `${b}@{1}`), tip, `git reflog ${b}: the tip before the last move`);
  return follow(repo, 1, { [`<its tip before that, in git reflog ${b}>`]: tip }, b);
}

test('close credits no line another branch holds: a branch synced to main after the merge is refused',
  async () => {
  const synced = mergedOutRepo();
  synced.git('checkout', '-q', 'feat/export');
  synced.git('merge', '-q', '--ff-only', 'main');
  // the branch's next READY: a-export is parked, a card
  writePlan(synced.root, { id: 'b-stream', title: 'Stream rows', head: synced.merge, plan: 'src/stream/**', day: 2 });
  const [card] = (await verbs.related(synced.io, { rest: ['src/report/format.ts'] })).out.cards;
  assert.deepEqual([card.id, card.built], ['a-export', undefined], `HEAD's line is main's merge and the teammate's ${synced.teammate.slice(0,
    7)}, not what a-export built`);
  assert.deepEqual(await closeOf(synced), holdsHead('main'), 'synced to main: main\'s merge is HEAD itself');
});

test('a plan made on a detached HEAD closes on a detached HEAD only; on a branch it is refused with the detached route',
  async () => {
  const io = bookWorld({ branch: null });
  const id = await begin(io);
  io.state.commits = commitsOf(id);
  io.state.branch = 'main';
  const message = `plan-close-off-branch: ${id}: close it on its branch detached as it was when the work was done (if it is gone: git checkout --detach <its merge>^2); HEAD: main`;
  await assert.rejects(verbs.close(io, { rest: [id] }), { code: 'plan-close-off-branch', message });
  assert.deepEqual(planRecords(io, id).map((r) => r.t), ['plan'], 'nothing appended');
  io.state.branch = null;
  assert.equal((await verbs.close(io, { rest: [id] })).out.code, 'plan-closed', 'back on a detached HEAD it closes');
});

test('the refusal\'s route closes with both own commits, the branch put back where its work ended',
  async () => {
  const gone = mergedOutRepo();
  gone.git('branch', '-q', '-D', 'feat/export');
  assert.deepEqual(await closeOf(gone), ['plan-close-off-branch', [`plan-close-off-branch: a-export: ${BACK}; HEAD: main`], true],
    'on main, the branch gone: the route is named');
  gone.git('branch', 'feat/export', `${gone.merge}^2`);
  gone.git('checkout', '-q', 'feat/export');
  assert.deepEqual(await closeOf(gone), ['plan-closed', [gone.planned, gone.named], false], 'the route taken: both own commits, newest first');
  const remote = mergedOutRepo();
  remote.git('update-ref', 'refs/remotes/origin/main', remote.merge);
  remote.git('update-ref', 'refs/remotes/origin/feat/export', remote.planned);
  remote.git('checkout', '-q', 'feat/export');
  remote.git('branch', '-f', 'main', remote.fork);
  remote.git('merge', '-q', '--ff-only', 'origin/main');
  assert.deepEqual(await closeOf(remote), holdsHead('origin/main'), 'local main is stale at the fork; the fetched origin/main holds the merge, HEAD itself');
  remote.git('reset', '-q', '--hard', remote.planned);
  assert.deepEqual(await closeOf(remote), ['plan-closed', [remote.planned, remote.named], false],
    'its own tip again: origin/feat/export, its pushed copy, is its own line, never another branch');
});

/** What a push and `git clone` leave: origin/<b> at each branch b's tip, and the symbolic ref origin/HEAD pointing at origin/<head> (the remote's default
 * branch). */
function pushed({ git }, branches, head) {
  for (const b of branches) git('update-ref', `refs/remotes/origin/${b}`, b);
  git('symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${head}`);
}

test('the remote\'s default pointer is no branch of its own: a plan on the default branch closes with its commits',
  async () => {
  const trunk = ownRepo('main');
  pushed(trunk, ['main'], 'main');
  // main's next READY: a-export is parked, a card
  writePlan(trunk.root, { id: 'b-stream', title: 'Stream rows', head: trunk.planned, plan: 'src/stream/**', day: 2, branch: 'main' });
  const [card] = (await verbs.related(trunk.io, { rest: ['src/report/stream.ts'] })).out.cards;
  assert.deepEqual([card.id, card.built?.own.map((c) => c.sha)], ['a-export', [trunk.planned, trunk.named]],
    'the parked plan\'s card on a cloned main: what it built');
  assert.deepEqual(await closeOf(trunk), ['plan-closed', [trunk.planned, trunk.named], false],
    'origin/main is main\'s own remote copy and origin/HEAD only points at it');
  const feature = ownRepo('feat/export');
  pushed(feature, ['main', 'feat/export'], 'feat/export');
  assert.deepEqual(await closeOf(feature), ['plan-closed', [feature.planned, feature.named], false],
    'origin/HEAD -> origin/feat/export, its own copy; origin/main is at the fork');
  const synced = mergedOutRepo();
  synced.git('checkout', '-q', 'feat/export');
  synced.git('merge', '-q', '--ff-only', 'main');
  pushed(synced, ['main', 'feat/export'], 'main');
  assert.deepEqual(await closeOf(synced), holdsHead('main'), 'near miss: synced to main with origin/HEAD there is still refused, by main');
  const rebased = forkedRepo();
  rebased.git('checkout', '-q', 'feat/export');
  rebased.git('rebase', '-q', 'main');
  pushed(rebased, ['main'], 'main');
  assert.deepEqual(await closeOf(rebased), holdsUnder(rebased.teammate, 'main'), 'near miss: rebased with origin/HEAD there is still refused, by main');
  const ff = ownRepo('feat/export');
  ff.git('checkout', '-q', 'main');
  ff.git('merge', '-q', '--ff-only', 'feat/export');
  ff.git('checkout', '-q', 'feat/export');
  pushed(ff, ['main'], 'main');
  assert.deepEqual(await closeOf(ff), holdsHead('main'), 'near miss: main fast-forwarded to it, pushed, is still refused, by main');
});

/** feat/export's work, then main's newer commit merged in by a merge commit (`mergeIn`), the common sync before a PR; HEAD on feat/export, nothing else holds
 * it yet. */
function mergedInRepo() {
  const repo = forkedRepo();
  repo.git('checkout', '-q', 'feat/export');
  repo.git('merge', '-q', '--no-ff', '--no-edit', 'main');
  return { ...repo, mergeIn: repo.git('rev-parse', 'HEAD') };
}
test('another branch\'s line holding HEAD is one shape to git: refused, and only the route of the condition that holds closes',
  async () => {
  const copy = mergedInRepo();
  copy.git('branch', 'feat/export-2');
  assert.deepEqual(await viaReflog(copy, copy.planned), [holdsHead('feat/export-2'), holdsHead('feat/export-2'), copy.mergeIn],
    'main merged in, then a backup at the same tip; the reflog route, not synced: before the merge-in the copy still holds that tip, refused again, back '
      + 'on the merge-in');
  copy.git('branch', '-D', 'feat/export-2');
  assert.deepEqual(await closeOf(copy), ['plan-closed', [copy.planned, copy.named], false],
    'a copy of it: deleted, both own commits; the merge-in and main\'s commit are not its own');
  const cut = mergedInRepo();
  cut.git('checkout', '-q', '-b', 'feat/export-2');
  cut.commit('src/report/next.ts', 'export const n = 1;\n', 'next on top');
  cut.git('checkout', '-q', 'feat/export');
  assert.deepEqual(await viaReflog(cut, cut.planned), [holdsHead('feat/export-2'), holdsHead('feat/export-2'), cut.mergeIn],
    'main merged in, then a branch cut from it with its own commit; the reflog route, not synced: refused again, nothing recorded');
  const ff = mergedInRepo();
  ff.git('checkout', '-q', 'main');
  ff.git('merge', '-q', 'feat/export'); // git fast-forwards main: its old tip is an ancestor
  ff.git('checkout', '-q', 'feat/export');
  assert.deepEqual(await viaReflog(ff, ff.planned), [holdsHead('main'), holdsHead('main'), ff.mergeIn],
    'main merged in, then a plain git merge of it on main; the reflog route, not synced: refused again, never a closed record of nothing');
  const trunk = ownRepo('main');
  trunk.git('checkout', '-q', '-b', 'pr');
  trunk.commit('src/pr/fix.go', 'package pr\n', 'a merged PR');
  trunk.git('checkout', '-q', 'main');
  trunk.git('merge', '-q', '--no-ff', '--no-edit', 'pr');
  trunk.git('branch', '-q', '-D', 'pr');
  trunk.git('branch', 'mate/topic');
  assert.deepEqual(await viaReflog(trunk, trunk.planned, 'main'), [holdsHead('mate/topic', 'main'), holdsHead('mate/topic', 'main'),
    trunk.git('rev-parse', 'mate/topic')],
    'a plan on main, a PR merged since, a teammate\'s branch cut from main; the reflog route, not synced: refused again, main back on the PR\'s merge');
  const detached = ownRepo('feat/export');
  detached.git('checkout', '-q', '--detach');
  writePlan(detached.root, { id: 'a-export', title: 'Report export', head: detached.fork, plan: 'src/report/**', day: 1, branch: null });
  assert.deepEqual(await closeOf(detached), holdsHead('feat/export', 'HEAD', 'git checkout --detach'),
    'a plan of a detached HEAD: no branch to put back, HEAD\'s own reflog');
  const synced = mergedOutRepo();
  const after = synced.commit('docs/notes.md', 'notes\n', 'teammate: notes after the merge');
  synced.git('checkout', '-q', 'feat/export');
  synced.git('merge', '-q', '--ff-only', 'main');
  assert.deepEqual(await viaReflog(synced, synced.planned), [holdsHead('main'), ['plan-closed', [synced.planned, synced.named], false], after],
    `case 6: synced onto main after its merge, past it to ${after.slice(0,
      7)}, no commit since: the same refusal; its route: back at its tip before the sync, both own commits, then on the synced tip again`);
});

test('a branch that moved with a tip no other line holds is refused, and the reflog route closes it',
  async () => {
  const rebased = forkedRepo();
  rebased.git('checkout', '-q', 'feat/export');
  rebased.git('rebase', '-q', 'main');
  const rebasedTip = rebased.git('rev-parse', 'HEAD');
  assert.deepEqual(await viaReflog(rebased, rebased.planned), [holdsUnder(rebased.teammate, 'main'),
    ['plan-closed', [rebased.planned, rebased.named], false], rebasedTip],
    'rebased onto main, no merge anywhere, no commit since: back at its tip before the rebase, both own commits, then on the rebased tip again');
  const merged = forkedRepo();
  merged.git('checkout', '-q', 'feat/export');
  merged.git('rebase', '-q', 'main');
  merged.git('checkout', '-q', 'main');
  merged.git('merge', '-q', '--no-ff', '--no-edit', 'feat/export');
  merged.git('checkout', '-q', 'feat/export');
  const onMain = merged.git('rev-parse', 'HEAD');
  assert.deepEqual(await viaReflog(merged, merged.planned), [holdsUnder(merged.teammate, 'main'), ['plan-closed', [merged.planned, merged.named], false],
    onMain],
    'rebased, then merged --no-ff (the merge\'s ^2 is HEAD itself): the reflog still holds its tip before the rebase; back on the rebased tip after');
  const reused = mergedOutRepo();
  reused.git('branch', '-q', '-D', 'feat/export');
  reused.git('checkout', '-q', '-b', 'feat/export');
  const next = reused.commit('docs/next.md', 'next\n', 'next work');
  assert.deepEqual(await viaReflog(reused, reused.merge), [holdsUnder(reused.merge, 'main'), holdsHead('main'), next],
    'its name reused from main for new work: its reflog holds only the new branch, refused again, nothing recorded');
  const reusedRoute = { '<that merge: on main\'s line, merging feat/export>': reused.merge };
  assert.deepEqual(await follow(reused, 2, reusedRoute), [holdsUnder(reused.merge, 'main'), ['plan-closed', [reused.planned, reused.named], false], next],
    'its name reused: that merge\'s ^2, both own commits; then back on the new work, which no route leaves only in the reflog');
  const first = ownRepo('feat/export');
  first.git('checkout', '-q', 'main');
  const mate = first.commit('src/report/format.ts', 'export const f = 1;\n', 'teammate: format the dates');
  first.git('checkout', '-q', '-b', 'feat/late', first.fork);
  first.git('merge', '-q', '--ff-only', 'main');
  first.commit('src/report/late.ts', 'export const l = 1;\n', 'late work');
  writePlan(first.root, { id: 'a-export', title: 'Report export', head: first.fork, plan: 'src/report/**', day: 1, branch: 'feat/late' });
  assert.deepEqual(await closeOf(first), ['plan-close-merged', [`plan-close-merged: a-export: HEAD's line holds ${mate.slice(0,
    8)}, which main's line holds too: own commits unknown, nothing recorded`, ...routesOf('main', 'feat/late')], true],
      'synced before the work: main\'s commit under it');
});

/** feat/export forked from main, its plan (ID) begun there and made READY the way a person makes it, through the rubric's records (world.cjs recordsFor),
 * after
 * `early(repo)` (commits made before READY: not its work); `start`: its READY head; `own()` then commits its two own commits, one naming it (a Ruby file
 * outside the plan),
 * one touching a planned file -> their shas, oldest first. */
async function readyRepo(early = () => null) {
  const repo = realRepo();
  repo.commit('src/report/export.ts', 'export const a = 1;\n', 'start');
  repo.git('checkout', '-q', '-b', 'feat/export');
  const id = await begin(repo.io);
  const records = recordsFor('normal', ['src/report/**']);
  for (const record of records.slice(0, -1)) await added(repo.io, id, record);
  early(repo); // before the person's yes, the write that makes it READY
  assert.equal((await added(repo.io, id, records.at(-1))).out.state.ready, true, 'READY');
  const own = () => [repo.commit('lib/export.rb', 'EXPORT = 1\n', `export rows (${id})`),
    repo.commit('src/report/stream.ts', 'export const s = 1;\n', 'stream the rows')];
  return { ...repo, start: repo.git('rev-parse', 'HEAD'), own, id, file: path.join(repo.root, `.decisionbook/${id}.jsonl`) };
}
/** "make it READY" taken as an action after a refusal: ready, then close -> [READY?, what close said, every ready record's head, a closed record written?,
 * feat/export's tip] */
async function readyThenClose(repo) {
  const ready = (await verbs.ready(repo.io, { rest: [repo.id] })).out.ready;
  const said = await closeOf(repo);
  const rows = nodeFs.readFileSync(repo.file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  return [ready, said, rows.filter((r) => r.t === 'ready').map((r) => r.head), rows.some((r) => r.t === 'closed'), repo.git('rev-parse', 'feat/export')];
}

// READY is the freeze, so `ready` on a READY plan that holds stores nothing again (before: a second ready record that kept the
// first one's head). Where the work began is the one ready record's head, and close still credits from there
test('ready on a READY plan stores nothing again: ready then close credits the work since its READY',
  async () => {
  const plain = await readyRepo((repo) => repo.commit('src/report/draft.ts', 'export const d = 1;\n', 'a draft')); // near miss: a planned file, before READY
  const [named, planned] = plain.own();
  const notes = plain.commit('docs/notes.md', 'notes\n', 'notes'); // near miss: names no plan, touches no planned file
  assert.deepEqual(await readyThenClose(plain), [true, ['plan-closed', [planned, named], false], [plain.start], true, notes],
    'ready again after the work: both own commits, never the draft before READY nor the notes');
  const early = await readyRepo();
  early.git('checkout', '-q', 'main');
  const mate = early.commit('lib/mate.rb', 'MATE = 1\n', 'teammate work');
  early.git('checkout', '-q', 'feat/export');
  early.git('merge', '-q', '--ff-only', 'main'); // synced before the work
  const [, earlyTip] = early.own();
  assert.deepEqual(await closeOf(early), holdsUnder(mate, 'main', early.id), 'synced before the work: main\'s commit under HEAD, the fifth route\'s shape');
  assert.deepEqual(await readyThenClose(early), [true, holdsUnder(mate, 'main', early.id), [early.start], false, earlyTip],
    'ready then close: refused again, never a closed record of nothing');
  const late = await readyRepo();
  late.own();
  late.git('checkout', '-q', 'main');
  late.git('merge', '-q', '--no-ff', '--no-edit', 'feat/export');
  const merge = late.git('rev-parse', 'HEAD');
  late.git('checkout', '-q', 'feat/export');
  late.git('merge', '-q', '--ff-only', 'main'); // synced after main merged it
  // then committed: the reflog route's "no commit since" does not hold
  const more = late.commit('src/report/more.ts', 'export const m = 1;\n', `more rows (${late.id})`);
  assert.deepEqual(await closeOf(late), holdsUnder(merge, 'main', late.id), 'committed after a sync: main\'s merge under HEAD');
  assert.deepEqual(await readyThenClose(late), [true, holdsUnder(merge, 'main', late.id), [late.start], false, more],
    'ready then close: refused again; the later commit stays on the branch');
});

// READY is the freeze. A plain protected file outside the plan joins it (the product writes the one line and says so) and a path
// planned after READY is the plan's too; a danger path is what stays the person's: outside the plan it asks naming the file, and planned
// after READY below critical work it is denied
test('[I-5] the gate reads the READY plan: inside passes, a file outside is asked, a danger path outside asks naming the file',
  async () => {
  const io = bookWorld();
  writeConfig(io, { protect: ['src/**', 'app/**'] });
  const id = await begin(io);
  for (const record of recordsFor('normal', ['src/report/**'])) await added(io, id, record);
  assert.equal((await verbs.ready(io, { rest: [id] })).out.ready, true);
  assert.deepEqual(await gateSays(io, 'src/report/export.ts'), ['allow', 'gate-in-scope', id]);
  assert.deepEqual(await gateSays(io, 'docs/guide.md'), ['allow', 'gate-not-protected', null]);
  const danger = await handlers.preEdit(editEvent('src/billing/db/retries.sql'), io);
  assert.deepEqual([danger.verdict, danger.code, danger.plan], ['ask', 'plan-out-of-scope', id]);
  assert.match(danger.reason, /^DecisionBook gate: plan-out-of-scope: src\/billing\/db\/retries\.sql: a danger path \(a danger zone, a database schema or migration\) outside the READY plan is the person's, once/);
  const outside = await handlers.preEdit(editEvent('src/billing/retry.ts'), io);
  assert.deepEqual([outside.verdict, outside.code, outside.plan, 'context' in outside], ['ask', 'plan-outside', id, false]);
  assert.ok(!planRecords(io, id).some((r) => r.to === 'file:src/billing/retry.ts'), 'nothing joins at an ask');
  await added(io, id, { t: 'link', rel: 'plans', to: 'file:app/**', why: 'planned after READY' });
  assert.deepEqual(await gateSays(io, 'app/models/user.rb'), ['ask', 'plan-outside', id], 'a path the AI planned after READY is not the person\'s yes');
  assert.deepEqual(await gateSays(io, 'app/db/users.sql'), ['ask', 'plan-out-of-scope', id], 'a danger path under it is the person\'s');
  await added(io, id, { t: 'link', rel: 'plans', to: 'file:src/billing/db/retries.sql', why: 'planned after READY, with no yes of the person' });
  assert.deepEqual(await gateSays(io, 'src/billing/db/retries.sql'), ['ask', 'plan-out-of-scope', id],
    'the danger path asked about opens with no link of the AI: linked after the yes, it is still outside the plan and still the person\'s');
  io.state.branch = 'feat/other';
  assert.deepEqual(await gateSays(io, 'src/report/export.ts'), ['deny', 'plan-none', null], 'another branch\'s READY opens nothing here');
});

// a file of the parked plan is a file outside the newer one: asked under the newer plan, which names itself; a danger path there asks
test('[I-8] a newer READY plan parks the older: the older opens nothing, its file is asked under the newer one', async () => {
  const io = bookWorld();
  writeConfig(io, { protect: ['src/**'] });
  const old = await begin(io, { title: 'Report export' });
  for (const record of recordsFor('normal', ['src/report/**'], '.old')) await added(io, old, record);
  await verbs.ready(io, { rest: [old] });
  const next = await begin(io, { title: 'Report filters' });
  // no supersedes link: parked, not replaced
  for (const record of recordsFor('normal', ['src/filters/**'], '.next').slice(0, -1)) await added(io, next, record);
  assert.equal((await added(io, next, { t: 'confirm', by: 'Ayse', said: 'yes' })).out.state.parked, old, 'the yes that makes it READY parks the older');
  assert.deepEqual(await gateSays(io, 'src/report/db/rows.sql'), ['ask', 'plan-out-of-scope', next], 'a danger path the parked plan held is outside the newer one');
  assert.deepEqual(await gateSays(io, 'src/report/export.ts'), ['ask', 'plan-outside', next], 'the parked plan\'s file is outside the newer one');
  assert.deepEqual(await gateSays(io, 'src/filters/a.ts'), ['allow', 'gate-in-scope', next]);
});

/** On `branch`: an older READY plan of src/<a>/**, then a newer one of src/<b>/** with `extra` records (a supersedes link, or none), made READY unless `draft`.
 * -> [older, newer] */
async function twoPlans(io, branch, [a, b], { extra = [], draft = false } = {}) {
  io.state.branch = branch;
  const [old, next] = [await begin(io, { title: `${a} on ${branch}` }), await begin(io, { title: `${b} on ${branch}` })];
  for (const record of recordsFor('normal', [`src/${a}/**`], `.${a}`)) await added(io, old, record);
  await verbs.ready(io, { rest: [old] });
  for (const record of [...recordsFor('normal', [`src/${b}/**`], `.${b}`).slice(0, -1), ...extra.map((rel) => ({ t: 'link', rel, to: `plan:${old}`,
    why: 'replaces it' }))]) await added(io, next, record);
  if (!draft) await added(io, next, { t: 'confirm', by: 'Ayse', said: 'yes' }); // a draft: no yes yet, so it is not READY
  return [old, next];
}

test('a READY plan another one superseded stays shut when its successor closes; a parked plan opens again',
  async () => {
  const io = bookWorld();
  writeConfig(io, { protect: ['src/**'] });
  const [old, next] = await twoPlans(io, 'feat/export', ['report', 'filters'], { extra: ['supersedes'] });
  const committed = (id) => { io.state.commits = [{ after: io.state.head, sha: `c-${id}`, subject: 'work', body: `DecisionBook: ${id}`, files: [] }]; }; // a close needs its commit
  committed(next);
  await verbs.close(io, { rest: [next] });
  assert.deepEqual(await gateSays(io, 'src/report/export.ts'), ['deny', 'plan-none', null],
    'the line of supersession goes on in the closed one: the replaced plan opens nothing');
  assert.equal((await verbs.show(io, { rest: [old] })).out.state, 'superseded');
  const [parked, newer] = await twoPlans(io, 'feat/two', ['charts', 'labels']);
  committed(newer);
  await verbs.close(io, { rest: [newer] });
  assert.deepEqual(await gateSays(io, 'src/charts/axis.rb'), ['allow', 'gate-in-scope', parked],
    'parked, never replaced: it is the branch\'s READY plan again');
  const [kept] = await twoPlans(io, 'feat/three', ['search', 'ranking'], { extra: ['supersedes'], draft: true });
  assert.deepEqual(await gateSays(io, 'src/search/query.go'), ['allow', 'gate-in-scope', kept], 'a draft\'s link binds nothing');
});

