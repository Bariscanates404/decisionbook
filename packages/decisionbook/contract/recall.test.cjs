// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// DecisionBook gives the AI the earlier plans of the area it works in, not only the ones its words match: the files it touches, their
// folder and one import step, and the same concerns nearby (a decision key's area). Small cards first, deeper on demand. Black box: the public entry and kit's
// fake io; the walk is reached through the real handlers (UserPromptSubmit, PostToolUse) and the `related` verb, which call its one owner.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { errors: { fail } } = require('@atlasbound/kit');
const { bookWorld, writeConfig, readOf, textOf, onDay, stepRows } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
/** One plan's file as a team commits it: its plan record, plans, links, decisions (by Ayse) and, when READY or closed, its ready or closed record; `head`:
 * the
 * git head it began (and was made READY) on; `closed`: true, or the closeout's own fields. */
function planText({ id, title, branch = 'main', day = 1, plans = [], decisions = [], links = [], ready = false, closed = false,
  why = 'it is a rule we do follow all the way', head }) {
  const rows = [{ schema: 'decisionbook-record/1', t: 'plan', id, title, why, branch, head },
    ...plans.map((to) => ({ t: 'link', rel: 'plans', to: `file:${to}`, why: 'the code' })),
    ...links.map(([rel, to]) => ({ t: 'link', rel, to, why: 'fixture' })), ...decisions.map((d) => ({ t: 'decision', why: 'a rule', by: 'Ayse', ...d })),
    ...(ready ? [{ t: 'ready', scope: plans, level: 'normal', head }] : []), ...(closed ? [{ t: 'closed', own: [], files: plans, tests: [], other: 0,
      ...closed }] : [])];
  return rows.map((r) => `${JSON.stringify({ ...r, at: onDay(day) })}\n`).join('');
}
const webOf = (plans) => Object.fromEntries(plans.map((i) => [`.decisionbook/${i.id}.jsonl`, planText(i)]));
const LOGIN = 'app/controllers/login_controller.rb';
const SESSIONS = 'app/controllers/sessions_controller.rb';
const USER = 'app/models/user.rb';
const EXPIRY = { id: 'PLAN-20261001-session-expiry', title: 'Session expiry', day: 1, plans: [SESSIONS], closed: true,
  decisions: [{ key: 'auth.session-ttl', value: '30 minutes', files: [SESSIONS] }] };
const REMEMBER = { id: 'PLAN-20261003-remember-me', title: 'Remember me', day: 3, plans: [USER],
  decisions: [{ key: 'auth.remember-me', value: 'off', files: [USER] }] };
const EXPORT = { id: 'PLAN-20261005-report-export', title: 'Report export is slow', day: 5, plans: ['src/report/export.rb'],
  decisions: [{ key: 'report.export.rows', value: 'streamed' }] };
const LOGIN_PROMPT = 'the login screen keeps users signed in too long';
const prompt = (text, session = 's1') => ({ hook_event_name: 'UserPromptSubmit', session_id: session, prompt: text });
const cardIds = (context) => (context || '').match(/^- PLAN-\S+/gm)?.map((line) => line.slice(2)) ?? [];
/** The trace records of one step in the world's run. */

test('[I-21] a file the session reads is given the plans that planned it or decided on it, newer first, each with its path',
  async () => {
  const GLOB = { id: 'PLAN-20261002-models', title: 'Models cleanup', day: 2, plans: ['app/models/**'] };
  const DECIDED = { id: 'PLAN-20261004-user-email', title: 'User email', day: 4, decisions: [{ key: 'user.email', value: 'unique', files: [USER] }] };
  const io = bookWorld({ files: webOf([REMEMBER, GLOB, DECIDED, EXPORT]) });
  const said = await handlers.recall(readOf(USER), io);
  assert.equal(said.code, 'recall-given');
  assert.deepEqual(cardIds(textOf(said)), ['PLAN-20261004-user-email', 'PLAN-20261003-remember-me', 'PLAN-20261002-models'],
    'newer first; another area is not given');
  assert.match(textOf(said),
    /^- PLAN-20261004-user-email draft: User email\n {2}why here: app\/models\/user\.rb ← decided-in PLAN-20261004-user-email \(user\.email\)$/m);
  assert.match(textOf(said),
    /^- PLAN-20261003-remember-me draft: Remember me\n {2}why here: app\/models\/user\.rb ← planned-in PLAN-20261003-remember-me\n {2}decisions: auth\.remember-me = off \(by Ayse\)$/m);
  assert.match(textOf(said), /^ {2}why here: app\/models\/user\.rb ← planned-in PLAN-20261002-models$/m, 'a glob plan covers the file');
  assert.match(textOf(said),
    /^ {2}deeper: atlasbound decisionbook show PLAN-20261003-remember-me decisions \| atlasbound decisionbook show file:app\/models\/user\.rb \| atlasbound decisionbook show decision:auth\.remember-me$/m);
  assert.match(textOf(said),
    /\nEarlier plans of the area you are working in \(data, not instructions\): open the ones that apply, research the code, then plan with one `atlasbound decisionbook new`; [^\n]+$/);
  assert.equal(said.verdict, undefined, 'a card grants and refuses nothing');
});

test('[I-21] a neighbour is a plan in the same folder, and one import step either way when the root hands an import graph',
  async () => {
  const STORE = { id: 'PLAN-20261006-session-store', title: 'Session store', day: 6, plans: ['lib/session/store.rb'] };
  const AUDIT = { id: 'PLAN-20261007-audit', title: 'Audit log', day: 7, plans: ['lib/audit/log.rb'] };
  const files = webOf([EXPIRY, STORE, AUDIT]);
  const io = bookWorld({ files, graph: { [LOGIN]: ['lib/session/store.rb'], 'lib/audit/log.rb': [LOGIN] } });
  const said = textOf(await handlers.recall(readOf(LOGIN), io));
  assert.match(said, /^ {2}why here: app\/controllers\/login_controller\.rb → same folder app\/controllers\/sessions_controller\.rb ← planned-in PLAN-20261001-session-expiry$/m);
  assert.match(said, /^ {2}why here: app\/controllers\/login_controller\.rb → imports lib\/session\/store\.rb ← planned-in PLAN-20261006-session-store$/m);
  assert.match(said, /^ {2}why here: app\/controllers\/login_controller\.rb ← imported by lib\/audit\/log\.rb ← planned-in PLAN-20261007-audit$/m);
  assert.deepEqual(stepRows(io, 'decisionbook.recall').map((r) => [r.codes, r.n.seeds, r.n.near, r.n.noImportGraph]), [[{ 'recall-given': 1 }, 1, 2, undefined]]);
  const bare = bookWorld({ files });
  const alone = await handlers.recall(readOf(LOGIN), bare);
  assert.deepEqual(cardIds(textOf(alone)), ['PLAN-20261001-session-expiry'], 'no graph: no import step, never a guess');
  assert.deepEqual(stepRows(bare, 'decisionbook.recall').map((r) => [r.n.near, r.n.noImportGraph]), [[undefined, 1]],
    'the trace says the import step was not measured');
});

test('[I-21] the concern hop: a prompt with no matching word reaches the decisions of its concern',
  async () => {
  const io = bookWorld({ files: webOf([EXPIRY, REMEMBER, EXPORT]), changed: ['.decisionbook/PLAN-20261005-report-export.jsonl', LOGIN] });
  assert.equal((await verbs.find(io, { rest: LOGIN_PROMPT.split(' ').filter((w) => w.length > 3) })).text, 'nothing found\n', 'the words do not match');
  const said = await handlers.prompt(prompt(LOGIN_PROMPT), io);
  assert.equal(said.code, 'prompt-recall');
  assert.deepEqual(cardIds(textOf(said)), ['PLAN-20261001-session-expiry', 'PLAN-20261003-remember-me'],
    'the neighbour first, then the same concern; the report export is another area');
  assert.match(textOf(said),
    /^- PLAN-20261001-session-expiry closed: Session expiry\n {2}why here: app\/controllers\/login_controller\.rb → same folder app\/controllers\/sessions_controller\.rb ← planned-in PLAN-20261001-session-expiry\n {2}decisions: auth\.session-ttl = 30 minutes \(by Ayse\)$/m);
  assert.match(textOf(said),
    /^ {2}why here: app\/controllers\/login_controller\.rb → same folder app\/controllers\/sessions_controller\.rb ← planned-in PLAN-20261001-session-expiry → decides auth\.session-ttl → area auth → auth\.remember-me$/m);
  assert.deepEqual(stepRows(io, 'decisionbook.prompt').map((r) => [r.codes, r.n.cards, r.n.seeds]), [[{ 'prompt-recall': 1 }, 2, 1]],
    'one seed: an uncommitted DecisionBook record is history, not the work');
});

test('[I-21] a replaced decision is shown as replaced and a superseded plan names its successor, never as current',
  async () => {
  const OLD = { id: 'PLAN-20261001-ttl-old', title: 'Session TTL', day: 1, plans: [SESSIONS], closed: true,
    decisions: [{ key: 'auth.session-ttl', value: '60 minutes', files: [SESSIONS] }] };
  const NEW = { id: 'PLAN-20261008-ttl-new', title: 'Shorter sessions', day: 8, plans: [SESSIONS], closed: true,
    links: [['supersedes', 'plan:PLAN-20261001-ttl-old']],
    decisions: [{ key: 'auth.session-ttl', value: '30 minutes', files: [SESSIONS], supersedes: ['PLAN-20261001-ttl-old/auth.session-ttl'] }] };
  const said = textOf(await handlers.recall(readOf(SESSIONS), bookWorld({ files: webOf([OLD, NEW]) })));
  assert.deepEqual(cardIds(said), ['PLAN-20261008-ttl-new', 'PLAN-20261001-ttl-old']);
  assert.match(said, /^- PLAN-20261008-ttl-new closed: Shorter sessions\n.*\n {2}decisions: auth\.session-ttl = 30 minutes \(by Ayse\)$/m);
  assert.match(said, /^- PLAN-20261001-ttl-old closed, replaced by PLAN-20261008-ttl-new: Session TTL\n.*\n {2}decisions: auth\.session-ttl = 60 minutes \(by Ayse\) replaced by PLAN-20261008-ttl-new\/auth\.session-ttl$/m);
});

test('[I-21] a linked earlier plan\'s card says what it built and its files; an unrelated plan gives no card and no line',
  async () => {
  const REPLY = 'app/models/reply.rb';
  const POLICY = { id: 'PLAN-20261009-reply-policy', title: 'Reply policy', day: 9, plans: [USER], ready: true, head: 'h0' };
  const REQUESTS = { id: 'PLAN-20261010-reply-requests', title: 'Reply requests', day: 10, plans: [REPLY], ready: true, head: 'c1' };
  const CSV = { id: 'PLAN-20261011-report-csv', title: 'Report CSV', day: 11, plans: ['src/report/csv.rb'], ready: true, head: 'c2' };
  // the cards are of HEAD's branch; this one the session holds
  const HELD = { id: 'PLAN-20261012-billing-retry', title: 'Billing retry', day: 12, plans: ['src/billing/retry.rb'], ready: true, head: 'c3' };
  const end = (sha, files, after) => ({ sha, subject: `end of ${sha}`, body: '', files, after }); // the fake git answers commits(base) with the ones `after` it
  const policyFiles = ['.decisionbook/PLAN-20261009-reply-policy.jsonl', 'app/assets/a.css', USER, 'app/views/user.haml'];
  const io = bookWorld({ branch: 'main', files: webOf([POLICY, REQUESTS, CSV, HELD]), commits: [end('c2', [REPLY, USER], 'h0'), end('c1', policyFiles, 'h0'),
    end('c2', [REPLY, USER], 'c1')] });
  const [reads, commitsOf] = [[], io.git.commits];
  io.git.commits = (base) => reads.push(base) && commitsOf(base);
  const said = textOf(await handlers.recall(readOf(USER), io));
  assert.deepEqual(cardIds(said), ['PLAN-20261009-reply-policy', 'PLAN-20261010-reply-requests'], 'the report CSV is another area: no card');
  assert.match(said, /^- PLAN-20261009-reply-policy parked: Reply policy\n {2}why here: app\/models\/user\.rb ← planned-in PLAN-20261009-reply-policy\n {2}built: app\/models\/user\.rb, app\/assets\/a\.css, app\/views\/user\.haml @ c1$/m, 'its planned file first; its own record is history, not the work');
  assert.match(said, /^ {2}built: app\/models\/reply\.rb, app\/models\/user\.rb @ c2$/m, 'c2 is the next task\'s own commit, never the earlier one\'s');
  assert.deepEqual([said.match(/^ {2}built: /gm).length, reads], [2, ['h0', 'c1']], 'a line per linked card; one git read per head a shown card began after');
  assert.deepEqual(stepRows(io, 'decisionbook.recall').map((r) => r.n.built), [2]);
  const closed = bookWorld({ files: webOf([{ ...POLICY, closed: { own: [{ sha: 'c9', subject: 'reply policy' }], files: [USER] } }]) });
  closed.git.commits = async () => assert.fail('a closed plan says what it built itself');
  assert.match(textOf(await handlers.recall(readOf(USER), closed)),
    /^- PLAN-20261009-reply-policy closed: Reply policy\n.*\n {2}built: app\/models\/user\.rb @ c9$/m);
});

// what a context was already told is the cli's one rule (cli contract said.test, recall.test), so DecisionBook keeps no "given"
// record:
// every hook gives the area's best cards as say items, keyed by the plan, with the one-line pointer the cli says where a card is relevant again.
test('[I-21] a read and a prompt give the area\'s best cards each time, each a say item keyed by its plan, with no home too',
  async () => {
  const files = webOf([EXPIRY, REMEMBER]);
  const io = bookWorld({ files, changed: [LOGIN] });
  const atPrompt = await handlers.prompt(prompt(LOGIN_PROMPT), io);
  assert.deepEqual(cardIds(textOf(atPrompt)), ['PLAN-20261001-session-expiry', 'PLAN-20261003-remember-me']);
  assert.deepEqual(atPrompt.say.map((s) => s.key), ['decisionbook.card:PLAN-20261001-session-expiry', 'decisionbook.card:PLAN-20261003-remember-me', 'decisionbook.recall']);
  assert.match(atPrompt.say[0].short,
    /^- PLAN-20261001-session-expiry given above, relevant here too: app\/controllers\/login_controller\.rb → same folder [^\n]+$/);
  assert.deepEqual(cardIds(textOf(await handlers.recall(readOf(SESSIONS), io))), ['PLAN-20261001-session-expiry', 'PLAN-20261003-remember-me'],
    'a read gives them again: the cli holds what was said');
  const first = bookWorld({ files: webOf([EXPORT]) });
  assert.deepEqual(cardIds(textOf(await handlers.recall(readOf('src/report/export.rb', 's3', 'Edit'), first))), ['PLAN-20261005-report-export'],
    'an edit is a first touch too');
  first.fs.writeAtomic('.decisionbook/PLAN-20261009-csv.jsonl', planText({ id: 'PLAN-20261009-csv', title: 'CSV columns', day: 9,
    plans: ['src/report/csv.rb'] }));
  assert.deepEqual(cardIds(textOf(await handlers.prompt(prompt('make the columns right please', 's3'), first))),
    ['PLAN-20261005-report-export', 'PLAN-20261009-csv'],
    'the file the session edited seeds its next prompt: its card again (the cli holds it) and the new one');
  const homeless = bookWorld({ files, home: null });
  assert.deepEqual(cardIds(textOf(await handlers.recall(readOf(SESSIONS), homeless))), ['PLAN-20261001-session-expiry', 'PLAN-20261003-remember-me'],
    'no home: the cards come, the touched file is not kept');
  assert.deepEqual(await handlers.recall(readOf(SESSIONS, null), io), { code: 'recall-unkept' }, 'no session: no one to give them to');
  assert.deepEqual(cardIds(textOf(await handlers.recall(readOf('README.md'), io))), [], 'a file no plan is near');
});

test('[I-21] the bound: many hits give at most 3 whole cards inside 2 KB, then the line naming the related verb',
  async () => {
  const long = 'x'.repeat(300);
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `PLAN-202610${String(10 + (i % 18)).padStart(2, '0')}-c${i}`, title: `${long} ${i}`,
    day: 10 + (i % 18),
    plans: [`app/controllers/c${i}.rb`], decisions: [{ key: `auth.rule${i}`, value: long, files: [`app/controllers/c${i}.rb`] }] }));
  const io = bookWorld({ files: webOf(many) });
  const said = await handlers.recall(readOf(LOGIN), io);
  assert.ok(Buffer.byteLength(textOf(said)) <= 2048, `${Buffer.byteLength(textOf(said))} bytes`);
  const shown = cardIds(textOf(said));
  assert.ok(shown.length >= 1 && shown.length <= 3, shown.join(', '));
  assert.match(textOf(said), /\nEarlier plans of the area you are working in [^\n]+; all of an area's: atlasbound decisionbook related <path>\.$/);
  assert.deepEqual(cardIds(textOf(await handlers.recall(readOf(LOGIN), io))), shown, 'the same best cards: the cli says them once per context');
});

test('[I-21] nothing relevant is the prompt exactly; short common words match nothing; two long words make a words card',
  async () => {
  const io = bookWorld({ files: webOf([EXPIRY, REMEMBER, EXPORT]) });
  const SHORT = 'please do it now, it is in the way of all we do';
  assert.deepEqual(await handlers.prompt(prompt(SHORT), io), { code: 'prompt-passed' }, 'no seed: no block, no new text');
  assert.deepEqual(await handlers.prompt(prompt('please look at the export'), io), { code: 'prompt-passed' }, 'one long word that holds is not enough');
  assert.deepEqual(await handlers.prompt(prompt('/decisionbook "the report export is slow again"'), io), { code: 'prompt-passed' }, 'a slash command never');
  const worded = 'the report export is slow again for big customers';
  assert.match(textOf(await handlers.prompt(prompt(worded), io)), /^- PLAN-20261005-report-export draft: Report export is slow\n {2}why here: the words report, export, slow \(title, links, decisions\)$/m,
    'two long words that hold make a card where no plan is asked for');
  writeConfig(io, { protect: ['app/**'] });
  const nudged = await handlers.prompt(prompt(SHORT), io);
  assert.deepEqual(Object.keys(nudged), ['code', 'say']);
  assert.equal(nudged.code, 'prompt-nudge');
  // where protection needs a plan, the plan pack replaces the cards (contract/pack.test.cjs holds its lines); here no area: the level and the calls
  assert.deepEqual(nudged.say.map((s) => s.key), ['decisionbook.nudge', 'decisionbook.pack']);
  assert.match(textOf(nudged), /^DecisionBook: protected files need a READY plan on this branch and there is none\.\nthis task runs as normal work [^\n]+\nA small fix instead [^\n]+\nIf this request changes code: [^\n]+\nwhere a blank is not free text: [^\n]+\natlasbound decisionbook new <<'JSON'\n\{[^\n]+\nJSON\natlasbound decisionbook add <id> <<'JSON'\n\[[^\n]+\nJSON$/,
    'the nudge\'s head, the level line, the small form (the prompt names no file), the calls');
  const packed = await handlers.prompt(prompt(worded), io);
  assert.deepEqual(cardIds(textOf(packed)), [], 'no card where the pack is said');
  assert.match(textOf(packed), /^- report\.export\.rows = streamed \(Ayse\)$/m, 'the words walk reached the report export: its decision is in the pack');
  const filed = bookWorld({ files: webOf([EXPIRY, REMEMBER, EXPORT]), changed: ['docs/notes.md'] });
  assert.deepEqual(await handlers.prompt(prompt(worded), filed), { code: 'prompt-passed' },
    'a file seeds the walk: words alone make no card');
  const broken = bookWorld({ files: webOf([EXPORT]) });
  writeConfig(broken, { protect: ['app/**'] });
  broken.git.statusZ = async () => { throw fail('git-failed', 'status: 128'); };
  assert.deepEqual((await handlers.prompt(prompt(SHORT), broken)).say, nudged.say, 'a git read that fails keeps the nudge and a pack of no earlier plan');
  assert.deepEqual(stepRows(broken, 'decisionbook.prompt').map((r) => [r.ok, r.n.recallUnread, r.n.packed]), [[true, 1, 1]], 'and the trace counts it');
});

test('[I-21] the same walk by hand: decisionbook related gives what the hooks give, with more room', async () => {
  const io = bookWorld({ files: { ...webOf([EXPIRY, REMEMBER, EXPORT]), [LOGIN]: 'class Login\n' } });
  const byHand = await verbs.related(io, { rest: [LOGIN] });
  assert.deepEqual(byHand.out.cards.map((c) => [c.id, c.rank]), [['PLAN-20261001-session-expiry', 'near'], ['PLAN-20261003-remember-me', 'concern']]);
  assert.match(byHand.text, /^- PLAN-20261001-session-expiry closed: Session expiry$/m);
  assert.deepEqual(cardIds((await verbs.related(io, { rest: ['report', 'export'] })).text), ['PLAN-20261005-report-export']);
  assert.equal((await verbs.related(io, { rest: ['nothing', 'here'] })).text, 'no earlier plan relates to this work\n');
  const named = await handlers.prompt(prompt(`why does \`${LOGIN}\` keep users signed in?`), io);
  assert.deepEqual(cardIds(textOf(named)), ['PLAN-20261001-session-expiry', 'PLAN-20261003-remember-me'], 'a path the prompt names that exists here');
  assert.deepEqual(stepRows(io, 'decisionbook.related').map((r) => Object.keys(r.codes)[0]), ['plan-shown', 'plan-shown', 'recall-none']);
});

// every task on ONE branch, or on a detached HEAD (branch null for the work and the plans alike).
const A = 'src/a.rb';
const OPTIONS = { id: 'PLAN-20261003-poll-options', title: 'Poll options', day: 3, plans: [A], ready: true,
  decisions: [{ key: 'poll.options', value: 'at most 10', files: [A] }] };
/** A closed task, a draft left behind, T1 READY then parked by T2's newer READY one (what SessionStart gives T2's session), each planning src/a.rb. */
const oneBranch = (branch) => webOf([{ id: 'PLAN-20261001-poll-closed', title: 'Poll closed', day: 1, plans: [A], closed: true },
  { id: 'PLAN-20261002-poll-draft', title: 'Poll draft', day: 2, plans: [A] }, OPTIONS,
    { id: 'PLAN-20261004-poll-limit', title: 'Poll limit', day: 4, plans: [A], ready: true }]
  .map((one) => ({ ...one, branch })));

test('[I-21] the earlier plans of the work\'s own branch are cards, on a named branch and a detached HEAD alike',
  async () => {
  for (const branch of ['feat/poll', null]) {
    const io = bookWorld({ files: oneBranch(branch), branch, changed: [A] });
    assert.equal((await verbs.resume(io)).out.id, 'PLAN-20261004-poll-limit', `SessionStart gives T2 its READY one (branch ${branch})`);
    const said = await handlers.prompt(prompt('limit how many options a poll may have'), io);
    assert.deepEqual(cardIds(textOf(said)), ['PLAN-20261003-poll-options', 'PLAN-20261002-poll-draft', 'PLAN-20261001-poll-closed'],
      `newer first (branch ${branch})`);
    assert.match(textOf(said),
      /^- PLAN-20261003-poll-options parked: Poll options\n {2}why here: src\/a\.rb ← planned-in PLAN-20261003-poll-options\n {2}decisions: poll\.options = at most 10 \(by Ayse\)$/m);
    assert.deepEqual(stepRows(io, 'decisionbook.prompt').map((r) => [r.n.seeds, r.n.found, r.n.cards]), [[1, 3, 3]], 'the trace counts what was found');
    assert.deepEqual((await verbs.related(io, { rest: [] })).out.cards.map((c) => c.id), cardIds(textOf(said)), 'decisionbook related: the same walk, the same rule');
  }
});

test('[I-21] with no READY plan on the branch, the draft the session start gives is never a card',
  async () => {
  for (const branch of ['main', null]) {
    const drafts = webOf([{ ...OPTIONS, ready: false, branch }, { id: 'PLAN-20261004-poll-limit', title: 'Poll limit', day: 4, plans: [A], branch }]);
    const io = bookWorld({ files: drafts, branch });
    const { out: held } = await verbs.resume(io);
    assert.equal(held.code, 'session-draft');
    const said = await handlers.recall(readOf(A), io);
    assert.deepEqual(cardIds(textOf(said)), ['PLAN-20261004-poll-limit', 'PLAN-20261003-poll-options'].filter((id) => id !== held.id), `branch ${branch}`);
  }
});
