// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What a person's yes covers. A confirm is the person's yes after a prompt of theirs since the plan's `new`, on the plan as they saw
// it (core/level); and where their answers to every blocking question are that yes. Whose a record is: core/whose.
const { person: { saidAfter } } = require('@atlasbound/kit');
const { isAfter, personSigned, wordCut } = require('../base/text.cjs');
const { HEARD } = require('../contracts/rubric.cjs');
const { foldPlan, planChange } = require('./fold.cjs');
const { grownSince } = require('./level.cjs');
const { allAnswered, answersKeep } = require('./ready.cjs');
const { notSaid, yesOutgrown, yesUnseen } = require('./text/refused.cjs');

const NOT_ASKED = 'confirm-not-asked'; // a confirm that is no yes of the person's
const UNSEEN = ['amend', 'task', 'check']; // the plan's goal, tasks and checks: a yes covers them only once the person saw them

/** `actor`: who acts (kit's answer over this session's prompt rows); `rows`: the plan's records as the batch leaves
 * them; `view`: their fold. -> { amended: the kinds of record that changed the plan after the person saw it }, or
 * { refused: why this confirm is no person's yes }. */
function yesCovers({ actor, rows, view, danger, risk }) {
  if (saidAfter(actor, view.at) !== 'yes') return { refused: notSaid(NOT_ASKED, actor.why !== 'no-prompt-row') };
  if (actor.who === 'terminal') return { amended: [] };
  const seen = foldPlan(rows.filter((row, i) => !i || !isAfter(row.at, actor.at)));
  const grown = grownSince(seen, view, danger, risk);
  if (grown.length) return { refused: yesOutgrown(grown) };
  const amended = rows.filter((row) => isAfter(row.at, actor.at)).map(planChange).filter(Boolean);
  const unseen = [...new Set(amended.filter((kind) => UNSEEN.includes(kind)))];
  return unseen.length ? { refused: yesUnseen(unseen) } : { amended };
}

/** Whether the person's answers are their yes: every blocking question has their answer, none keeps an old decision (a keep is no
 * yes), and `added` (this write's records in words after the plan's `new`) brought one; else their yes in words. -> words | null */
function answersAreYes(view, added) {
  if (!allAnswered(view) || answersKeep(view)) return null;
  const brought = added.filter((r) => r.t === 'decision' && personSigned(r) && view.questions.some((q) => q.blocking && q.q === r.answers));
  const theirs = brought.map((r) => r.said).filter(Boolean);
  return brought.length ? wordCut([...new Set(theirs)].join(' '), HEARD.said) : null;
}

module.exports = { yesCovers, answersAreYes, NOT_ASKED };
