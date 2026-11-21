// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The contract suite's world: kit's in-memory fs, a clock a millisecond later per record, a scripted git, the trace bound to decisionbook's vocabulary.
const kit = require('@atlasbound/kit');
const decisionbook = require('@atlasbound/decisionbook');

const ROOT = '/fake';

/** the composition root's one import step of a file both ways, in the shape the root hands it, from `graph` (file -> the files it imports);
 * null: no import graph is handed. */
const importsFrom = (graph) => async () => (graph ? (file) => ({ file, imports: (graph[file] || []).map((to) => ({ to, line: 1 })),
  importers: Object.keys(graph).filter((from) => graph[from].includes(file)).map((from) => ({ from, line: 1 })) }) : null);

const GUARD = { dir: '.atlasbound/labels', what: 'label', why: 'a label decides what a write may change', lowering: ['lock', 'takes', 'joins'], holds: 'lock' };
/** bookWorld({ files, branch, head, commits }) -> the io the composition root hands the package. `commits` answer git's commits read. `guarded`: the
 * folder a package declares the person's (GUARD: a toy guarded folder), null where none does; `guardedWay`, how a person makes a file there (null: none);
 * `research`, the root's answer where a plan's research goes first (null: none).
 * `changed`, the files git's status names (uncommitted); `graph`, the import graph the root hands (null: none). */
function bookWorld({ files = {}, branch = 'feat/export', head = 'h0', commits = [], tracked = Object.keys(files), authors = {},
  home = kit.testing.memoryFs(), guarded = () => GUARD, changed = [], graph = null, heard = null, journalOff = false, person = true,
  begun = 's1', guardedWay = null, research = null } = {}) {
  const fs = kit.testing.memoryFs(files);
  // `begun`, the AI session whose start row the home holds from the world's first instant (its SessionStart came before the test); null: none
  if (begun && home) home.writeAtomic(kit.paths.hereKey(ROOT, 'decisionbook', `start-${kit.hash.sha256(begun).slice(0, 16)}.json`), `${JSON.stringify({ head, dirty: [], at: '2026-11-02T06:00:00.000Z' })}\n`);
  let tick = 0; // each record a millisecond later, so the order of records across files is real
  const clock = { ...kit.testing.fixedClock(), now: () => `2026-11-02T06:00:00.${String((tick += 1) % 1000).padStart(3, '0')}Z` };
  const tracer = kit.io.createTrace({ fs, clock });
  const state = { branch, head, commits, tracked, changed };
  const git = { branch: async () => state.branch, head: async () => state.head,
    commits: async (base) => state.commits.filter((c) => !base || c.after === base), shared: async () => [], // no other branch
    lsFiles: async () => state.tracked.map((key) => ({ key, disk: key })),
      tracked: async (keys) => state.tracked.filter((key) => keys.some((k) => key.startsWith(k))),
    author: async (key) => authors[key] || null, statusZ: async () => state.changed.map((key) => ({ xy: ' M', key, disk: key })),
    // whose a line is (steps/open): each author of `authors` commits under a mail of their own, never the one this clone commits as
    me: async () => 'me@world.invalid',
    blame: async (key) => (authors[key] ? fs.readText(key).split('\n').map(() => ({ sha: 'c0', subject: null, author: authors[key],
      mail: `${authors[key]}@world.invalid` })) : []) };
  // `actor`, the root's answer to who acts (kit's own, over a faked process): in a session no terminal, outside one the world's `terminal`
  // (a person's unless a test says no) with `above`, its ancestors' command words (null: the walk could not be done).
  // `heard`, the person's journaled prompts the root hands from handoff ({ id, at, text }); null: none handed; `absent`, why an answer
  // is null as the root says it (off by choice when `journalOff`, else not installed)
  return { fs, home, clock, root: ROOT, run: 'r1', hostEnv: ['CLAUDE_PROJECT_DIR', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_PID'], trace: tracer.forPackage('decisionbook', decisionbook.vocabulary), git, state, guarded, imports: importsFrom(graph),
    terminal: person, above: [], heard: () => heard, guardedWay: () => guardedWay, research: () => research,
    actor(prompts) {
      const walk = () => this.above && { chain: [['-zsh'], ...this.above], leader: 0 }; // under a login shell that leads the terminal
      const seat = { env: { get: () => null }, input: { isTTY: !this.session && this.terminal }, proc: { ancestry: walk } };
      return kit.person.createActor({ ...seat, said: () => {} })(prompts);
    },
    absent: (what) => (what !== 'heard' || heard !== null ? null : (journalOff ? 'off' : 'not-installed')) };
}

const { verbs } = decisionbook;
const wire = (value) => JSON.stringify(value);
/** Start a plan (normal work, no risk word); -> its id. */
const begin = async (io, over = {}) => (await verbs.create(io, { rest: [wire({ title: 'Report export is slow', why: 'large exports time out',
  success: 'a 10,000 row export finishes in 5 s', kind: 'feature', level: 'normal', ...over })] })).out.id;
const added = (io, id, record) => verbs.add(io, { rest: [id, wire(record)] }); // an array of records is one batch
const refusedWith = (io, id, record) => added(io, id, record).then(() => null, (err) => [err.code, err.message]); // null: written
const logFile = (id) => `.decisionbook/${id}.jsonl`;
const planRecords = (io, id) => io.fs.readText(logFile(id)).trim().split('\n').map((line) => JSON.parse(line)); // a plan's records as written
/** One no-fork item per planned path among `records` (plans links): what a plan with fewer forks than its level states. */
const noForks = (records) => records.filter((r) => r.t === 'link' && r.rel === 'plans').map((r) => ({ t: 'item', kind: 'no-fork',
  file: r.to.slice('file:'.length), text: 'Read whole: the task settles what this file does, nothing in it is open.' }));
const onDay = (day) => `2026-10-${String(day).padStart(2, '0')}T09:00:00.000Z`; // a hand-built history's record time, on a day of October
const researchRows = (n) => Array.from({ length: n }, (_, i) => ({ t: 'research', tool: 'grep', asked: `export query ${i}`,
  answer: `src/report/export.js:${i + 1}`, source: `src/report/export.js:${i + 1}` }));
// each a fork, a person's decision with its effect on the plan; `tag` keeps one plan's forks apart from another's (the same key is settled)
const answeredPairs = (n, tag) => Array.from({ length: n }, (_, i) => [{ t: 'question', q: `Q${i + 1}`, text: `rule ${i + 1}?`,
  decides: `report.export${tag}.rule${i + 1}`,
  whyNotCode: 'a product rule', blocking: true }, { t: 'decision', key: `report.export${tag}.rule${i + 1}`, value: `v${i + 1}`, why: 'support', by: 'Ayse',
    answers: `Q${i + 1}`, effect: ['check:AC-1'] }]).flat();
// the gap list, frozen (contract/gaps.test.cjs pins it): renaming, dropping or reordering a gap fails until this line changes with it
const GAP_IDS = ['existing-data', 'invalid-input', 'config-docs', 'compat-rollout', 'failure-visibility', 'scope-surfaces', 'tests-proof'];
/** Every record a level's rubric asks for (a READY plan's rows; critical adds two edges, two answers, risk and rollback; normal and critical a step per
 * planned path;
 * and every gap closed, here each as not applying). */
const recordsFor = (level, plans, tag = '') => [...researchRows({ micro: 1, normal: 3, critical: 5 }[level]),
  { t: 'item', kind: 'feature', text: 'report export' },
  ...(level === 'micro' ? [] : GAP_IDS.map((gap) => ({ t: 'item', kind: 'gap', gap, status: 'na', text: 'the export adds nothing of this kind' }))),
  ...plans.map((to) => ({ t: 'link', rel: 'plans', to: `file:${to}`, why: 'the export code' })),
  ...(level === 'micro' ? [] : plans.map((file, i) => ({ t: 'item', kind: 'step', order: i + 1, file, change: 'stream the rows', verify: 'AC-1' }))),
  { t: 'check', id: 'AC-1', text: 'the export finishes in 5 s', how: 'e2e', command: 'npm test -- export' },
    { t: 'check', id: 'AC-2', text: 'rows keep their order', how: 'unit' },
  { t: 'item', kind: 'task', text: 'stream the rows', covers: ['AC-1', 'AC-2'] }, { t: 'item', kind: 'actor', text: 'an analyst' },
  ...['empty report', 'a cancelled export', 'a 1 GB report'].slice(0, level === 'critical' ? 3 : 2).map((text) => ({ t: 'item', kind: 'edge', text })),
  { t: 'item', kind: 'impact', text: 'the scheduler reads the same rows: unchanged' }, ...answeredPairs(level === 'critical' ? 5 : 3, tag),
  ...(level === 'critical' ? [{ t: 'item', kind: 'risk', text: 'memory on huge exports' }, { t: 'item', kind: 'rollback', text: 'revert the commit' }] : []),
  { t: 'confirm', by: 'Ayse', said: 'yes, go ahead' }]; // the person's yes to this plan, last
/** An AI session (`session`) reads `files` with the Read tool and shows plan `id`: the read receipts the plan's research may
 * cite (its sessions are the ones that name it). */
async function readFor(io, id, files, session = 's1') {
  for (const file of files) await decisionbook.handlers.recall(readOf(file, session), io);
  const was = io.session;
  io.session = session;
  await verbs.show(io, { rest: [id] });
  io.session = was;
}
/** A plan that passes its level's rubric (critical: its research cites a file the session read). */
async function readyOne(io, { plans = ['src/report/**'], title, level = 'normal' } = {}) {
  const id = await begin(io, { ...(title ? { title } : {}), level });
  if (level === 'critical') await readFor(io, id, ['src/report/export.js']);
  let last = null; // the write that completes the plan makes it READY and says so; no ready call follows
  for (const record of recordsFor(level, plans, title ? `.${title.toLowerCase().replace(/\W+/g, '-')}` : '')) {
    if (record.t === 'confirm') await leavesOthers(io, id);
    last = await added(io, id, record);
  }
  return { id, res: { out: last.out.state, text: last.text } };
}
/** Plan `id` says, in a non-goal, that its change leaves as it is each person's standing decision of another plan on its files. */
async function leavesOthers(io, id) {
  const covers = ((await verbs.show(io, { rest: [id] })).out.unmet.find((u) => u.id === 'replaces')?.changed ?? []).map((c) => c.ref);
  return covers.length ? added(io, id, { t: 'item', kind: 'non-goal', text: 'this change leaves it as it is', covers }) : null;
}
/** Whether plan `id` waits for the person's answer on a decision it places nowhere (a conflict of one key among them). */
const waitsForAnswer = async (io, id) => (await verbs.ready(io, { rest: [id] })).out.unmet.some((u) => u.code === 'ready-replace-unasked');
/** The rubric rows a plan does not hold yet, by code. */
const unmetOf = async (io, id) => (await verbs.ready(io, { rest: [id] })).out.unmet.map((u) => u.code);
const editEvent = (file, tool = 'Edit') => ({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: tool, tool_input: { file_path: `${ROOT}/${file}` } });
const testWrite = (file, content) => ({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Write', tool_input: { file_path: `${ROOT}/${file}`, content } });
const readOf = (file, session = 's1', tool = 'Read') => ({ hook_event_name: 'PostToolUse', session_id: session, tool_name: tool,
  tool_input: { file_path: `${ROOT}/${file}` } }); // a read as PostToolUse sends it
/** The event as the host sends it in permission mode `mode`; a session's start as the host sends it (`source`: startup, resume, clear, compact). */
const asMode = (event, mode) => ({ ...event, permission_mode: mode });
const starting = (session = 's1', source = 'startup') => ({ hook_event_name: 'SessionStart', session_id: session, source });
const writeConfig = (io, config) => io.fs.writeAtomic('.decisionbook/config.json', wire(config));
/** The trace of the world's run as [step, ok, error code or null]; the n of the last trace record of one step. */
const tracedSteps = (io) => io.fs.readText('.atlasbound/trace/r1.ndjson').trim().split('\n').map((line) => JSON.parse(line)).map((r) => [r.step, r.ok,
  r.err ? r.err.code : null]);
const lastN = (io, step) => io.fs.readText('.atlasbound/trace/r1.ndjson').trim().split('\n').map((line) => JSON.parse(line))
  .filter((r) => r.step === step).at(-1).n;
/** The trace rows of one step. */
const stepRows = (io, step) => io.fs.readText('.atlasbound/trace/r1.ndjson').trim().split('\n').map((line) => JSON.parse(line)).filter((r) => r.step === step);
const ruling = (said) => [said.verdict, said.code]; // a gate's answer as [verdict, code]

/** the whole text a handler gives, its context then its say items, as the hook port joins them before its one context rule holds what a context was
 * told. */
const textOf = (out) => [out.context, ...(out.say || []).map((s) => s.text)].filter(Boolean).join('\n');
/** the JSON a text hands with the call `atlasbound decisionbook <words>`, as a draft (in the acting session's drafts folder, or the folder
 * itself with no session): the line between the draft's head and the call. */
function sentBy(text, words) {
  const lines = String(text).split('\n');
  const name = words.split(' ').at(-1);
  const at = lines.findIndex((line) => new RegExp(`^write this JSON with your Write tool to \\.atlasbound/drafts/([0-9a-f]{12}/)?${name}\\.json:$`).test(line));
  const draft = at >= 0 && lines[at].slice('write this JSON with your Write tool to '.length, -1);
  return at >= 0 && lines[at + 2] === `then run: atlasbound decisionbook ${words} --file ${draft}` ? JSON.parse(lines[at + 1]) : null;
}

/** A person's answer to question `q` as an AI sends it: signed for them, `value` its reading, `said` their words; the product decides whose it is. */
const theirAnswer = (q, key, value, said) => ({ t: 'decision', key, value, why: 'the developer\'s answer', by: 'the developer', said, answers: q, effect: ['check:AC-1'] });
/** The state a write left: READY, or the codes of the rows the plan still lacks. */
const stateOf = (res) => (res.out.state.ready ? 'READY' : res.out.state.unmet.map((u) => u.code).join(','));

module.exports = { ROOT, waitsForAnswer, readFor, theirAnswer, stateOf, bookWorld, begin, added, refusedWith, logFile, planRecords, onDay, GAP_IDS, recordsFor, readyOne, leavesOthers, unmetOf, editEvent, testWrite, readOf,
  asMode, starting, writeConfig, tracedSteps, lastN, stepRows, ruling, wire, textOf, sentBy, noForks };
