// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Telemetry's helper module: the small pure helpers its folds and its wall use. Nothing here decides.
const { MAX_BREAKDOWN_EVENTS, BAND_WORDS, wireWord } = require('./rules.cjs');

/** A word as it leaves when its published list holds it, else `other`: anything not in the list never leaves as itself. */
const closedWord = (words, word) => (words.includes(wireWord(word)) ? wireWord(word) : 'other');

/** What the rules make of a trace row: its package's mark for its step (an event name or local-only), or undefined (no rule). */
const markOf = ({ pkg, step }, { STEP_RULES }) => (Object.hasOwn(STEP_RULES, pkg) && Object.hasOwn(STEP_RULES[pkg], step)
  ? STEP_RULES[pkg][step] : undefined);

/** The word of the first bucket whose bound is above the value: [[bound, word], …] ending at Infinity. */
const bucketOf = (value, edges) => edges.find(([bound]) => value < bound)[1];

/** A rule's word dimensions: its enums that are no band (a band is a count that leaves as a word). */
const dimsOf = (rule) => Object.entries(rule.enums).filter(([, words]) => words !== BAND_WORDS);

/** A step's codes: each one it counted at least once. */
const codesSaid = (counts) => Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));

/** `count` more of `name` in a tally. */
const addTo = (tally, name, count) => {
  tally[name] = (tally[name] || 0) + count;
};

/** `count` more of `name` in the event of these words on that day. */
function tallyEvent(buckets, { event, at, words, name, count }) {
  const key = [event, at.slice(0, 10), ...Object.values(words)].join('|');
  if (!buckets.has(key)) buckets.set(key, { event, at, payload: { ...words } });
  addTo(buckets.get(key).payload, name, count);
}

/** A table's events in their first order, at most MAX_BREAKDOWN_EVENTS, and how many were cut. */
const boundedEvents = (buckets) => {
  const events = [...buckets.values()];
  return { events: events.slice(0, MAX_BREAKDOWN_EVENTS), cut: Math.max(0, events.length - MAX_BREAKDOWN_EVENTS) };
};

module.exports = { closedWord, markOf, bucketOf, dimsOf, codesSaid, addTo, tallyEvent, boundedEvents };
