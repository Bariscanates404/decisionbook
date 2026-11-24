// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What is said of the earlier plans that relate to the work at hand: a hook is given the first whole cards
// that fit its byte budget; the `related` verb, every card.
const { text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS, shortOf, SHOWN: { recall: shown } } = require('../../contracts/codes.cjs');
const { bytes, boundedLines } = require('./budget.cjs');
const { jsonCall } = require('./calls.cjs');
const { cardText } = require('./card.cjs');
const { firstFive, unreadLines } = require('./open.cjs');

const RECALL_BYTES = 2048;
const RECALL_CARDS = 3;
const RELATED_BYTES = 6144;
const RELATED_CARDS = 10;
// what was not found, three ways apart: no record here (`found` 0 and no file of the work that no plan touched says more), records unread
// ([{ file, code }]), the work's files no plan touched (none in a repository with no plan); each line names five files and how many more
const absentLines = ({ found, unread = [], untouched = [] }) => [...(found === 0 && !untouched.length ? [`${WORDS.absent.none}: ${shortOf('recall-none')}`] : []),
  ...unreadLines(unread), ...(untouched.length ? [filled(WORDS.absent.untouched, { files: shown.files(firstFive(untouched)) })] : [])];

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
    const short = `- ${card.id} ${WORDS.alsoHere} ${shown.path(card.path)}`;
    said.push({ key: `decisionbook.card:${card.id}`, text, short });
  }
  return [...said, { key: 'decisionbook.recall', text: WORDS.recall }];
}

/** `related`: every card, up to the verb's own count and budget, then what was not found and the open items of the plans said. */
function relatedText({ cards, untouched, open }) {
  const absent = [...absentLines({ found: cards.length, untouched }), ...open];
  if (!cards.length) return absent.join('\n');
  const more = jsonCall('related', '<path|words>');
  const budget = { max: RELATED_BYTES, count: RELATED_CARDS, more };
  return boundedLines({ head: [], list: cards.map(cardText), tail: [...absent, WORDS.recall], ...budget }).join('\n');
}

module.exports = { RECALL_BYTES, RECALL_CARDS, RELATED_CARDS, recallSay, relatedText, absentLines };
