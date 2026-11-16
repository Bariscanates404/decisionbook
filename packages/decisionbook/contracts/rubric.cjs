// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// DecisionBook's readiness rubric, open, as data: READY is a yes/no list per level, never a number. `floor` per level is the count a row
// needs; absent, the row does not apply there. The form is light: a small fix needs its files and the person's yes; normal work adds how
// success is seen, its checks and the questions asked; only critical work fills the whole form. core/ready.cjs holds the one test per row.
const { enums: { itemKind } } = require('./record.json');
const { globsOverlap } = require('../base/glob.cjs');

const LEVELS = ['micro', 'normal', 'critical']; // small fix · normal work · critical work
const all = (n = 1) => ({ micro: n, normal: n, critical: n });
const full = (normal, critical = normal) => ({ normal, critical });
const critical = (n = 1) => ({ critical: n });

const RUBRIC = Object.freeze([
  { id: 'success', code: 'ready-no-success', floor: full(1) }, // a success signal and a kind
  { id: 'research', code: 'ready-research', floor: critical(5) },
  { id: 'feature', code: 'ready-no-feature', floor: critical() }, // the primary feature it changes
  { id: 'plan', code: 'ready-no-plan', floor: all() }, // files or globs listed, none too broad
  { id: 'checks', code: 'ready-checks', floor: full(1, 2) }, // testable acceptance criteria
  { id: 'command', code: 'ready-no-command', floor: full(1) }, // a validation command
  { id: 'tasks', code: 'ready-tasks', floor: critical() }, // every criterion covered by a task, every task covers one
  { id: 'questions', code: 'ready-open-question', floor: all() }, // no open blocking question
  { id: 'danger', code: 'ready-danger-undecided', floor: all() }, // every danger zone has a decision
  { id: 'standards', code: 'ready-standard-undecided', floor: full(1) }, // two ways where a new file goes, asked once (judged at `ready`)
  { id: 'actors', code: 'ready-no-actor', floor: critical() },
  { id: 'edges', code: 'ready-edges', floor: critical(3) },
  { id: 'impact', code: 'ready-impact', floor: critical() }, // cross-feature impact covering each shared consumer
  { id: 'answers', code: 'ready-answers', floor: full(3, 5) }, // FORKS settled, never answers counted
  { id: 'repro', code: 'ready-no-repro', floor: full(1) }, // a bug only
  { id: 'precedent', code: 'ready-no-precedent', floor: full(1) }, // a user-interface surface only
  { id: 'risk', code: 'ready-no-risk', floor: critical() },
  { id: 'rollback', code: 'ready-no-rollback', floor: critical() },
  { id: 'confirm', code: 'ready-no-confirm', floor: all() }, // the person's yes to this plan, recorded
]);

// The level ratchet's data: a path rule names what a directory IS, at any depth. A database schema or migration is critical and never
// waived.
const HARD_PATHS = [/(^|\/)(migrations|migrate)\//, /(^|\/)(db|database)\//, /(^|\/)schema\.[A-Za-z]+$/];
/** A danger path: a danger zone of the policy, or a database schema or migration. Only the person lets one into a plan. */
const isDangerPath = (danger, file) => danger.some((zone) => globsOverlap(zone, file)) || HARD_PATHS.some((re) => re.test(file));
/** The danger paths a plan took in after the person's yes (its `plans` links past the count the yes saw): a frozen plan's yes covers
 * every other file it grows by. */
const dangerSince = (view, danger) => view.links.filter((link) => link.rel === 'plans').slice(view.confirm.after)
  .map((link) => link.to.slice('file:'.length)).filter((file) => isDangerPath(danger, file));
const SOFT_PATHS = [/(^|\/)(auth|authn|authz|authentication|authorization)\//, /(^|\/)(billing|payments?)\//,
  /(^|\/)(infrastructure|infra|terraform|deploy|deployment|ci|\.github|\.gitlab)\//];
const MICRO_PATHS = [/(^|\/)(common|shared)(-[^/]+)?\//, /(^|\/)(bin|cmd|entrypoints?)\//, /(^|\/)(e2e|playwright|cypress)\//];
const RISK_WORDS = ['migration', 'backfill', 'transact', 'schema change', 'auth', 'login', 'logout', 'session', 'jwt', 'permission', 'billing', 'payment',
  'invoice', 'subscription', 'pricing', 'kyc', 'webhook', 'cron', 'scheduled job', 'email template', 'smtp', 'deploy', 'infrastructure', 'pipeline'];
const UI_PATHS = [/(^|\/)([^/]*-)?(frontend|css)\//, /(^|\/)(ui|web|views?|pages|screens|styles?)\//, /\.(css|scss|sass|less|jsx|tsx|vue|html|cljs)$/];
const QUIET_ROLES = ['test', 'fixture', 'docs']; // kit's file roles a plan of which alone stays a small fix at any count
const FANOUT_MIN = 3; // shared consumers outside the plan's own plan that make normal work critical, unless waived
const MICRO_FILES = 2;
const GROWN_FACTOR = 3;
const GROWN_FLOOR = 6; // a yes covers max(GROWN_FACTOR x files held at the person's prompt, GROWN_FLOOR) files added after it
// The answers row counts forks once by key: research that `settles` one citing file:line, or a person's decision answering a question
// naming what it `decides` and `whyNotCode`, every `effect` landing in the plan (EFFECTS; no plan text to land on). A question sharing
// RESTATE of the TASK's words is refused.
// The level's number is a floor of what is asked, never a ceiling. A task with fewer forks states it after the asking: an item of kind
// NONE whose text says why (NONE_WORDS words at least) stands for the rest only while every question the plan asks (one that names what
// it `decides`) has the person's answer, and only once those questions reach the number or each planned path has a NONE item of its own
// (`file`): no filler question, and no plan that asks nothing because that was the cheapest.
const FORKS = Object.freeze({ EFFECTS: ['file', 'check', ...itemKind.filter((kind) => !['step', 'gap', 'no-fork'].includes(kind))], RESTATE: 0.6,
  TASK: ['title', 'why', 'success', 'goal'], NONE: 'no-fork', NONE_WORDS: 3 });
// Research is the AI's own reading of this repository (core/ready). A tool's answer is a pointer, never research: an MCP server's tool
// (`mcp__<server>__<tool>`, or a tool named after this product), a web or documentation tool. Normal work under RESEARCH_NOTE read
// records gets one note at READY, never a refusal; a small fix nothing.
const POINTER_TOOLS = [/^mcp__/i, /atlasbound/i, /^web[_-]?(fetch|search)$/i, /context7/i];
const isPointerTool = (tool) => POINTER_TOOLS.some((re) => re.test(String(tool ?? '')));
const RESEARCH_NOTE = Object.freeze({ normal: 3 });
// The gaps of any change, fixed and in order: the guide for what to ask the person and what to research (the words are in
// words.json `askGuide` and the command text), never records a plan must fill. A gap item is still read (an older plan holds them).
const GAPS = Object.freeze(['existing-data', 'invalid-input', 'config-docs', 'compat-rollout', 'failure-visibility', 'scope-surfaces', 'tests-proof']);

module.exports = { LEVELS, RUBRIC, isDangerPath, dangerSince, HARD_PATHS, SOFT_PATHS, MICRO_PATHS, RISK_WORDS, UI_PATHS, QUIET_ROLES,
  FANOUT_MIN, MICRO_FILES, GROWN_FACTOR, GROWN_FLOOR, FORKS, GAPS, isPointerTool, RESEARCH_NOTE };
