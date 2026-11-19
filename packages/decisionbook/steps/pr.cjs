// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// `pr [<id>|--branch]`: a pull request's description from the plan records: one plan, or every plan of this branch but one set aside or
// replaced (the default). Its goal, the decisions in the person's words with what they did not take, checks, commits. Reads only: it
// prints, it calls no service.
const { errors: { fail } } = require('@atlasbound/kit');
const { closedOf, sinceHead } = require('../core/close.cjs');
const { withProposed } = require('../core/fold.cjs');
const store = require('./store.cjs');
const { WORDS } = require('../contracts/codes.cjs');

/** A plan's own commits: those its close recorded, else those a close would record now; null where it names no commit it began on. */
async function ownCommits(io, view) {
  if (view.closed) return view.closed.own;
  const commits = sinceHead(view) ? await io.git.commits(sinceHead(view), { firstParent: true }) : null;
  return commits && closedOf(view, commits, null).own;
}

async function pr({ rest, flags = {} }, io) {
  if (rest[0] && flags.branch) throw fail('plan-args', WORDS.usage.pr);
  if (rest[0]) store.readPlan(io, rest[0]); // an id that names no plan here is plan-unknown
  const web = store.readWeb(io);
  const branch = await io.git.branch();
  const views = web.views.filter((v) => (rest[0] ? v.id === rest[0] : v.branch === branch && !['aside', 'superseded'].includes(v.state)));
  const plans = await Promise.all(views.map(async (v) => ({ id: v.id, title: v.title, state: v.state, why: v.why, success: v.success,
    goal: v.goal, decisions: withProposed(v, v.decisions.filter((d) => !d.proposed && d.state !== 'revised')), checks: v.checks,
    commits: await ownCommits(io, v) })));
  return { out: { branch, plans }, code: 'plan-shown', n: { plans: plans.length } };
}

module.exports = { pr };
