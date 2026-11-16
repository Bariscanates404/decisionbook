// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What the gate says when it denies or asks: the code, the file, the code's sentence and why in this case; the one line for a
// file the frozen plan took in; the same for a shell command's writes and for the stop check.
const { text: { safe: { clip }, lines: { filled } } } = require('@atlasbound/kit');
const { WORDS, shortOf } = require('../../contracts/codes.cjs');
const { isAnswered } = require('../../base/text.cjs');

/** `why`: what holds in this case; `noOne`: the host asks nobody here, so the reason says what to do instead. */
function gateReason({ code, file, why = '', noOne = false }) {
  const inCase = why ? ` (${why})` : '';
  const instead = noOne ? `. ${shortOf('ask-no-one')}` : '';
  return `${WORDS.gatePrefix} ${code}: ${file}: ${shortOf(code)}${inCase}${instead}`;
}

/** How an open plan is left for other work: only on the person's answer, recorded on it as theirs (one record, in the sentence). */
const asideWay = (id) => filled(WORDS.asideWay, { id, record: JSON.stringify({ t: 'aside', by: '', said: WORDS.asideSaid }) });

/** The one line said when the frozen plan takes in a file written outside it. */
const grownLine = (id, file) => filled(WORDS.grown, { id, file: clip(file, 160) });

const PERSONS = ['questions', 'danger', 'standards', 'confirm']; // the rubric rows only a person's words fill
/** The branch's draft, the same at a session's start and at a denied edit: its id, the rows it lacks, which of them the AI fills now
 * with no one asked, the ONE thing needed of the person as a plain question (each blocking question with no answer of theirs and,
 * where forks are short, each fork asked and not answered; else their yes), and the one call that shows it all as an add to fill. */
function draftWhy(draft) {
  const rows = draft.unmet.map((row) => row.id);
  const mine = rows.filter((row) => !PERSONS.includes(row));
  const asked = draft.questions.filter((q) => !isAnswered(draft, q) && (q.blocking || (rows.includes('answers') && q.decides)));
  const open = asked.map((q) => `${clip(q.q, 40)}: ${clip(q.text, 240)}`);
  const yes = rows.includes('confirm') ? WORDS.draftYes : '';
  const ask = open.length ? filled(WORDS.draftAsk, { questions: open.join('; ') }) : yes;
  return filled(WORDS.draftHere, { id: draft.id, rows: rows.join(', '), ask,
    mine: mine.length ? filled(WORDS.draftMine, { rows: mine.join(', ') }) : '' });
}

/** Why a policy write is the person's: the globs it takes out. */
const takesOutWhy = (globs) => clip(filled(WORDS.takesOut, { globs: globs.join(', ') }), 200);
/** Why a READY plan is asked about once: who committed it, or that no yes to it is recorded on this machine. */
const cameFromWhy = (author) => (author ? `${WORDS.cameWith} ${clip(author, 80)}` : WORDS.notMadeHere);

/** A shell command whose writes cannot be placed; `what`: the folder it writes, or why it was not read, or ''. */
function unplacedReason(what) {
  const about = what ? `${what}: ` : '';
  return `${WORDS.gatePrefix} shell-unplaced: ${about}${shortOf('shell-unplaced')}`;
}

/** The gate's reason for the file a shell command writes, then that the command writes it and what lets it pass. */
const shellReason = (reason, file) => [reason, `${WORDS.shellWrites} ${file}; ${WORDS.shellNext}`].join('\n');

/** The plan's reason and the promise's, for a write both refuse, so one round fixes both. */
const bothReasons = (plan, promise) => `${plan} ; ${promise}`;

const stopReason = (code, files) => `${WORDS.stopPrefix} ${code}: ${clip(files.join(', '), 600)}: ${shortOf(code)}`;

module.exports = { gateReason, grownLine, draftWhy, asideWay, takesOutWhy, cameFromWhy, unplacedReason, shellReason, bothReasons,
  stopReason };
