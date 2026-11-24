// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// the blank records core/skeleton hands to fill: every "" is the AI's to write; `ai` and `person` name whose part a record is.
const times = (n, make) => Array.from({ length: Math.max(n, 0) }, (_, i) => make(i));
const item = (kind, more = {}) => ({ t: 'item', kind, text: '', ...more });
// a human's decision: `value` what the AI understood they decided, `whose` words it holds (person, a teammate's name; assumed: no
// one's), `said` those exact words, copied
const theirs = (more) => ({ t: 'decision', key: '', value: '', why: '', whose: '', said: '', ...more });
// a person's answer to question `q`: its effect is required; to one that names standing decisions, it places each in one of the two lists
const answerTo = (q, check = '') => theirs({ answers: q.q, ...(q.supersedes.length && { supersedes: [], keeps: [] }), effect: [`check:${check}`] });
const ai = (records) => ({ ai: records, person: [] });
const person = (records) => ({ ai: [], person: records });
// the paths a plan will hold, its own and the named ones; none yet: one blank to fill, so its link and its step are handed together
const planPaths = (planned, named, all = [...new Set([...planned, ...named])]) => (all.length ? all : ['']);

module.exports = { times, item, theirs, answerTo, ai, person, planPaths };
