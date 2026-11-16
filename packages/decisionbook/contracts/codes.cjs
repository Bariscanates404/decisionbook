// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE decisionbook codes + their wording: every verdict and refusal DecisionBook can give, with the text a person or an agent reads; the
// words are data in contracts/words.json and this module is their one door.
const { codes: { createCodes } } = require('@atlasbound/kit');
const { codes: ROWS, words } = require('./words.json');

module.exports = { ...createCodes(ROWS), WORDS: Object.freeze(words) };
