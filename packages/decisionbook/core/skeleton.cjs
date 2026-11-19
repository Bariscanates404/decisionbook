// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE; what a plan still needs at its level as fill-in records, built row by row from the rubric that decides READY (core/ready), so the
// shape handed is the shape READY reads. Every "" is the AI's to fill; the person's answers and yes are a separate part, never filled by
// the AI.
const { UI_PATHS } = require('../contracts/rubric.cjs');
const { ofKind, isAnswered } = require('../base/text.cjs');
const { scopeOf } = require('./fold.cjs');
const { unmet, levelRows } = require('./ready.cjs');
const { anyOverlap } = require('../base/glob.cjs');
const { times, item, theirs, answerTo, ai, person, planPaths } = require('../base/fill.cjs');
const { refOf } = require('../contracts/shapes.cjs');

// each row: (view, its floor, the plan ctx) -> { ai, person }; ctx: files (the paths to plan), checks (the check ids the plan will hold),
// danger
const ROWS = {
  success: (v) => ai(v.success && v.kind ? [] : [{ t: 'amend', success: '', kind: '' }]),
  research: (v, n) => ai(times(n - v.research.length, () => ({ t: 'research', tool: '', asked: '', answer: '', source: '' }))),
  feature: (v) => ai(ofKind(v, 'feature').length ? [] : [item('feature')]),
  plan: (v, n, ctx) => ai(scopeOf(v).length ? [] : planPaths(scopeOf(v), ctx.files).map((file) => ({ t: 'link', rel: 'plans', to: refOf('file', file), why: '' }))),
  checks: (v, n, ctx) => ai(ctx.checks.slice(v.checks.length).map((id) => ({ t: 'check', id, text: '', command: '' }))),
  command: (v, n, ctx) => ai(ctx.commandOnly ? ctx.checks.slice(v.checks.length).map((id) => ({ t: 'check', id, text: '', command: '' })) : []),
  tasks: (v, n, ctx) => {
    const uncovered = ctx.checks.filter((id) => !ofKind(v, 'task').some((t) => t.covers.includes(id)));
    return ai(uncovered.length ? [item('task', { covers: uncovered })] : []);
  },
  // one decision per open question, with its effect; a blocking one is handed here, the others by the answers row
  questions: (v, n, ctx) => person(v.questions.filter((q) => q.blocking && !isAnswered(v, q)).map((q) => answerTo(q, ctx.checks[0]))),
  danger: (v, n, ctx) => person(
    [...scopeOf(v), ...ctx.files].filter((f) => anyOverlap([f], ctx.danger) && !v.decisions.some((d) => anyOverlap([f], d.files)))
    .map((f) => theirs({ files: [f] }))),
  actors: (v) => ai(ofKind(v, 'actor').length ? [] : [item('actor')]),
  edges: (v, n) => ai(times(n - ofKind(v, 'edge').length, () => item('edge'))),
  impact: (v) => ai(ofKind(v, 'impact').length ? [] : [item('impact', { covers: ofKind(v, 'consumer').map((c) => c.text) })]),
  // the forks settled count; the questions asked and not answered are answered first. Nothing blank is handed for this row: a blank
  // question pushed the AI to invent one, a blank "no further fork" item to ask nothing (the cheapest plan was the one with no
  // question). The row's own sentence says the duty: every behaviour left open is a question
  answers: (v, n, ctx) => {
    const row = unmet(v, ctx.level, ctx.danger).find((u) => u.id === 'answers');
    if (!row) return ai([]);
    const asked = v.questions.filter((q) => q.decides && q.whyNotCode && !q.to && !isAnswered(v, q));
    return person(asked.filter((q) => !q.blocking).map((q) => answerTo(q, ctx.checks[0])));
  },
  repro: (v) => ai(v.kind === 'bug' && !ofKind(v, 'repro').length ? [item('repro')] : []),
  precedent: (v, n, ctx) => ai([...scopeOf(v), ...ctx.files].some((f) => UI_PATHS.some((re) => re.test(f))) && !ofKind(v, 'precedent').length ? [item('precedent')] : []),
  risk: (v) => ai(ofKind(v, 'risk').length ? [] : [item('risk')]),
  rollback: (v) => ai(ofKind(v, 'rollback').length ? [] : [item('rollback')]),
  // their yes once every question that names decisions has their answer (a keep is no yes)
  confirm: (v) => person(v.questions.some((q) => q.supersedes.length && !isAnswered(v, q)) ? [] : [{ t: 'confirm', by: '', said: '' }]),
};
const WITH = { checks: 'tasks' }; // a row whose records need another's in the same call: a new check its task, where the level asks tasks
/** The records `rows` (rubric ids) still need on `view` at `level`: { ai, person, rows } (rows: the ids that asked for any). `files`: the
 * paths to plan when the view plans none yet. */
function skeletonOf(view, level, { rows = null, files = [], danger = [] } = {}) {
  const wanted = rows && [...rows, ...rows.map((id) => WITH[id]).filter(Boolean)];
  const asked = levelRows(level).filter((row) => !wanted || wanted.includes(row.id));
  const checksRow = asked.find((row) => row.id === 'checks');
  const commandOnly = !checksRow && asked.some((row) => row.id === 'command') ? 1 : 0; // the command row alone adds one check that carries it
  const checks = [...view.checks.map((c) => c.id), ...times((checksRow ? checksRow.floor[level] - view.checks.length : commandOnly), (i) => `AC-${view.checks.length + i + 1}`)];
  const parts = asked.map(
    (row) => [row.id, ROWS[row.id] ? ROWS[row.id](view, row.floor[level], { files, checks, danger, level, commandOnly }) : ai([])]);
  // a row the records of another fill (command: a check's) still counts as needed
  const missing = unmet(view, level, danger).map((u) => u.id);
  return { ai: parts.flatMap(([, p]) => p.ai), person: parts.flatMap(([, p]) => p.person),
    rows: parts.filter(([id, p]) => p.ai.length + p.person.length || missing.includes(id)).map(([id]) => id) };
}

module.exports = { skeletonOf };
