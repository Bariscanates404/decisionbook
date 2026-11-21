// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. One earlier plan as a card: which plan, why it is relevant to the work, what it decided and built, its links, what goes deeper.
const { text: { lines: { dayOf } } } = require('@atlasbound/kit');
const { showCall } = require('./calls.cjs');
const { deciderOf, agedOf, replacedBy, rivalText } = require('./records.cjs');
const { WORDS, SHOWN: { card: shown } } = require('../../contracts/codes.cjs');
const { refOf } = require('../../contracts/shapes.cjs');

const BUILT_FILES = 3;
const SHA = 12;

/** What the plan built: its first files, then its last own commit, or the range from its first to its last. */
function builtLine({ files, own }) {
  const named = shown.files(files.slice(0, BUILT_FILES).join(', '));
  const more = files.length > BUILT_FILES ? ` (+${files.length - BUILT_FILES} files)` : '';
  const shas = own.map((commit) => shown.sha(String(commit.sha).slice(0, SHA)));
  const range = shas.length > 1 ? `..${shas[0]} (${shas.length} commits)` : '';
  return `  built: ${named}${more} @ ${shas.at(-1)}${range}`;
}

const cardDecision = (d, day) => (d.conflict ? `${shown.key(d.key)} ${rivalText(d.conflict)}` : `${shown.key(d.key)} = ${shown.value(d.value)} (by ${
  deciderOf(d.by, d.author)}${agedOf(d, day)})${d.supersededBy ? ` replaced${replacedBy(d)}` : ''}`);

/** The commands that show more of a card: its decisions, the history of the file it was found by, its first
 * decision. */
function deeperLine(card) {
  const file = card.file ? [showCall(refOf('file', shown.file(card.file)))] : [];
  const decision = card.decisions.length ? [showCall(refOf('decision', shown.key(card.decisions[0].key)))] : [];
  return `  deeper: ${[showCall(card.id, 'decisions'), ...file, ...decision].join(' | ')}`;
}

function cardText(card) {
  const day = card.at ? dayOf(card.at) : null;
  const replaced = card.replacedBy ? `, replaced by ${shown.replacedBy(card.replacedBy)}` : '';
  const more = card.more ? `; ${card.more} more: ${showCall(card.id, 'decisions')}` : ''; // the decisions the card left out, and where they are
  const decisions = card.decisions.length ? [`  decisions: ${card.decisions.map((d) => cardDecision(d, day)).join('; ')}${more}`] : [];
  const built = card.built && card.built.own.length ? [builtLine(card.built)] : [];
  const links = card.linked.map((l) => `${l.rel} ${l.id}: ${l.why}`).join('; ');
  const linked = card.linked.length ? [`  linked: ${shown.links(links)}`] : [];
  const unverified = card.unverified ? ` ${WORDS.cardUnverified}` : '';
  return [`- ${card.id} ${card.state}${day ? ` (${day})` : ''}${unverified}${replaced}: ${shown.title(card.title)}`, `  why here: ${shown.path(card.path)}`,
    ...decisions, ...built, ...linked, deeperLine(card)].join('\n');
}

module.exports = { cardText };
