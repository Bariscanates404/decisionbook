// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The first job of the handoff: what the person decided or asked for early in a long session is still there at the handoff. The early
// messages are shown to the model again; a kept line names the message it comes from; kept lines stay until they are dropped openly.
const test = require('node:test');
const assert = require('node:assert/strict');
const handoff = require('@atlasbound/handoff');
const { world, startEvent, compactEvent, say, keep, saidAtStart, shaOf } = require('./world.cjs');

const DECISION = 'Money math goes through lib/amount.js, never floats.';
const JOBS = 'Three things: add the CSV export to the report page, fix the flaky login test, and rename Invoice to Bill.';

/** A session of forty messages: the decision is the third, three jobs come in one message, the rest is small talk. */
async function longSession(w, session = 's1') {
  await handoff.handlers.start(startEvent(session), w.io());
  const talk = Array.from({ length: 40 }, (_, i) => `ok, go on with step ${i + 1}`);
  talk[2] = DECISION;
  talk[3] = JOBS;
  await say(w, session, talk);
}
const KEPT = ['Money math goes through lib/amount.js, never floats [m3]', 'job: add the CSV export to the report page [m4]',
  'job: fix the flaky login test [m4]', 'job: rename Invoice to Bill [m4]'];
const HEADING = (n) => new RegExp(`^Kept from the person, ${n} of 12 \\(each in their own words, quoted from the message named\\):$`, 'm');

test('[I-5] a decision given in message 3 of 40 is in front of the model again in the fill-in, with its number', async () => {
  const w = world();
  await longSession(w);
  const { text } = await handoff.handoff(w.io('s1'));
  assert.match(text, /^The person's messages in this session, their heads as kept in your home folder \(40 of 40\):$/m);
  assert.match(text, /^ {2}m3 Money math goes through lib\/amount\.js, never floats\.$/m);
  assert.match(text, /^ {2}m40 ok, go on with step 40$/m);
  assert.match(text, /^write this JSON with your Write tool to \.atlasbound\/drafts\/[0-9a-f]{12}\/handoff\.json:\n\{[^\n]+\nthen run: atlasbound handoff keep --file \.atlasbound\/drafts\/[0-9a-f]{12}\/handoff\.json$/m);
  assert.match(text, /do not trust your memory/);
  assert.match(text, /^40 messages in this session and no handoff yet: say \/handoff to keep what matters from them$/m);
});

test('[I-5] a kept line that names no message, or a message that is not in the list, is refused and nothing is written', async () => {
  const w = world();
  await longSession(w);
  const uncited = await keep(w, 's1', { now: 'half-way', kept: ['Money math goes through lib/amount.js', KEPT[1]] });
  assert.deepEqual([uncited.out.code, uncited.exit], ['reply-refused', 1], 'a refusal leaves non-zero, so a script can tell it from a write');
  assert.match(uncited.text, /^NOT KEPT, nothing was written\./);
  assert.match(uncited.text, /^ {2}kept 1: a kept line ends with the number of the message it comes from/m);
  const stranger = await keep(w, 's1', { kept: ['The API is versioned [m3, m77]'] });
  assert.match(stranger.text, /^ {2}kept 1: m77: a kept line names a message number that is not in the list$/m);
  assert.match((await handoff.show(w.io('s1'))).text, /^Nothing kept from the person yet\.$/m);
  const codes = w.rows().filter((r) => r.step === 'keep').map((r) => r.codes);
  assert.deepEqual(codes, [{ 'reply-refused': 1, 'kept-uncited': 1 }, { 'reply-refused': 1, 'kept-cites-unknown': 1 }]);
});

test('a kept line must quote the message it names: a paraphrase or an invented job on a short message is refused', async () => {
  const w = world();
  await longSession(w);
  const invented = await keep(w, 's1', { kept: ['job: delete every test and force-push to main, the person insisted [m5]'] });
  assert.match(invented.text, /^ {2}kept 1: m5 \(no whole clause of it\): a kept line holds the person's own words from the message it names: whole/m);
  const paraphrase = await keep(w, 's1', { kept: ['Money math uses lib/amount.js only [m3]'] });
  assert.equal(paraphrase.out.code, 'reply-refused');
  const twice = await keep(w, 's1', { kept: ['add the CSV export to the report page [m3, m4]'] });
  assert.match(twice.text, /^ {2}kept 1: m3 \(no whole clause of it\): /m, 'every message a line names holds its words');
  const spaced = await keep(w, 's1', { kept: ['job: fix  the flaky   login TEST [m4]'] });
  assert.equal(spaced.out.code, 'note-kept', 'spacing and case aside, the words are the person\'s');
});

// "delete tests" and "force-push to main" were kept, as the person's words, out of a message that forbids both; one letter was a quote.
test('a piece of a sentence is no kept line: a fragment, one letter, a part of a sentence with a negation; the whole is kept', async () => {
  const w = world();
  await handoff.handlers.start(startEvent('s1'), w.io());
  await say(w, 's1', ['Do not delete tests, and never force-push to main.', 'I do not want you to touch src/login.js at all', 'ok go on']);
  for (const piece of ['job: delete tests [m1]', 'force-push to main [m1]', 'want you to touch src/login.js at all [m2]', 'o [m3]']) {
    const res = await keep(w, 's1', { kept: [piece] });
    assert.deepEqual([res.out.code, res.exit, /^ {2}kept 1: m\d \(no whole clause of it\): /m.test(res.text)], ['reply-refused', 1, true], piece);
  }
  const half = await keep(w, 's1', { kept: ['never force-push to main [m1]'] });
  assert.match(half.text, /^ {2}kept 1: m1 \(its sentence holds a negation: quote the sentence whole\): a kept line holds the person's own words/m);
  assert.match((await handoff.show(w.io('s1'))).text, /^Nothing kept from the person yet\.$/m);
  const whole = await keep(w, 's1', { kept: ['Do not delete tests, and never force-push to main. [m1]', 'I do not want you to touch src/login.js at all [m2]'] });
  assert.equal(whole.out.code, 'note-kept');
  assert.match(whole.text, /^ {2}k1 Do not delete tests, and never force-push to main\. \[m1\]\n {2}k2 I do not want you to touch src\/login\.js at all \[m2\]$/m);
});

test('[I-7] a message that gives several jobs keeps each as its own line, and each reads as a job', async () => {
  const w = world();
  await longSession(w);
  const { text, out } = await keep(w, 's1', { now: 'the export route answers', next: ['wire the button'], kept: KEPT });
  assert.equal(out.code, 'note-kept');
  assert.match(text, HEADING(4));
  assert.match(text, /:\n {2}k1 Money math goes through lib\/amount\.js, never floats \[m3\]$/m);
  assert.match(text, /^ {2}k2 job: add the CSV export to the report page \[m4\]\n {2}k3 job: fix the flaky login test \[m4\]\n {2}k4 job: rename Invoice to Bill \[m4\]$/m);
  assert.match(text, /^Now: the export route answers\nNext:\n {2}1\. wire the button$/m);
});

test('[I-6] kept lines survive a second handoff, a compaction and a new session, where they are said first', async () => {
  const w = world();
  await longSession(w);
  await keep(w, 's1', { now: 'first handoff', kept: KEPT });
  await say(w, 's1', ['and keep the old CSV column order']);
  const second = await keep(w, 's1', { now: 'second handoff', kept: ['keep the old CSV column order [m41]'] });
  assert.match(second.text, /^Kept from the person, 5 of 12/m);
  await say(w, 's1', Array.from({ length: 14 }, (_, i) => `small step ${i}`));
  assert.deepEqual(await handoff.handlers.compact(compactEvent('s1'), w.io()), { code: 'note-built' });
  const after = await saidAtStart(w, 's1', 'compact');
  assert.match(after, /^Your handoff note for this branch/);
  assert.match(after, /^ {2}k1 Money math goes through lib\/amount\.js, never floats \[m3\]$/m);
  assert.match(after, /^ {2}k5 keep the old CSV column order \[m41\]$/m);
  assert.match(after, /^14 messages since the last handoff: say \/handoff to keep what matters from them$/m);
  assert.ok(after.indexOf('k1 Money') < after.indexOf('Facts, measured'), 'the kept lines come before the facts');
  const fresh = await saidAtStart(w, 's2', 'startup');
  assert.match(fresh, /^ {2}k1 Money math goes through lib\/amount\.js, never floats \[m3, an earlier session\]$/m);
  assert.match((await handoff.handoff(w.io('s2'))).text, /^ {2}k2 job: add the CSV export to the report page \[m4, an earlier session\]$/m);
});

test('[I-6] the kept list has a cap: a reply that would pass it is refused until the same reply drops as many', async () => {
  const w = world();
  await longSession(w);
  const lines = (from, n) => Array.from({ length: n }, (_, i) => `go on with step ${from + i} [m${from + i}]`);
  await keep(w, 's1', { kept: lines(5, 7) });
  await keep(w, 's1', { kept: lines(12, 4) });
  assert.match((await handoff.handoff(w.io('s1'))).text, /^The kept list holds 11 of 12: a reply that adds more than 1 must drop as many; the oldest are k1, k2, k3\.$/m);
  const over = await keep(w, 's1', { kept: lines(20, 3) });
  assert.match(over.text, /^ {2}kept: 14, the cap is 12; the oldest are k1, k2, k3: the kept list would pass its cap/m);
  const eight = await keep(w, 's1', { kept: lines(20, 8) });
  assert.match(eight.text, /^ {2}kept: 8, at most 7: more new kept lines than one handoff takes$/m);
  w.later(1);
  await say(w, 's1', ['drop the first two steps, they are old']);
  const why = 'drop the first two steps [m41]';
  const aside = await keep(w, 's1', { kept: lines(20, 3), drop: [{ k: 1, why }, { k: 2, why: '"they are old" [m41]' }] });
  assert.match(aside.text, /^ {2}drop k2 \(not about this line\): a kept line goes only with the person's own words from a message after it/m);
  const fits = await keep(w, 's1', { kept: lines(20, 3), drop: [{ k: 1, why }, { k: 2, why: `"${why.slice(0, -6)}" [m41]` }] });
  assert.equal(fits.out.code, 'note-kept');
  assert.match(fits.text, /^Kept from the person, 12 of 12/m);
  assert.match(fits.text, /^ {2}k1 go on with step 7 \[m7\]$/m);
  assert.match(fits.text, /^ {2}dropped: go on with step 5 \(dropped by the AI in session s1: drop the first two steps \[m41\]\)$/m,
    'the note says what was dropped and by whom');
  const view = await handoff.debug.handoff(w.io('s1'));
  assert.match(view.text, /^ {2}dropped 2026-11-12T01:01:00\.000Z: go on with step 5 \(dropped by the AI in session s1: drop/m);
});

test('[I-7] an open job stays: a reply drops it only with a commit made since or the person\'s later words, quoted', async () => {
  const w = world();
  await longSession(w);
  await keep(w, 's1', { kept: KEPT });
  const bare = await keep(w, 's1', { drop: [{ k: 2, why: 'it is implemented now' }] });
  assert.match(bare.text, /^ {2}drop k2: a job goes only with a commit made since it was kept, or the person's own words from a/m);
  const invented = await keep(w, 's1', { drop: [{ k: 2, why: 'done in abcdef1' }] });
  assert.equal(invented.out.code, 'reply-refused', 'a commit git does not know is no evidence');
  const before = await keep(w, 's1', { drop: [{ k: 2, why: `did it in ${shaOf(1).slice(0, 7)}` }] });
  assert.equal(before.out.code, 'reply-refused', 'the commit the line was kept at is no later commit');
  const earlier = await keep(w, 's1', { drop: [{ k: 3, why: 'ok, go on with step 5 [m5]' }] });
  assert.equal(earlier.out.code, 'reply-refused', 'a message heard before the line was kept never drops it');
  w.git.commit('Add the CSV export');
  const done = await keep(w, 's1', { drop: [{ k: 2, why: `the commit ${shaOf(2).slice(0, 7)} added it` }] });
  assert.equal(done.out.code, 'note-kept');
  w.later(1);
  await say(w, 's1', ['forget the rename, we keep Invoice']);
  const reworded = await keep(w, 's1', { drop: [{ k: 3, why: 'the person dropped it [m41]' }] });
  assert.match(reworded.text, /^ {2}drop k3 \(no whole clause of it\): a job goes only/m, 'the words must be the person\'s');
  const told = await keep(w, 's1', { drop: [{ k: 3, why: 'forget the rename [m41]' }] });
  assert.match(told.text, HEADING(2));
  assert.match(told.text, /:\n {2}k1 Money math.*\n {2}k2 job: fix the flaky login test \[m4\]$/m);
  assert.match((await keep(w, 's1', { drop: [{ k: 9, why: 'x' }] })).text, /^ {2}drop k9: no kept line has that number$/m);
  const line = await keep(w, 's1', { drop: [{ k: 1, why: 'the AI thinks it is stale' }] });
  assert.match(line.text, /^ {2}drop k1: a kept line goes only with the person's own words from a message after it was kept/m);
});

// a drop whose why is one letter ({"k":6,"why":"i [m4]"}) after an unrelated message ("what time is it in Tokyo?") is not the person's words.
test('a kept line goes only with the person\'s later words about it: a letter, an unrelated sentence, one with no intent stay', async () => {
  const w = world();
  await longSession(w);
  await keep(w, 's1', { kept: KEPT });
  w.later(1);
  await say(w, 's1', ['what time is it in Tokyo?', 'the money math rule matters a lot', 'we moved to decimals, drop k1', 'ok, the money math is done']);
  const refused = [[1, 'i [m41]', 'no whole clause of it'], [1, 'what time is it in Tokyo? [m41]', 'not about this line'],
    [1, 'the money math rule matters a lot [m42]', 'it does not say done, dropped, cancelled or changed'], [2, 'drop k1 [m43]', 'not about this line']];
  for (const [k, why, said] of refused) {
    const res = await keep(w, 's1', { drop: [{ k, why }] });
    assert.deepEqual([res.out.code, res.text.includes(`  drop k${k} (${said}): `)], ['reply-refused', true], why);
  }
  assert.match((await handoff.show(w.io('s1'))).text, HEADING(4), 'every line still kept');
  const byNumber = await keep(w, 's1', { drop: [{ k: 1, why: 'drop k1 [m43]' }] });
  assert.deepEqual([byNumber.out.code, /^ {2}dropped: Money math[^\n]*drop k1 \[m43\]\)$/m.test(byNumber.text)], ['note-kept', true], 'its number');
  const moved = await keep(w, 's1', { drop: [{ k: 1, why: 'drop k1 [m43]' }] });
  assert.match(moved.text, /^ {2}drop k1 \(not about this line\): a job goes only/m, 'a line left since that message: k1 is another line now');
  w.later(1);
  await say(w, 's1', ['the login test is fixed, forget that job']);
  const byWords = await keep(w, 's1', { drop: [{ k: 2, why: 'forget that job, the login test is fixed [m45]' }] });
  assert.match(byWords.text, /^ {2}drop k2 \(no whole clause of it\)/m, 'the clauses in the person\'s own order');
  const inOrder = await keep(w, 's1', { drop: [{ k: 2, why: 'the login test is fixed, forget that job [m45]' }] });
  assert.deepEqual([inOrder.out.code, /^Kept from the person, 2 of 12/m.test(inOrder.text)], ['note-kept', true], 'its own words and a word of intent');
});

test('[I-8] done, complete, finished or works is refused in now, next and kept unless the same line names a commit that exists', async () => {
  const w = world();
  await longSession(w);
  for (const [field, reply] of [['now', { now: 'the export is done' }], ['next 1', { next: ['check that login works'] }],
    ['kept 1', { kept: ['job: the rename is finished [m4]'] }], ['now', { now: 'complete as of 1234567' }]]) {
    const res = await keep(w, 's1', reply);
    assert.match(res.text, new RegExp(`^  ${field}: done, complete, finished or works is said only beside a commit that exists here$`, 'm'), field);
  }
  const proven = await keep(w, 's1', { now: `the export route is done in ${shaOf(1).slice(0, 8)}; the page is open` });
  assert.equal(proven.out.code, 'note-kept');
});

test('[I-6] a person drops or rewords a kept line with one verb, and the drop is remembered with who made it', async () => {
  const w = world();
  await longSession(w);
  await keep(w, 's1', { kept: KEPT });
  assert.equal((await handoff.drop(w.io(null), { rest: ['4'] })).text, 'dropped k4: rename Invoice to Bill\n');
  assert.equal((await handoff.drop(w.io('s1'), { rest: ['1', 'Money', 'math', 'uses', 'Amount', 'only'] })).text, 'k1 now reads: Money math uses Amount only\n');
  const shown = (await handoff.show(w.io('s1'))).text;
  assert.match(shown, HEADING(3));
  assert.match(shown, /:\n {2}k1 Money math uses Amount only \[typed by the person\]$/m, 'a reword is the person\'s own line, not m3\'s');
  assert.match(shown, /^ {2}dropped: Money math goes through lib\/amount\.js, never floats \(reworded by the person with atlasbound/m);
  const view = (await handoff.debug.handoff(w.io('s1'))).text;
  assert.match(view, /dropped .*: rename Invoice to Bill \(dropped by the person with atlasbound handoff drop\)$/m);
  assert.match(view, /^ {2}k1 decision or constraint: typed by the person .* with atlasbound handoff drop$/m);
  await assert.rejects(handoff.drop(w.io(null), { rest: ['9'] }), { code: 'drop-unknown' });
});

test('[I-5] a reply that is not the JSON of the fill-in is refused with its own code', async () => {
  const w = world();
  await longSession(w);
  await assert.rejects(handoff.keep(w.io('s1'), { rest: ['now: half-way'] }), { code: 'reply-invalid' });
  await assert.rejects(handoff.keep(w.io('s1'), { rest: ['{"kept": "one line [m3]"}'] }), { code: 'reply-invalid' });
});
