// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The relevance walk from the work's files and words to earlier plans, ranked file > near > concern > words, newer first.
const { paths: { dirOf } } = require('@atlasbound/kit');
const { RELS, BUILT_ON } = require('../contracts/shapes.cjs');
const { byTime, keyArea, isStanding } = require('../base/text.cjs');
const { covering, folderOf } = require('../base/glob.cjs');
const { found, heldOf, linksOf } = require('./web.cjs');

const RANKS = ['file', 'near', 'concern', 'words'];
// a words-only card holds two of the prompt's words at least: one alone matched any plan that names a common word
// (contract/recall.test.cjs)
const WORD_SCORE = 2;
const CARD_DECISIONS = 3;

function claimsOf(web, cards) {
  const linked = web.edges.filter((e) => e.to.startsWith('file:')).map((e) => ({ id: e.from.slice('plan:'.length), glob: e.to.slice('file:'.length), label: RELS[e.rel].back }));
  const decided = web.decisions.filter(isStanding).flatMap((d) => d.files.map((glob) => ({ id: d.plan, glob, label: 'decided-in', key: d.key })));
  return [...linked, ...decided].filter((c) => cards.has(c.id)).map((c) => ({ id: c.id, glob: c.glob, label: `${c.label} ${c.id}${c.key ? ` (${c.key})` : ''}`,
    area: c.key ? keyArea(c.key) : null, covers: covering(c.glob), folder: folderOf(c.glob) }));
}

function fileHits(claims, seeds) {
  return seeds.flatMap((seed) => claims.flatMap((c) => {
    if (c.covers(seed.file)) return [{ id: c.id, rank: seed.rank, area: c.area, file: seed.file, path: `${seed.how} ← ${c.label}` }];
    const beside = seed.rank === 'file' && c.folder === dirOf(seed.file);
    return beside ? [{ id: c.id, rank: 'near', area: c.area, file: c.glob, path: `${seed.how} → same folder ${c.glob} ← ${c.label}` }] : [];
  }));
}

function concernHits(web, linked, cards) {
  const reached = new Set(linked.map((hit) => hit.id));
  const standing = web.decisions.filter(isStanding);
  const decided = Map.groupBy(standing, (d) => d.plan);
  const sources = new Map();
  [...linked].sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank)).forEach((hit) => (decided.get(hit.id) || []).forEach((d) => {
    if (!sources.has(keyArea(d.key))) sources.set(keyArea(d.key), { key: d.key, path: hit.path });
  }));
  return standing.filter((d) => cards.has(d.plan) && !reached.has(d.plan) && sources.has(keyArea(d.key))).map((d) => {
    const source = sources.get(keyArea(d.key));
    const path = `${source.path} → decides ${source.key} → area ${keyArea(d.key)} → ${d.key}`;
    return { id: d.plan, rank: 'concern', area: keyArea(d.key), file: null, path };
  });
}

const wordHits = (web, words, cards) => found(web, words).filter((h) => h.score >= WORD_SCORE && cards.has(h.view.id))
  .map((h) => ({ id: h.view.id, rank: 'words', area: null, file: null, path: `the words ${h.words.join(', ')} (${h.matched.join(', ')})` }));

function bestOf(hits, cards) {
  const best = new Map();
  hits.forEach((h) => {
    if (!best.has(h.id) || RANKS.indexOf(h.rank) < RANKS.indexOf(best.get(h.id).rank)) best.set(h.id, h);
  });
  return [...best.values()].sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank) || byTime(cards.get(b.id), cards.get(a.id)));
}

function cardOf(web, view, hit) {
  const replaced = web.edges.find((e) => e.rel === 'supersedes' && e.to === `plan:${view.id}`);
  const inArea = (d) => Number(keyArea(d.key) === hit.area);
  const decisions = web.decisions.filter((d) => d.plan === view.id && isStanding(d)).sort((a, b) => inArea(b) - inArea(a));
  const builtOn = linksOf(web, `plan:${view.id}`).filter((l) => [BUILT_ON.rel, RELS[BUILT_ON.rel].back].includes(l.rel));
  return { id: view.id, title: view.title, state: view.state, at: view.at, rank: hit.rank, path: hit.path, file: hit.file,
    replacedBy: replaced ? replaced.from.slice('plan:'.length) : null,
    decisions: decisions.slice(0, CARD_DECISIONS).map(({ key, value, by, supersededBy }) => ({ key, value, by, supersededBy })),
    linked: builtOn.map(({ rel, to, why }) => ({ rel, id: to.slice('plan:'.length), why })) };
}

function relatedOf(web, { files = [], near = [], words = [], branch = null }) {
  const held = heldOf(web, branch);
  const cards = new Map(web.views.filter((v) => v !== held).map((v) => [v.id, v]));
  const seeds = [...files.map((s) => ({ ...s, rank: 'file' })), ...near.map((s) => ({ ...s, rank: 'near' }))];
  const linked = fileHits(claimsOf(web, cards), seeds);
  const hits = [...linked, ...concernHits(web, linked, cards), ...(files.length ? [] : wordHits(web, words, cards))];
  return bestOf(hits, cards).map((hit) => cardOf(web, cards.get(hit.id), hit));
}

module.exports = { relatedOf };
