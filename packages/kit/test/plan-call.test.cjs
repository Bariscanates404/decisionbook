// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// every shipped text an AI reads names the one call that plans, `atlasbound decisionbook new`; `/decisionbook` loads a 10 KB command
// file. Allowed: the module list a person reads (cli's modules.json names the commands a module gives) and the command file's own title.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadPackages, shippedOf } = require('../tools/packages.cjs');

const SLASH = /(?<![\w@./-])\/decisionbook\b/;
const ALLOWED = [{ file: 'cli/contracts/modules.json', line: /^\s*"(what|loses)": / }, { file: 'decisionbook/commands/decisionbook.md', line: /^# \/decisionbook$/ }];

const linesWith = (re) => loadPackages(ROOT).flatMap(({ name, dir }) => shippedOf(dir).flatMap((rel) => fs.readFileSync(path.join(dir, rel), 'utf8').split('\n')
  .map((text, i) => ({ file: `${name}/${rel}`, line: i + 1, text })).filter((l) => re.test(l.text))));

// a new or add printed with its JSON as a single-quoted word breaks the shell on an apostrophe in a text; a heredoc's brace with a quote is
// held by the host as obfuscation, a prompt in its default permission mode
test('no shipped text prints a new or add with its JSON as a quoted argument or a heredoc: the one form is the draft', () => {
  assert.deepEqual(linesWith(/atlasbound decisionbook (new|add)\b[^\n]*?['"]\$?[[{]/).map((l) => `${l.file}:${l.line}`), []);
  assert.deepEqual(linesWith(/<<'JSON'/).map((l) => `${l.file}:${l.line}`), []);
});

test('no shipped text names the slash command as the way to plan; the person\'s module list and the command\'s own title may', () => {
  const found = linesWith(SLASH);
  const allowed = (l) => ALLOWED.some((a) => a.file === l.file && a.line.test(l.text));
  assert.deepEqual(found.filter((l) => !allowed(l)).map((l) => `${l.file}:${l.line}`), []);
  assert.deepEqual([...new Set(found.filter(allowed).map((l) => l.file))].sort(), ALLOWED.map((a) => a.file).sort(), 'each allowed place still holds it');
});
