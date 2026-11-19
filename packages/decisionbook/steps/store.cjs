// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE one reader and writer of `.decisionbook/`: one append-only file per plan, and the config; an unreadable plan is named, never
// stops the others.
const { errors: { fail, isFail }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { SCHEMA, DIR, CONFIG, SHAPES, storedLine, bound } = require('../contracts/shapes.cjs');
const { WORDS, SHOWN: { store: shown } } = require('../contracts/codes.cjs');
const { foldPlan, scopeOf } = require('../core/fold.cjs');
const { webOf } = require('../core/web.cjs');
const { bareWord, isGlob } = require('../base/glob.cjs');
const { FORKS } = require('../contracts/rubric.cjs');
const { stepPath } = require('../base/text.cjs');
const { readsByPlan } = require('./here.cjs');

const pathOf = (id) => `${DIR}/${id}.jsonl`;
// a symbolic link is refused so a committed link never carries an outside file into a view; git never commits a hard link
const textAt = (io, key) => io.fs.readText(key, { noLink: 'symbolic' });

const put = (io, id, record, { first = false } = {}) => io.fs[first ? 'createExclusive' : 'append'](pathOf(id), storedLine(record, io.clock.now()));
// a batch ({ id, lines, fresh }) holds its records and is read after the file's text, so each is checked as if the ones before it were
// written; then one append, or for a `fresh` one (a new: its plan record first) one exclusive create, so a refused new leaves no
// file. commit -> false where another process made a fresh batch's file while it was judged: nothing is written, the new takes the
// next id (steps/write)
const hold = (io, batch, record) => batch.lines.push(storedLine(record, io.clock.now()));
const commit = (io, batch) => io.fs[batch.fresh ? 'createExclusive' : 'append'](pathOf(batch.id), batch.lines.join(''));

const batchOf = (batch, id) => (batch && batch.id === id ? batch : { lines: [], fresh: false });

/** A plan's records as written, its plan record first, with the lines refused and the file line of each record; `batch`: the records a
 * write holds, read after the file's. */
function planRows(io, id, batch = null) {
  const held = batchOf(batch, id);
  const text = textAt(io, pathOf(id)) ?? (held.fresh ? '' : null);
  if (text === null) throw fail('plan-unknown', id);
  const whole = text + held.lines.join('');
  const { rows, refused } = bound.kept(whole, 'Record');
  if (!rows.length || rows[0].t !== 'plan') throw fail('record-invalid', filled(WORDS.notPlanFirst, { id }));
  if (rows[0].id !== id) throw fail('record-invalid', filled(WORDS.planCopy, { id, named: rows[0].id }));
  if (rows[0].schema !== SCHEMA) throw fail('schema-major', `${id}: ${rows[0].schema}`);
  const lines = whole.split('\n').flatMap((line, i) => (line.trim() && !refused.some((r) => r.line === i + 1) ? [i + 1] : []));
  return { rows, refused: refused.map(({ line, code }) => ({ line, code })), lines };
}
const readPlan = (io, id, batch = null, { rows, refused, lines } = planRows(io, id, batch)) => foldPlan(rows, refused, lines);

function plansOf(io, batch) {
  const listed = (io.fs.list(DIR) || []).filter((name) => name.endsWith('.jsonl')).map((name) => name.slice(0, -'.jsonl'.length));
  const ids = batch && batch.fresh && !listed.includes(batch.id) ? [...listed, batch.id] : listed;
  const views = [];
  const refused = [];
  for (const id of ids) {
    try {
      views.push(readPlan(io, id, batch));
    } catch (err) {
      if (!isFail(err)) throw err;
      refused.push({ id, code: err.code });
    }
  }
  return { views, refused };
}

// what a plan's research may rest on (core/ready): the files read in its sessions, and which of the files it plans or states no fork
// of are here already (a new one has nothing to read); an open plan's only
function plansReceipts(io, views) {
  const readOf = readsByPlan(io);
  const named = (v) => [...scopeOf(v), ...v.items.filter((i) => i.kind === FORKS.NONE && i.file).map((i) => stepPath(i.file))]
    .filter((f) => !isGlob(f));
  const there = (v) => [...new Set(named(v))].filter((file) => io.fs.exists(file) && io.fs.list(file) === null);
  return Object.fromEntries(views.filter((v) => v.stage !== 'closed').map((v) => [v.id, { read: readOf(v.id), there: there(v) }]));
}

/** Every plan; a config that does not read is named in `refused` and marks no folder danger, so a torn policy never stops a view. */
function readWeb(io, { danger = null, batch = null, asked } = {}) {
  const policy = danger ? { config: { danger } } : readPolicy(io);
  const { views, refused } = plansOf(io, batch);
  return { ...webOf(views, policy.config?.danger ?? [], asked, plansReceipts(io, views)),
    refused: [...(policy.unreadable ? [{ id: CONFIG, code: 'policy-unreadable' }] : []), ...refused] };
}

// the plan files `web` could not read, each with why: unknown, never absent
// the plans not read whole: a file that did not read, and one with a line that did not (its line numbers named)
const unreadPlans = (web) => [...web.refused.filter((r) => r.id !== CONFIG).map((r) => ({ file: pathOf(r.id), code: r.code })),
  ...web.views.filter((v) => v.refused.length).map((v) => ({ file: `${pathOf(v.id)}:${v.refused.map((r) => r.line).join(',')}`, code: v.refused[0].code }))];
const WORDS_READ = Object.keys(SHAPES.Config);

function bookConfig(io) {
  const text = textAt(io, CONFIG);
  const said = bound.shape('Config', text === null ? {} : bound.json(text, 'policy-unreadable'));
  const stray = Object.keys(said).find((word) => !WORDS_READ.includes(word));
  if (stray) throw fail('policy-word-unknown', filled(WORDS.policyWords, { stray: shown.stray(stray), words: WORDS_READ.join(', ') }));
  return { protect: (said.protect || []).map(bareWord), danger: (said.danger || []).map(bareWord), answer: said.answer || null };
}

// an unreadable policy is never read as none, so a hostile, broken or misspelt file never switches the gate off; its code and why are told
function readPolicy(io) {
  try {
    return { config: bookConfig(io), text: textAt(io, CONFIG) };
  } catch (err) {
    if (!isFail(err)) throw err;
    return { unreadable: err.message };
  }
}

/** The danger zones the policy names; one that does not read names none (its readers say why). */
const dangerOf = (io) => (readPolicy(io).config || {}).danger || [];
const writeConfig = (io, config) => io.fs.writeAtomic(CONFIG, `${JSON.stringify(Object.fromEntries(Object.entries(config).filter(([, v]) => v !== null)))}\n`);
const keepsPlan = (io) => io.fs.list(DIR) !== null;
const taken = (io) => (id) => io.fs.exists(pathOf(id));

module.exports = { pathOf, textAt, put, hold, commit, planRows, readPlan, readWeb, unreadPlans, bookConfig, readPolicy, dangerOf,
  writeConfig, keepsPlan, taken };
