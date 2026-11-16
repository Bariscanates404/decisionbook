// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. A promised surface: the import lines a person's words or a plan record show, and a test file's imports judged against them.
const { imports: SHAPES, cap: CAP } = require('../contracts/promise.json');
const { text: { safe: { clip }, secrets } } = require('@atlasbound/kit');

const COMPILED = SHAPES.map(({ form, re }) => ({ form, re: new RegExp(re, 'gm') }));
const boundNames = (list) => list.split(',').map((one) => one.trim().split(/\s*:\s*|\s+as\s+/)[0]).filter(Boolean);

/** Every import line of text, in order: { form: names | whole, names, word (the module as written), line (1-based), text, secret }.
 * `secret`: kit's secret reader would clip the whole statement (read before the clip), so no reader keeps, shows or links it (the one
 * screen, for every source). */
function importsOf(text) {
  const all = COMPILED.flatMap(({ form, re }) => [...String(text).matchAll(re)].map((m) => {
    const at = m.index + (m[0].length - m[0].trimStart().length);
    return { form, names: form === 'names' ? boundNames(m[1]) : [m[1]], word: m[2], line: String(text).slice(0, at).split('\n').length,
      text: clip(m[0].trim().replace(/\s+/g, ' '), CAP.lineChars), secret: secrets.find(m[0]).length > 0 };
  }));
  return all.sort((a, b) => a.line - b.line);
}

/** the rows DecisionBook keeps of a prompt: each statement once (its first saying stays), only the statement, never a secret one; the
 * newest `cap.kept`.
 * -> { rows, held, n: { kept, secret } }, held: the statements the prompt holds that may be kept. */
function promptKept(rows, text, { session, at }) {
  const found = importsOf(text);
  const held = found.filter((imp) => !imp.secret);
  const fresh = [...new Map(held.filter((imp) => !rows.some((r) => r.statement === imp.text)).map((imp) => [imp.text, imp])).values()];
  const added = fresh.map((imp) => ({ statement: imp.text, module: imp.word, names: imp.names, session, at }));
  return { rows: [...rows, ...added].slice(-CAP.kept), held, n: { kept: added.length, secret: found.length - held.length } };
}

/** One promise per promised file: the named exports of every line that promised it, the newest line kept as the one to show, named by the
 * source that said it first (the same statement in two sources is one promise; on a tie, the source read first). */
function promisesOf(found) {
  const byFile = Map.groupBy(found.filter((p) => p.file), (p) => p.file);
  return [...byFile.values()].map((rows) => {
    const newest = rows.reduce((a, b) => (String(b.at) >= String(a.at) ? b : a));
    const first = rows.filter((r) => r.text === newest.text).reduce((a, b) => (String(b.at) < String(a.at) ? b : a));
    const names = [...new Set(rows.filter((r) => r.form === 'names').flatMap((r) => r.names))];
    return { file: newest.file, folder: newest.folder, names, text: newest.text, from: first.from, at: newest.at };
  }).slice(0, CAP.promises);
}

/** Where a test's import leaves the promise: the module bound whole under a promised name (taken as a default it never promised), or a file
 * inside a promised folder that is not the promised file (this code's own). Imports carry `file`, the repository file they resolve to
 * (null: outside). */
function brokenOf(imports, promises) {
  return imports.flatMap((imp) => {
    const same = promises.find((p) => p.file === imp.file);
    if (same) return imp.form === 'whole' && same.names.includes(imp.names[0]) ? [{ ...imp, why: 'whole', promise: same }] : [];
    const inside = imp.file && promises.find((p) => p.folder && imp.file.startsWith(`${p.folder}/`));
    return inside ? [{ ...imp, why: 'inside', promise: inside }] : [];
  });
}

/** The files a promise speaks for: the promised file, every file of its folder, and any test file. */
const concerns = (promises, file, isTest) => isTest || promises.some((p) => p.file === file || (p.folder && file.startsWith(`${p.folder}/`)));

module.exports = { importsOf, promptKept, promisesOf, brokenOf, concerns };
