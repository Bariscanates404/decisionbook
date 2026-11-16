// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// kit's one owner of the person's words: whole clauses of their message, a sentence with a negation only whole; words about a line,
// and words that settle it. Fragments of a clause are the first cases.
const test = require('node:test');
const assert = require('node:assert/strict');
const { said: { clausesOf, notTheirs, isAbout, sharedWith, names, notHeld, notSettling, askedIn, heldItems, asksAside } } = require('@atlasbound/kit');

// an answer given as a list item is that whole item; the question it quotes back is the asker's sentence, not theirs
test('a list item is the person\'s whole; its quoted opening may be left out; a question that sets work aside', () => {
  const LIST = 'Answers:\n- About "Keep the old rows, or not?": Hide them everywhere. They are NOT deleted.\n- About "Which key?": Use y.\nThanks';
  const said = clausesOf(LIST);
  assert.deepEqual(said.map(({ key, sentence, item = 0, lead }) => `${sentence} ${lead ? -item : item} ${key}`), ['0 0 answers', '1 -1 about "keep the old rows',
    '1 -1 not', '2 1 hide them everywhere', '3 1 they are not deleted', '5 -2 about "which key', '6 2 use y', '7 0 thanks']);
  assert.deepEqual(askedIn(LIST), [{ item: 1, asked: 'About "Keep the old rows, or not?": ', said: 'Hide them everywhere. They are NOT deleted.' },
    { item: 2, asked: 'About "Which key?": ', said: 'Use y.' }], 'each quoting item with its own words after the quote, as the person wrote them');
  assert.equal(notTheirs('Hide them everywhere. They are NOT deleted.', said), null, 'the negation in the quoted question is not their sentence\'s');
  assert.deepEqual(heldItems('They are NOT deleted.', said), [{ item: 1, whole: false }], 'a side sentence of the item');
  assert.deepEqual(heldItems('Hide them everywhere. They are NOT deleted.', said), [{ item: 1, whole: true }]);
  assert.deepEqual(heldItems('Hide them everywhere. They are NOT deleted.\nUse y.', said), [{ item: 1, whole: true }, { item: 2, whole: true }], 'two items, the opening between left out');
  assert.deepEqual([heldItems('Thanks', said), heldItems('never said', said)], [[], []]);
  assert.deepEqual(['Plan p1 is still open. Is it set aside for now?', 'Plan p1: **set it aside?**', 'Plan p1 goes on. Shall I change the name?', 'I set plan p1 aside.',
    'p1 planını kenara koyayım mı?'].map(asksAside), [true, true, false, false, true]);
});

const RULE = 'Do not delete tests, and never force-push to main.';
const JOBS = 'Three things: add the CSV export to the report page, fix the flaky login test, and rename Invoice to Bill.';
const theirs = (words, message) => notTheirs(words, clausesOf(message));

test('a piece of a clause is no quote: fragments, a paraphrase, one letter, no words', () => {
  const pieces = [['delete tests', RULE], ['force-push to main', RULE], ['o', 'ok go on'], ['', RULE], ['i', 'what time is it in Tokyo?'],
    ['want you to touch src/login.js at all', 'I do not want you to touch src/login.js at all'],
    ['Money math uses lib/amount.js only', 'Money math goes through lib/amount.js, never floats.'], ['テストを削除', 'テストを削除しないでください。']];
  for (const [words, message] of pieces) assert.equal(theirs(words, message), 'fragment', words);
});

test('whole clauses are the person\'s words, case, spacing, quote marks and the last stop aside; a joining word opens no clause', () => {
  const whole = [[RULE, RULE], ['do not  delete tests, and never force-push to MAIN', RULE], [`"${RULE}"`, RULE],
    ['add the CSV export to the report page', JOBS], ['rename Invoice to Bill', JOBS], ['fix the flaky login test, and rename Invoice to Bill', JOBS],
    ['add the CSV export', 'Two jobs: add the CSV export and fix the flaky login test.'], ['fix login', 'Jobs:\n- fix login\n- add tests'],
    ['Force-push is fine', 'Do not delete tests. Force-push is fine.'], ['run the linter', 'Never:\n- delete tests\n\nrun the linter'],
    ['forget the rename', 'forget the rename, we keep Invoice'], ['testleri silme, main\'e force-push yapma', 'testleri silme, main\'e force-push yapma']];
  for (const [words, message] of whole) assert.equal(theirs(words, message), null, words);
  assert.equal(theirs('add the CSV export to the report page, rename Invoice to Bill', JOBS), 'fragment', 'a clause left out between is no run');
});

test('a sentence that holds a negation is quoted whole: a part of it, a list item under it, a wrapped line of it are refused', () => {
  const parts = [['never force-push to main', RULE], ['Money math goes through lib/amount.js', 'Money math goes through lib/amount.js, never floats.'],
    ['delete tests', 'Never do these:\n- delete tests.\n- force-push to main.'], ['force-push to main', 'Never do these:\n- delete tests.\n- force-push to main.'],
    ['delete tests', 'Please do not under any circumstances\ndelete tests'], ['rename fmt', 'I don\'t want you to touch the tests, rename fmt'],
    ['testleri silme', 'testleri silme, main\'e force-push yapma'], ['テストを削除しない', 'テストを削除しない、mainにpushする'],
    ['mainにpushする', 'テストを削除しない、mainにpushする']];
  for (const [words, message] of parts) assert.equal(theirs(words, message), 'negation', words);
  assert.equal(theirs('Never do these: delete tests, force-push to main', 'Never do these:\n- delete tests.\n- force-push to main.'), null, 'the whole list');
});

test('the clauses of a message: its sentences, list items, its own commas and joining words; a long one is read whole', () => {
  assert.deepEqual(clausesOf(RULE), [{ key: 'do not delete tests', sentence: 0, no: true }, { key: 'never force-push to main', sentence: 0, no: true }]);
  assert.deepEqual(clausesOf('Jobs:\n1. fix login.\n2) add tests\n\nThen ship v1.2, ok?').map(({ key, sentence, no }) => `${sentence}${no ? '!' : ''} ${key}`),
    ['0 jobs', '1 fix login', '3 add tests', '4 ship v1.2', '4 ok'], 'an item of a list no negation opens is its own sentence');
  assert.deepEqual(clausesOf('Never:\n- delete tests.\n- push to main\n\nship it').map(({ key, sentence, no }) => `${sentence}${no ? '!' : ''} ${key}`),
    ['0! never', '0 delete tests', '0 push to main', '1 ship it'], 'a negation in the line that opens a list governs every item');
  assert.deepEqual(clausesOf(null), []);
});

// a message is read whole: no count of its clauses is cut, so what the person wrote after the 80th is theirs too,
// and words quoted past the 80th are checked
test('a long message is read whole: an answer after its 80th clause is theirs, a tail the person never wrote is not', () => {
  const steps = Array.from({ length: 200 }, (_, i) => `- step ${i + 1} stays as it is`);
  const said = clausesOf(['Notes:', ...steps].join('\n'));
  assert.equal(said.length, 201, 'every clause of a 200-item message');
  assert.equal(notTheirs('step 200 stays as it is', said), null, 'their last item is theirs');
  assert.equal(notTheirs([...steps.slice(0, 80), '- delete every test'].join('\n'), clausesOf(steps.slice(0, 85).join('\n'))), 'fragment',
    '80 of their items and one they never wrote are not theirs');
  const many = Array.from({ length: 20000 }, (_, i) => `item ${i}`).join('\n');
  assert.equal(notTheirs(many, clausesOf(many)), null, 'a 20,000-clause quote of a 20,000-clause message is read in time');
});

test('a store that keeps no words keeps sealed clauses: the same test runs over the digests', () => {
  const seal = (key) => `#${key.length}:${key.charCodeAt(0)}:${key.charCodeAt(key.length - 1)}`;
  const sealed = clausesOf(RULE).map((clause) => ({ ...clause, key: seal(clause.key) }));
  assert.equal(notTheirs(RULE, sealed, seal), null);
  assert.equal(notTheirs('never force-push to main', sealed, seal), 'negation');
  assert.equal(notTheirs('delete tests', sealed, seal), 'fragment');
});

test('words are about a decision when they hold it or share enough of its content words; common words count for nothing', () => {
  assert.equal(isAbout('Round the cart total half up.', 'cart rounding round half up'), true);
  assert.equal(isAbout('the name is format', 'naming fmt format'), true);
  assert.equal(isAbout('yes: "use tabs"', 'Use tabs'), true, 'the text itself is held');
  assert.equal(isAbout('thanks, also what is 2+2?', 'cart rounding round half up'), false);
  assert.equal(isAbout('yes', 'report export rows stream'), false, 'a bare yes names nothing');
  assert.equal(isAbout('anything at all', ''), false, 'no subject');
});

test('a value is what an answer decides when its words are the answer\'s own, with the answer\'s negation', () => {
  const Q = 'Warn once (proposed) or on every occurrence?';
  const held = [['once per process', 'once per process', Q], ['once', 'yes, the first one', Q], ['2', '2', Q], ['warn once', 'Yes.', Q], ['once', 'evet', Q],
    ['every time', 'No, every time.', Q], ['1000', 'Write 1,000 rows per batch.', 'Rows per write?'], ['no', 'No.', 'Also warn for the environment?'],
    ['warn only for command-line use; env, default, preset give no warning',
      'Only when the person typed the option on the command line. A value from its environment variable (Option.env), a default or a preset gives no warning.', Q]];
  for (const [value, answer, question] of held) assert.equal(notHeld(value, answer, question), null, `${value} <- ${answer}`);
  const foreign = [['once', 'every occurrence', Q], ['also warn for the environment', 'No.', 'Also warn for the environment?'], ['once per process', 'what time is it in Tokyo?', Q],
    ['once per process', 'About "warn once per process or on every occurrence?": every occurrence.', 'Warn once per process (proposed) or on every occurrence?'],
    ['warn every time, skip the tests', 'warn every time', Q], ['2 retries', '5', 'How many retries, 2 or 5?'], ['', 'yes', Q]];
  for (const [value, answer, question] of foreign) assert.equal(notHeld(value, answer, question), 'foreign', `${value} <- ${answer}`);
  const flipped = [['warn for the environment variable', 'Do not warn for the environment variable.', Q], ['warn once', 'warn on every occurrence, never once', Q],
    ['never warn on env', 'warn on env', Q], ['never warn', 'yes', 'Warn on every use?']];
  for (const [value, answer, question] of flipped) assert.equal(notHeld(value, answer, question), 'flipped', `${value} <- ${answer}`);
  assert.equal(sharedWith('One warning per parse, however many times the option is given.', 'If the option is passed several times, warn once?'), 3);
  assert.deepEqual([names('Q1: every occurrence.', 'Q1'), names('Q11: x', 'Q1')], [true, false]);
});

test('words settle a kept line when they are about it, or name its number, and say done, drop, cancel or change', () => {
  assert.equal(notSettling('You can drop the rule about tests and force-push, it is done.', RULE, 5), null);
  assert.equal(notSettling('drop k5, it is old', RULE, 5), null, 'its number');
  assert.equal(notSettling('forget the rename', 'rename Invoice to Bill', 3), null);
  assert.equal(notSettling('drop the first two steps', 'go on with step 5', 1), null, 'steps and step are one word');
  assert.equal(notSettling('drop this: "use tabs"', 'Use tabs', 2), null, 'the line itself is held');
  assert.equal(notSettling('testler ve force-push kuralını iptal et', 'testler silinmez, force-push yok', 2), null, 'a word of intent of another language');
  assert.equal(notSettling('what time is it in Tokyo?', RULE, 5), 'unrelated');
  assert.equal(notSettling('i', RULE, 5), 'unrelated');
  assert.equal(notSettling('drop k4, it is old', RULE, 5), 'unrelated', 'another line\'s number');
  assert.equal(notSettling('drop k5, it is old', RULE, null), 'unrelated', 'a number that names the line no more');
  assert.equal(notSettling('drop what we said, never do that with the rule', RULE, 5), 'unrelated', 'a negation and common words are no content');
  assert.equal(notSettling('change how you run the tests', RULE, 5), 'unrelated', 'one of five content words is under the share');
  assert.equal(notSettling('the tests and the force-push matter a lot', RULE, 5), 'no-intent');
});
