// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The shape of the telemetry words a package declares (contracts/rules.cjs says what they mean): every name a word, every value of its
// closed shape; a declaration of any other shape does not read, and its package's rows stay local.
const WORD = /^[A-Za-z][\w-]{0,47}$/u;
const EVENT = /^[a-z][a-z0-9_]{0,47}$/u;
const isRecord = (value) => Object.prototype.toString.call(value) === '[object Object]';
const isWord = (word) => typeof word === 'string' && WORD.test(word);
const listOf = (ok) => (list) => Array.isArray(list) && list.every(ok);
const mapOf = (ok) => (map) => isRecord(map) && Object.entries(map).every(([key, value]) => isWord(key) && ok(value));
const textOk = (text) => typeof text === 'string' && text.length <= 60;
// What each key of a declaration may hold; a declaration with any other key does not read.
const DECLARATION = { form: (form) => form === 'run' || form === 'state', counts: listOf(isWord), bands: listOf(isWord), words: mapOf(isWord),
  owners: mapOf((step) => step === null || isWord(step)), rowsOf: mapOf(isWord), totalOf: isWord, says: textOk,
  whole: (whole) => isRecord(whole) && isWord(whole.step) && isWord(whole.sum) && Number.isSafeInteger(whole.scale) && whole.scale > 0
    && listOf(textOk)(whole.says) && whole.says.length === 3 };
const eventOk = (events, own) => ([name, one]) => EVENT.test(name) && !own.includes(name) && isRecord(one) && Object.hasOwn(one, 'form')
  && Object.entries(one).every(([key, value]) => Object.hasOwn(DECLARATION, key) && DECLARATION[key](value))
  && (one.totalOf === undefined || events[one.totalOf]?.form === 'state');
/** A package's telemetry words read: its codes a list, its events (none named as one of telemetry's `own`) and outcomes, where it has
 * them, of the shape above. */
const declarationRead = (words, own) => Array.isArray(words?.codes)
  && (words.outcomes === undefined || mapOf(listOf(isWord))(words.outcomes))
  && (words.events === undefined || (isRecord(words.events) && Object.entries(words.events).every(eventOk(words.events, own))));

module.exports = { isRecord, declarationRead };
