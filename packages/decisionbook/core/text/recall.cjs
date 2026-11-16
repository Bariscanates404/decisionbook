// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What is said of the earlier plans that relate to the work at hand: a hook is given the first whole cards
// that fit its byte budget; the `related` verb, every card.
const { text: { safe: { clip } } } = require('@atlasbound/kit');
const { WORDS, shortOf } = require('../../contracts/codes.cjs');
const { bytes, boundedLines } = require('./budget.cjs');
const { cardText } = require('./card.cjs');

const RECALL_BYTES = 2048;
const RECALL_CARDS = 3;
const RELATED_BYTES = 6144;
const RELATED_CARDS = 10;

/** What a hook says of `cards`: the first whole cards that fit in `max` bytes (once one does not fit, none after it
 * is given), each with the short line that stands for it when the context already holds it, then the line that says
 * what the cards are. */
function recallSay(cards, max = RECALL_BYTES) {
  const said = [];
  let room = max - bytes([WORDS.recall]);
  for (const card of cards.slice(0, RECALL_CARDS)) {
    const text = cardText(card);
    room -= bytes([text, '']);
    if (room < 0) break;
    const short = `- ${card.id} ${WORDS.alsoHere} ${clip(card.path, 300)}`;
    said.push({ key: `decisionbook.card:${card.id}`, text, short });
  }
  return [...said, { key: 'decisionbook.recall', text: WORDS.recall }];
}

/** `related`: every card, up to the verb's own count and budget. */
function relatedText(cards) {
  if (!cards.length) return shortOf('recall-none');
  const more = 'atlasbound decisionbook related <path|words> --json';
  const budget = { max: RELATED_BYTES, count: RELATED_CARDS, more };
  return boundedLines({ head: [], list: cards.map(cardText), tail: [WORDS.recall], ...budget }).join('\n');
}

module.exports = { RECALL_BYTES, RECALL_CARDS, RELATED_CARDS, recallSay, relatedText };
