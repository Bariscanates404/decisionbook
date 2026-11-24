// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What a session start (and `resume`) says of the branch's open plan, in its byte budget. A READY plan is frozen and its
// start IS the intake a new session builds from: the settled decisions with the person's own sentences, the files, what the
// research found, the questions parked with someone else; or the draft as the work in progress with what it lacks and its one
// call; or that there is none; and what changed in the protection.
const { text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS, shortOf, SHOWN: { start: shown }, branchWord } = require('../../contracts/codes.cjs');
const { isShown } = require('../../base/text.cjs');
const { scopeOf } = require('../fold.cjs');
const { bytes, boundedLines } = require('./budget.cjs');
const { showCall, replaceLine, jsonCall } = require('./calls.cjs');
const { draftWhy, asideWay } = require('./gate.cjs');
const { NONE, openLines, leadLines } = require('./open.cjs');
const { planHeldBy } = require('../gate.cjs');
const { settledLine, findingLine, stepLine, openQuestionLines, parkedLines, confirmLines, assumptionLine, levelLine } = require('./records.cjs');

// a READY plan's start is the whole intake a new session builds from (the decisions with the person's sentences, the files, the
// findings), so it has twice the room it had as a pointer; nothing else is said of the plan in that context
const START_BYTES = 4096;
const OPEN_SHOWN = 5;
const ASSUMED_SHOWN = 3;

/** The branch's draft, the first thing a session does: that it is the work in progress, to be finished before any research or edit;
 * what it lacks, whose each part is and the one call that shows it (the gate's own sentence); other work only on the person's answer. */
function draftLines(view, branch) {
  const slots = { id: view.id, level: view.level.level, branch: shown.branch(branchWord(branch)), title: shown.title(view.title) };
  return [filled(WORDS.draftOpen, slots), `not READY: ${draftWhy(view)}`, asideWay(view.id)];
}

/** Under the decisions: how a person replaces one, the open questions, the AI's last assumptions, the last note,
 * where more is; a heading stands only over its lines. */
function tailLines(view, decided) {
  const replace = decided.length ? [replaceLine(`${view.id}/<key>`)] : [];
  const questions = openQuestionLines(view);
  const open = questions.length ? [WORDS.open, ...questions.slice(0, OPEN_SHOWN)] : [];
  const assumptions = view.assumptions.slice(-ASSUMED_SHOWN).map(assumptionLine);
  const assumed = assumptions.length ? [WORDS.assumed, ...assumptions] : [];
  const note = view.notes.slice(-1).map((n) => `last note: ${shown.text(n.text)}`);
  return [...replace, ...open, ...assumed, ...note, WORDS.more];
}

const LIST_MIN = 160; // a list with less room than this says nothing: its heading and "+n more" would be all of it

function readyPlanLines(view, branch, max) {
  const held = planHeldBy(view); // what holds it, as the gate reads it: no edit passes
  const title = `Plan ${view.id} READY${held ? `, ${WORDS.held[held].title},` : ''} on ${shown.branch(branchWord(branch))}: ${shown.title(view.title)}`;
  const goal = view.goal ? [`goal: ${shown.goal(view.goal)}`] : [];
  const top = [title, held ? WORDS.held[held].line : WORDS.frozen, WORDS.data, levelLine(view.level), `why: ${shown.why(view.why)}`, ...goal,
    `files: ${shown.files(scopeOf(view).join(', '))}`];
  const decided = view.decisions.filter(isShown).map(settledLine);
  const heading = filled(WORDS.settled, { call: showCall(view.id, 'decisions') });
  const settled = [...confirmLines(view.confirm, view.amended), ...(decided.length ? [heading] : [])];
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

// whose the branch's open plan is to a session (steps/open openFor) where it is said in one line: its words and the key it is said by
const ONE_LINE = { teammate: { words: WORDS.draftTheirs, key: 'decisionbook.draft' }, earlier: { words: WORDS.draftLeft, key: 'decisionbook.draft' } };
/** `open`: the branch's open plan as this machine's sessions meet it; `whose` it is to the session (a teammate's draft, or one an
 * earlier session here left: one line); `items`: the open items (steps/touch); `parked`: the questions that wait with someone on the
 * team (steps/teammate parkedWaiting), said whatever the branch's plan is and whose. What leads (text/open leadLines) stands first, and
 * no plan is asked for while it does; those questions and the plans that lost a conflict follow, each in at most a share of the room, and
 * the plan's lists give way. */
function startText(open, branch, { max = START_BYTES, whose = 'mine', items = NONE, parked = [], idle } = {}) {
  const merging = leadLines(items);
  const waiting = parkedLines(parked);
  const after = [...boundedLines({ head: waiting.slice(0, 1), list: waiting.slice(1), tail: [], max: Math.floor(max / 3), more: jsonCall('inbox') }),
    ...boundedLines({ head: [], list: openLines({ ...NONE, lost: items.lost }), tail: [], max: Math.floor(max / 2), more: jsonCall('inbox') })];
  const around = (lines) => [...merging, ...lines, ...after].join('\n');
  if (!open) return around(merging.length ? [] : idle); // `idle`: what a branch with no plan is told (steps/read)
  const slots = { id: open.id, branch: shown.branch(branchWord(branch)), title: shown.title(open.title),
    files: shown.openFiles(scopeOf(open).join(', ')) };
  if (ONE_LINE[whose]) return around([filled(ONE_LINE[whose].words, slots)]);
  return around(open.state === 'draft' ? draftLines(open, branch) : readyPlanLines(open, branch, max - bytes([...merging, ...after, ''])));
}

/** The start's text as the one thing said of the branch's open plan in a context (the cli's rule by key: the same text again says
 * nothing); `short`: the line that stands for it in a context that already holds an older one. A draft's one line has its own key,
 * so the draft said whole once a message is on it is said in full. */
const startSaid = (text, whose = 'mine') => ({ key: ONE_LINE[whose]?.key ?? 'decisionbook.start', text,
  short: `${text.split('\n')[0]}; ${WORDS.changedSince}` });
/** DecisionBook's part of a /resume-handoff, under its heading, after the person's handoff. */
const sharedPart = (text) => [WORDS.shared, text].join('\n');

/** What the protection lost and gained since the last session (core/policy), for the AI to tell the person. */
function changedLine({ gone, added, unreadable }) {
  const lost = gone.length ? [`${WORDS.noLonger} ${shown.gone(gone.join(', '))}`] : [];
  const gained = added.length ? [`${WORDS.newly} ${shown.added(added.join(', '))}`] : [];
  const torn = unreadable ? [WORDS.unreadable] : [];
  return `${WORDS.changed}: ${[...lost, ...gained, ...torn].join('; ')}.`;
}
const unreadableLine = (why) => `${WORDS.tell} ${shortOf('policy-unreadable')} (${why}).`;

module.exports = { START_BYTES, startText, startSaid, sharedPart, changedLine, unreadableLine };
