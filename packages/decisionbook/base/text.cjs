// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The words of a record that more than one module reads: who decided, what answers a question, how alike two texts are, which words a
// prompt holds, and a prompt's clauses sealed (a digest beside each sentence, in the person's home) with kit's one test of a person's own
// words over them.
const { text: { lines: { escapedRe } }, hash: { sha256 }, said: { clausesOf, notTheirs, heldItems, askedIn, sharedWith, names } } = require('@atlasbound/kit');

const decisionRef = (d) => `${d.plan}/${d.key}`;
const decisionSlot = (d) => `${d.key}|${d.scope}`; // where two live ones conflict
const byTime = (a, b) => String(a.at).localeCompare(String(b.at));
const TOKEN = '[\\p{L}\\p{N}_-]'; // an id's characters, of any script
// Whole: no id character beside it, nor a `.` joining it to one, so `#142`, `1.42`, `<id>-2` are not `42`, `<id>`.
const mentions = (text, word) => new RegExp(`(?<!${TOKEN}|${TOKEN}\\.)${escapedRe(word)}(?!${TOKEN}|\\.${TOKEN})`, 'u').test(text);

const isAi = (by) => /^(ai|the ai|assistant)$/i.test(String(by).trim());
const stepPath = (file) => String(file).split(':')[0].trim(); // `<path>[:<line or symbol>]`: the path is what the plan must cover
// a question written again (the same q, later) is answered only by a decision made after it
const personAnswers = (d, q) => d.answers === q.q && !d.proposed && !isAi(d.by) && !(Date.parse(d.at) < Date.parse(q.at));
const isAnswered = (view, q) => view.decisions.some((d) => personAnswers(d, q));
// the forks a plan asks the person: a question parked with someone else (`to`) is none, it never counts and never waits
const forkQuestions = (view) => view.questions.filter((q) => q.decides && !q.to);
const yesAgain = (view) => Date.parse(view.confirm.at) > Date.parse(view.ready.at); // a yes given again, to a READY plan
const wordRun = (text) => String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const wordSet = (text) => new Set(wordRun(text));
const jaccard = (x, y, shared = [...x].filter((w) => y.has(w)).length) => (shared ? shared / (x.size + y.size - shared) : 0);
const alike = (a, b, min) => jaccard(wordSet(a), wordSet(b)) >= min;
const ofKind = (view, kind) => view.items.filter((i) => i.kind === kind);
const keyArea = (key) => String(key).split('.')[0]; // `auth.session-ttl` -> `auth`
const isStanding = (d) => d.state !== 'revised' && !d.proposed;
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
/** The last prompt kept after `since` in which `words` are the person's own, or null; `prompts`: the rows heard here (null: none).
 * `how` 'negation': in which they are a part of a sentence that holds a negation, theirs once quoted whole. */
const heardIn = (prompts, since, words, how = null) => (prompts || []).findLast((row) => Date.parse(row.at) > Date.parse(since)
  && notTheirs(words, unsealed(row.said), sealKey) === how) ?? null;

const QUOTED_MIN = 2; // a quoted opening names a question when it shares this many content words with it, and fewer with every other
/** Which of `questions` (the plan's, in its order) each quoting list item of the person's message answers (kit askedIn), kept on the
 * prompt's row as { <item>: <q> }: the one question the quote names by its id; else the one whose text and proposal share the most
 * words with the quote; else, for a run of items between two placed ones, the questions between those two (placedByOrder). The
 * product's own binding and the judgement of a record an AI sends read this one placing. */
function quotedBy(text, questions) {
  const items = askedIn(text);
  const named = ({ asked }) => {
    const byId = questions.filter((q) => names(asked, q.q));
    const [best, next] = questions.map((q) => [sharedWith(`${q.text} ${q.proposal || ''}`, asked), q.q]).sort((a, b) => b[0] - a[0]);
    if (byId.length === 1) return byId[0].q;
    return best && best[0] >= QUOTED_MIN && !(next && next[0] === best[0]) ? best[1] : null;
  };
  const of = Object.fromEntries(items.map((one) => [one.item, named(one)]).filter(([, q]) => q));
  return { ...of, ...placedByOrder(items, of, questions) };
}
/** The questions the quoting items of a message answer that name none the product can tell by their words (the AI asked in other
 * words than the plan's): the person answers in the order they were asked, so a run of such items between two placed ones is the
 * questions that lie between those two in the plan's order, when the run and those questions are as many. An item before the first
 * placed one or after the last is placed nowhere: a closing "yes, go ahead" must never stand as a question's answer.
 * -> { <item>: <q> } */
function placedByOrder(items, of, questions) {
  const at = (item) => questions.findIndex((q) => q.q === of[item]);
  const taken = new Set(Object.values(of));
  const runs = items.filter((one) => !of[one.item]).reduce((all, one) => {
    const last = all.at(-1);
    return last && last.at(-1).item === one.item - 1 ? [...all.slice(0, -1), [...last, one]] : [...all, [one]];
  }, []);
  return Object.fromEntries(runs.flatMap((run) => {
    const before = items.findLast((one) => one.item < run[0].item && of[one.item]);
    const after = items.find((one) => one.item > run.at(-1).item && of[one.item]);
    const between = before && after ? questions.slice(at(before.item) + 1, at(after.item)).filter((q) => !taken.has(q.q)) : [];
    return between.length === run.length ? run.map((one, i) => [one.item, between[i].q]) : [];
  }));
}
/** The person's answer to each of `questions` (the plan's, in its order) their message gives in list items that quote what they
 * answer: the words of every item of that question, whole and in their order (the quoted opening left out). -> [{ q, said }] */
function answersIn(text, questions) {
  const items = askedIn(text).filter((one) => one.said);
  const of = quotedBy(text, questions);
  return questions.map((q) => ({ q, said: items.filter((one) => of[one.item] === q.q).map((one) => one.said).join('\n') })).filter((one) => one.said);
}
/** How the person's own `words` stand in the list items of prompt row `row`: `items`, the items their answer is (the ones the words
 * touch, and each item beside them that quotes the same question of plan `id`); `part`, the words leave some of that out; `of`, the
 * questions those items quote. No list item touched: { items: [], part: false, of: [] }. */
function placedIn(row, words, id) {
  const held = heldItems(words, unsealed(row.said), sealKey);
  const asked = (row.of || {})[id] || {};
  const of = [...new Set(held.map(({ item }) => asked[item]).filter(Boolean))];
  const beside = (n, step) => (asked[n] && of.includes(asked[n]) ? [n, ...beside(n + step, step)] : []);
  const touched = held.map(({ item }) => item);
  const items = held.length ? [...beside(touched[0] - 1, -1).reverse(), ...touched, ...beside(touched.at(-1) + 1, 1)] : [];
  return { items, part: held.some((one) => !one.whole) || items.length > held.length, of };
}

/** What the AI's last message before the person's prompt at `at` showed of plan `id` (a `shown` row's entry), or null: the row must
 * be the newest before that prompt, and no other prompt of theirs lies between the two (their reply answers that message). */
function shownBefore(shown, prompts, at, id) {
  const row = (shown || []).findLast((one) => Date.parse(one.at) < Date.parse(at));
  const between = row && (prompts || []).some((p) => Date.parse(p.at) > Date.parse(row.at) && Date.parse(p.at) < Date.parse(at));
  return row && !between ? (row.plans || {})[id] ?? null : null;
}
/** Whether `message` holds the words of `text` (a proposal as the AI showed it) as one run, in their order, and it has one: the same
 * words spread over other sentences show nothing. */
const wordsIn = (text, message, run = wordRun(text).join(' ')) => run !== '' && ` ${wordRun(message).join(' ')} `.includes(` ${run} `);
const sameWords = (a, b) => [...wordSet(a)].join(' ') === [...wordSet(b)].join(' ');

module.exports = { byTime, mentions, decisionRef, decisionSlot, stepPath, isAi, personAnswers, isAnswered, forkQuestions, yesAgain, wordSet,
  alike, ofKind, keyArea, isStanding,
  unrevised, promptWords, sealedSaid, heardIn, quotedBy, answersIn, placedIn, shownBefore, wordsIn, sameWords };
