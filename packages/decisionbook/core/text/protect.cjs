// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What `protect` answers and what a session start says of protection: the paths that need a plan, or that
// there are none and who chose that.
const { text: { safe: { clip }, lines: { counted, filled } } } = require('@atlasbound/kit');
const { WORDS } = require('../../contracts/codes.cjs');

/** One line: the protected paths, or none (a person's answer, or nobody chose yet). */
function protectLine({ protect, answer }) {
  if (protect.length) return filled(WORDS.protectedPaths, { globs: clip(protect.join(', '), 600) });
  return answer && answer.answer === 'none' ? WORDS.answeredNone : WORDS.unprotected;
}

function candidateLine({ glob, files, testFiles }) {
  const tests = testFiles ? `, ${counted(testFiles, WORDS.testFileUnit)}` : '';
  return `  ${glob}   ${counted(files, WORDS.fileUnit)}${tests}`;
}

/** After an answer: what is protected now and what an edit there needs. With no answer: what is protected, the
 * folders a person could choose, and how to choose. */
function protectText(out) {
  if (out.code === 'protect-answered') {
    if (out.answer === 'none') return WORDS.answeredNone;
    return [filled(WORDS.protectedPaths, { globs: out.current.join(', ') }), WORDS.protectNext].join('\n');
  }
  const now = filled(WORDS.protectedNow, { globs: (out.current || []).join(', ') || WORDS.noneChosen });
  const folders = out.candidates.length ? out.candidates.map(candidateLine) : [WORDS.protectNoFolder];
  return [now, WORDS.protectCould, ...folders, WORDS.protectChoose].join('\n');
}

module.exports = { protectLine, protectText };
