// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The handoff's codes and their wording: every answer of a hook or a verb, every refusal of a reply, every fact that was not measured.
const { codes: { createCodes } } = require('@atlasbound/kit');

const ROWS = [
  ['handoff-no-home', 'this user has no home folder, so nothing is kept and nothing is said'],
  ['handoff-no-session', 'no AI session here: the note holds the facts; /handoff inside a session writes now, next and the kept lines'],
  // the note
  ['note-built', 'the note was rebuilt from what can be measured now'],
  ['note-refreshed', 'the note was brought up to the session\'s journal: at a message, at a turn\'s end, and for a session that ended without one'],
  ['note-kept', 'now, next and the kept lines were written into the note'],
  ['note-shown', 'the note as stored'],
  ['note-none', 'this branch has no note here yet'],
  ['note-unreadable', 'this branch\'s note is there and does not read as a note, so nothing is written over it: repair the file or move it away'],
  ['session-unreadable', 'this session\'s record is there and does not read, so nothing is written over it: repair the file or move it away'],
  ['note-said', 'the note of this branch was said to the new context'],
  ['resume-said', 'the note was given on /resume-handoff'],
  // a reply to the fill-in: all of it is written, or none
  ['reply-invalid', 'the reply is not the JSON the fill-in shows'],
  ['reply-refused', 'nothing was written: fix the lines named and send the whole reply again'],
  ['kept-uncited', 'a kept line ends with the number of the message it comes from, as [m3] or [m3, m17]'],
  ['kept-cites-unknown', 'a kept line names a message number that is not in the list'],
  ['kept-not-quoted', 'a kept line holds the person\'s own words from the message it names, as they wrote them; a paraphrase ' +
    'or a word cut short is not theirs, nor is a line with words of yours beside theirs: a one-word answer is kept alone ("keep it [m3]"), and what it answered goes in now'],
  ['kept-too-many', 'more new kept lines than one handoff takes'],
  ['kept-over-cap', 'the kept list would pass its cap: drop the least needed in the same reply'],
  ['done-unproven', 'done, complete, finished or works is said only beside a commit that exists here'],
  ['drop-unknown', 'no kept line has that number'],
  ['job-drop-unsourced', 'a job goes only with a commit made since it was kept, or the person\'s own words from a later message, '
    + 'as "<their words> [m9]": words that are about this job (or name its number, k2) and say it is done, dropped or changed'],
  ['drop-unsourced', 'a kept line goes only with the person\'s own words from a message after it was kept, as "<their words> [m9]": '
    + 'words that are about this line (or name its number, k2) and say it is done, dropped, cancelled or changed'],
  ['line-dropped', 'the kept line was dropped'],
  ['line-edited', 'the kept line was reworded'],
  // a person's message and an edit
  ['message-kept', 'the head of the message was kept in the home store'],
  ['message-passed', 'a slash command holds no words to keep'],
  ['file-touched', 'the edited file was counted for this session'],
  ['file-outside', 'the edited file is not in this repository, so it is not counted'],
  // a fact the note could not measure
  ['session-unseen', 'this session\'s start was not seen'],
  ['session-head-gone', 'the commit this session began at is no longer here'],
  ['head-none', 'this repository has no commit yet'],
  // the one context notice: no handoff is asked for by itself, a person asks (/handoff, atlasbound handoff)
  ['context-notice', 'tell the person once, inside your normal reply, how full this session\'s context is (the line above) and that '
    + '/handoff keeps what matters before a compaction if they want it; do not start a handoff yourself'],
  ['context-below', 'the context is below the notice point'],
  ['context-noticed', 'the context notice was said once in this session already'],
  ['context-unread', 'no usage could be read from the transcript, so nothing is said'],
];

module.exports = createCodes(ROWS);
