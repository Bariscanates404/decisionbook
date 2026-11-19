// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What the gate says when it denies or asks: the code, the file, the code's sentence and why in this case; the one line for a
// file the frozen plan took in; the same for a shell command's writes and for the stop check.
const { text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS, shortOf, SHOWN: { gate: shown } } = require('../../contracts/codes.cjs');
const { isAnswered } = require('../../base/text.cjs');
const { rivalText } = require('./records.cjs');

/** `why`: what holds in this case; `noOne`: the host asks nobody here, so the reason says what to do instead. */
function gateReason({ code, file, why = '', noOne = false }) {
  const inCase = why ? ` (${why})` : '';
  const instead = noOne ? `. ${shortOf('ask-no-one')}` : '';
  return `${WORDS.gatePrefix} ${code}: ${file}: ${shortOf(code)}${inCase}${instead}`;
}

/** How an open plan is left for other work: only on the person's answer, recorded on it as theirs (one record, in the sentence). */
const asideWay = (id) => filled(WORDS.asideWay, { id, record: JSON.stringify({ t: 'aside', by: '', said: WORDS.asideSaid }) });

/** Why a file outside the READY plan is asked: the plan, and the level it would run at with the file in it where that is higher. */
const outsideWhy = (plan, level) => [filled(WORDS.outsidePlan, { id: plan.id }),
  ...(level !== plan.ready.level ? [filled(WORDS.outsideGrows, { level: WORDS.levels[level] })] : [])].join('; ');

const PERSONS = ['questions', 'danger', 'standards', 'confirm']; // the rubric rows only a person's words fill
/** The branch's draft, the same at a session's start and at a denied edit: its id, the rows it lacks, which of them the AI fills now
 * with no one asked, the ONE thing needed of the person as a plain question (each blocking question with no answer of theirs and,
 * where forks are short, each fork asked and not answered; else their yes), and the one call that shows it all as an add to fill. */
function draftWhy(draft) {
  const rows = draft.unmet.map((row) => row.id);
  const mine = rows.filter((row) => !PERSONS.includes(row));
  const asked = draft.questions.filter((q) => !isAnswered(draft, q) && (q.blocking || (rows.includes('answers') && q.decides)));
  const open = asked.map((q) => `${shown.q(q.q)}: ${shown.text(q.text)}`);
  const yes = rows.includes('confirm') ? WORDS.draftYes : '';
  const ask = open.length ? filled(WORDS.draftAsk, { questions: open.join('; ') }) : yes;
  return filled(WORDS.draftHere, { id: draft.id, rows: rows.join(', '), ask,
    mine: mine.length ? filled(WORDS.draftMine, { rows: mine.join(', ') }) : '' });
}

/** Why the branch's READY plan covers no edit of a session of another task: the plan, and how the session goes on with it instead. */
const otherTaskWhy = (plan) => filled(WORDS.otherTask, { id: plan.id, record: JSON.stringify({ t: 'resume', why: WORDS.otherTaskWhy }) });
/** Why a plan whose person's decisions hold a conflict covers no edit: each conflict, its lines, who and their words. */
const conflictWhy = (plan) => plan.decisions.filter((d) => d.rivals?.length).map(rivalText).join(' ');
/** Why the branch's draft holds no edit of a file it does not name. */
const elsewhereWhy = (draft) => filled(WORDS.draftElsewhere, { id: draft.id });

/** Why a READY plan that grew past its level covers no edit: the level it is now, and what that level still lacks. */
const outgrownWhy = (plan) => `${filled(WORDS.outgrown, { level: WORDS.levels[plan.level.level] })}; ${draftWhy(plan)}`;

/** Why a policy write is the person's: the globs it takes out. */
const takesOutWhy = (globs) => shown.takesOut(filled(WORDS.takesOut, { globs: globs.join(', ') }));
/** Why a READY plan is asked about once: who committed it, or that no yes to it is recorded on this machine. */
const cameFromWhy = (author) => (author ? `${WORDS.cameWith} ${shown.author(author)}` : WORDS.notMadeHere);

/** A shell command whose writes cannot be placed; `what`: the folder it writes, or why it was not read, or ''; `said`: its own words
 * where the code's do not fit (git's merge family). */
function unplacedReason(what, said = shortOf('shell-unplaced')) {
  const about = what ? `${what}: ` : '';
  return `${WORDS.gatePrefix} shell-unplaced: ${about}${said}`;
}
/** A shell read's ask: too long to read, a command's own words for files it never names (`shellUnnamed`), or a write not placed. */
function unplacedOf(read, unread) {
  if (unread) return unplacedReason(WORDS.shellUnread);
  const own = read.why.find((w) => w.code === 'shell-writes-unnamed' && Object.hasOwn(WORDS.shellUnnamed, w.word));
  return own ? unplacedReason(own.word, WORDS.shellUnnamed[own.word]) : unplacedReason('');
}

/** The gate's reason for the file a shell command writes, then that the command writes it and what lets it pass. */
const shellReason = (reason, file) => [reason, `${WORDS.shellWrites} ${file}; ${WORDS.shellNext}`].join('\n');

/** The plan's reason and the promise's, for a write both refuse, so one round fixes both. */
const bothReasons = (plan, promise) => `${plan} ; ${promise}`;

const stopReason = (code, files) => `${WORDS.stopPrefix} ${code}: ${shown.files(files.join(', '))}: ${shortOf(code)}`;

module.exports = { gateReason, conflictWhy, otherTaskWhy, outsideWhy, outgrownWhy, elsewhereWhy,
  draftWhy, asideWay, takesOutWhy, cameFromWhy, unplacedReason, unplacedOf, shellReason, bothReasons,
  stopReason };
