// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The shapes the cli checks at its edges and its tables: what a package may declare in package.json `atlasbound`, what a handler may
// answer, the config, the hook protocol per event, the trace vocabulary. A published shape changes only with a major.
// A package's whole declaration (package.json `atlasbound`): its hooks, commands, MCP servers, what a session's write tool may write in its
// store, its verbs, the answers it offers other packages (name -> its entry path) and needs (name -> the value while none answers), the
// verbs setup allows without a prompt, setup's next steps, its plain name, the store its team commits, the gate it runs, the module
// row an add-on brings (`module`: one of its packages holds it), the config keys its hooks read (`hookConfig`: a hook process hands those
// on), how `debug trace` says its rows (`trace`), and the paths in the product's store its team commits (`teamFiles`: the ignore block
// leaves them to git, uninstall leaves them).
const SHAPES = {
  Manifest: { hooks: 'HookDecl[]?', commands: 'CommandDecl[]?', mcp: 'McpDecl?', sessionWrites: 'str[]?', verbs: 'VerbDecl[]?',
    provides: 'str{}?', needs: 'obj?', free: 'str[]?', next: 'NextDecl[]?', plain: 'str?', teamStore: 'str?', gate: 'GateDecl?',
    module: 'ModuleRow?', hookConfig: 'word[]?', trace: 'TraceDecl?', teamFiles: 'str[]?' },
  // facet: a ref field said with its name, counted apart by --tally; ref: ref fields said as their values; counts: name -> [word before,
  // divisor, decimals, word after], said once in that unit
  TraceDecl: { facet: 'word?', ref: 'word[]?', counts: 'obj?' },
  // VerbDecl by: who alone may run it; when: only with one of these flags; phrase: a grave act, typed with these words at a plain terminal
  VerbDecl: { words: 'word[]', what: 'str', call: 'str?', short: 'word?', flags: 'str[]?', values: 'str[]?', render: 'str?',
    looks: 'bool?', reads: 'bool?', asks: 'bool?', noWords: 'bool?', host: 'bool?', next: 'bool?', stdin: 'int?',
    tasks: 'TaskDecl[]?', by: 'by?', when: 'str[]?', phrase: 'str?' },
  TaskDecl: { question: 'str', run: 'str', read: 'str[]' },
  NextDecl: { step: 'int', verb: 'str', what: 'str' }, // step: its place in setup's list, in the order a person runs them
  GateDecl: { name: 'str', ask: 'str?' },
  HookDecl: { event: 'event', matcher: 'str?', handler: 'str', timeout: 'int' },
  CommandDecl: { src: 'str', dest: 'str', with: 'word?', without: 'word?' }, // with/without: placed only while that package is / is not wired
  // the MCP servers a package declares, each its name, the words of this bin that start it and its tools; free: tools that only read
  McpDecl: { servers: 'McpServer[]', free: 'str[]?' },
  McpServer: { name: 'word', args: 'str[]', tools: 'str[]' },
  // context is said every time (the person's own ask); key and short put the reason under the rule
  Decision: { verdict: 'verdict?', reason: 'str?', key: 'word?', short: 'str?', context: 'str?', say: 'Say[]?' },
  Say: { key: 'word', text: 'str', short: 'str?' }, // a text under the one context rule (core/said); its key names the text's kind
  Doctor: { ok: 'bool', says: 'str?' },
  Payload: { session_id: 'str?', cwd: 'str?' },
  HostFile: { hooks: 'arr{}?', env: 'obj?', mcpServers: 'obj?' },
  // What config/1 holds that the cli reads (compose refuses a hookTraceDays of 0). Every other key is its package's and is checked once,
  // there.
  Config: { schema: 'str?', hookTraceDays: 'int?' },
  // What a hook process reads of its own, beside the keys a package's hooks read: a typo anywhere else must not close a gate. A retention
  // that cannot be one keeps its default, in compose.
  HookConfig: { schema: 'str?', hookTraceDays: 'any?' },
  TraceRow: { run: 'id', seq: 'int', step: 'str', pkg: 'str', at: 'str' },
  Modules: { base: 'word[]', modules: 'ModuleRow[]' }, // contracts/modules.json
  // words: the verbs it answers, for the line a verb of a module with a package not installed says; optIn: wired only when named
  ModuleRow: { name: 'word', title: 'str', packages: 'word[]', what: 'str', loses: 'str', alias: 'word[]?', words: 'str[]?', optIn: 'bool?' },
};
const REFUSE = { Manifest: 'manifest-invalid', HookDecl: 'manifest-invalid', CommandDecl: 'manifest-invalid', McpDecl: 'manifest-invalid', McpServer: 'manifest-invalid',
  VerbDecl: 'manifest-invalid', TaskDecl: 'manifest-invalid', TraceDecl: 'manifest-invalid', NextDecl: 'manifest-invalid', GateDecl: 'manifest-invalid',
  Payload: 'hook-input-invalid', Config: 'config-invalid', HookConfig: 'config-invalid', Modules: 'manifest-invalid', ModuleRow: 'manifest-invalid' };

// One row per host event a package may attach to. `on`: the payload field a matcher reads. `blocks`: the verdicts the host is told (only
// the pre-edit gate blocks a write, only a Stop decision blocks completion). `context`: whether the event carries additionalContext.
// `person`: its payload carries the person's words, or (Stop) what the AI's last message showed them, which their reply then takes or
// sets aside: only the host's own call of it is heard (adapters/hook) and no shell command may name it (steps/person).
const EVENTS = {
  SessionStart: { on: 'source', blocks: [], context: true, keeps: ['resume'] }, // keeps: a start that restores the transcript; any other begins anew
  UserPromptSubmit: { on: null, blocks: [], context: true, person: true },
  PreToolUse: { on: 'tool_name', blocks: ['deny', 'ask'], context: true },
  PostToolUse: { on: 'tool_name', blocks: [], context: true },
  Stop: { on: null, blocks: ['deny'], context: false, person: true },
  PreCompact: { on: 'trigger', blocks: [], context: false }, // never blocks a compaction; the reply is silence
};
const ENUMS = { event: Object.keys(EVENTS), verdict: ['deny', 'ask', 'allow'], by: ['person'] };
// The port's own row, wired whatever module is on: an AI's shell command meets the gate of the verbs only a person runs (steps/person).
const SHELL_GATE = { event: 'PreToolUse', matcher: 'Bash', timeout: 10 };

const STEPS = ['cli.verb', 'actor', 'hook.in', 'hook.handler', 'hook.out', 'hook.said', 'packages', 'setup', 'update', 'uninstall', 'doctor', 'probes', 'protect', 'status', 'debug.trace', 'debug.doctor', 'debug.shell', 'debug.inject', 'debug.who', 'modules'];
const DEBUG_SCHEMA = 'ab-debug/1';

// How compose opens the repository, one word per verb (argv picks it from the row): `hostRoot` the host's project directory names it,
// `hook` reads only the hook's config keys and keeps its trace days, `looking` makes no trace folder where none is, `reading` holds the
// trace in this process, `cleaning` lets uninstall enter a root a setup left.
const MODES = {
  work: {}, look: { looking: true }, read: { reading: true }, clean: { cleaning: true }, host: { hostRoot: true },
  'host-read': { hostRoot: true, reading: true }, hook: { hostRoot: true, hook: true },
};

// config/1: every setting with its default, data. Absent from the repository's file means this value; compose freezes the result.
const CONFIG = { schema: 'config/1', hookTraceDays: 14 };
const CONFIG_FILE = '.atlasbound/cli/config.json';
const STORE = '.atlasbound';
const SAID_DIR = '.atlasbound/cli/said'; // one record per session of what its context was told (digests, never text)

module.exports = { SHAPES, REFUSE, EVENTS, ENUMS, SHELL_GATE, STEPS, DEBUG_SCHEMA, CONFIG, CONFIG_FILE, STORE, SAID_DIR, MODES };
