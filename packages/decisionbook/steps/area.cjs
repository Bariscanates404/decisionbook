// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The work's area (files a text names, files the branch changed, one import step of each) and core/recall's cards cut to the hook's bound.
const { errors: { isFail }, paths: { repoRel, join } } = require('@atlasbound/kit');
const { DIR } = require('../contracts/shapes.cjs');
const { byTime } = require('../base/text.cjs');
const { relatedOf } = require('../core/recall.cjs');
const { sinceHead, builtOf } = require('../core/close.cjs');
const { recallSay, RECALL_CARDS, RELATED_CARDS } = require('../core/text/recall.cjs');
const { sessionRead, sessionRows } = require('./here.cjs');

const SEEDS = 200; // the files of the work one walk starts from: the named and the touched first
const IMPORT_SEEDS = 20; // the files whose import step is read
const IMPORT_STEP = 20; // the neighbours one file adds

const pathWords = (text) => String(text).split(/\s+/).map((word) => word.replace(/^[^\p{L}\p{N}_./~-]+|[^\p{L}\p{N}_~-]+$/gu, '')).filter((word) => /[/.]/.test(word)); // words holding a `/` or `.`, unquoted
const namedFiles = (io, text) => pathWords(text).map((word) => (word.startsWith('/') ? repoRel(io.root, word) : join('', word))).filter((key) => key && io.fs.exists(key) && io.fs.list(key) === null);

// DecisionBook's own records are the history, not the work: never a seed
async function branchFiles(io, web, branch) {
  const [first] = web.views.filter((v) => v.branch === branch && v.head).sort(byTime);
  // a head this clone does not hold: the uncommitted only
  const committed = first ? ((await io.git.commits(first.head)) ?? []).flatMap((c) => c.files) : [];
  return [...(await io.git.statusZ()).map((row) => row.key), ...committed].filter((key) => key && !key.startsWith(`${DIR}/`));
}

/** The files a prompt's work starts from: the ones it names, the session touched (newest first), the branch changed. */
const workFiles = async (io, web, { text, session, branch }) => [...new Set([...namedFiles(io, text),
  ...sessionRows(io, session).filter((row) => row.t === 'file').map((row) => row.file).reverse(), ...(await branchFiles(io, web, branch))])].slice(0, SEEDS);

const neighbours = (edgesOf, file) => {
  const { imports, importers } = edgesOf(file);
  const out = imports.map(({ to }) => ({ file: to, how: `${file} → imports ${to}` }));
  return [...out, ...importers.map(({ from }) => ({ file: from, how: `${file} ← imported by ${from}` }))].slice(0, IMPORT_STEP);
};

async function importStep(io, files) {
  if (!files.length) return { near: [], n: {} }; // nothing to step from: the import graph is not opened
  try {
    const edgesOf = typeof io.imports === 'function' ? await io.imports() : null;
    if (!edgesOf) return { near: [], n: { noImportGraph: 1 } }; // no import graph is handed here: unread
    const near = files.slice(0, IMPORT_SEEDS).flatMap((file) => neighbours(edgesOf, file));
    return { near, n: { near: near.length } };
  } catch (err) {
    if (!isFail(err)) throw err;
    return { near: [], n: { noImportGraph: 1, importGraphUnread: 1 } };
  }
}

// what each shown card built: a closeout as recorded; HEAD's branch's unclosed one read as close reads it; another branch's: no read
async function withBuilt(io, web, { cards, room, branch }) {
  const reads = new Map();
  const own = async (head) => ((await io.git.shared(head, branch))?.length === 0 ? io.git.commits(head, { firstParent: true }) : null);
  const after = (head) => reads.get(head) || reads.set(head, own(head)).get(head);
  const built = await Promise.all(cards.slice(0, room).map(async (card) => {
    const view = web.views.find((v) => v.id === card.id);
    const commits = view.closed ? [] : view.branch === branch && sinceHead(view) && (await after(sinceHead(view)));
    return commits ? { ...card, built: builtOf(web, view, commits) } : card;
  }));
  return [...built, ...cards.slice(room)];
}

/** The area of the work: core/recall's walk from its files (or words) and their import step, each card with what it built within `room`. */
async function areaOf(io, web, { files, words = [], branch }, room) {
  const { near, n } = await importStep(io, files);
  const walked = relatedOf(web, { files: files.map((file) => ({ file, how: file })), near, words, branch });
  return { cards: await withBuilt(io, web, { cards: walked, room, branch }), n: { seeds: files.length, ...n, found: walked.length } };
}

// a pushed card does not say again a decision `said` names (the pack's, steps/here saidByPack); a verb passes none and answers whole
async function cardsFor(io, web, { files, words, branch, session, said = new Set() }, max = null) {
  const { cards: walked, n } = await areaOf(io, web, { files, words, branch }, max ? RECALL_CARDS : RELATED_CARDS);
  const cards = walked.map((card) => ({ ...card, decisions: card.decisions.filter((d) => !said.has(`${card.id}/${d.key}`)) }));
  const say = max && cards.length ? recallSay(cards, max) : [];
  const shown = cards.slice(0, max ? Math.max(say.length - 1, 0) : RELATED_CARDS);
  sessionRead(io, session, shown.map((card) => card.id), max ? 'card' : 'related');
  const built = max && shown.length ? { built: shown.filter((card) => card.built && card.built.own.length).length } : {};
  return { cards, say, n: { ...n, cards: Math.max(say.length - 1, 0), ...built } };
}

module.exports = { SEEDS, namedFiles, branchFiles, workFiles, areaOf, cardsFor };
