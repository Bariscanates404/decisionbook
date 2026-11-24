// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The words of a record that more than one module reads: who decided, what answers a question, how alike two texts are, which
// words a prompt holds, a stored `said` cut to its bound, and a prompt's sentences as its row keeps them (in the person's home).
const { text: { lines: { escapedRe, unmarked }, secrets: { scrub } }, said: { sentencesOf, quotedAt, wholeOf }, person: { isAiName: isAi } } = require('@atlasbound/kit');

const decisionRef = (d) => `${d.plan}/${d.key}`;
const lineKey = (d) => `${d.plan}:${d.line}`; // one line of one plan's file, where a ref names every line of a key
const lineRef = (d) => `decision:${decisionRef(d)}@${d.at}`; // one line itself, apart from another of its plan and key (core/lost)
// where two lines of one key meet: its key and scope (a sent record may hold no scope, a folded line holds null)
const slotOf = (d) => `${d.key}|${d.scope ?? null}`;
const sameSlot = (a, b) => slotOf(a) === slotOf(b);
const planSlot = (d) => `${d.plan}/${slotOf(d)}`; // one key and scope of one plan
// THE one reading of a record's time (`at`, an ISO time): whether one is before or after another, their order, how far apart
const isBefore = (a, b) => Date.parse(a) < Date.parse(b);
const isAfter = (a, b) => Date.parse(a) > Date.parse(b);
const isTime = (at) => Number.isFinite(Date.parse(at));
const secondsBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 1000);
const byTime = (a, b) => Date.parse(a.at) - Date.parse(b.at);
const TOKEN = '[\\p{L}\\p{N}_-]'; // an id's characters, of any script
// Whole: no id character beside it, nor a `.` joining it to one, so `#142`, `1.42`, `<id>-2` are not `42`, `<id>`.
const mentions = (text, word) => new RegExp(`(?<!${TOKEN}|${TOKEN}\\.)${escapedRe(word)}(?!${TOKEN}|\\.${TOKEN})`, 'u').test(text);

const saidOf = (record) => (typeof record.said === 'string' ? record.said : ''); // a record's `said`, '' where it holds none
const stepPath = (file) => String(file).split(':')[0].trim(); // `<path>[:<line or symbol>]`: the path is what the plan must cover
const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); // one person's name, case aside
/** Whose answer a record says it is, where that is someone other than `person` (who works here); else null. */
const otherOf = (record, person) => (record.saidBy && !sameName(record.saidBy, person) ? record.saidBy : null);
const personSigned = (d) => !d.proposed && !isAi(d.by); // the person's own record: their name, on words they typed or an act of theirs
// a human's line: the person's own, or someone's answer the AI wrote down, naming whose it is (`saidBy`) and where their words are
const isTheirs = (d) => personSigned(d) || (!d.proposed && Boolean(d.saidBy && d.source));
// the person's question is answered by the person, one parked with someone else (`to`) by any human's line, made after it was written
const personAnswers = (d, q) => d.answers === q.q && isTheirs(d) && !isBefore(d.at, q.at);
const isAnswered = (view, q) => view.decisions.some((d) => personAnswers(d, q));
/** The person's word that put a question off, where no answer of a person ended it since; null where none stands. */
const putOff = (view, q) => (isAnswered(view, q) ? null : view.later.findLast((l) => l.q === q.q && !isBefore(l.at, q.at)) ?? null);
const asList = (value) => [].concat(value || []); // a record field that holds one value or a list of them, as a list
// a person's answer (sent or folded) keeping the standing decisions it names, replacing none (state `kept`, core/web): no yes
const isKeep = (d) => asList(d.keeps).length > 0 && !asList(d.supersedes).length;
// a key's person lines (keeps too) no other replaced: each names in `revises` the `at` of those standing when written (steps/batch)
const headsOf = (lines) => lines.filter((d) => !lines.some((o) => o !== d && asList(o.revises).includes(d.at)));
const replacedOf = (d) => asList(d.supersedes).filter((ref) => ref !== decisionRef(d)); // the other decisions it replaces
const personsOwn = (d) => isTheirs(d) && !isKeep(d); // a person's decision, not a keep
// the conflicts some of `lines` are in (core/validity: one object per conflict, on every line of it), each once
const conflictsIn = (lines) => [...new Set(lines.map((d) => d.conflict).filter(Boolean))];
const lineIn = (conflict, plan) => conflict.lines.find((o) => o.plan === plan); // a plan's first line in a conflict
const refsNamed = (record) => [...asList(record.supersedes), ...asList(record.keeps)]; // every ref a record places
// the lines in a conflict that a record names, under any key
const namedInConflict = (record, decisions) => decisions.filter((d) => d.conflict && refsNamed(record).includes(d.ref));
// THE states the fold gives a line (core/validity), read through these names alone
const STATE = Object.freeze({ proposed: 'proposed', revised: 'revised', kept: 'kept', replaced: 'superseded', live: 'active', dropped: 'set aside' });
const isLive = (d) => d.state === STATE.live; // it stands for its key and none replaced it (it may be in a conflict)
const isKeeping = (d) => d.state === STATE.kept; // a person's keep that stands: never live itself, it stands in what it keeps
const isReplaced = (d) => d.state === STATE.replaced; // another decision replaced it
const isShown = (d) => d.state !== STATE.revised; // what a text shows of a plan: not a line its plan wrote again
const isDecided = (d) => isLive(d) || isReplaced(d); // what its plan decided, whether or not another plan replaced it since
const holdsAlone = (d) => isLive(d) && !d.conflict; // live, and in no conflict
/** `said` as stored: whole, or cut back to its last whole word under `max` characters and marked `~` (kit's clip mark). */
const wordCut = (said, max, head = said.slice(0, max - 1)) => (said.length <= max ? said
  : `${head.slice(0, Math.max(head.search(/\s\S*$/u), 0) || head.length).trimEnd()}~`);
// the forks a plan asks: the person's questions, and one parked with someone else (`to`) once a human answered it; unanswered it is
// none: it never counts and never waits
const forkQuestions = (view) => view.questions.filter((q) => q.decides && (!q.to || isAnswered(view, q)));
const yesAgain = (view) => isAfter(view.confirm.at, view.ready.at); // a yes given again, to a READY plan
// a text with each letter of a mark in its plain ASCII form (ç c, ử u, ß ss): a plan id and a search read alike; PLAIN: no mark to take off
const PLAIN = { đ: 'd', ð: 'd', ħ: 'h', ı: 'i', ŀ: 'l', ł: 'l', ŉ: 'n', ø: 'o', ŧ: 't', ß: 'ss', æ: 'ae', œ: 'oe', þ: 'th' };
const asciiFolded = (text) => unmarked(String(text).toLowerCase()).replace(/[^\p{ASCII}]/gu, (c) => PLAIN[c] ?? c);
const wordSet = (text) => new Set(String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
// the same words in the same order, whatever the case and the punctuation between them: one value said twice
const sameWords = (a, b) => `${String(a).toLowerCase().match(/[\p{L}\p{N}]+/gu)}` === `${String(b).toLowerCase().match(/[\p{L}\p{N}]+/gu)}`;
const jaccard = (x, y, shared = [...x].filter((w) => y.has(w)).length) => (shared ? shared / (x.size + y.size - shared) : 0);
const alike = (a, b, min) => jaccard(wordSet(a), wordSet(b)) >= min;
const ofKind = (view, kind) => view.items.filter((i) => i.kind === kind);
const keyArea = (key) => String(key).split('.')[0]; // `auth.session-ttl` -> `auth`
// No stop list of one human language: shorter words (it, do, the, ve, ile) say nothing on their own.
const WORD_MIN = 4;
const promptWords = (text) => [...new Set(String(text).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => [...word].length >= WORD_MIN))];
/** A prompt's sentences as its row keeps them in the person's home (kit's, after the secret screen): [text, head, lead], ends left off. */
const keptSaid = (text) => sentencesOf(scrub(text))
  .map(({ text: words, head, lead }) => [words, head, lead].slice(0, lead ? 3 : 1 + Boolean(head)));
const unitsKept = (said) => (said || []).map(([text, head = '', lead = '']) => ({ text: String(text), head, lead }));
/** The newest of the person's prompt rows (after `since`) that holds `said`: { at, units, places } (where kit finds it), or null. */
const foundIn = (heard, said, since = null) => (heard || []).filter((row) => !since || isAfter(row.at, since))
  .map((row) => ({ at: row.at, units: unitsKept(row.said) })).map((m) => ({ ...m, places: quotedAt(said, m.units) }))
  .findLast((m) => m.places.length > 0) ?? null;
const wholeAt = (found, place = found.places[0]) => wholeOf(found.units, place); // the whole sentences a found place stands in

module.exports = { lineKey, asList, asciiFolded, byTime, isBefore, isAfter, isTime, secondsBetween, mentions, decisionRef, lineRef, slotOf,
  sameSlot, planSlot, stepPath, isAi, saidOf, sameName, otherOf, personAnswers, isAnswered, putOff, isKeep, headsOf, replacedOf,
  personSigned, isTheirs, personsOwn,
  STATE, isLive, isKeeping, isReplaced, isShown, isDecided, holdsAlone, conflictsIn, lineIn, refsNamed, namedInConflict, wordCut,
  forkQuestions, yesAgain, wordSet, sameWords, alike, ofKind, keyArea, promptWords, keptSaid, foundIn, wholeAt };
