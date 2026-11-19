// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The relevance walk from the work's files and words to earlier plans, ranked file > words (most first) > near > concern, then newer.
const { paths: { dirOf } } = require('@atlasbound/kit');
const { RELS, BUILT_ON, refOf, refValue, refIs } = require('../contracts/shapes.cjs');
const { byTime, keyArea, isStanding, isAi } = require('../base/text.cjs');
const { covering, folderOf } = require('../base/glob.cjs');
const { found, heldOf, linksOf } = require('./web.cjs');

// the plans of the work's own files, the plans the task names in words, a file's neighbours, a neighbour's concern
const RANKS = ['file', 'words', 'near', 'concern'];
const WORD_SCORE = 2; // a words card holds two of the task's words at least: one alone matched any plan that names a common word
const CARD_DECISIONS = 3;

function claimsOf(web, cards) {
  const linked = web.edges.filter((e) => refIs('file', e.to)).map((e) => ({ id: refValue(e.from), glob: refValue(e.to), label: RELS[e.rel].back }));
  const decided = web.decisions.filter(isStanding).flatMap((d) => d.files.map((glob) => ({ id: d.plan, glob, label: 'decided-in', key: d.key })));
  return [...linked, ...decided].filter((c) => cards.has(c.id)).map((c) => ({ id: c.id, glob: c.glob, label: `${c.label} ${c.id}${c.key ? ` (${c.key})` : ''}`,
    area: c.key ? keyArea(c.key) : null, covers: covering(c.glob), folder: folderOf(c.glob) }));
}

function fileHits(claims, seeds) {
  return seeds.flatMap((seed) => claims.flatMap((c) => {
    if (c.covers(seed.file)) return [{ id: c.id, rank: seed.rank, area: c.area, file: seed.file, picked: `${seed.rank === 'file' ? 'file' : 'import'} ${seed.file}`, path: `${seed.how} ← ${c.label}` }];
    const beside = seed.rank === 'file' && c.folder === dirOf(seed.file);
    return beside ? [{ id: c.id, rank: 'near', area: c.area, file: c.glob, picked: `folder ${c.folder}`, path: `${seed.how} → same folder ${c.glob} ← ${c.label}` }] : [];
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
    return { id: d.plan, rank: 'concern', area: keyArea(d.key), file: null, picked: `key area ${keyArea(d.key)}`, path };
  });
}

const wordHits = (web, words, cards) => found(web, words).filter((h) => h.score >= WORD_SCORE && cards.has(h.view.id))
  .map((h) => ({ id: h.view.id, rank: 'words', score: h.score, area: null, file: null, picked: `words ${h.words.join(', ')}`, path: `the words ${h.words.join(', ')} (${h.matched.join(', ')})` }));

function bestOf(hits, cards) {
  const best = new Map();
  hits.forEach((h) => {
    if (!best.has(h.id) || RANKS.indexOf(h.rank) < RANKS.indexOf(best.get(h.id).rank)) best.set(h.id, h);
  });
  return [...best.values()].sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank) || (b.score || 0) - (a.score || 0)
    || byTime(cards.get(b.id), cards.get(a.id)));
}

function cardOf(web, view, hit) {
  const replaced = web.edges.find((e) => e.rel === 'supersedes' && e.to === refOf('plan', view.id));
  const first = (d) => 2 * Number(keyArea(d.key) === hit.area) + Number(!isAi(d.by)); // the work's concern first, then a person's
  const decisions = web.decisions.filter((d) => d.plan === view.id && isStanding(d)).sort((a, b) => first(b) - first(a) || byTime(b, a));
  const builtOn = linksOf(web, refOf('plan', view.id)).filter((l) => [BUILT_ON.rel, RELS[BUILT_ON.rel].back].includes(l.rel));
  const { rank, picked, path, file } = hit;
  return { id: view.id, title: view.title, state: view.state, at: view.at, rank, picked, path, file,
    replacedBy: replaced ? refValue(replaced.from) : null,
    more: Math.max(decisions.length - CARD_DECISIONS, 0), decisions: decisions.slice(0, CARD_DECISIONS)
      .map(({ ref, plan, key, value, said, saidBy, source, line, by, at, supersededBy, replaced, kept, rivals }) =>
        ({ ref, plan, key, value, said, saidBy, source, line, by, at, supersededBy, replaced, kept, rivals })),
    linked: builtOn.map(({ rel, to, why }) => ({ rel, id: refValue(to), why })) };
}

// the branch's open plan is no card of a hook (the session's start said it); a verb asked whole (`whole`) is given its READY one
function relatedOf(web, { files = [], near = [], words = [], branch = null, whole = false }) {
  const held = [heldOf(web, branch)].find((v) => v && !(whole && v.state === 'ready')) ?? null;
  const cards = new Map(web.views.filter((v) => v !== held).map((v) => [v.id, v]));
  const seeds = [...files.map((s) => ({ ...s, rank: 'file' })), ...near.map((s) => ({ ...s, rank: 'near' }))];
  const linked = fileHits(claimsOf(web, cards), seeds);
  const hits = [...linked, ...concernHits(web, linked, cards), ...wordHits(web, words, cards)];
  return bestOf(hits, cards).map((hit) => cardOf(web, cards.get(hit.id), hit));
}

// the work's files no plan touched (none plans, built or decided them): never researched here
const untouchedOf = (web, files) => (!web.views.length ? [] : files).filter((file) => ![...web.edges.filter((e) => refIs('file', e.to)).map((e) => refValue(e.to)),
  ...web.decisions.flatMap((d) => d.files)].some((glob) => covering(glob)(file)));

module.exports = { relatedOf, untouchedOf };
