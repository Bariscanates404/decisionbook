// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The promised surface here, from three sources in this order: the statements DecisionBook kept from the prompts it was handed,
// DecisionBook records, and the person's journaled prompts when the composition root hands a journal (`io.heard`, handoff's); each module
// word resolved to a file of this repository.
const { paths: { join, dirOf, nameOf } } = require('@atlasbound/kit');
const { entries: ENTRIES } = require('../contracts/promise.json');
const { importsOf, promisesOf } = require('../core/promise.cjs');
const store = require('./store.cjs');
const { keptRows } = require('./here.cjs');

const STEM = /\.[^.]*$/;

/** A module word's file here: the file itself, a file of that stem beside it, or a folder's entry file (then the folder is the module's
 * own). */
function resolved(io, key) {
  if (!key) return null;
  const listed = io.fs.list(key);
  if (!listed && io.fs.exists(key)) return { file: key, folder: null };
  const sibling = (io.fs.list(dirOf(key)) || []).find((name) => name !== nameOf(key) && name.replace(STEM, '') === nameOf(key));
  if (sibling) return { file: join(dirOf(key), sibling), folder: null };
  const entry = (listed || []).find((name) => ENTRIES.includes(name.replace(STEM, '')));
  return entry ? { file: `${key}/${entry}`, folder: key } : null;
}

/** The person's journaled prompts; null: none is handed, so that source is empty (why, off or not installed: the root's
 * `absent('heard')`). */
const journalHere = async (io) => (io.heard ? io.heard() : null);

async function saidHere(io, batch) {
  const web = store.readWeb(io, { batch });
  return [...keptRows(io).map((r) => ({ text: r.statement, from: `prompt:${String(r.session ?? '').slice(0, 8)}`, at: r.at })),
    ...web.views.flatMap((v) => [v.why, v.goal].map((text) => ({ text, from: `plan:${v.id}`, at: v.at }))),
    ...web.decisions.flatMap((d) => [d.value, d.why].map((text) => ({ text, from: `decision:${d.key}`, at: d.at }))),
    ...((await journalHere(io)) || []).map((r) => ({ text: r.text, from: `heard:${r.id}`, at: r.at }))].filter((s) => typeof s.text === 'string');
}

/** Every promise here; one speaks from the repository's root, as a person writes a module in a prompt. `batch`: an add's records held, not
 * yet written.
 * a secret statement of any source is never a promise, so it is never shown, linked or traced. */
async function promisesHere(io, batch = null) {
  const found = (await saidHere(io, batch)).flatMap((s) => importsOf(s.text).filter((imp) => !imp.secret).map((imp) => ({ ...imp, ...resolved(io, join('', imp.word)), from: s.from, at: s.at })));
  return promisesOf(found);
}

module.exports = { resolved, journalHere, promisesHere };
