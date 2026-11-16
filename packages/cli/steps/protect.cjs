// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// setup's one question, once per repository; with no person at a terminal the AI only relays it (the product cannot prove who typed the
// yes).
const { text: { lines: { counted } } } = require('@atlasbound/kit');
const { saidFailure } = require('./failure.cjs');

const WHAT = '  AtlasBound can protect your source files: before an AI edits a protected file, it first writes a short plan with DecisionBook (why, which ' +
  'files, how it is checked) and asks you to approve it. It cannot prove who typed the yes, and it is a check, not a sandbox: it sees an AI\'s ' +
  'write tools and what a shell command\'s text says it writes, never what a program does once it runs.';
const LATER = '  you can change this any time with atlasbound protect';
const ANSWERS = { 1: 'source', 2: 'chosen', 3: 'none' };

const foldersOf = (said) => {
  const folders = said.candidates.filter(({ glob }) => glob.endsWith('/**'));
  return folders.map(({ glob, files }) => `${glob} (${counted(files, 'file')})`).join(', ') || 'none found: choose them';
};

const forTheAi = (folders) => ['protect your source files? (for the AI: ask the person; do not answer this yourself)', WHAT,
  `  automatic: ${folders}  ->  atlasbound protect --source`, '  choose: the paths the person names  ->  atlasbound protect "<path or glob>[,...]"',
  '  not now: nothing is protected  ->  the person types atlasbound protect --none in their own terminal', LATER];

const forThePerson = (folders) => `${['protect your source files?', WHAT, `  1  automatic: ${folders}`, '  2  choose them yourself',
  '  3  not now: nothing is protected', LATER].join('\n')}\nanswer 1, 2 or 3: `;

async function heard(io, folders, choices) {
  const answer = ANSWERS[await io.terminal.ask(forThePerson(folders))];
  const globs = answer === 'chosen' ? await io.terminal.ask(`${choices}the paths to protect, comma separated: `) : '';
  if (!answer || (answer === 'chosen' && !globs)) return null;
  return { flags: { source: answer === 'source', none: answer === 'none' }, rest: globs ? [globs] : [], door: 'setup-terminal' };
}

/** The answer `protect` (DecisionBook's verb) asked once with no word, then with what the person chose at a terminal. */
async function setupQuestion(io) {
  const { out: said, text: choices } = await io.answer('protect', {});
  if (said.answer || said.current) return { lines: [], door: 'answered' };
  const folders = foldersOf(said);
  if (!io.terminal.on) return { lines: forTheAi(folders), door: 'ai' };
  try {
    const args = await heard(io, folders, choices);
    if (!args) return { lines: ['protect: no answer, so nothing is protected yet; setup asks again next time'], door: 'none' };
    return { lines: [(await io.answer('protect', args)).text.trimEnd()], door: 'person' };
  } finally {
    io.terminal.close();
  }
}

async function askProtect(_input, io) {
  const { lines, door } = await setupQuestion(io);
  return { out: lines, n: { lines: lines.length }, codes: {}, ref: { door } };
}

/** What is protected, in the words of the answer `notice` (DecisionBook's; setup and doctor say it); null where nothing on here provides
 * it or it cannot say it (the record keeps why). */
const noticeOf = (io) => Promise.resolve().then(async () => (await io.answer('notice', {}))?.text.trimEnd() ?? null).catch((err) => {
  saidFailure(io, 'protect', 'notice-unread', err);
  return null;
});

module.exports = { askProtect, noticeOf };
