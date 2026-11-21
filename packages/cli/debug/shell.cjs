// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// debug shell: what kit's shell reader saw in a command the person types (words, writes and by what, the host's variables it sets, what
// it cannot place and why); the trace keeps counts.
const { errors: { fail }, text: { shell: { writtenBy, setBy, readWords }, lines: { filled } }, debug: { render: { columns } } } = require('@atlasbound/kit');
const { DEBUG_SCHEMA } = require('../contracts/shapes.cjs');
const { shortOf, WORDS: { shell: W } } = require('../contracts/codes.cjs');

const wordLine = ({ words, redirs }) => ['words', [...words.map((w) => (w.literal ? w.word : `${w.word}(expands)`)), ...redirs.map((r) => `${r.op} ${r.word ?? ''}`)].join(' ')];
const writeLine = (w) => ['write', [...w.cd, w.path].join(' > '), `by ${w.by}${w.maybe ? W.maybe : ''}`];
const whyLine = ({ code, word }) => ['unplaced', word ?? '', `${shortOf(code)} (${code})`];

async function debugShell({ rest }, io) {
  if (rest.length !== 1) throw fail('args-invalid', W.oneWord);
  const read = writtenBy(rest[0]);
  const commands = readWords(rest[0]);
  const posed = setBy(read, io.hostEnv); // the shell gate denies these before any file is judged
  const answer = posed.length ? filled(W.hostEnv, { names: posed.join(', ') })
    : read.writes.length || read.unplaced ? filled(W.named, { ...read, n: read.writes.length }) : W.nothing;
  const rows = [...commands.map(wordLine), ...read.writes.map(writeLine), ...posed.map((name) => ['sets', name, W.setsHost]),
    ...read.why.map(whyLine), ['answer', answer]];
  const codes = Object.fromEntries(read.why.map(({ code }) => [code, read.why.filter((u) => u.code === code).length]));
  return { out: { schema: DEBUG_SCHEMA, verb: 'shell', commands, ...read, hostEnv: posed }, n: { commands: commands.length, writes: read.writes.length, why: read.why.length }, codes,
    text: `${columns(rows).join('\n')}\n` };
}

module.exports = { debugShell };
