// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. One earlier plan as a card: which plan, why it is relevant to the work at hand, what it decided and built,
// what it is linked to, and the commands that go deeper.
const { text: { safe: { clip } } } = require('@atlasbound/kit');
const { showCall } = require('./calls.cjs');
const { deciderOf } = require('./records.cjs');

const BUILT_FILES = 3;
const SHA = 12;

/** What the plan built: its first files, then its last own commit, or the range from its first to its last. */
function builtLine({ files, own }) {
  const shown = clip(files.slice(0, BUILT_FILES).join(', '), 160);
  const more = files.length > BUILT_FILES ? ` (+${files.length - BUILT_FILES} files)` : '';
  const shas = own.map((commit) => clip(String(commit.sha).slice(0, SHA), 100));
  const range = shas.length > 1 ? `..${shas[0]} (${shas.length} commits)` : '';
  return `  built: ${shown}${more} @ ${shas.at(-1)}${range}`;
}

function cardDecision(d) {
  const replaced = d.supersededBy ? ` replaced by ${clip(d.supersededBy, 120)}` : '';
  return `${clip(d.key, 60)} = ${clip(d.value, 60)} (by ${deciderOf(d.by)})${replaced}`;
}

/** The commands that show more of a card: its decisions, the history of the file it was found by, its first
 * decision. */
function deeperLine(card) {
  const file = card.file ? [showCall(`file:${clip(card.file, 160)}`)] : [];
  const decision = card.decisions.length ? [showCall(`decision:${clip(card.decisions[0].key, 60)}`)] : [];
  return `  deeper: ${[showCall(card.id, 'decisions'), ...file, ...decision].join(' | ')}`;
}

function cardText(card) {
  const replaced = card.replacedBy ? `, replaced by ${clip(card.replacedBy, 100)}` : '';
  const decisions = card.decisions.length ? [`  decisions: ${card.decisions.map(cardDecision).join('; ')}`] : [];
  const built = card.built && card.built.own.length ? [builtLine(card.built)] : [];
  const links = card.linked.map((l) => `${l.rel} ${l.id}: ${l.why}`).join('; ');
  const linked = card.linked.length ? [`  linked: ${clip(links, 300)}`] : [];
  return [`- ${card.id} ${card.state}${replaced}: ${clip(card.title, 100)}`, `  why here: ${clip(card.path, 300)}`,
    ...decisions, ...built, ...linked, deeperLine(card)].join('\n');
}

module.exports = { cardText };
