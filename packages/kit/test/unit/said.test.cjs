// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// kit's one owner of the person's words: whole clauses of their message, a sentence with a negation only whole; words about a line,
// and words that settle it. Fragments of a clause are the first cases.
const test = require('node:test');
const assert = require('node:assert/strict');
const { said: { clausesOf, notTheirs, isAbout, intends }, host: { personWords }, errors: { fail } } = require('@atlasbound/kit');

// an answer given as a list item is that whole item; the question it quotes back is the asker's sentence, not theirs
test('a list item is the person\'s whole; its quoted opening may be left out', () => {
  const LIST = 'Answers:\n- About "Keep the old rows, or not?": Hide them everywhere. They are NOT deleted.\n- About "Which key?": Use y.\nThanks';
  const said = clausesOf(LIST);
  assert.deepEqual(said.map(({ key, sentence, item = 0, lead }) => `${sentence} ${lead ? -item : item} ${key}`), ['0 0 answers', '1 -1 about "keep the old rows',
    '1 -1 not', '2 1 hide them everywhere', '3 1 they are not deleted', '5 -2 about "which key', '6 2 use y', '7 0 thanks']);
  assert.equal(notTheirs('Hide them everywhere. They are NOT deleted.', said), null, 'the negation in the quoted question is not their sentence\'s');
  assert.equal(notTheirs('Hide them everywhere. They are NOT deleted.\nUse y.', said), null, 'two items, the opening between left out');
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

test('a quote opened after a colon is a sentence of its own: whole it is theirs, though the one before holds a negation', () => {
  const message = 'The open answer is not settled, so here is mine: "Escape speed is the least speed to leave the pull." Record it; do not write code.';
  assert.equal(theirs('Escape speed is the least speed to leave the pull.', message), null);
  assert.equal(theirs('so here is mine', message), 'negation', 'the sentence before the quote is still whole only');
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

test('words are about a kept line, or not, and say done, drop, cancel or change, or not (handoff settles a line on both)', () => {
  const about = [['You can drop the rule about tests and force-push, it is done.', RULE], ['forget the rename', 'rename Invoice to Bill'],
    ['drop the first two steps', 'go on with step 5'], ['drop this: "use tabs"', 'Use tabs'],
    ['testler ve force-push kuralını iptal et', 'testler silinmez, force-push yok']];
  assert.deepEqual(about.map(([words, line]) => [isAbout(words, line), intends(words)]), about.map(() => [true, true]), 'steps and step are one word');
  assert.deepEqual(['what time is it in Tokyo?', 'i', 'drop what we said, never do that with the rule', 'change how you run the tests']
    .map((words) => isAbout(words, RULE)), [false, false, false, false], 'a negation and common words are no content; one of five words is under the share');
  assert.deepEqual([isAbout('the tests and the force-push matter a lot', RULE), intends('the tests and the force-push matter a lot')], [true, false]);
});

// Sentences as people type them (and the same in Turkish): three numbered answers on one line and on three.
const T1 = ['1. A second positional argument is fine: a percent from 0 to 100, default 0.',
  '2. Outside 0 to 100 throw a RangeError, and a TypeError when it is not a number.', '3. No rounding in total(), leave formatting to format.js.'];
const T1_TR = ['1. İkinci konumsal argüman olsun: 0 ile 100 arası yüzde, varsayılan 0.', '2. 0 ile 100 dışında RangeError fırlat, sayı değilse TypeError.',
  '3. total() içinde yuvarlama yok, biçimlendirme format.js\'e kalsın.'];
const ROUNDED = 'Should the discounted result be rounded (e.g. to 2 decimals / cents)?';

test('a numbered list on one line is the same items as on three', () => {
  for (const list of [T1, T1_TR]) assert.deepEqual(clausesOf(list.join(' ')), clausesOf(list.join('\n')), list[0]);
  assert.deepEqual(clausesOf(T1.join(' ')).map((clause) => clause.item), [1, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual(clausesOf('1. Round to 2. 2. Throw.').map((clause) => `${clause.item} ${clause.key}`), ['1 round to 2', '2 throw'], 'a number in an item is no mark');
  for (const plain of ['Use version 2. It is faster.', 'Set it to 1. 2 is too many.', 'Jobs: fix 1. and 3. only', '1. Keep 0. 3. is too many.']) {
    assert.equal(new Set(clausesOf(plain).map((clause) => clause.item)).size, 1, `no list on one line: ${plain}`);
  }
});

test('two forms of one word are one word: an ending aside, in English and in Turkish; other words stay apart', () => {
  assert.deepEqual([T1[2], 'The discounted result should not be rounded.'].map((said) => isAbout(said, ROUNDED)), [false, true]);
  assert.equal(isAbout('adet 0 olursa ürün sepetten çıkarılsın', 'Ürünü sepetinden çıkarsın mı?'), true);
  assert.deepEqual([isAbout('discount', 'discover'), isAbout('format', 'formal'), isAbout('İkinci soru', 'ikinci')], [false, false, true]);
});


const TYPED = "/handoff RETRY'a dokunma. Sıradaki iş: ayarlara log seviyesi eklemek, şimdilik sadece aklında tut.";
const inRepository = (folder) => (folder === '.claude/commands' ? ['handoff.md', 'notes.txt', '.md'] : null); // the one command held here

test('a slash command the person typed is the host\'s word: their sentence is the words after it', () => {
  const words = personWords(TYPED, inRepository);
  assert.equal(words, "RETRY'a dokunma. Sıradaki iş: ayarlara log seviyesi eklemek, şimdilik sadece aklında tut.");
  assert.equal(theirs("RETRY'a dokunma.", TYPED), 'fragment', 'read with the command, their first sentence is a piece of another');
  assert.equal(theirs("RETRY'a dokunma.", words), null);
  assert.equal(theirs('Sıradaki iş: ayarlara log seviyesi eklemek, şimdilik sadece aklında tut.', words), null);
  for (const piece of ["RETRY'a", 'dokunma', 'log seviyesi']) assert.equal(theirs(piece, words), 'fragment', piece);
  assert.equal(personWords('/handoff', inRepository), '', 'a command alone: no words of theirs');
  assert.equal(personWords('  /handoff\n  keep the v1 API', inRepository), 'keep the v1 API');
});

test('a sentence that opens with a slash word the repository holds no command for is theirs whole', () => {
  const whole = ['/tmp klasörünü silme.', '/tmp/notes.txt dosyasını silme.', '/handoffs listesini silme.', '/handoff/eski klasörünü silme.',
    '/../handoff klasörünü silme.', 'RETRY için /handoff yazma.', '/ handoff', '/Handoff RETRY\'a dokunma.', '/handoff.md dosyasını silme.',
    '/notes dosyasını silme.', '/notes.txt dosyasını silme.', '~/handoff dosyasını silme.', 'handoff RETRY\'a dokunma.', ''];
  for (const sentence of whole) assert.equal(personWords(sentence, inRepository), sentence, sentence);
  assert.equal(theirs('/tmp klasörünü silme.', personWords('/tmp klasörünü silme.', inRepository)), null);
  assert.equal(theirs('klasörünü silme.', personWords('/tmp klasörünü silme.', inRepository)), 'fragment', 'the path is a word of their sentence');
  assert.equal(personWords(TYPED, () => null), TYPED, 'a repository with no command: every word is theirs');
  assert.equal(personWords(TYPED, () => { throw fail('io-read-failed', 'commands'); }), TYPED, 'a folder that does not read holds no command');
  assert.equal(personWords('ok go on', () => assert.fail('listed')), 'ok go on', 'no slash opens it: the folder is not read');
});
