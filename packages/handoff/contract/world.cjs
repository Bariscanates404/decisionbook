// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The fake io of the handoff contract suite: kit's memory fs twice (the repository and the person's home), a clock a test moves, a git
// whose commits a test makes, and a process door that records every start (the handoff must never use it). Only the public entry and
// kit's test helpers are used.
const { io: kitIo, testing: { memoryFs }, paths: { hereKey } } = require('@atlasbound/kit');
const handoff = require('@atlasbound/handoff');

const T0 = Date.parse('2026-11-12T01:00:00.000Z');
const HERE = hereKey('/fake', 'handoff');
const shaOf = (n) => String(n).padStart(2, '0').repeat(20);

/** A git with a line of commits (oldest first), a branch a test switches and a list of changed files. */
function fakeGit(branch) {
  const git = { name: branch, log: [{ sha: shaOf(1), subject: 'First commit' }], changed: [] };
  const at = (rev) => {
    const back = rev.endsWith('~1') ? 1 : 0;
    const found = git.log.findIndex((c) => c.sha.startsWith(rev.replace(/~1$/, '')));
    return found < 0 ? -1 : found - back;
  };
  return Object.assign(git, {
    commit: (subject) => git.log.push({ sha: shaOf(git.log.length + 1), subject }),
    branch: async () => git.name,
    head: async () => (git.log.length ? git.log.at(-1).sha : null),
    resolves: async (rev) => at(rev) >= 0,
    commits: async (base) => (at(base) < 0 ? null : git.log.slice(at(base) + 1).reverse().map((c) => ({ ...c, body: '', files: [] }))),
    statusZ: async () => git.changed.map((key) => ({ xy: ' M', key, disk: key })),
  });
}

/** handoffWorld({ branch, plans, home }) -> { io(session), fs, home, git, starts, later(minutes), rows() }. `plans`: what the
 * composition root's closure answers (undefined: no closure handed); `home: null`: a user with no home folder. */
function handoffWorld({ branch = 'main', plans, home = memoryFs(), env = {} } = {}) {
  const fs = memoryFs();
  const now = { ms: T0 };
  const clock = { now: () => new Date(now.ms).toISOString(), elapsedMs: () => 0 };
  const git = fakeGit(branch);
  const starts = [];
  const spy = (door) => (spec) => {
    starts.push({ door, cmd: spec && spec.cmd });
    return { code: 0, stdout: '', stderr: '', error: null, pid: 1 };
  };
  const proc = { run: spy('run'), startDetached: spy('startDetached'), alive: () => false, pid: () => 9 };
  const hostEnv = { get: (key) => env[key] ?? null, userHome: () => '/home/ana', realOf: (dir) => dir };
  const trace = kitIo.createTrace({ fs, clock }).forPackage('handoff', handoff.vocabulary);
  const io = (session = null) => ({ root: '/fake', run: 'r1', session, fs, home, clock, git, proc, env: hostEnv, trace,
    ...(plans === undefined ? {} : { plans: async () => plans }) });
  const rows = () => [...fs.store].filter(([key]) => key.startsWith('.atlasbound/trace/')).flatMap(([, text]) => text.trim().split('\n'))
    .map((line) => JSON.parse(line));
  return { io, fs, home, git, starts, rows, later: (minutes) => { now.ms += minutes * 60000; } };
}

const startEvent = (session, source = 'startup') => ({ session_id: session, hook_event_name: 'SessionStart', source });
const promptEvent = (session, prompt) => ({ session_id: session, hook_event_name: 'UserPromptSubmit', prompt });
const editedEvent = (session, file) => ({ session_id: session, hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: file } });
const compactEvent = (session) => ({ session_id: session, hook_event_name: 'PreCompact', trigger: 'auto' });

/** The person says each of `prompts` in `session`, in order. */
async function say(w, session, prompts) {
  for (const prompt of prompts) await handoff.handlers.prompt(promptEvent(session, prompt), w.io());
}
/** The AI's reply to the fill-in, as `atlasbound handoff keep` receives it. */
const keep = (w, session, reply) => handoff.keep(w.io(session), { rest: [JSON.stringify(reply)] });
/** What a session start says to the new context ('' when nothing). */
const saidAtStart = async (w, session, source) => (((await handoff.handlers.start(startEvent(session, source), w.io())).say || [])[0] || { text: '' }).text;
/** Every text the home store holds, joined: where the person's words may be. */
const homeText = (w) => [...w.home.store.values()].join('\n');
/** Every text the repository holds, the trace rows among them: where the person's words must never be. */
const repoText = (w) => [...w.fs.store.values()].join('\n');

/** The host's transcript of `session` in the person's home, its last assistant message holding `tokens` of context from `model`. */
function transcriptAt(w, session, { tokens, model = 'claude-sonnet-5-5' }, prompt = 'go on') {
  const usage = { input_tokens: 3, cache_read_input_tokens: tokens - 1003, cache_creation_input_tokens: 1000, output_tokens: 77 };
  const rows = [{ type: 'user', message: { content: 'hi' } }, { type: 'assistant', message: { model, usage } }];
  w.home.writeAtomic(`.claude/projects/-fake/${session}.jsonl`, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return { ...promptEvent(session, prompt), transcript_path: `/home/ana/.claude/projects/-fake/${session}.jsonl` };
}

/** The bounds the suite holds the package to: the note's screen, a message's head, a session's messages, a fill-in's list, a session's
 * days in the home. */
const BOUNDS = { note: { lines: 40, chars: 4000 }, message: { chars: 1200, perSession: 60, shown: 6000 }, sessionDays: 14 };

module.exports = { world: handoffWorld, startEvent, promptEvent, editedEvent, compactEvent, say, keep, saidAtStart, homeText, repoText, transcriptAt, shaOf,
  HERE, T0, BOUNDS };
