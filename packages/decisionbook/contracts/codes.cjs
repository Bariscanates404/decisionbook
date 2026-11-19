// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE decisionbook codes + their wording: every verdict and refusal DecisionBook can give, with the text a person or an agent reads; the
// words are data in contracts/words.json and this module is their one door, as for the characters a text shows of a value
// (contracts/bounds.json): SHOWN.<view>.<field>(value) is the value cut to that bound, marked ~ when cut.
const { codes: { createCodes }, text: { safe: { clip } } } = require('@atlasbound/kit');
const { codes: ROWS, words } = require('./words.json');
const BOUNDS = require('./bounds.json');

const clipsOf = (fields) => Object.fromEntries(Object.entries(fields).map(([field, max]) => [field, (value) => clip(value, max)]));
const SHOWN = Object.fromEntries(Object.entries(BOUNDS).filter(([view]) => view !== '//').map(([view, fields]) => [view, clipsOf(fields)]));

/** A plan's or HEAD's branch as a text says it: a detached HEAD (no branch) in words, never null. */
const branchWord = (branch) => branch ?? words.detachedHead;

module.exports = { ...createCodes(ROWS), WORDS: Object.freeze(words), SHOWN, branchWord };
