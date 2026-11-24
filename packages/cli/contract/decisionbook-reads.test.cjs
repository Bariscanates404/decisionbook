// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The reading verbs over the records a repository already keeps, through the real bin: inbox, the proposal a person did not take in show,
// why (git blame to the closed plan) and pr. One repository whose plans arrive as committed files, as a pull brings a teammate's.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, makeRepo, git, run } = require('./support.cjs');

const plannedOn = (day) => `2026-11-${String(day).padStart(2, '0')}T09:00:00.000Z`;
const stampedPlan = (id, title, branch, day) => ({ title, why: 'totals are off by a cent', success: 'totals match the ledger', kind: 'bug',
  level: 'micro', schema: 'decisionbook-record/1', t: 'plan', id, branch, at: plannedOn(day) });
const ROUNDING = '2026-11-08-export-rounding';
const REFUNDS = '2026-11-12-refund-rounding';
const FORMAT = '2026-11-13-export-format';
const OLD = '2026-11-07-old-export';
const TEAM = '2026-11-14-team-import';
const ASKED = { t: 'question', q: 'Q1', text: 'Round half-up or half-even?', decides: 'export.rounding', whyNotCode: 'a product rule',
  proposal: 'half-up', blocking: true };
const SAID = 'use half-even, the auditors want it';

/** The repository: a commit of the rounding, its plan closed on it, a later plan that replaces its decision, a draft with an open question
 * and one parked with a colleague, a plan set aside, and a teammate's draft of another branch; README.md holds an uncommitted line. */
function plannedRepo() {
  const repo = makeRepo({ 'src/export.rb': 'total.round(2)\n' });
  const branch = git(repo, 'symbolic-ref', '--short', 'HEAD').trim();
  fs.writeFileSync(path.join(repo, 'src/export.rb'), 'total.round(2, half: :even)\n');
  git(repo, 'commit', '-qam', 'round half-even');
  const sha = git(repo, 'rev-parse', 'HEAD').trim();
  const plans = {
    [ROUNDING]: [stampedPlan(ROUNDING, 'Export rounding', branch, 8), { t: 'link', rel: 'plans', to: 'file:src/export.rb', why: 'the rounding' },
      { t: 'check', id: 'AC-1', text: 'totals match the ledger', command: 'rake test' }, ASKED,
      { t: 'decision', key: 'export.rounding', value: 'half-even', why: 'audit', by: 'Amy', answers: 'Q1', said: SAID, effect: ['check:AC-1'] },
      { ...ASKED, q: 'Q2', text: 'Show the cent column?', decides: 'export.cents', proposal: 'yes' },
      { t: 'decision', key: 'export.cents', value: 'yes', why: 'clarity', by: 'Amy', answers: 'Q2', said: 'yes', effect: ['check:AC-1'] },
      { t: 'ready', scope: ['src/export.rb'], level: 'micro' },
      { t: 'closed', head: sha, own: [{ sha, subject: 'round half-even' }], files: ['src/export.rb'], tests: [], other: 0 }],
    [REFUNDS]: [stampedPlan(REFUNDS, 'Refund rounding', branch, 12), { t: 'link', rel: 'plans', to: 'file:src/export.rb', why: 'the rounding' },
      { t: 'decision', key: 'export.rounding', value: 'half-up for refunds, half-even elsewhere', why: 'refunds', by: 'Amy',
        said: 'refunds round half-up', supersedes: [`${ROUNDING}/export.rounding`] },
      { t: 'ready', scope: ['src/export.rb'], level: 'micro' }],
    [FORMAT]: [stampedPlan(FORMAT, 'Export format', branch, 13), { ...ASKED, text: 'CSV or JSON?', decides: 'export.format', proposal: 'CSV with a header row' },
      { ...ASKED, q: 'Q2', text: 'Which delimiter does the bank read?', decides: 'export.delimiter', to: 'Lee', source: 'the bank call' }],
    [OLD]: [stampedPlan(OLD, 'Old export', branch, 7), { t: 'aside', by: 'Amy', said: 'later, after the release' }],
  };
  const write = (id, rows) => fs.writeFileSync(path.join(repo, '.decisionbook', `${id}.jsonl`),
    rows.map((row, i) => JSON.stringify({ at: plannedOn(Number(id.slice(8, 10))).replace('09:00:00', `09:${String(i).padStart(2, '0')}:00`), ...row })).join('\n') + '\n');
  fs.mkdirSync(path.join(repo, '.decisionbook'));
  Object.entries(plans).forEach(([id, rows]) => write(id, rows));
  git(repo, 'add', '.decisionbook');
  git(repo, 'commit', '-qm', 'the plans');
  write(TEAM, [stampedPlan(TEAM, 'Team import', 'feat/team', 14), { ...ASKED, text: 'Skip or stop on a bad row?', decides: 'import.bad-row',
    proposal: 'skip it and report it' }]);
  git(repo, 'add', '.decisionbook');
  git(repo, '-c', 'user.name=Lee', 'commit', '-qm', 'a teammate\'s plan, pulled');
  fs.appendFileSync(path.join(repo, 'README.md'), 'not yet committed\n');
  return { repo, branch, sha };
}

const world = makeWorld();
const given = plannedRepo();
const ab = (...args) => run(world.bin, [...args, '--target', given.repo]);

test('inbox: what waits for the person on this branch, and the teammates\' plans pulled here; read-only, one screen, --json', () => {
  const before = fs.readdirSync(path.join(given.repo, '.decisionbook')).map((name) => fs.readFileSync(path.join(given.repo, '.decisionbook', name), 'utf8'));
  const said = ab('decisionbook', 'inbox');
  assert.equal(said.code, 0, said.err);
  assert.equal(said.out, [`Waiting for you on ${given.branch}: open questions 1, questions parked with someone 1, READY plans not closed 1, set aside 1`,
    `- ${FORMAT} Q1: CSV or JSON? (proposed: CSV with a header row)`,
    `- ${FORMAT} Q2 for Lee: Which delimiter does the bank read? (from the bank call)`,
    `- ${REFUNDS} READY, not closed: Refund rounding`,
    `- ${OLD} set aside: Old export (Amy: "later, after the release")`,
    'Pulled from other branches: open questions 1, questions parked with someone 0, READY plans not closed 0, set aside 0',
    `- ${TEAM} on feat/team by Lee Q1: Skip or stop on a bad row? (proposed: skip it and report it)`, ''].join('\n'),
  'the closed plan waits for no one; the question parked with a colleague waits for him, said here too');
  const json = JSON.parse(ab('decisionbook', 'inbox', '--json').out);
  assert.deepEqual([json.branch, json.here.map((row) => [row.id, row.waits]), json.pulled.map((row) => [row.id, row.branch, row.by, row.q, row.proposal])],
    [given.branch, [[FORMAT, 'question'], [FORMAT, 'parked'], [REFUNDS, 'ready'], [OLD, 'aside']], [[TEAM, 'feat/team', 'Lee', 'Q1', 'skip it and report it']]]);
  const after = fs.readdirSync(path.join(given.repo, '.decisionbook')).map((name) => fs.readFileSync(path.join(given.repo, '.decisionbook', name), 'utf8'));
  assert.deepEqual(after, before, 'read-only: no record written');
});

test('show: under a person\'s decision that differs from its question\'s proposal, that proposal once, never called refused', () => {
  const shown = ab('decisionbook', 'show', ROUNDING);
  assert.equal(shown.code, 0, shown.err);
  const lines = shown.out.split('\n');
  const at = lines.findIndex((line) => line.startsWith('- export.rounding = half-even'));
  assert.deepEqual([lines[at + 1], lines.filter((line) => /its question proposed:/.test(line)).length], ['  its question proposed: half-up', 1],
    'export.cents took its proposal word for word: no line under it');
  assert.match(lines[at], new RegExp(`; Amy: "${SAID}"`), 'the person\'s own words stay on the decision');
});

test('why: blame names the commit, its closed plan says why in the person\'s words; an unknown is said, never guessed', () => {
  const short = given.sha.slice(0, 8);
  const shipped = ab('decisionbook', 'why', 'src/export.rb:1');
  assert.equal(shipped.code, 0, shipped.err);
  assert.equal(shipped.out, [`src/export.rb:1: commit ${short} "round half-even"`, `plan ${ROUNDING} (closed) shipped it: Export rounding`,
    `- export.rounding = half-even (audit; by Amy) superseded by ${REFUNDS}/export.rounding (Amy, 2026-11-12: "refunds round half-up"); Amy: "${SAID}"`,
    `  replaced by ${REFUNDS}: export.rounding = half-up for refunds, half-even elsewhere (refunds; by Amy) active; Amy: "refunds round half-up"`,
    '- export.cents = yes (clarity; by Amy) active', ''].join('\n'));
  const json = JSON.parse(ab('decisionbook', 'why', 'src/export.rb', '--json').out);
  assert.deepEqual(json.commits.map((c) => [c.sha, c.plans.map((p) => p.id)]), [[given.sha, [ROUNDING]]], 'every line of the file: one commit');
  assert.equal(ab('decisionbook', 'why', 'lib/z.cjs:1').out.split('\n')[1],
    'no closed plan lists this commit, so the plans do not say why; nothing is guessed');
  assert.equal(ab('decisionbook', 'why', 'README.md:2').out, 'README.md:2: not committed yet, so no plan shipped it\n');
});

test('pr: a pull request description in Markdown from the plan records only: goal, decisions in their words, checks, commits', () => {
  const one = ab('decisionbook', 'pr', ROUNDING);
  assert.equal(one.code, 0, one.err);
  assert.equal(one.out, ['## Export rounding', '', `Plan \`${ROUNDING}\` (closed)`, '**Why:** totals are off by a cent',
    '**Success:** totals match the ledger', '', '### Decisions',
    `- **export.rounding**: half-even (Amy: "${SAID}"), superseded by ${REFUNDS}/export.rounding`, '  - its question proposed: half-up',
    '- **export.cents**: yes (Amy: "yes")', '', '### Checks', '- AC-1: totals match the ledger (`rake test`)', '', '### Commits',
    `- ${given.sha.slice(0, 8)} round half-even`, '',
    '<sub>From the DecisionBook records in .decisionbook/ (atlasbound decisionbook pr): no chat text, nothing sent.</sub>', ''].join('\n'));
  const branch = ab('decisionbook', 'pr', '--branch').out;
  assert.deepEqual(branch.split('\n').filter((line) => line.startsWith('## ')), ['## Export rounding', '## Refund rounding', '## Export format'],
    'the branch\'s plans in order; one set aside is no part of its work');
  assert.match(branch, /\n### Commits\n- not measured: the plan names no commit it began on\n\n## Export format\n/, 'a plan with no start commit');
});

test('status and the bare decisionbook verb name a plan file that does not read, and nothing of it once it reads again', () => {
  const file = path.join(given.repo, '.decisionbook', `${FORMAT}.jsonl`);
  const whole = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, `${whole}{"t":"note","text":"cut\n`); // a line cut short, as a stopped write or a hand edit leaves it
  assert.match(ab('status').out, new RegExp(`^ {2}decisionbook: refused \\.decisionbook/${FORMAT}\\.jsonl line 4 \\(record-invalid\\)$`, 'm'));
  assert.ok(ab('decisionbook').out.includes(`a record could not be read: .decisionbook/${FORMAT}.jsonl:4 (record-invalid); what it holds is unknown`));
  fs.writeFileSync(file, whole);
  for (const said of [ab('status').out, ab('decisionbook').out]) assert.doesNotMatch(said, /refused|could not be read/);
});
