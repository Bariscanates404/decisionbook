// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE verb and handler table: every verb and handler is one traced step (kit's traced); a verb's row names its step, the function that
// does it, and the text of its answer (core/text).
const { traced, paths: { resolveFrom } } = require('@atlasbound/kit');
const { isCode, WORDS } = require('../contracts/codes.cjs');
const { create, addRecords } = require('../steps/write.cjs');
const { ready } = require('../steps/ready.cjs');
const { close } = require('../steps/close.cjs');
const read = require('../steps/read.cjs');
const gate = require('../steps/gate.cjs');
const recall = require('../steps/recall.cjs');
const shell = require('../steps/shell.cjs');
const { planPack } = require('../steps/pack.cjs');
const { inbox } = require('../steps/inbox.cjs');
const { why } = require('../steps/why.cjs');
const { pr } = require('../steps/pr.cjs');
const stop = require('../steps/stop.cjs');
const { protect } = require('../steps/protect.cjs');
const { bookConfig, readWeb } = require('../steps/store.cjs');
const { openItems } = require('../steps/touch.cjs');
const { openLines } = require('../core/text/open.cjs');
const { CONFIG, DIR } = require('../contracts/shapes.cjs');
const { writtenText, closedText } = require('../core/text/state.cjs');
const { showText, nodeText, foundText } = require('../core/text/show.cjs');
const { relatedText } = require('../core/text/recall.cjs');
const { inboxText } = require('../core/text/inbox.cjs');
const { whyText } = require('../core/text/why.cjs');
const { prText } = require('../core/text/pr.cjs');
const { protectLine, protectText } = require('../core/text/protect.cjs');

const planHelp = async (_args, io) => ({ out: { says: WORDS.plan, open: openLines(await openItems(io, readWeb(io)), []) }, code: 'plan-shown' });
const notice = async (_args, io) => ({ out: { line: protectLine(bookConfig(io)) }, code: 'protect-shown' });
const shownText = (o) => (o.node ? nodeText(o.node, o.links, o.decisions, o.open) : showText(o));

// verb: [its step, what does it, the text of its answer]
const VERBS = {
  plan: ['decisionbook.plan', planHelp, (o) => [o.says, ...o.open].join('\n')],
  create: ['decisionbook.create', create, writtenText],
  add: ['decisionbook.add', addRecords, writtenText],
  ready: ['decisionbook.ready', ready, writtenText],
  close: ['decisionbook.close', close, closedText],
  show: ['decisionbook.show', read.showNode, shownText],
  find: ['decisionbook.find', read.findWords, foundText],
  related: ['decisionbook.related', recall.related, relatedText],
  pack: ['decisionbook.pack', planPack, (o) => o.text], // `decisionbook plan <path|words>`
  resume: ['decisionbook.resume', read.resume, (o) => o.text],
  inbox: ['decisionbook.inbox', inbox, inboxText],
  why: ['decisionbook.why', why, whyText],
  pr: ['decisionbook.pr', pr, prText],
  protect: ['decisionbook.protect', protect, protectText],
  notice: ['decisionbook.notice', notice, (o) => o.line],
};
// handler: [its step, what does it]
const HANDLERS = {
  preEdit: ['decisionbook.gate', gate.preEdit],
  postEdit: ['decisionbook.trust', gate.postEdit],
  session: ['decisionbook.session', read.session],
  prompt: ['decisionbook.prompt', recall.recallPrompt],
  recall: ['decisionbook.recall', recall.recallFile],
  preShell: ['decisionbook.shell', shell.preShell],
  start: ['decisionbook.start', stop.keepStart],
  stop: ['decisionbook.stop', stop.stopCheck],
};
const STEPS = [...Object.values(VERBS), ...Object.values(HANDLERS)].map(([step]) => step).concat('decisionbook.debug', 'plan.phase', 'plan.flow', 'research.read', 'research.pointer', 'ready.research');
const vocabulary = Object.freeze({ steps: STEPS, isCode }); // what a trace of this package accepts; the composition root binds it

// a row names the file it judged and the plan it read or wrote (repo-relative path and id, never a command or a record's text)
const tracedStep = ({ io, step, fn, ref = null }) => (input) => traced(io, step, async (given, at) => {
  const { out, code, n = {}, codes = {} } = await fn(given, at);
  return { out, n, codes: { [code]: 1, ...codes },
    ...(ref && { ref: { file: out.file ?? out.files?.[0] ?? null, plan: out.plan ?? out.id ?? null } }) };
})(input, { run: io.run, ref });

const verbs = Object.freeze(Object.fromEntries(Object.entries(VERBS).map(([name, [step, fn, textOf]]) => [name, async (io, args = {}) => {
  const { out } = await tracedStep({ io, step, fn, ref: {} })({ rest: [], flags: {}, ...args }); // debug: a verb's row names its plan
  return { out, text: `${textOf(out)}\n` };
}])));

const handlers = Object.freeze(Object.fromEntries(Object.entries(HANDLERS).map(([name, [step, fn]]) => [name,
  async (event, io) => (await tracedStep({ io, step, fn, ref: { session: event.session_id ?? null } })(event)).out])));

const UNGUARDED = ['gate-off', 'gate-not-protected', 'gate-not-write-tool'];

async function gateRead(io, { file, tool = 'Edit', session = null, mode }) {
  const event = { tool_name: tool, tool_input: { file_path: resolveFrom(io.root, file) }, permission_mode: mode, session_id: session };
  const { out: said } = await tracedStep({ io, step: 'decisionbook.debug', fn: (given, at) => gate.preEdit(given, at, { dry: true }) })(event);
  const guarded = !UNGUARDED.includes(said.code);
  return { read: `${CONFIG}, ${DIR}/*.jsonl`, verdict: said.verdict, code: said.code, reason: said.reason || null, guarded };
}

module.exports = { vocabulary, verbs, handlers, tracedStep, gateRead };
