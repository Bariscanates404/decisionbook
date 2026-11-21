// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The open items (steps/touch openItems) as every reader says them, in the same words: a plan file an unfinished merge left, the
// plan files not read whole (unknown, never absent), then each built plan whose decision lost a conflict after it edited.
const { text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS, SHOWN: { open: shown } } = require('../../contracts/codes.cjs');

const NONE = { merge: [], unread: [], lost: [] };
/** The one line for the records not read ([{ file, code }]): five files and how many more; none: no line. */
const unreadLines = (unread, files = unread.map((r) => `${r.file} (${r.code})`)) => (files.length ? [filled(WORDS.absent.unread,
  { files: shown.files(`${files.slice(0, 5).join(', ')}${files.length > 5 ? ` (+${files.length - 5} more)` : ''}`) })] : []);
// a teammate's plan's item (`author`: steps/touch) says who clears it, never the record to write here
const lostLine = (l) => filled(`${WORDS.lostAfter} ${l.author ? WORDS.lostTheirs : WORDS.lostMine}`, { ...l, files: shown.files(l.files.join(', ')),
  value: shown.value(String(l.value)), now: shown.value(String(l.now)), author: shown.author(l.author ?? '') });
/** `ids`: the plans a reader is about (none given: every plan's); an unfinished merge and a file not read are every reader's (what
 * they hold is not known). -> the lines, merges first */
const openLines = ({ merge, unread, lost }, ids = null) => [...merge.map((m) => m.why), ...unreadLines(unread),
  ...lost.filter((l) => !ids || ids.includes(l.plan)).map(lostLine)];

/** What leads a session's start: an unfinished merge, then the plan files not read, each under the line that says what to do first. */
const leadLines = ({ merge, unread }) => [...(merge.length ? [WORDS.mergeFirst, ...merge.map((m) => m.why)] : []),
  ...(unread.length ? [WORDS.unreadFirst, ...unreadLines(unread)] : [])];

module.exports = { NONE, lostLine, unreadLines, openLines, leadLines };
