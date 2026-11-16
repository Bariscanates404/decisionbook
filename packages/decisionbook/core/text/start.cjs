// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What a session start (and `resume`) says of the branch's open plan, in its byte budget. A READY plan is frozen and its
// start IS the intake a new session builds from: the settled decisions with the person's own sentences, the files, what the
// research found, the questions parked with someone else; or the draft as the work in progress with what it lacks and its one
// call; or that there is none; and what changed in the protection.
const { text: { safe: { clip }, lines: { filled } } } = require('@atlasbound/kit');
const { WORDS, shortOf } = require('../../contracts/codes.cjs');
const { unrevised } = require('../../base/text.cjs');
const { scopeOf } = require('../fold.cjs');
const { openPlan } = require('../gate.cjs');
const { bytes, boundedLines } = require('./budget.cjs');
const { showCall, replaceLine } = require('./calls.cjs');
const { draftWhy, asideWay } = require('./gate.cjs');
const { settledLine, findingLine, stepLine, openQuestionLines, parkedLines, confirmLines, assumptionLine, levelLine } = require('./records.cjs');

// a READY plan's start is the whole intake a new session builds from (the decisions with the person's sentences, the files, the
// findings), so it has twice the room it had as a pointer; nothing else is said of the plan in that context
const START_BYTES = 4096;
const OPEN_SHOWN = 5;
const ASSUMED_SHOWN = 3;

/** The branch's draft, the first thing a session does: that it is the work in progress, to be finished before any research or edit;
 * what it lacks, whose each part is and the one call that shows it (the gate's own sentence); other work only on the person's answer. */
function draftLines(view, branch) {
  const slots = { id: view.id, level: view.level.level, branch: clip(branch, 100), title: clip(view.title, 100) };
  return [filled(WORDS.draftOpen, slots), `not READY: ${draftWhy(view)}`, ...parkedLines(view), asideWay(view.id)];
}

/** Under the decisions: how a person replaces one, the open questions, the AI's last assumptions, the last note,
 * where more is; a heading stands only over its lines. */
function tailLines(view, decided) {
  const replace = decided.length ? [replaceLine(`${view.id}/<key>`)] : [];
  const questions = openQuestionLines(view);
  const open = questions.length ? [WORDS.open, ...questions.slice(0, OPEN_SHOWN)] : [];
  const assumptions = view.assumptions.slice(-ASSUMED_SHOWN).map(assumptionLine);
  const assumed = assumptions.length ? [WORDS.assumed, ...assumptions] : [];
  const note = view.notes.slice(-1).map((n) => `last note: ${clip(n.text, 200)}`);
  return [...replace, ...open, ...parkedLines(view), ...assumed, ...note, WORDS.more];
}

const LIST_MIN = 160; // a list with less room than this says nothing: its heading and "+n more" would be all of it

function readyPlanLines(view, branch, max) {
  const title = `Plan ${view.id} READY on ${clip(branch, 100)}: ${clip(view.title, 100)}`;
  const goal = view.goal ? [`goal: ${clip(view.goal, 200)}`] : [];
  const top = [title, WORDS.frozen, WORDS.data, levelLine(view.level), `why: ${clip(view.why, 300)}`, ...goal,
    `files: ${clip(scopeOf(view).join(', '), 400)}`];
  const decided = unrevised(view.decisions).map(settledLine);
  const settled = [...confirmLines(view.confirm, view.amended), ...(decided.length ? [WORDS.settled] : [])];
  const tail = tailLines(view, decided);
  const room = max - bytes([...top, ...settled, ...tail]);
  const each = Math.floor((room - Math.min(bytes(decided), Math.floor(room / 2))) / 2); // the decisions first, up to half the room
  // the steps and the findings, each a list under its heading in its share; none, or no room for more than its heading: no line
  const lists = [[WORDS.stepsLeft, view.steps.map(stepLine), 'plan'], [WORDS.found, view.research.map(findingLine), 'research']]
    .flatMap(([heading, list, node]) => (list.length && each >= LIST_MIN
      ? boundedLines({ head: [heading], list, tail: [], max: each, more: showCall(view.id, node) }) : []));
  const head = [...top, ...lists, ...settled];
  return boundedLines({ head, list: decided, tail, max, more: showCall(view.id, 'decisions') });
}

/** The branch's open plan is the gate's (core/gate openPlan): what a start says, a denial says. */
function startText(web, branch, { max = START_BYTES } = {}) {
  const open = openPlan(web, branch);
  if (!open) return WORDS.none;
  return (open.state === 'draft' ? draftLines(open, branch) : readyPlanLines(open, branch, max)).join('\n');
}

/** The start's text as the one thing said of the branch's open plan in a context (the cli's rule by key: the same text again says
 * nothing); `short`: the line that stands for it in a context that already holds an older one. */
const startSaid = (text) => ({ key: 'decisionbook.start', text, short: `${text.split('\n')[0]}; ${WORDS.changedSince}` });
/** DecisionBook's part of a /resume-handoff, under its heading, after the person's handoff. */
const sharedPart = (text) => [WORDS.shared, text].join('\n');

/** What the protection lost and gained since the last session (core/policy), for the AI to tell the person. */
function changedLine({ gone, added, unreadable }) {
  const lost = gone.length ? [`${WORDS.noLonger} ${clip(gone.join(', '), 300)}`] : [];
  const gained = added.length ? [`${WORDS.newly} ${clip(added.join(', '), 300)}`] : [];
  const torn = unreadable ? [WORDS.unreadable] : [];
  return `${WORDS.changed}: ${[...lost, ...gained, ...torn].join('; ')}.`;
}
const unreadableLine = (why) => `${WORDS.tell} ${shortOf('policy-unreadable')} (${why}).`;

module.exports = { START_BYTES, startText, startSaid, sharedPart, changedLine, unreadableLine };
