// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Telemetry's reasons, on top of kit's table, and the sentences it says to a person: both data (contracts/codes.json). Nobody else types
// them. `sentence(name, words)` fills a sentence's `{word}` places; `questionBlock` is the block setup and the notice show.
const { codes: { createCodes } } = require('@atlasbound/kit');
const { codes: ROWS, texts: TEXT } = require('./codes.json');

const sentence = (name, words = {}) => TEXT[name].replace(/\{(\w+)\}/gu, (_, word) => words[word]);
/** The namespaces asked about, each with the line it says of itself (shown here, never sent). */
const forLine = (spaces) => `  For: ${spaces.map((space) => `${space.ns} (${space.says})`).join(', ')}`;
/** What is sent, never sent and kept, under its first line and the namespaces it covers. */
const questionBlock = (first, spaces) => [first, forLine(spaces), ...TEXT.sent, TEXT.kept].join('\n');

module.exports = { TEXT, sentence, forLine, questionBlock, ...createCodes(ROWS) };
