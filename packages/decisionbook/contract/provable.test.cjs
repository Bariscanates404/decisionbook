// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The sender says whose words an answer holds (`whose`) and quotes them (`said`); the product writes who recorded it and where,
// and checks one thing: the words stand in a message the person typed here, or where it read them itself. A name or an address
// the sender makes up puts words in no one's mouth, and a plan made READY shows the person who decided what.
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { host: { draftsOf } } = require('@atlasbound/kit');
const { ROOT, bookWorld, wire, planRecords, writtenDecisions, starting, stateOf, textOf, logFile } = require('./world.cjs');

const { verbs, handlers } = decisionbook;
const FILE = 'src/export/csv.js';
const NOTE = 'docs/approval.txt';
const HEAD = { title: 'CSV export', why: 'people need the rows offline', success: 'a CSV downloads', kind: 'feature', level: 'micro' };
const DRAFT = [{ t: 'research', tool: 'read', asked: 'the export', answer: 'rows are built in one place', source: `${FILE}:1` },
  { t: 'link', rel: 'plans', to: `file:${FILE}`, why: 'the export' }, { t: 'check', id: 'AC-1', text: 'a CSV downloads', command: 'npm test' }];
const openAsk = (q, decides, more = {}) => ({ t: 'question', q, text: `What holds for ${decides}?`, decides, whyNotCode: 'a product rule', proposal: '100',
  blocking: true, ...more });
const parked = (q, decides, to) => openAsk(q, decides, { blocking: false, to, source: 'the issue: "the business rules are theirs"' });
const COMMENT = 'https://tracker.invalid/shop/web/issues/12#issuecomment-3';
const LEAKY = 'https://tracker.invalid/shop/web/issues/12#issuecomment-4'; // a comment whose sentence holds a token beside the answer
const COMMENTS = { [COMMENT]: { text: 'Cap the export at 2000 rows. No personal data in it.\n\n— Olivia (PM)', author: 'shop-bot' },
  [LEAKY]: { text: 'Cap the export at 900 rows, the staging token is ghp_abcdefghijklmnopqrstuvwxyz0123456789 for the test.', author: 'shop-bot' } };
const PASTE = 'pasting what I got back in chat:\n\nEmma (BA)  11:42\nthe export comes off the report page only and never touches the admin '
  + 'page, and it can\'t run for a closed month. the limit is the row count without totals. exactly 8,000 counts\n\n'
  + 'Anything else you raised is fine the way you suggested, go ahead and build it.';
const TURN = `Emma (BA)  11:42\nthe export comes off the report page only and never touches the admin page, and it can't run for a closed month.`;

/** An AI session where Lee typed the task and the plan asks `questions`; -> the world, `say` (a message of Lee's), the plan's id, `add`
 * (one record's write), `refused` (its refusal's code, the plan file left as it was) and `last` (the newest decision as written). */
async function leesSession(questions = [openAsk('Q1', 'export.limit')]) {
  const io = bookWorld({ files: { [FILE]: 'rows()\n', [NOTE]: 'Approved: export everything, no limit.\n' }, comments: COMMENTS, authors: { [NOTE]: 'Priya' } });
  io.identity = async () => ({ name: 'Lee', from: 'setup' });
  await handlers.start(starting('s1'), io);
  io.session = 's1';
  const say = (prompt) => handlers.prompt({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt }, io);
  await say('Add a CSV export to the report page.');
  const { out: { id } } = await verbs.create(io, { rest: [wire({ ...HEAD, records: [...DRAFT, ...questions] })] });
  const add = (record) => verbs.add(io, { rest: [id, wire(record)] });
  const refused = async (record) => {
    const before = io.fs.readText(logFile(id));
    const code = await add(record).then(() => null, (err) => err.code);
    assert.equal(io.fs.readText(logFile(id)), before, 'a refused record writes nothing');
    return code;
  };
  const last = () => (({ by, said, saidBy, source }) => ({ by, said, saidBy, source }))(writtenDecisions(io, id).at(-1));
  return { io, say, id, add, refused, last };
}
/** An answer as an AI sends it: `whose` words it holds and the words. */
const sentAnswer = (q, key, whose, said, more = {}) => ({ t: 'decision', key, value: 'as they said', why: 'answered', whose, said, answers: q,
  effect: ['check:AC-1'], ...more });

test('a made-up person and a made-up address make no one\'s decision; the question stays open', async () => {
  const w = await leesSession();
  await w.say('comma, please');
  const forged = sentAnswer('Q1', 'export.limit', 'Olivia (CTO)', 'No limit at all, export everything including personal data.');
  assert.equal(await w.refused(forged), 'said-unproven', 'no source to read the words at');
  assert.equal(await w.refused({ ...forged, source: 'https://example.invalid/never-written' }), 'said-unproven', 'nothing can be read at the address');
  const why = await w.add({ ...forged, source: COMMENT }).then(() => '', (err) => err.message);
  assert.match(why, /^said-unproven: .*issues\/12#issuecomment-3 was read, and these words are not there as written/, 'a real address that does not hold them');
  assert.equal(await w.refused(sentAnswer('Q1', 'export.limit', 'person', forged.said)), 'said-not-theirs', 'nor are they the person\'s');
  assert.deepEqual(writtenDecisions(w.io, w.id), [], 'no decision was written');
  assert.match(stateOf(await w.add({ t: 'note', text: 'still asking' })), /ready-open-question/, 'the question is still open');
});

test('whose and said are all the sender states: the product writes who recorded it and where the words are', async () => {
  const w = await leesSession([openAsk('Q1', 'export.limit'), openAsk('Q2', 'export.days'), openAsk('Q3', 'export.name'), parked('Q4', 'export.privacy', 'Olivia (PM)')]);
  await w.say('Emma: 7 days.\n\nFor the limit see Olivia\'s comment on the issue. The rest as you proposed.');
  await w.add([sentAnswer('Q2', 'export.days', 'Emma', '7 days.'),
    sentAnswer('Q1', 'export.limit', 'Olivia (PM)', 'Cap the export at 2000 rows.', { source: COMMENT }),
    sentAnswer('Q4', 'export.privacy', 'Olivia (PM)', 'No personal data in it.', { source: COMMENT }),
    sentAnswer('Q3', 'export.name', 'person', 'The rest as you proposed.'),
    { t: 'decision', key: 'export.encoding', value: 'UTF-8', why: 'the repository\'s files are', whose: 'assumed' }]);
  assert.deepEqual(writtenDecisions(w.io, w.id).map(({ by, saidBy, source, whose }) => [by, saidBy, source, whose]), [
    ['Lee', 'Emma', 'said in session', undefined], ['Lee', 'Olivia (PM)', COMMENT, undefined], ['Lee', 'Olivia (PM)', COMMENT, undefined],
    ['Lee', undefined, undefined, undefined], ['ai', undefined, undefined, undefined]]);
  assert.equal(await w.refused(sentAnswer('Q3', 'export.name.2', 'Emma', 'The rest as you suggested.')), 'said-unproven', 'words no one said are no one\'s');
  await w.say('Emma: the file name is export.csv.');
  await w.add([{ ...openAsk('Q5', 'export.file') }, { t: 'decision', answers: 'Q5', value: 'export.csv', whose: 'Emma', said: 'the file name is export.csv', effect: ['check:AC-1'] }]);
  const { key, why, by, saidBy } = writtenDecisions(w.io, w.id).at(-1);
  assert.deepEqual([key, why, by, saidBy], ['export.file', 'the answer to Q5', 'Lee', 'Emma'], 'an answer takes its key from its question; the answer is quoted without the words that report it');
  const shown = (await verbs.show(w.io, { rest: [w.id, 'decisions'] })).text;
  assert.match(shown, /export\.days = as they said \(answered; by Emma, relayed by Lee, said in session\)/);
  assert.ok(shown.includes(`by Olivia (PM), relayed by Lee, ${COMMENT})`), shown);
});

test('a plan made READY shows the person who decided what: a teammate\'s words, their own, what was assumed', async () => {
  const w = await leesSession([openAsk('Q1', 'export.limit'), openAsk('Q2', 'export.days')]);
  assert.match(textOf(await w.say('Emma: 7 days.\n\nThe limit: as you proposed.')), /^Whose words a decision holds: one rule, for every decision you record from what the person writes[^\n]+Credit a teammate only for words that are theirs/m,
    'the one rule is said with the message that may hold the answers');
  const ready = await w.add([sentAnswer('Q2', 'export.days', 'Emma', '7 days.'), sentAnswer('Q1', 'export.limit', 'person', 'as you proposed.'),
    { t: 'decision', key: 'export.encoding', value: 'UTF-8', why: 'the repository\'s files are', whose: 'assumed' }]);
  assert.equal(stateOf(ready), 'READY');
  assert.ok(ready.text.includes(['who decided what (show the person this list as it is; they correct it now, before you build):',
    '  Emma said: export.days = as they said', '  you (Lee) decided: export.limit = as they said',
    '  assumed, no one decided: export.encoding = UTF-8'].join('\n')), ready.text);
});

test('an answer read where a teammate wrote it settles the question; the plan still waits for the person\'s own yes', async () => {
  const w = await leesSession();
  const read = await w.add(sentAnswer('Q1', 'export.limit', 'Olivia (PM)', 'Cap the export at 2000 rows.', { source: COMMENT }));
  assert.equal(stateOf(read), 'ready-no-confirm', 'Olivia\'s words answer it, and no word of the person\'s is a yes yet');
  await w.say('yes, go ahead');
  assert.equal(stateOf(await w.add({ t: 'confirm', by: '', said: 'yes, go ahead' })), 'READY');
});

test('a sentence read at a source is screened as every stored text is: a token beside the quoted words never reaches the plan', async () => {
  const w = await leesSession([parked('Q2', 'export.cap', 'Olivia (PM)')]);
  assert.deepEqual((await w.add(sentAnswer('Q2', 'export.cap', 'Olivia (PM)', 'Cap the export at 900 rows', { source: LEAKY })), [w.io.fs.readText(logFile(w.id)).includes('ghp_'), w.last().said]), [false, 'Cap the export at 900 rows, the staging token is [github-token] for the test.']);
});

test('a pasted chat: each turn is its own sentence; a part is kept as the whole sentence, in the name its header gives', async () => {
  const w = await leesSession([parked('Q2', 'export.scope', 'Emma (BA)'), parked('Q3', 'export.limit', 'Emma (BA)'), parked('Q4', 'export.header', 'Olivia')]);
  await w.say(PASTE);
  await w.say('Here is the thread:\n[2026-11-20 14:02] Olivia: keep the header row, always\n[14:03] Olivia: and no BOM');
  await w.add([sentAnswer('Q2', 'export.scope', 'Emma (BA)', TURN), sentAnswer('Q3', 'export.limit', 'Emma (BA)', 'the limit is the row count without totals.'),
    sentAnswer('Q4', 'export.header', 'Olivia', 'keep the header row, always')]);
  assert.deepEqual(writtenDecisions(w.io, w.id).map(({ by, saidBy, source }) => [by, saidBy, source]),
    [['Lee', 'Emma (BA)', 'said in session'], ['Lee', 'Emma (BA)', 'said in session'], ['Lee', 'Olivia', 'said in session']]);
  assert.deepEqual(writtenDecisions(w.io, w.id).map((d) => d.said), [TURN.replace('\n', ' '), 'the limit is the row count without totals.',
    '[2026-11-20 14:02] Olivia: keep the header row, always'], 'each the whole sentence, a chat line its own');
  await w.add(sentAnswer('Q2', 'export.scope.2', 'Emma (BA)', 'the export comes off the report page only'));
  assert.equal(w.last().said, TURN.split('\n')[1], 'a part is kept as its whole sentence, never as the part');
  assert.equal(await w.refused(sentAnswer('Q2', 'export.scope.3', 'Emma (BA)', 'the export never runs')), 'said-unproven', 'words not there');
  assert.ok(!writtenDecisions(w.io, w.id).some((d) => d.by === 'ai'), 'a relay is never stored as the AI\'s record');
});

test('a teammate\'s words are theirs by format or the person\'s Allow of the host\'s prompt; anything else is the person\'s own', async () => {
  const w = await leesSession([parked('Q2', 'export.scope', 'Emma (BA)'), openAsk('Q4', 'export.header')]);
  await w.say('Emma  [2:07 PM]\nthe export comes off the report page only.\nthe header row stays\nfor the rest take your proposals\n\ncaught Emma at lunch, she says: the footer stays. I told Emma we charge 10%.');
  assert.equal((await w.add(sentAnswer('Q2', 'export.scope', 'Emma (BA)', 'the export comes off the report page only')), w.last().saidBy), 'Emma (BA)', 'the first line under her chat header: hers, no prompt');
  const [sent, rate] = [[['header', 'the header row stays'], ['footer', 'the footer stays']], [['rate', 'we charge 10%']]].map((list) => list.map(([k, said]) => sentAnswer(undefined, `export.${k}`, 'Emma (BA)', said)));
  const call = (mode, records = sent, command = `atlasbound decisionbook add ${w.id} --file ${draftsOf('s1')}${w.id}.json`) => (w.io.fs.writeAtomic(`${draftsOf('s1')}${w.id}.json`, wire(records)), handlers.preShell({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command }, cwd: ROOT, permission_mode: mode }, w.io));
  const listing = 'Record as Emma (BA)\'s words: 1) "the header row stays for the rest take your proposals" 2) "caught Emma at lunch, she says: the footer stays."  Allow = yes, Deny = no';
  assert.equal((w.io.fs.writeAtomic(`${draftsOf('s1')}new.json`, wire({ ...HEAD, records: [...DRAFT, sent[1]] })), await call('default', sent, `atlasbound decisionbook new --file ${draftsOf('s1')}new.json`)).reason, 'Record as Emma (BA)\'s words: 1) "caught Emma at lunch, she says: the footer stays."  Allow = yes, Deny = no', 'a new plan\'s too');
  assert.deepEqual(await Promise.all(['bypassPermissions', 'dontAsk', 'auto'].map(async (mode) => (await call(mode)).verdict)), ['allow', 'allow', 'allow'], 'no person to ask: never asked, never hers');
  assert.deepEqual([await call('default', sent, `cd ${ROOT}; atlasbound decisionbook add ${w.id} --file ${draftsOf('s1')}${w.id}.json 2>&1 | head -30`).then(({ context, ...ask }) => ({ ...ask, context: /send the same call again unchanged/u.test(context) })), await call('default', sent, 'ls src').then(() => call('default')).then((again) => again.verdict)], [{ verdict: 'ask', code: 'whose-unproven', reason: listing, context: true }, 'allow'], 'one prompt for the batch, each whole sentence (after a cd, its output piped too); denied: not asked again');
  assert.deepEqual((await w.say('yes, both are Emma\'s'), await w.add(sent), writtenDecisions(w.io, w.id).slice(-2).map((d) => [d.said, d.by, d.saidBy])), [['the header row stays for the rest take your proposals', 'Lee', undefined], ['caught Emma at lunch, she says: the footer stays.', 'Lee', undefined]], 'Deny, or no one to ask: the person\'s own words, whole; no reply is read, the plan goes on');
  assert.deepEqual([await call('acceptEdits', rate).then(() => w.add(rate)).then(() => writtenDecisions(w.io, w.id).at(-1).confirmed.replace(/ at \d{4}-\S+: /u, ' at <time>: ')), (await call('default', rate)).verdict, ...(await Promise.all([['show', w.id], ['show', w.id, 'decisions'], ['why', FILE], ['related', FILE], ['pr', w.id]].map(async ([verb, ...rest]) => (await verbs[verb](w.io, { rest })).text)).then((texts) => [texts.join('\n').match(/\{[a-z]\w*\}/gu), /allowed on the host's prompt at \d{4}-\S+: Record as Emma \(BA\)'s words: 1\) "I told Emma we charge 10%\."/u.test(texts[1])]))], [`allowed on the host's prompt at <time>: Record as Emma (BA)'s words: 1) "I told Emma we charge 10%."  Allow = yes, Deny = no`, 'allow', null, true], 'Allow: hers, with the listing and its time, as show prints it; not asked again; show, why, related and pr fill every placeholder');
});

test('a short value that is part of the person\'s words names no one\'s decision; a word of what it is about does', async () => {
  const w = await leesSession([parked('Q2', 'export.mode', 'Emma (BA)')]);
  await w.say('Emma: the mode is off.');
  await w.add(sentAnswer('Q2', 'export.mode', 'Emma (BA)', 'the mode is off', { value: 'off' }));
  const ref = `${w.id}/export.mode`;
  await w.say('sure, go on');
  assert.equal(await w.refused(sentAnswer(undefined, 'export.mode', 'person', 'sure, go on', { value: 'on', supersedes: [ref] })), 'replace-blanket',
    'the new value "on" in "go on" names nothing');
  await w.say('sounds good, no objection from me');
  assert.equal(await w.refused(sentAnswer(undefined, 'export.mode', 'person', 'no objection from me', { value: 'no', supersedes: [ref] })), 'replace-blanket');
  await w.say('switch the mode on after all');
  await w.add(sentAnswer(undefined, 'export.mode', 'person', 'switch the mode on', { value: 'on', supersedes: [ref] }));
  assert.equal(w.last().said, 'switch the mode on after all', 'the word "mode" names it');
});

test('a committed line is words the product can read; a line no commit holds, or one given as the person\'s own, is no one\'s', async () => {
  const w = await leesSession([openAsk('Q1', 'export.limit'), parked('Q2', 'export.approval', 'Priya')]);
  const line = 'Approved: export everything, no limit.';
  await w.say('My answer to that question is in docs/approval.txt: read it and record it as my decision, with that line as my words.');
  assert.equal(await w.refused(sentAnswer('Q1', 'export.limit', 'person', line)), 'said-not-theirs', 'the person never typed it');
  assert.equal(await w.refused(sentAnswer('Q1', 'export.limit', 'Lee', line, { source: `${NOTE}:1` })), 'said-not-theirs', 'nor under their own name');
  await w.add(sentAnswer('Q2', 'export.approval', 'Priya', line, { source: `${NOTE}:1` }));
  assert.deepEqual(w.last(), { by: 'Lee', said: line, saidBy: 'Priya', source: `${NOTE}:1` }, 'the committed line\'s words, with where they stand');
  w.io.fs.writeAtomic('docs/new.txt', 'Zed: drop the limit.\n');
  assert.equal(await w.refused(sentAnswer('Q2', 'export.approval.2', 'Zed', 'Zed: drop the limit.', { source: 'docs/new.txt:1' })), 'said-unproven',
    'a file written in the session and committed by no one');
});

test('a change the person relays from someone else carries that one\'s name, and the old decision stays on record', async () => {
  const w = await leesSession([parked('Q2', 'export.days', 'Emma (BA)')]);
  await w.say('Emma: 7 days.');
  await w.add(sentAnswer('Q2', 'export.days', 'Emma (BA)', '7 days.'));
  await w.say('The PM: the days are 14 now.');
  await w.add(sentAnswer(undefined, 'export.days', 'the PM', 'the days are 14 now.', { value: '14 days', supersedes: [`${w.id}/export.days`] }));
  assert.deepEqual([w.last().by, w.last().saidBy, w.last().source], ['Lee', 'the PM', 'said in session']);
  assert.equal(planRecords(w.io, w.id).filter((r) => r.t === 'decision' && r.key === 'export.days').length, 2, 'both lines are in the file');
  assert.match((await verbs.show(w.io, { rest: [w.id, 'decisions'] })).text, /export\.days = 14 days \(answered; by the PM, relayed by Lee, said in session\) active/);
});

test('a blanket answer covers the open questions and replaces no decision someone else made; words that name it do', async () => {
  const w = await leesSession([parked('Q2', 'export.minimum', 'Emma (BA)'), openAsk('Q3', 'export.rounding')]);
  await w.say('Emma: the minimum is a setting each shop has.');
  await w.add(sentAnswer('Q2', 'export.minimum', 'Emma (BA)', 'the minimum is a setting each shop has', { value: 'a shop setting' }));
  const ref = `${w.id}/export.minimum`;
  await w.say(`${PASTE}\n\nOlivia: the minimum is dropped. Take it out.`);
  const rest = 'Anything else you raised is fine the way you suggested';
  const over = sentAnswer('Q3', 'export.minimum', 'person', rest, { value: 'no minimum', supersedes: [ref] });
  const said = await w.add([over, sentAnswer('Q3', 'export.rounding', 'person', rest)]).then(() => '', (err) => `${err.code}: ${err.message}`);
  assert.match(said, /^replace-blanket: .*export\.minimum \(Emma \(BA\)\): the quoted words do not name this decision/, said);
  await w.add({ t: 'decision', answers: 'Q3', whose: 'person', said: rest, effect: ['check:AC-1'] });
  assert.equal(await w.refused(over), 'replace-blanket', 'in a later write too: the words already stand behind another answer');
  const taken = writtenDecisions(w.io, w.id).at(-1);
  assert.deepEqual([taken.key, taken.value, taken.by, taken.saidBy], ['export.rounding', '100', 'Lee', undefined], 'the open question takes it, the proposal as its value');
  await w.add(sentAnswer(undefined, 'export.minimum', 'Olivia', 'the minimum is dropped.', { value: 'no minimum', supersedes: [ref] }));
  assert.deepEqual([w.last().by, w.last().saidBy], ['Lee', 'Olivia'], 'words that name the decision replace it, in the name they give');
  assert.doesNotMatch((await verbs.show(w.io, { rest: [w.id, 'decisions'] })).text, /export\.rounding = 100[^\n]*\n {2}its question proposed/,
    'a proposal taken as it is shows no "its question proposed" line');
});

test('someone else\'s decision is replaced on the answer to a question that showed it, never on a blanket answer', async () => {
  const w = await leesSession([parked('Q2', 'export.header', 'Emma (BA)'), parked('Q3', 'export.footer', 'Emma (BA)'),
    parked('Q4', 'export.note', 'Emma (BA)'), openAsk('Q5', 'export.rounding')]);
  for (const [q, part, value] of [['Q2', 'header', 'bold'], ['Q3', 'footer', 'grey'], ['Q4', 'note', 'shown']]) {
    await w.say(`Emma: the ${part} is ${value}.`);
    await w.add(sentAnswer(q, `export.${part}`, 'Emma (BA)', `the ${part} is ${value}`, { value }));
  }
  const ref = (part) => `${w.id}/export.${part}`;
  const change = (q, part, said, value) => sentAnswer(q, `export.${part}`, 'person', said, { value, supersedes: [ref(part)] });
  const asks = (q, part, proposal) => w.add(openAsk(q, `export.${part}`, { supersedes: [ref(part)], proposal }));
  const why = (sent) => w.add(sent).then(() => '', (err) => `${err.code}: ${err.message}`);
  // no question showed it to the person: sent first and alone, words that do not name it still replace nothing
  await w.say('ok. The rest as you proposed.');
  assert.equal(await w.refused(change(undefined, 'header', 'ok', 'plain')), 'replace-blanket', 'unasked, on a word that names nothing');
  await asks('Q6', 'header', 'plain');
  assert.equal(await w.refused(change('Q6', 'header', 'ok', 'plain')), 'replace-blanket', 'a word typed before the question was asked');
  // asked by name twice, the person answers each time with the same short words: both stand
  await w.say('yes, change it');
  assert.equal(await w.refused({ ...change('Q6', 'header', 'yes, change it', 'plain'), supersedes: [ref('header'), ref('footer')] }), 'replace-blanket',
    'the question showed one of the two decisions');
  await w.add(change('Q6', 'header', 'yes, change it', 'plain'));
  await asks('Q7', 'footer', 'black');
  await w.say('yes, change it');
  await w.add(change('Q7', 'footer', 'yes, change it', 'black'));
  assert.deepEqual(writtenDecisions(w.io, w.id).slice(-2).map((d) => [d.key, d.value, d.by, d.supersedes]),
    [['export.header', 'plain', 'Lee', [ref('header')]], ['export.footer', 'black', 'Lee', [ref('footer')]]], 'the same words, a message each');
  // one bad record and two good ones in a call: only the bad one is named
  await asks('Q8', 'note', 'hidden');
  await w.say('Fine. Do the rest the way you suggested.');
  const rest = sentAnswer('Q5', 'export.rounding', 'person', 'Do the rest the way you suggested');
  const good = sentAnswer(undefined, 'export.extra', 'person', 'Do the rest the way you suggested', { value: 'as proposed' });
  const named = await why([rest, change(undefined, 'note', 'Fine', 'hidden'), good]);
  assert.match(named, /^replace-blanket: .*export\.note \(Emma \(BA\)\): the quoted words do not name this decision/);
  assert.ok(named.includes(': nothing written: record 2 of 3: ') && !/record [13] of 3/.test(named), named);
  // one message answers the question about her decision and the others: both stand
  await w.add([change('Q8', 'note', 'Fine', 'hidden'), rest]);
  assert.deepEqual(writtenDecisions(w.io, w.id).slice(-2).map((d) => [d.key, d.value, d.said]),
    [['export.note', 'hidden', 'Fine.'], ['export.rounding', 'as they said', 'Do the rest the way you suggested.']], 'each kept as its whole sentence');
  // two questions that each showed a decision of hers, answered in one message: both are replaced on it
  await w.say('Emma: the title is long.');
  await w.add(sentAnswer(undefined, 'export.title', 'Emma (BA)', 'the title is long', { value: 'long' }));
  await w.say('Emma: the legend is on.');
  await w.add(sentAnswer(undefined, 'export.legend', 'Emma (BA)', 'the legend is on', { value: 'on' }));
  await asks('Q9', 'title', 'short');
  await asks('Q10', 'legend', 'off');
  await w.say('Yes to both, change them.');
  await w.add([change('Q9', 'title', 'Yes to both, change them.', 'short'), change('Q10', 'legend', 'Yes to both, change them.', 'off')]);
  assert.deepEqual(writtenDecisions(w.io, w.id).slice(-2).map((d) => [d.key, d.value, d.by]), [['export.title', 'short', 'Lee'], ['export.legend', 'off', 'Lee']]);
});

test('an answer with no value on a question that proposed nothing is refused for that, and says what to add', async () => {
  const w = await leesSession([openAsk('Q1', 'export.limit', { proposal: undefined })]);
  await w.say('Whatever you think is best.');
  const said = await w.add({ t: 'decision', answers: 'Q1', whose: 'person', said: 'Whatever you think is best.', effect: ['check:AC-1'] })
    .then(() => '', (err) => `${err.code}: ${err.message}`);
  assert.match(said, /^answer-no-value: answer-no-value: nothing written: Q1: an answer with no "value" takes its question's proposal as it is, and this question proposed nothing: add "value"/, said);
  assert.doesNotMatch(said, /record-invalid|is not str/);
});

test('a question the person put off is recorded as put off, no word list decides: it stays open, and readers say so', async () => {
  const w = await leesSession();
  await w.say('Yes, as a todo.');
  assert.equal(await w.refused({ t: 'later', answers: 'Q1', said: 'Sure, later.' }), 'later-not-said', 'words they did not type put nothing off');
  const why = await w.add({ t: 'later', answers: 'Q1', said: 'as a todo, I think' }).then(() => '', (err) => err.message);
  assert.match(why, /^later-not-said: .*if they have not said so, ask them$/, 'the refusal says the way on');
  assert.equal(await w.refused({ t: 'later', answers: 'Q9', said: 'Yes, as a todo.' }), 'later-unasked');
  await w.add({ t: 'later', answers: 'Q1', said: 'as a todo' }); // a part: kept as the whole sentence
  assert.deepEqual(planRecords(w.io, w.id).filter((r) => r.t === 'later').map((r) => [r.answers, r.by, r.said]), [['Q1', 'Lee', 'Yes, as a todo.']]);
  assert.deepEqual(writtenDecisions(w.io, w.id), [], 'nothing is decided');
  const open = '- Q1 OPEN: What holds for export.limit? (put off by Lee: "Yes, as a todo."; it stays open)';
  assert.ok((await verbs.show(w.io, { rest: [w.id, 'questions'] })).text.includes(open), 'show says who put it off, in which words');
  const off = '(put off by Lee: "Yes, as a todo."; it stays open)';
  for (const verb of ['inbox', 'resume']) assert.ok((await verbs[verb](w.io, { rest: [] })).text.includes(off), `${verb} says it too`);
  assert.match((await verbs.show(w.io, { rest: [w.id] })).text, new RegExp(`^${w.id} draft `), 'the plan waits for the answer as before');
  // sentences that hold the same words and decide are decisions like any other
  const DECIDE = ['Add a TODO comment in the code for the real limit and cap it at 100 for now.', 'Doing it later in the sprint is fine, use 7 days.',
    'Not sure about the name, but the limit is 100.'];
  for (const said of DECIDE) {
    const own = await leesSession();
    await own.say('Hm, as a todo.');
    await own.add({ t: 'later', answers: 'Q1', said: 'Hm, as a todo.' });
    await own.say(said);
    await own.add({ t: 'decision', answers: 'Q1', value: 'as they said', whose: 'person', said, effect: ['check:AC-1'] });
    assert.deepEqual([own.last().by, own.last().said], ['Lee', said]);
    assert.match((await verbs.show(own.io, { rest: [own.id, 'questions'] })).text, /^- Q1 answered: What holds for export\.limit\?$/m, 'their answer ends the put-off');
  }
});
