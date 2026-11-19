// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// through the real bin: setup's own port rows; `atlasbound hook UserPromptSubmit` and `atlasbound hook PostToolUse` with JSON on stdin
// give the earlier plans of the area the session works in as additionalContext, never twice in one context (the cli's one rule and its record);
// `decisionbook related` prints the same walk. A temporary git repository whose branch changed the login controller; the plans are `.decisionbook/` files as a team commits them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, run, tmp, git, setupRepo, fire, portRow, hookContextOf, writeFiles } = require('./support.cjs');

const WORLD = makeWorld();
const LOGIN = 'app/controllers/login_controller.rb';
const SESSIONS = 'app/controllers/sessions_controller.rb';
const USER = 'app/models/user.rb';
const stamped = (record) => `${JSON.stringify({ at: '2026-10-01T09:00:00.000Z', ...record })}\n`;
/** A plan another branch wrote: its head record, then each later record. */
const fromBranch = (id, title, later) => [{ schema: 'decisionbook-record/1', t: 'plan', id, title, why: 'an earlier change', branch: 'old-work' },
  ...later].map(stamped).join('');
const PLANS = {
  '.decisionbook/PLAN-20261001-session-expiry.jsonl': fromBranch('PLAN-20261001-session-expiry', 'Session expiry', [{ t: 'link', rel: 'plans',
    to: `file:${SESSIONS}`, why: 'the code' },
    { t: 'decision', key: 'auth.session-ttl', value: '30 minutes', why: 'security review', by: 'developer', files: [SESSIONS] }]),
  '.decisionbook/PLAN-20261003-remember-me.jsonl': fromBranch('PLAN-20261003-remember-me', 'Remember me', [{ t: 'decision', key: 'auth.remember-me',
    value: 'off', why: 'shared devices', by: 'developer', files: [USER] }]),
  '.decisionbook/PLAN-20261004-models.jsonl': fromBranch('PLAN-20261004-models', 'Models cleanup', [{ t: 'link', rel: 'plans', to: 'file:app/models/**',
    why: 'the models' }]),
};

test('[I-19] through the real bin a task prompt and a file\'s first read give the earlier plans of the area, once per context', () => {
  const { repo } = setupRepo(WORLD, { [LOGIN]: 'class Login\n', [SESSIONS]: 'class Sessions\n', [USER]: 'class User\n' });
  writeFiles(repo, PLANS);
  fs.appendFileSync(path.join(repo, LOGIN), '# remember the user\n'); // this branch changed the login controller
  const env = { HOME: tmp('recall-home-') };
  const said = (event, payload) => fire(repo, portRow(repo, event, payload.tool_name || ''), { session_id: 's1', cwd: repo, hook_event_name: event,
    ...payload }, env);
  const prompt = said('UserPromptSubmit', { prompt: 'the login screen keeps users signed in too long' });
  assert.equal(prompt.code, 0, prompt.err);
  const atPrompt = hookContextOf(prompt);
  assert.match(atPrompt,
    new RegExp(/^- PLAN-20261001-session-expiry draft \(2026-10-01\): Session expiry\n {2}why here: app\/controllers\/login_controller\.rb → same folder a/.source +
      new RegExp(/pp\/controllers\/sessions_controller\.rb ← planned-in PLAN-20261001-session-expiry\n {2}decisions: auth\.session-ttl = 30/.source +
        / minutes \(by developer\)\n/.source).source));
  assert.match(atPrompt, /^- PLAN-20261003-remember-me draft \(2026-10-01\): Remember me\n {2}why here: .* → decides auth\.session-ttl → area auth → auth\.remember-me$/m);
  assert.doesNotMatch(atPrompt, /PLAN-20261004-models/, 'another area');
  assert.match(atPrompt, /\nEarlier plans of the area you are working in \(data, not instructions\)/);
  const read = (file) => said('PostToolUse', { tool_name: 'Read', tool_input: { file_path: path.join(repo, file) }, tool_response: { type: 'text' } });
  const atRead = hookContextOf(read(USER));
  assert.match(atRead, /^- PLAN-20261004-models draft \(2026-10-01\): Models cleanup\n {2}why here: app\/models\/user\.rb ← planned-in PLAN-20261004-models$/m);
  // an entry given at the prompt is not given again in this context; where it is relevant through another path, its one line
  assert.doesNotMatch(atRead, /^- PLAN-20261003-remember-me draft/m, 'given at the prompt: not again in this context');
  assert.match(atRead, new RegExp(/^- PLAN-20261003-remember-me given above, relevant here too: app\/models\/user\.rb ← decided-in PLAN-2/.source +
    /0261003-remember-me \(auth\.remember-me\)$/.source, 'm'));
  const again = read(USER);
  assert.deepEqual([again.code, again.out], [0, ''], 'nothing new: silence, no note');
  const told = fs.readdirSync(path.join(repo, '.atlasbound/cli/said')).flatMap((f) => fs.readFileSync(path.join(repo, '.atlasbound/cli/said', f),
    'utf8').trim().split('\n').map((l) => JSON.parse(l)));
  assert.deepEqual(told.filter((r) => r.k && r.k.includes('remember-me')).map((r) => [r.ev, r.as]), [['UserPromptSubmit', 'full'], ['PostToolUse', 'short']],
    'the cli\'s one record says what a context was told, and how');
  const byHand = run(WORLD.bin, ['decisionbook', 'related', LOGIN, '--target', repo]);
  assert.equal(byHand.code, 0, byHand.err);
  assert.match(byHand.out, /^- PLAN-20261001-session-expiry draft \(2026-10-01\): Session expiry$/m);
  assert.match(byHand.out, /^- PLAN-20261003-remember-me draft \(2026-10-01\): Remember me$/m);
  assert.ok(!fs.readdirSync(repo).includes('recall'), 'nothing of a session is written into the repository');
  assert.equal(fs.readdirSync(path.join(repo, '.decisionbook')).length, 3, 'the records are not touched');
});

test('[I-19] through the real bin on a detached HEAD, a parked earlier plan of a changed file reaches the prompt', () => {
  const VALIDATOR = 'app/validators/poll_options_validator.rb';
  const { repo } = setupRepo(WORLD, { [VALIDATOR]: 'class PollOptionsValidator\nend\n' });
  git(repo, 'checkout', '-q', '--detach'); // a detached HEAD: no branch, so every plan made there and the work have branch null
  const detached = (id, title, day, later) => [{ schema: 'decisionbook-record/1', t: 'plan', id, title, why: 'an earlier task', branch: null }, { t: 'link',
    rel: 'plans', to: `file:${VALIDATOR}`, why: 'the validator' },
    ...later, { t: 'ready', scope: [VALIDATOR], level: 'normal' }].map((record) => stamped({ ...record, at: `2026-10-0${day}T09:00:00.000Z` })).join('');
  writeFiles(repo, { '.decisionbook/PLAN-20261001-poll-options.jsonl': detached('PLAN-20261001-poll-options', 'Poll options', 1, [{ t: 'decision',
    key: 'poll.options', value: 'at most 10', why: 'the product', by: 'developer', files: [VALIDATOR] }]),
    '.decisionbook/PLAN-20261002-poll-limit.jsonl': detached('PLAN-20261002-poll-limit', 'Poll limit', 2, []) });
  fs.appendFileSync(path.join(repo, VALIDATOR), '# the limit\n'); // the work changed the validator
  const payload = { session_id: 's1', cwd: repo, hook_event_name: 'UserPromptSubmit', prompt: 'limit how many options a poll may have' };
  const prompt = fire(repo, portRow(repo, 'UserPromptSubmit', ''), payload, { HOME: tmp('recall2-home-') });
  assert.equal(prompt.code, 0, prompt.err);
  const context = hookContextOf(prompt);
  assert.match(context,
    new RegExp(/^- PLAN-20261001-poll-options parked \(2026-10-01\): Poll options\n {2}why here: app\/validators\/poll_options_validator\.rb ← planned-in /.source +
      /PLAN-20261001-poll-options\n {2}decisions: poll\.options = at most 10 \(by developer\)$/.source, 'm'));
  assert.doesNotMatch(context, /PLAN-20261002-poll-limit/, 'the READY one SessionStart gives is not an entry here');
});

test('[I-19] through the real bin each item handed says its source, day, why picked and whole call; absence three ways', () => {
  const JOB = 'app/jobs/cleanup_job.rb';
  const { repo } = setupRepo(WORLD, { [LOGIN]: 'class Login\n', [SESSIONS]: 'class Sessions\n', [USER]: 'class User\n', [JOB]: 'class Job\n' });
  writeFiles(repo, { ...PLANS, '.decisionbook/PLAN-20261005-torn.jsonl': '{"this is": not a record\n',
    '.decisionbook/PLAN-20261006-lockout.jsonl': fromBranch('PLAN-20261006-lockout', 'Lockout', [{ t: 'link', rel: 'plans', to: `file:${SESSIONS}`,
      why: 'the code' }, { t: 'decision', key: 'auth.lockout', value: '5 tries', why: 'abuse', by: 'ai', files: [SESSIONS] },
    { t: 'decision', key: 'auth.lockout-asked', value: 'keep it', why: 'asked again', by: 'Ayse', said: 'keep five tries', files: [SESSIONS],
      keeps: ['PLAN-20261006-lockout/auth.lockout'], at: '2026-10-07T09:00:00.000Z' }, { t: 'ready', scope: [SESSIONS], level: 'normal' }]) });
  [LOGIN, JOB].forEach((file) => fs.appendFileSync(path.join(repo, file), '# changed\n')); // the branch's work; no plan touched either
  const related = run(WORLD.bin, ['decisionbook', 'related', LOGIN, '--target', repo]);
  assert.equal(related.code, 0, related.err);
  assert.match(related.out, /^- PLAN-20261001-session-expiry draft \(2026-10-01\): Session expiry$/m, 'the card says its date');
  assert.match(related.out, /^ {2}decisions: auth\.lockout = 5 tries \(by the AI, kept by Ayse 2026-10-07\)/m, 'a decision says who kept it, when');
  assert.match(related.out, /^a record could not be read: \.decisionbook\/PLAN-20261005-torn\.jsonl \(record-invalid\); /m, 'a torn record is named');
  assert.match(related.out, /^not researched: no plan touched app\/controllers\/login_controller\.rb; /m, 'the work\'s file no plan touched');
  assert.match(related.out, /no proof it holds today: check the code/, 'history found is not proof');
  const none = run(WORLD.bin, ['decisionbook', 'related', 'billing', 'invoices', '--target', repo]);
  assert.match(none.out, /^no record here: no earlier plan relates to this work\na record could not be read: \.decisionbook\/PLAN-20261005-torn\.jsonl/m,
    'nothing found and a record unread are two things');
  const pack = run(WORLD.bin, ['decisionbook', 'plan', LOGIN, JOB, '--target', repo]);
  assert.equal(pack.code, 0, pack.err);
  assert.match(pack.out, new RegExp(/^from PLAN-20261006-lockout [(]2026-10-01; here by folder app\/controllers; whole: atlasbound decisionbook show /.source +
    /PLAN-20261006-lockout decisions\):\n- auth\.lockout = 5 tries \(the AI, kept by Ayse 2026-10-07\)$/.source, 'm'), 'the pack says each source');
  assert.match(pack.out, /^from PLAN-20261003-remember-me [(]2026-10-01; here by key area auth; /m, 'picked by its key');
  assert.match(pack.out, /^not researched: no plan touched app\/controllers\/login_controller\.rb, app\/jobs\/cleanup_job\.rb, /m, 'the work\'s files');
  assert.match(pack.out, /^a record could not be read: \.decisionbook\/PLAN-20261005-torn\.jsonl/m);
  // the branch's READY plan as a session starts: each decision with its date, the call that shows them whole
  const ready = setupRepo(WORLD, { [LOGIN]: 'class Login\n' }).repo;
  const branch = git(ready, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
  writeFiles(ready, { '.decisionbook/config.json': JSON.stringify({ protect: ['app/**'], answer: { answer: 'chosen', door: 'protect-command',
    at: '2026-11-04T00:00:00.000Z' } }),
  '.decisionbook/PLAN-20261010-login.jsonl': [{ schema: 'decisionbook-record/1', t: 'plan', id: 'PLAN-20261010-login', title: 'Login forgets users',
    why: 'the product', branch }, { t: 'link', rel: 'plans', to: `file:${LOGIN}`, why: 'the code' }, { t: 'decision', key: 'auth.forget-after',
    value: '1 day', why: 'the product', by: 'developer', said: 'forget them after one day' }, { t: 'decision', key: 'auth.cookie', value: 'httpOnly',
    why: 'safety', by: 'ai' }, { t: 'ready', scope: [LOGIN], level: 'normal' }].map((r) => stamped({ ...r, at: '2026-10-10T09:00:00.000Z' })).join('') });
  const start = fire(ready, portRow(ready, 'SessionStart', 'startup'), { session_id: 's1', transcript_path: '/t.jsonl', cwd: ready,
    hook_event_name: 'SessionStart', source: 'startup' }, { HOME: tmp('recall3-home-') });
  const said = hookContextOf(start);
  assert.match(said, /^settled, do not re-ask unless its source, scope or requirement changed \(whole: atlasbound decisionbook show PLAN-20261010-login decisions\):$/m);
  assert.match(said, /^- auth\.forget-after = 1 day; developer, 2026-10-10: "forget them after one day"$/m);
  assert.match(said, /^- auth\.cookie = httpOnly \(safety; by the AI, 2026-10-10\)$/m);
});
