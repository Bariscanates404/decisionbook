// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The contract of the promised surface (steps/surface): the line a reader of a concerned file is shown, and the gate's one ask on a test
// file's imports.
const { paths: { join, dirOf }, repo: { fileRole }, text: { lines: { filled } }, person: { asksPerson } } = require('@atlasbound/kit');
const { WORDS } = require('../contracts/codes.cjs');
const { importsOf, promptKept, brokenOf, concerns } = require('../core/promise.cjs');
const { afterEdit } = require('../core/policy.cjs');
const { sessionRows, sessionAdd, keptRows, keepRows } = require('./here.cjs');
const { resolved, promisesHere } = require('./surface.cjs');
const { scopeOf } = require('../core/fold.cjs');
const { globCovers } = require('../base/glob.cjs');
const { refOf } = require('../contracts/shapes.cjs');

const CONTRACT = 'contract'; // the derived rel a plan's promise is written as (contracts/record.json)

const contractLine = (p) => filled(WORDS.contractCard, { from: p.from, line: p.text, file: p.file, names: p.names.join(', ') || WORDS.contractNoNames,
  own: p.folder ? filled(WORDS.contractOwn, { folder: p.folder }) : '' });

/** The contract said: to a reader of `file`, every promise, where one speaks for the file (a test file, the promised file or its folder);
 * in a prompt's answer, only the promises of the files its own statements name (`named`). */
async function contractSay(io, { file = null, named = null }) {
  const promises = await promisesHere(io);
  const said = named ? promises.filter((p) => named.includes(p.file)) : promises.filter(() => concerns(promises, file, fileRole(file).role === 'test'));
  if (!said.length) return { say: [], n: { promises: promises.length } };
  return { say: [{ key: 'decisionbook.contract', text: said.map(contractLine).join('\n') }], n: { promises: promises.length, contract: 1 } };
}

const howOf = (b) => (b.why === 'whole' ? filled(WORDS.contractWhole, { module: b.file, name: b.names[0] })
  : filled(WORDS.contractInside, { module: b.file, folder: b.promise.folder, promised: b.promise.file }));
const brokenLine = (file, b) => filled(WORDS.contractBroken,
  { file, line: b.line, text: b.text, how: howOf(b), promise: b.promise.text, from: b.promise.from });

// the test's text after the write, each import resolved from the test's folder (a bare word is a package, never a file here)
function brokenIn(event, io, file, promises) {
  const input = event.tool_input || {};
  const text = afterEdit(io.fs.readText(file), event.tool_name, input) ?? input.new_string ?? '';
  const imports = importsOf(text).map((imp) => ({ ...imp, file: imp.word.startsWith('.') ? resolved(io, join(dirOf(file), imp.word))?.file ?? null : null }));
  return brokenOf(imports, promises);
}

/** The gate's one ask: a test file whose new text imports outside a promise, once a session and promise (no one to ask: refused once, with
 * the line). */
async function contractVerdict(event, io, file) {
  const promises = fileRole(file).role === 'test' ? await promisesHere(io) : [];
  if (!promises.length) return { n: {} };
  const broken = brokenIn(event, io, file, promises);
  const asked = new Set(sessionRows(io, event.session_id).filter((row) => row.t === 'contract').map((row) => row.promise));
  const fresh = broken.filter((b) => !asked.has(b.promise.file));
  const n = { promises: promises.length, broken: broken.length, ...(broken.length && !fresh.length ? { contractAsked: 1 } : {}) };
  if (!fresh.length) return { n };
  if (event.session_id) [...new Set(fresh.map((b) => b.promise.file))].forEach((promise) => sessionAdd(io, event.session_id, { t: 'contract', promise }));
  const reason = `${WORDS.gatePrefix} contract-unpromised: ${fresh.slice(0, 2).map((b) => brokenLine(file, b)).join(' ; ')}`;
  return { verdict: asksPerson(event.permission_mode) ? 'ask' : 'deny', code: 'contract-unpromised', reason, n };
}

/** the promises a plan takes on, each written once as a derived `contract` link (as built-on is): a planned path that covers the promised
 * file, lies in its folder, or is a test file. */
async function planContracts(io, view, batch) {
  const planned = scopeOf(view);
  const promises = planned.length ? await promisesHere(io, batch) : []; // a promise decided in this same call is read from the batch
  const held = new Set(view.links.filter((l) => l.rel === CONTRACT).map((l) => l.to));
  const takes = (p) => planned.some((glob) => globCovers(glob, p.file) || concerns([p], glob, fileRole(glob).role === 'test'));
  return promises.filter((p) => !held.has(refOf('file', p.file)) && takes(p)).map((p) => ({ t: 'link', rel: CONTRACT, to: refOf('file', p.file), why: p.text, source: p.from }));
}

/** DecisionBook's own ear: a prompt's statements are kept on this machine, nothing else of it (core promptKept), and the contract is said
 * in that prompt's answer (once a context, by the cli's rule). */
async function promptContract(event, io) {
  const { rows, held, n: kept } = promptKept(keptRows(io), String(event.prompt || ''), { session: event.session_id ?? null, at: io.clock.now() });
  if (kept.kept) keepRows(io, rows);
  const named = held.map((imp) => resolved(io, join('', imp.word))?.file).filter(Boolean);
  const said = named.length ? await contractSay(io, { named }) : { say: [], n: {} };
  return { say: said.say, n: Object.fromEntries(Object.entries({ ...kept, ...said.n }).filter(([, v]) => v)) };
}

module.exports = { contractSay, contractVerdict, planContracts, promptContract, CONTRACT };
