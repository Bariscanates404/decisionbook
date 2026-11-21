// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The published data: decisionbook-record/1, its relations, enums and shapes as data in contracts/record.json (any language can read
// it), and this module, its one door: the validator bound to it, the store's paths, and the reads a verb's words go through.
const { createValidate, errors: { fail, isFail }, text: { secrets }, host: { RESUME_PROMPT } } = require('@atlasbound/kit');
const { isCode, WORDS, shortOf } = require('./codes.cjs');
const { LEVELS, FORKS, GAPS } = require('./rubric.cjs');
const { isAi, asList, isKeep } = require('../base/text.cjs');
const RECORD = require('./record.json');

const SCHEMA = 'decisionbook-record/1';
const DIR = '.decisionbook';
const CONFIG = `${DIR}/config.json`;
/** One record as one line of a store's file, stamped with its time. */
const storedLine = (record, at) => `${JSON.stringify({ ...record, at })}\n`;
const NUDGE_MIN = 20; // a prompt shorter than this is a reply, not a task
/** A task prompt (the nudge's and the recall cards' one reading): neither a slash command nor a short reply. */
const isTaskPrompt = (text) => text.length >= NUDGE_MIN && !text.startsWith('/');
/** What a prompt is, as a flag: the person's /resume-handoff (kit's one reading), a task prompt, or other. Its words decide nothing about
 * the branch's open plan: that plan is the work in progress whatever a message says, and only the person's answer sets it aside. */
const promptAs = (text) => (RESUME_PROMPT.test(text) && 'resume') || (isTaskPrompt(text) && 'task') || 'other';
/** Whether a question's text asks leave (data: `leave`) to edit `path`, a file the plan already names: no fork. */
const LEAVE = new RegExp(`(?:^|[^\\p{L}])(?:${WORDS.leave.join('|')})`, 'iu');
const asksLeave = (text, path) => String(text).includes(path) && LEAVE.test(text);

const RELS = Object.freeze(RECORD.rels);
const BUILT_ON = Object.freeze(RECORD.builtOn); // the rule of the one link add writes by itself (core/web builtOnOf), as data
const NODE_TYPES = ['plan', 'decision', 'file', 'test', 'issue', 'commit', 'handoff'];
// What `show <id> <field>...` may pick; id, title, state, level and branch always come, and a decision always keeps its state, scope and
// conflicts.
const FIELDS = ['why', 'goal', 'plan', 'contract', 'gaps', 'research', 'pointers', 'checks', 'items', 'decisions', 'questions', 'assumptions', 'confirm', 'links', 'notes', 'resumes', 'closed'];
const VERB_ONLY = ['plan', 'ready', 'closed']; // written by their own verb only: `add` refuses them

const ENUMS = { ...RECORD.enums, schema: [SCHEMA], rel: Object.keys(RELS).filter((rel) => !RELS[rel].derived), level: LEVELS,
  gap: GAPS };
const SHAPES = RECORD.shapes;
/** The shape a record is read by: its type's, or the variant one of its fields names (record.json variants: a step item, a run probe). */
function shapeOf(value) {
  const [field, by] = Object.hasOwn(RECORD.variants, value.t) ? RECORD.variants[value.t] : [];
  return by && Object.hasOwn(by, value[field]) ? by[value[field]] : value.t;
}
const isPlanLink = (value) => Boolean(value) && value.t === 'link' && value.rel === 'plans'; // a typed word the plan stores as its glob
/** A node reference `type:value` (plan:<id>, file:<path or glob>, decision:<key>, …), and what follows a reference's type. */
const refOf = (type, value) => `${type}:${value}`;
const refValue = (ref) => String(ref).slice(String(ref).indexOf(':') + 1);
const refIs = (type, ref) => String(ref).startsWith(refOf(type, ''));
const plannedPath = (link) => refValue(link.to); // a `plans` link's file or glob
const VARIANTS = Object.values(RECORD.variants).flatMap(([, by]) => Object.values(by));
const REFUSE = { ...Object.fromEntries([...ENUMS.t, 'Record', ...VARIANTS].map((name) => [name, 'record-invalid'])), Cited: 'research-uncited' };
/** A decision's effects are `kind:value` of a known kind, and one that answers a question names at least one, unless it only keeps. */
const effectOk = (e) => typeof e === 'string' && /^[^:]+:./.test(e) && FORKS.EFFECTS.includes(e.split(':')[0]);
const effectHolds = (v, e = v.effect ?? []) => Array.isArray(e) && !(v.answers && !e.length && !isKeep(v)) && e.every(effectOk);

const bound = createValidate({ shapes: SHAPES, enums: ENUMS, refuse: REFUSE, isCode });

/** A node reference `type:value` -> { type, value }, or node-invalid. */
function nodeOf(ref) {
  const at = String(ref).indexOf(':');
  const type = String(ref).slice(0, at);
  if (at < 1 || !NODE_TYPES.includes(type) || at === String(ref).length - 1) throw fail('node-invalid', String(ref).slice(0, 80));
  return { type, value: String(ref).slice(at + 1) };
}

/** A verb's JSON word -> its value, an object or a list; plan-args names the usage when the word is missing or is neither. */
function argOf(text, usage) {
  const value = text === undefined ? null : bound.json(text, 'record-invalid');
  if (value === null || typeof value !== 'object') throw fail('plan-args', usage);
  return value;
}

/** The nodes `show` was asked for, each `<field>` or `<field>.<pick>` (a key, gap, id, q or order, else a 0-based index); a word that is no
 * field is plan-args, naming the fields. */
function fieldsAsked(words) {
  const asked = words.map((word) => ({ field: word.split('.')[0], pick: word.includes('.') ? word.slice(word.indexOf('.') + 1) : null }));
  const stray = asked.find(({ field }) => !FIELDS.includes(field) && field !== 'steps');
  if (stray !== undefined) throw fail('plan-args', `${stray.field}: show takes ${FIELDS.join(', ')}, steps, each optionally .<key|order|index>`);
  return asked;
}

// what `add` refuses beyond a type's shape, per type: [holds, code, what it names]; each judges any value, a shape problem is the shape's
// to name
const CHECKS = {
  link: [[(v) => !RELS[v.rel] || nodeOf(v.to).type === RELS[v.rel].to, 'node-invalid', (v) => `${v.rel} points at a ${RELS[v.rel].to}`],
    [(v) => v.why || (v.source && v.rel !== 'compared'), 'link-unsourced', (v) => `${v.rel} ${v.to}`]], // a comparison says what the code holds
  confirm: [[(v) => !isAi(v.by), 'confirm-by-person', (v) => v.by]],
  unlink: [[(v) => !isAi(v.by), 'unlink-by-person', (v) => v.by]], // removing a link DecisionBook wrote is the person's
  aside: [[(v) => !isAi(v.by), 'aside-not-asked', (v) => v.by]], // leaving an open plan for other work is the person's
  // the refusal says what an effect is and the next step
  decision: [[effectHolds, 'decision-no-effect', (v) => `${v.key}: effect ${asList(v.effect).join(', ') || 'none'}: ${WORDS.effectIs}`],
    // a ref the person's answer both replaces and keeps is placed nowhere
    [(v) => !asList(v.keeps).some((ref) => asList(v.supersedes).includes(ref)), 'placed-twice', (v) => `${v.key}: ${shortOf('placed-twice')}`]],
  research: [[(v) => !v.settles || bound.shape('Cited', v), 'research-uncited', (v) => v.source]],
};
/** What `run` refuses, as a problem [code, detail], or null; a coded refusal it throws is that problem, a fault passes. */
function problemOf(run) {
  try {
    return run() || null;
  } catch (err) {
    if (!isFail(err)) throw err;
    return [err.code, err.detail];
  }
}
/** every reason `value` is no record `add` takes, in one pass: the fields its shape misses, then each of its type's CHECKS; an
 * unknown type, or one only its verb writes, is refused alone. */
function recordProblems(value) {
  const t = bound.shape('Record', value).t;
  if (VERB_ONLY.includes(t)) throw fail('record-verb-only', t);
  const bad = bound.problems(shapeOf(value), value);
  return [...(bad.length ? [[REFUSE[shapeOf(value)] || 'record-invalid', bad.join(', ')]] : []),
    ...(CHECKS[t] || []).map(([holds, code, names]) => problemOf(() => !holds(value) && [code, names(value)])).filter(Boolean)];
}

/** For each record of `values` whose shape does not hold, once per kind: that kind's record with each required field a placeholder of
 * its type, and its optional fields, for the refusal to show the shape it takes. -> { routes } | {} */
function shapesTold(values) {
  const told = values.filter((v) => v && typeof v === 'object' && SHAPES[shapeOf(v)] && bound.problems(shapeOf(v), v).length).map((v) => {
    const [field] = shapeOf(v) === v.t ? [] : RECORD.variants[v.t]; // a variant (a step item, a run probe) keeps the word that names it
    const { value, optional } = bound.example(shapeOf(v), { fixed: { t: v.t, ...(field ? { [field]: v[field] } : {}) } });
    return `a ${field ? v[field] : v.t} record: ${JSON.stringify(value)}${optional.length ? ` (optional: ${optional.join(', ')})` : ''}`;
  });
  return told.length ? { routes: [...new Set(told)] } : {};
}

/** the name of the first text field kit's secret reader would clip (`said`, `answer`, `files.0`), or null; the value itself is never
 * named. */
function secretField(value, at = null) {
  if (typeof value === 'string') return secrets.find(value).length ? at || 'value' : null;
  if (!value || typeof value !== 'object') return null;
  return Object.entries(value).map(([key, item]) => secretField(item, at ? `${at}.${key}` : key)).find(Boolean) || null;
}
/** A batch (`place` names each item) holding a secret is refused whole, before anything is written: `.decisionbook/` is committed. */
function refuseSecrets(items, place) {
  const at = items.findIndex((item) => secretField(item));
  if (at >= 0) throw fail('record-secret', `${place(at)}: ${secretField(items[at])}`);
}

module.exports = { SCHEMA, DIR, CONFIG, storedLine, isTaskPrompt, promptAs, asksLeave, RELS, BUILT_ON, SHAPES, shapeOf, isPlanLink,
  plannedPath, refOf, refValue, refIs, bound, nodeOf, argOf, fieldsAsked, problemOf, recordProblems, shapesTold, refuseSecrets };
