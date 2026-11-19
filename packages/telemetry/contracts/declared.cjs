// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The shape of a package's descriptor (its contracts/telemetry.json): a namespace, its schema and policy, the one line it says of itself,
// its steps' marks, its codes, the host event its steps carry and the metrics it names. One of another shape registers nothing.
const { isRecord } = require('./wire.cjs');

const WORD = /^[A-Za-z][\w.:-]{0,63}$/u;
const NAME = /^[a-z][a-z0-9_]{0,31}$/u;
const SPACE = /^[a-z][a-z0-9]{0,15}$/u;
const MARKS = ['measured', 'measured-untimed', 'local-only', 'step_summary'];
const COMPUTED = ['hook-incomplete', 'health'];
const isWord = (word) => typeof word === 'string' && WORD.test(word);
const isOrdinal = (n) => Number.isSafeInteger(n) && n >= 1;
const listOf = (ok) => (list) => Array.isArray(list) && list.every(ok);
const mapOf = (ok, key = isWord) => (map) => isRecord(map) && Object.entries(map).every(([name, value]) => key(name) && ok(value));
const rising = (edges) => listOf(Number.isSafeInteger)(edges) && edges[0] === 0 && edges.length >= 2 && edges.length <= 12
  && edges.every((edge, i) => i === 0 || edge > edges[i - 1]);
const keysIn = (one, keys) => Object.keys(one).every((key) => keys.includes(key));

const metricRead = (steps) => (one) => isRecord(one) && (Object.hasOwn(one, 'computed')
  ? keysIn(one, ['computed']) && COMPUTED.includes(one.computed)
  : keysIn(one, ['step', 'n', 'code', 'buckets']) && Object.hasOwn(steps, one.step) && isWord(one.n)
    && (one.code === undefined || isWord(one.code)) && (one.buckets === undefined || rising(one.buckets)));
const eventRead = (steps) => (event) => event === undefined || (isRecord(event) && keysIn(event, ['steps', 'words'])
  && listOf((step) => Object.hasOwn(steps, step))(event.steps) && event.steps.length >= 2 && listOf(isWord)(event.words));

// What each key of a namespace's descriptor must hold; a descriptor with any other key does not read.
const SPACED = {
  namespace: (ns) => typeof ns === 'string' && SPACE.test(ns), schema: isOrdinal, policy: isOrdinal,
  lock: mapOf((pin) => typeof pin === 'string' && /^[0-9a-f]{64}$/u.test(pin), (key) => /^[1-9]\d{0,3}$/u.test(key)),
  says: (text) => typeof text === 'string' && text.length > 0 && text.length <= 120, steps: mapOf((mark) => MARKS.includes(mark)),
  codes: listOf(isWord), event: () => true, metrics: () => true, $comment: () => true,
};

/** Whether a descriptor reads as one of a namespace (`namespace` and all of its keys) or as shared codes (`shared: true`, any namespace's
 * steps may say them). Neither: it registers nothing and its rows stay local, which is not a refusal (-> null). */
function descriptorRead(one) {
  if (!isRecord(one) || (!Object.hasOwn(one, 'namespace') && one.shared !== true)) return null;
  if (one.shared === true) return listOf(isWord)(one.codes);
  return Object.keys(SPACED).filter((key) => key !== '$comment').every((key) => Object.hasOwn(one, key) || key === 'event')
    && Object.entries(one).every(([key, value]) => Object.hasOwn(SPACED, key) && SPACED[key](value))
    && eventRead(one.steps)(one.event) && mapOf(metricRead(one.steps), (name) => NAME.test(name))(one.metrics);
}

module.exports = { descriptorRead };
