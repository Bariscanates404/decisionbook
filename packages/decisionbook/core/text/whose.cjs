// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What a write says when the words of a record given as someone's answer were found nowhere, or do not name the decision of
// someone else they would replace (core/whose): what is missing, and the way on.
const { text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS, SHOWN: { refused: shown } } = require('../../contracts/codes.cjs');

/** `who`'s words the person did not type, which the product did not read at the record's source either (`why`: core/whose notRead). */
const unproven = (why, { who, source, heard }) => [filled(WORDS.unproven[why], { who: shown.by(who), source: shown.source(source ?? '') }),
  (heard || []).length ? '' : WORDS.unseen].filter(Boolean).join('. ');


/** Someone else's standing decisions (`lines`) a blanket answer would replace: which, whose, and the way on. */
const blanket = (lines) => filled(WORDS.blanket, { lines: [...new Set(lines.map((d) => `${shown.ref(d.ref)} (${shown.by(d.saidBy ?? d.by)})`))].join(', ') });

module.exports = { unproven, blanket };
