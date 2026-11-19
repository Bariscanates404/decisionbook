// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// setup's one question, once per repository; with no person at a terminal the AI only relays it (the product cannot prove who typed the
// yes).
const { text: { lines: { counted, filled } } } = require('@atlasbound/kit');
const { WORDS: { protect: W } } = require('../contracts/codes.cjs');
const { saidFailure } = require('./failure.cjs');

const ANSWERS = { 1: 'source', 2: 'chosen', 3: 'none' };

// each candidate: a top folder (`<dir>/**`) or an entry file at the root
const foldersOf = (said) => said.candidates.map(({ glob, files }) => `${glob} (${counted(files, 'file')})`).join(', ') || W.noneFound;

// the question as the AI relays it and as a person at a terminal answers it; a line's {what} and {later} are the words beside it
const forTheAi = (folders) => W.forTheAi.map((line) => filled(line, { ...W, folders }));
const forThePerson = (folders) => `${W.forThePerson.map((line) => filled(line, { ...W, folders })).join('\n')}\n${W.answer}`;

async function heard(io, folders, choices) {
  const answer = ANSWERS[await io.terminal.ask(forThePerson(folders))];
  const globs = answer === 'chosen' ? await io.terminal.ask(filled(W.paths, { choices })) : '';
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
    if (!args) return { lines: [W.noAnswer], door: 'none' };
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
