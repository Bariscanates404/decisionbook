// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// kit's one owner of the person's words: a message read as whole sentences; a quote found in it stands for the whole sentences it runs
// over, never the part; whose a sentence is, by the names in it and over its block; words about a line, and words that settle it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { said: { sentencesOf, quotedAt, wholeOf, voicedBy, isAbout, intends }, host: { personWords }, errors: { fail } } = require('@atlasbound/kit');

/** What is kept for `words` quoted from `message`: the whole sentences of their first place; null where they are not there. */
const kept = (words, message, units = sentencesOf(message)) => {
  const [place] = quotedAt(words, units);
  return place ? wholeOf(units, place) : null;
};
/** Whether `words` of `message` are `who`'s, at their first place (null: not there). */
const whose = (words, message, who, units = sentencesOf(message)) => {
  const [place] = quotedAt(words, units);
  return place ? voicedBy(units, place, who) : null;
};

test('a sentence ends at its full stop or a blank line; any other line break goes on, whatever the next line starts with', () => {
  const wrapped = [['late cancellations do not get\n100% of the deposit back', '100% of the deposit back'],
    ['a single coupon can not be\n¥1,000 or more', '¥1,000 or more'], ['Refunds are NOT\nPaid out in cash', 'Paid out in cash'],
    ['the app must never\nSMS the customer after 9pm', 'SMS the customer after 9pm'], ['honestly I wouldnt\nkeep the legacy rounding', 'keep the legacy rounding'],
    ['for the record there is no way\nI want the importer rewritten', 'I want the importer rewritten'], ['we do not,\nopen the terrace', 'open the terrace'],
    ['ship the new menu\nnot before friday', 'ship the new menu'], ['please do not do this:\ndelete the old invoices', 'delete the old invoices'],
    ['staff discounts are not\n\tstacked with coupons', 'stacked with coupons'], ['we never take bookings after 21:30\nfor the terrace', 'for the terrace'],
    ['ratio is 2:1 for staff meals and we do not\n**count drinks** in it', 'count drinks in it'], ['we do not \r\nreturn the deposit', 'return the deposit']];
  for (const [message, words] of wrapped) assert.equal(kept(words, message), message.replace(/\s*\r?\n\s*/gu, ' ').trim(), words);
  assert.equal(kept('migrate the old coupons', 'ok got it. we will not\nmigrate the old coupons'), 'we will not migrate the old coupons', 'after a stop');
  assert.equal(kept('tips go to the staff pool', 'tips go to the staff pool\n\ndo not\nrename it'), 'tips go to the staff pool', 'a blank line ends it');
  assert.equal(kept('We do not refund', 'Deposits are 20%.\nWe do not refund them! After 48 hours? never'), 'We do not refund them!', '. ! ?');
  assert.equal(kept('the 2.5 rule', 'we keep the 2.5 rule here, always'), 'we keep the 2.5 rule here, always', 'a stop inside a number ends nothing');
});

test('a list item, a chat line or a header ends the sentence before it; a list goes on from the sentence that opens it', () => {
  const things = 'things Emma does not want\n- charge a fee on gift cards\n- send receipts by sms';
  assert.equal(kept('send receipts by sms', things), 'things Emma does not want send receipts by sms', 'an item keeps its list\'s opening');
  assert.equal(kept('bill tips separately', 'we will not do these\n1. bill tips separately\n2) bill corkage'), 'we will not do these bill tips separately');
  assert.equal(kept('charge a fee on gift cards send receipts by sms', things), 'things Emma does not want charge a fee on gift cards send receipts by sms');
  assert.equal(kept('drop the banner', 'Two things.\n- keep the limit\n- drop the banner'), 'drop the banner', 'an opening with a full stop is its own');
  assert.equal(kept('the banner', 'Things we skip\n- the fee.\nWe keep this.\n- the banner'), 'the banner', 'a sentence between ends the list before it');
  assert.equal(kept('1. bill tips separately', 'we will not do these\n1. bill tips separately'), 'we will not do these bill tips separately', 'quoted with its mark');
  assert.equal(kept('earned on gift card purchases', '- loyalty points are not\n  earned on gift card purchases'), 'loyalty points are not earned on gift card purchases');
  assert.equal(kept('staff meals are capped', 'emma: no service charge on staff meals\nemma: staff meals are capped'), 'emma: staff meals are capped');
  assert.equal(kept('and no BOM', 'Here is the thread:\n[2026-11-20 14:02] Olivia: keep the header row\n[14:03] Olivia: and no BOM'), '[14:03] Olivia: and no BOM');
  for (const header of ['Emma  [2:07 PM]', '[11/23 2:07 PM] Emma (BA)', 'Emma (BA) 08:52', '# Answers']) {
    assert.equal(kept('kids eat free', `kids menu is half price\n${header}\nkids eat free`), 'kids eat free', header);
  }
  assert.deepEqual(sentencesOf('Emma  [2:07 PM]\nkeep it').map((unit) => unit.text), ['Emma  [2:07 PM]', 'keep it'], 'a header is a line of its own');
});

test('a quote is found as written: spacing, line breaks, a mail\'s ">", list and quote marks aside; never a part of a word', () => {
  const mail = 'From: Emma (BA)\nSent: Monday\n\n> we do not\n> refund the booking fee';
  for (const words of ['refund the booking fee', 'we do not\nrefund the booking fee', '> we do not\n> refund the booking fee', '"we do not refund the booking fee."',
    'WE DO NOT  refund the booking fee']) assert.equal(kept(words, mail), 'we do not refund the booking fee', words);
  for (const words of ['refund the booking fees', 'refund the fee', 'o', '', 'efund the booking fee', 'the booking fee was refunded']) {
    assert.equal(kept(words, mail), null, `not there: ${words}`);
  }
  assert.equal(kept('Deposits are 20%. We do not refund them', 'Deposits are 20%. We do not refund them.'), 'Deposits are 20%. We do not refund them.', 'two sentences');
  assert.equal(kept('テストを削除', 'テストを削除しないでください。'), 'テストを削除しないでください。', 'a script with no spaces');
  assert.deepEqual(quotedAt('keep it', sentencesOf('keep it. ok, keep it.')), [[0, 0], [1, 1]], 'every place');
});

test('whose a sentence is only what the format says: a chat line and its block, a chat header, a quote under "Emma wrote:"', () => {
  const theirs = [['Emma: keep the limit at 100', 'keep the limit'], ['Emma (BA): keep the limit at 100. drop the banner.', 'drop the banner'],
    ['pasting\n\nEmma  [2:07 PM]\nkeep the limit. drop the banner', 'drop the banner'], ['[11/23 2:07 PM] Emma (BA)\nkeep the limit', 'keep the limit'],
    ['Emma [BA] 3:41 PM\nkeep the limit. drop the banner.', 'drop the banner'], ['Emma (BA):\n- keep the limit\n- drop the banner', 'drop the banner'],
    ['Emma wrote:\n> keep the limit\n> at 100', 'at 100'], ['On Mon, 23 Nov 2026 at 10:02, Emma wrote:\n> keep the limit\n>\n> drop it', 'drop it'],
    ['Emma <emma@shop.test> wrote:\n> keep it', 'keep it'], ['[14:03] Emma: keep the limit', 'keep the limit']];
  for (const [message, words] of theirs) assert.equal(whose(words, message, 'Emma (BA)'), true, message);
  const not = [['I told Emma we charge 10%', 'we charge 10%'], ['caught Emma in the kitchen, she says: keep the limit', 'keep the limit'],
    ['Emma pinged me. Her answer: keep the limit', 'keep the limit'], ['Emma\'s reply:\nkeep the limit', 'keep the limit'],
    ['ok. Emma says keep the limit at 100.', 'keep the limit'], ['ok, Emma sent me this: "keep the limit. drop the banner"', 'drop the banner'],
    ['Hi Lee,\n\nDeposits are 20%.\n\nThanks,\nEmma', 'Deposits are 20%'], ['Emma says: keep the limit', 'keep the limit'],
    ['Emma  [2:07 PM]\nkeep the limit\n\nfor the rest take your proposals', 'for the rest take your proposals'], ['Emma: keep it\nand the rest as you say', 'the rest'], ['Emma (BA) 08:53\nit is taxed\nfor the rest go with your proposals', 'for the rest'], ['Emma:\n- keep it\n- drop it\nmy own line', 'my own line'],
    ['Emma: keep the limit\nOlivia: drop the banner', 'drop the banner'], ['Emmanuel: keep the limit', 'keep the limit'],
    ['Emma wrote:\nkeep the limit', 'keep the limit'], ['Emma wrote:\n> keep the limit\nand round the totals', 'and round the totals'],
    ['On Monday Emma wrote:\n> keep the limit', 'keep the limit'], ['From: Emma (BA)\n\n> keep the limit', 'keep the limit'],
    ['Emma: keep the limit.\n\nok go', 'keep the limit. ok go'], ['# Emma\nkeep the limit', 'keep the limit']];
  for (const [message, words] of not) assert.equal(whose(words, message, 'Emma'), false, message);
  assert.equal(whose('keep the limit', 'BA: keep the limit', 'Emma (BA)'), true, 'a role as the speaker is the one whose role it is');
  assert.equal(whose('keep the limit', 'the PM: keep the limit', 'the PM'), true, 'a role written as a name');
  assert.equal(whose('keep the limit', 'Emma Stone: keep the limit', 'Emma'), false, 'a fuller name than the one given is not proven theirs');
});

test('words are about a decision when they hold it or share enough of its content words; common words count for nothing', () => {
  assert.equal(isAbout('Round the cart total half up.', 'cart rounding round half up'), true);
  assert.equal(isAbout('the name is format', 'naming fmt format'), true);
  assert.equal(isAbout('yes: "use tabs"', 'Use tabs'), true, 'the text itself is held');
  assert.equal(isAbout('thanks, also what is 2+2?', 'cart rounding round half up'), false);
  assert.equal(isAbout('yes', 'report export rows stream'), false, 'a bare yes names nothing');
  assert.equal(isAbout('anything at all', ''), false, 'no subject');
  assert.deepEqual([isAbout('sure, go on', 'fee.mode on'), isAbout('sounds good, no objection from me', 'tax.included no'), isAbout('a monthly fee', 'month')], [false, false, true],
    'a short value names nothing on its own; a word, in its other form, does');
  assert.equal(isAbout('the subtotals', 'total'), false, 'never a part of another word');
});

const RULE = 'Do not delete tests, and never force-push to main.';
test('words are about a kept line, or not, and say done, drop, cancel or change, or not (handoff settles a line on both)', () => {
  const about = [['You can drop the rule about tests and force-push, it is done.', RULE], ['forget the rename', 'rename Invoice to Bill'],
    ['drop the first two steps', 'go on with step 5'], ['drop this: "use tabs"', 'Use tabs'],
    ['testler ve force-push kuralını iptal et', 'testler silinmez, force-push yok']];
  assert.deepEqual(about.map(([words, line]) => [isAbout(words, line), intends(words)]), about.map(() => [true, true]), 'steps and step are one word');
  assert.deepEqual(['what time is it in Tokyo?', 'i', 'drop what we said, never do that with the rule', 'change how you run the tests']
    .map((words) => isAbout(words, RULE)), [false, false, false, false], 'common words are no content; one shared word is under the share');
  assert.deepEqual([isAbout('the tests and the force-push matter a lot', RULE), intends('the tests and the force-push matter a lot')], [true, false]);
});

test('two forms of one word are one word: an ending aside, in English and in Turkish; other words stay apart', () => {
  const rounded = 'Should the discounted result be rounded (e.g. to 2 decimals / cents)?';
  assert.deepEqual(['No rounding in total(), leave formatting to format.js.', 'The discounted result should not be rounded.']
    .map((said) => isAbout(said, rounded)), [false, true]);
  assert.equal(isAbout('adet 0 olursa ürün sepetten çıkarılsın', 'Ürünü sepetinden çıkarsın mı?'), true);
  assert.deepEqual([isAbout('discount', 'discover'), isAbout('format', 'formal'), isAbout('İkinci soru', 'ikinci')], [false, false, true]);
});

const TYPED = "/handoff RETRY'a dokunma. Sıradaki iş: ayarlara log seviyesi eklemek, şimdilik sadece aklında tut.";
const inRepository = (folder) => (folder === '.claude/commands' ? ['handoff.md', 'notes.txt', '.md'] : null); // the one command held here

test('a slash command the person typed is the host\'s word: their sentence is the words after it', () => {
  const words = personWords(TYPED, inRepository);
  assert.equal(words, "RETRY'a dokunma. Sıradaki iş: ayarlara log seviyesi eklemek, şimdilik sadece aklında tut.");
  assert.equal(kept("RETRY'a dokunma.", words), "RETRY'a dokunma.");
  assert.equal(kept('log seviyesi', words), 'Sıradaki iş: ayarlara log seviyesi eklemek, şimdilik sadece aklında tut.', 'a part: its whole sentence');
  assert.equal(personWords('/handoff', inRepository), '', 'a command alone: no words of theirs');
  assert.equal(personWords('  /handoff\n  keep the v1 API', inRepository), 'keep the v1 API');
});

test('a sentence that opens with a slash word the repository holds no command for is theirs whole', () => {
  const whole = ['/tmp klasörünü silme.', '/tmp/notes.txt dosyasını silme.', '/handoffs listesini silme.', '/handoff/eski klasörünü silme.',
    '/../handoff klasörünü silme.', 'RETRY için /handoff yazma.', '/ handoff', '/Handoff RETRY\'a dokunma.', '/handoff.md dosyasını silme.',
    '/notes dosyasını silme.', '/notes.txt dosyasını silme.', '~/handoff dosyasını silme.', 'handoff RETRY\'a dokunma.', ''];
  for (const sentence of whole) assert.equal(personWords(sentence, inRepository), sentence, sentence);
  assert.equal(kept('klasörünü silme', personWords('/tmp klasörünü silme.', inRepository)), '/tmp klasörünü silme.', 'the path is a word of their sentence');
  assert.equal(personWords(TYPED, () => null), TYPED, 'a repository with no command: every word is theirs');
  assert.equal(personWords(TYPED, () => { throw fail('io-read-failed', 'commands'); }), TYPED, 'a folder that does not read holds no command');
  assert.equal(personWords('ok go on', () => assert.fail('listed')), 'ok go on', 'no slash opens it: the folder is not read');
});
