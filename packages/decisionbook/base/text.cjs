// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The words of a record that more than one module reads: who decided, what answers a question, how alike two texts are, which
// words a prompt holds, a stored `said` cut to its bound, and a prompt's clauses sealed (a digest beside each sentence, in the home).
const { text: { lines: { escapedRe, unmarked } }, hash: { sha256 }, said: { clausesOf } } = require('@atlasbound/kit');

const decisionRef = (d) => `${d.plan}/${d.key}`;
const decisionSlot = (d) => `${d.key}|${d.scope}`; // where two live ones conflict
// THE one reading of a record's time (`at`, an ISO time): whether one is before or after another, their order, how far apart
const isBefore = (a, b) => Date.parse(a) < Date.parse(b);
const isAfter = (a, b) => Date.parse(a) > Date.parse(b);
const isTime = (at) => Number.isFinite(Date.parse(at));
const secondsBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 1000);
const byTime = (a, b) => Date.parse(a.at) - Date.parse(b.at);
const TOKEN = '[\\p{L}\\p{N}_-]'; // an id's characters, of any script
// Whole: no id character beside it, nor a `.` joining it to one, so `#142`, `1.42`, `<id>-2` are not `42`, `<id>`.
const mentions = (text, word) => new RegExp(`(?<!${TOKEN}|${TOKEN}\\.)${escapedRe(word)}(?!${TOKEN}|\\.${TOKEN})`, 'u').test(text);

const isAi = (by) => /^(ai|the ai|assistant)$/i.test(String(by).trim());
const saidOf = (record) => (typeof record.said === 'string' ? record.said : ''); // a record's `said`, '' where it holds none
const stepPath = (file) => String(file).split(':')[0].trim(); // `<path>[:<line or symbol>]`: the path is what the plan must cover
// a question written again (the same q, later) is answered only by a decision made after it
const personAnswers = (d, q) => d.answers === q.q && !d.proposed && !isAi(d.by) && !isBefore(d.at, q.at);
const isAnswered = (view, q) => view.decisions.some((d) => personAnswers(d, q));
const asList = (value) => [].concat(value || []); // a record field that holds one value or a list of them, as a list
// a person's answer (sent or folded) keeping the standing decisions it names, replacing none (state `kept`, core/web): no yes
const isKeep = (d) => asList(d.keeps).length > 0 && !asList(d.supersedes).length;
// a key's person lines (keeps too) no other replaced: each names in `revises` the `at` of those standing when written (steps/batch)
const headsOf = (lines) => lines.filter((d) => !lines.some((o) => o !== d && asList(o.revises).includes(d.at)));
const replacedOf = (d) => asList(d.supersedes).filter((ref) => ref !== decisionRef(d)); // the other decisions it replaces
// what a reader names of a line in a conflict (core/web): where it is, whose, their words
const conflictLine = (o) => ({ value: o.value, said: o.said, line: o.line, by: o.by, saidBy: o.saidBy, source: o.source,
  ref: decisionRef(o), plan: o.plan });
const isTheirs = (d) => !d.proposed && !isAi(d.by); // a person's line: no proposal, not the AI's
const personsOwn = (d) => isTheirs(d) && !isKeep(d); // a person's decision, not a keep
const holdsAlone = (d) => d.state === 'active' && !asList(d.rivals).length; // active, its key in no conflict (core/web)
/** `said` as stored: whole, or cut back to its last whole word under `max` characters and marked `~` (kit's clip mark). */
const wordCut = (said, max, head = said.slice(0, max - 1)) => (said.length <= max ? said
  : `${head.slice(0, Math.max(head.search(/\s\S*$/u), 0) || head.length).trimEnd()}~`);
// the forks a plan asks the person: a question parked with someone else (`to`) is none, it never counts and never waits
const forkQuestions = (view) => view.questions.filter((q) => q.decides && !q.to);
const yesAgain = (view) => isAfter(view.confirm.at, view.ready.at); // a yes given again, to a READY plan
// a text with each letter of a mark in its plain ASCII form (ç c, ử u, ß ss): a plan id and a search read alike; PLAIN: no mark to take off
const PLAIN = { đ: 'd', ð: 'd', ħ: 'h', ı: 'i', ŀ: 'l', ł: 'l', ŉ: 'n', ø: 'o', ŧ: 't', ß: 'ss', æ: 'ae', œ: 'oe', þ: 'th' };
const asciiFolded = (text) => unmarked(String(text).toLowerCase()).replace(/[^\p{ASCII}]/gu, (c) => PLAIN[c] ?? c);
const wordSet = (text) => new Set(String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
const jaccard = (x, y, shared = [...x].filter((w) => y.has(w)).length) => (shared ? shared / (x.size + y.size - shared) : 0);
const alike = (a, b, min) => jaccard(wordSet(a), wordSet(b)) >= min;
const ofKind = (view, kind) => view.items.filter((i) => i.kind === kind);
const keyArea = (key) => String(key).split('.')[0]; // `auth.session-ttl` -> `auth`
const isStanding = (d) => !['revised', 'kept'].includes(d.state) && !d.proposed; // a kept answer stands in the decision it keeps
const unrevised = (decisions) => decisions.filter((d) => d.state !== 'revised'); // the decisions a text shows
// No stop list of one human language: shorter words (it, do, the, ve, ile) say nothing on their own.
const WORD_MIN = 4;
const promptWords = (text) => [...new Set(String(text).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => [...word].length >= WORD_MIN))];
const sealKey = (key) => sha256(key).slice(0, 16);
/** A prompt's clauses as its row keeps them: [digest, sentence, 1 where it holds a negation] each, and for a clause of a list item
 * which item of the message it is of (negative: in the item's quoted opening). */
const sealedSaid = (text) => clausesOf(text)
  .map(({ key, sentence, no, item, lead }) => [sealKey(key), sentence, Number(no), ...(item ? [lead ? -item : item] : [])]);
const unsealed = (said) => (said || [])
  .map(([key, sentence, no, item = 0]) => ({ key, sentence, no: Boolean(no), item: Math.abs(item), lead: item < 0 }));

module.exports = { asList, asciiFolded, byTime, isBefore, isAfter, isTime, secondsBetween, mentions, decisionRef, decisionSlot, stepPath,
  isAi, saidOf, personAnswers, isAnswered, isKeep, headsOf, replacedOf, isTheirs, personsOwn, holdsAlone, conflictLine, wordCut,
  forkQuestions, yesAgain, wordSet, alike, ofKind, keyArea, isStanding, unrevised, promptWords, sealKey, sealedSaid, unsealed };
