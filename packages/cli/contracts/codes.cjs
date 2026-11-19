// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE cli codes and their wording, on top of kit's table (a kit primitive can fail inside any verb), and the lines the verbs say: the words
// are data in contracts/words.json and this module is their one door.
const { codes: { createCodes }, host: { DRAFTS }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { codes: ROWS, words } = require('./words.json');

module.exports = { ...createCodes(ROWS.map((row) => row.map((text) => filled(text, { drafts: DRAFTS })))), WORDS: Object.freeze(words) };
