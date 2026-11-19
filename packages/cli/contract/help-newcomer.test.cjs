// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The help a newcomer reads, through the real bin of the open package, no line past 100 columns: what the product is, USAGE and the
// first steps on top, the commands in short (the person's own named), the flags, examples; help --all every command in three groups with
// the person's own marked; each command's help says its USAGE, when, an example, what it changes, its flags, who may run it and its exit
// codes; a version verb; a command typed wrong exits 2 with its usage line and the nearest verb; with --json a refusal is JSON too.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, makeRepo, run, runAll, tmp, writeFiles } = require('./support.cjs');

const OPEN = new Set([undefined, 'telemetry', 'handoff', 'decisionbook']);
const helpWorld = () => makeWorld({ product: '9.8.7', real: ['handoff'] });

const wide = (text) => text.split('\n').filter((line) => line.length > 100 && !line.startsWith('  $ ')); // an example is one command, kept whole

test('atlasbound --help: USAGE and first steps on top, the person\'s own named, flags, examples; help --all every command', () => {
  const said = run(helpWorld().bin, ['--help']).out;
  const at = (text) => said.indexOf(text);
  assert.match(said, /^AtlasBound 9\.8\.7: /);
  assert.match(said, /^USAGE\n {2}atlasbound <command> \[flags\]$/m);
  assert.match(said, /^GET STARTED .*\n {2}setup +.*\n {2}protect +.*\n {2}doctor +.*\n {2}then restart your AI session/m);
  for (const slash of ['/decisionbook', '/decide', '/handoff', '/resume-handoff']) assert.ok(said.includes(slash), slash);
  assert.ok(at('GET STARTED') < at('ONLY YOU') && at('ONLY YOU') < at('FLAGS') && at('FLAGS') < at('EXAMPLES'));
  const table = JSON.parse(run(helpWorld().bin, ['help', '--json']).out);
  const mine = said.slice(at('ONLY YOU'), said.indexOf('\n\n', at('ONLY YOU'))).replace(/\s+/g, ' ');
  for (const row of table.filter((r) => r.by === 'person')) assert.ok(mine.includes(row.words.at(-1)), row.words.join(' '));
  assert.match(said, /^ {2}\$ atlasbound setup$/m);
  const flags = said.split('\nFLAGS\n')[1].split('\n\n')[0].split('\n').map((line) => line.trim().split(/ {2,}/)[0]);
  assert.deepEqual(flags, ['-h, --help', '-V, --version', '--target <dir>', '--json', '--all'], 'the flags a refusal names with no command');
  const all = run(helpWorld().bin, ['help', '--all']).out;
  for (const row of table.filter((r) => r.by === 'person')) {
    assert.match(all, new RegExp(`atlasbound ${row.words.join(' ')} [^]*?\\((--none: )?you only\\)`), row.words.join(' '));
  }
  assert.ok(all.indexOf('you run these') < all.indexOf('your AI session runs these'));
  assert.deepEqual([...wide(said), ...wide(all)], [], 'no line past 100 columns');
});

test('every command of the open package explains itself: usage, when, an example, what it changes, who, flags and exit codes', async () => {
  const every = JSON.parse(run(helpWorld().bin, ['help', '--json']).out).filter((row) => OPEN.has(row.pkg));
  assert.deepEqual(every.filter((row) => !row.help).map((row) => row.words.join(' ')), [], 'every row has its help');
  const wordless = (row) => row.noWords || !(row.run || row.call) || row.help.usage !== undefined;
  assert.deepEqual(every.filter((row) => !wordless(row)).map((row) => row.words.join(' ')), [], 'a row that takes words says them as data');
  const table = every.filter((row) => row.words[0] !== 'help'); // `help --help` is the whole help
  const repo = makeRepo();
  const answers = await runAll(helpWorld().bin, table.map((row) => ({ args: [...row.words, '--help'], cwd: repo })));
  table.forEach((row, i) => {
    const out = answers[i].out;
    assert.match(out, new RegExp(`^USAGE\\n {2}atlasbound ${row.words.join(' ')}\\b.*\\[flags\\]`, 'm'), row.words.join(' '));
    for (const part of ['\nWHEN\n', '\nEXAMPLE\n  $ atlasbound ', '\nCHANGES\n', '\nWHO\n', '\nFLAGS\n', '--target <dir>', '\nEXIT\n']) {
      assert.ok(out.includes(part), `${row.words.join(' ')} --help says ${part}`);
    }
    if (row.by === 'person') assert.match(out.replace(/\s+/g, ' '), /WHO .*only you, at your own terminal/, row.words.join(' '));
    (row.flags || []).forEach((flag) => assert.match(out, new RegExp(`^ {2}${flag}\\b`, 'm'), `${row.words.join(' ')} names ${flag}`));
    assert.deepEqual(wide(out), [], `${row.words.join(' ')} --help within 100 columns`);
  });
});

test('atlasbound version is --version and -V; a mistyped command exits 2 with the nearest one and where every one is listed', () => {
  assert.deepEqual([run(helpWorld().bin, ['version']).out, run(helpWorld().bin, ['-V']).out], ['9.8.7\n', '9.8.7\n']);
  const typo = run(helpWorld().bin, ['setpu']);
  assert.equal(typo.code, 2);
  assert.equal(typo.err, 'atlasbound: verb-unknown: setpu (no such verb)\n  did you mean: atlasbound setup\n  atlasbound help lists every command\n');
  assert.doesNotMatch(run(helpWorld().bin, ['zzzzzz']).err, /did you mean/, 'nothing near: no guess');
  assert.match(run(helpWorld().bin, ['upgrade']).err, /^ {2}did you mean: atlasbound update$/m, 'another word for a verb names it');
});

test('a word or flag a command does not take exits 2 with its usage line, in a group its nearest command; nothing is ignored', () => {
  const ab = (...args) => run(helpWorld().bin, [...args, '--target', makeRepo()]);
  const usage = (verb) => `  usage: atlasbound ${verb} [flags]\n  atlasbound ${verb} --help says what it takes\n`;
  const said = [ab('status', 'extra'), ab('status', '--frob'), ab('modules', 'frob'), ab('telemetry', 'stauts'), ab('--frob')];
  assert.deepEqual(said.map((r) => r.code), [2, 2, 2, 2, 2], said.map((r) => r.err).join(''));
  assert.equal(said[0].err, `atlasbound: args-invalid: status takes no word: extra (the arguments of this verb have the wrong shape)\n${usage('status')}`);
  assert.ok(said[1].err.startsWith('atlasbound: flag-unknown: --frob on status; ') && said[1].err.endsWith(`\n${usage('status')}`), said[1].err);
  assert.equal(said[2].err, 'atlasbound: verb-unknown: modules frob (no such verb)\n  atlasbound modules --help lists its commands\n');
  assert.match(said[3].err, /^ {2}did you mean: atlasbound telemetry status$/m);
  assert.match(said[4].err, /^atlasbound: flag-unknown: --frob; with no command AtlasBound takes --help, --version, --target <dir>, --json and --all /);
  assert.match(ab('modules', 'on', 'banana').err, /the modules are handoff or decisionbook \(/, 'the short alias is not offered');
  const gone = run(helpWorld().bin, ['status', '--target', `${tmp('cli-gone-')}/nope`]);
  assert.match(gone.err, /^atlasbound: target-missing: .*nope \(no folder is there/, 'a folder that is not there is said so');
});

test('a package\'s debug command takes no word and related needs a path or words: each exits 2 with its usage, nothing guessed', () => {
  const repo = makeRepo();
  const ab = (...args) => run(helpWorld().bin, [...args, '--target', repo]);
  for (const verb of [['debug', 'handoff'], ['debug', 'decisionbook'], ['debug', 'resume'], ['debug', 'telemetry']]) {
    const res = ab(...verb, 'extra');
    assert.deepEqual([res.code, res.err.split('\n').slice(0, 2)], [2, [`atlasbound: args-invalid: ${verb.join(' ')} takes no word: extra (the arguments`
      + ' of this verb have the wrong shape)', `  usage: atlasbound ${verb.join(' ')} [flags]`]], res.err);
  }
  const bare = ab('decisionbook', 'related');
  assert.deepEqual([bare.code, bare.err.split('\n').slice(0, 2)], [2, ['atlasbound: args-invalid: decisionbook related takes a path or words (the'
    + ' arguments of this verb have the wrong shape)', '  usage: atlasbound decisionbook related <path|words> [flags]']], bare.err);
});

test('a draft that does not read says where it broke and the usage of its verb; the draft stays to be fixed', () => {
  const repo = makeRepo();
  writeFiles(repo, { '.atlasbound/drafts/new.json': '{"title": }' });
  const broken = run(helpWorld().bin, ['decisionbook', 'new', '--file', path.join(repo, '.atlasbound/drafts/new.json'), '--target', repo]);
  assert.equal(broken.code, 1, broken.err);
  assert.match(broken.err, /^atlasbound: record-invalid: SyntaxError\n {2}the JSON breaks at line 1, column 11\n {2}usage: atlasbound decisionbook new --file <draft> \| <record> \[flags\]$/m);
  assert.ok(fs.existsSync(path.join(repo, '.atlasbound/drafts/new.json')), 'kept, to fix with the Edit tool');
});

test('with --json a refusal is one JSON object on stdout: code, message, next; a broken JSON word says where, and its usage', () => {
  const world = helpWorld();
  const typo = run(world.bin, ['frobnicate', '--json']);
  assert.deepEqual([typo.code, JSON.parse(typo.out)], [2, { error: { code: 'verb-unknown', message: 'frobnicate (no such verb)',
    next: ['atlasbound help lists every command'] } }]);
  assert.match(typo.err, /^atlasbound: verb-unknown: frobnicate/, 'stderr still says it to a person');
  const repo = makeRepo();
  const broken = run(world.bin, ['decisionbook', 'new', '{"title": }', '--target', repo]);
  assert.match(broken.err, /^atlasbound: record-invalid: SyntaxError\n {2}the JSON breaks at line 1, column 11\n {2}usage: atlasbound decisionbook new /);
  const none = JSON.parse(run(world.bin, ['handoff', 'keep', '--json', '--target', repo], { input: '  ', env: { CLAUDE_CODE_SESSION_ID: 's1' } }).out);
  assert.deepEqual(none.error.next, ['no JSON was given', 'usage: atlasbound handoff keep --file <draft> [flags]',
    'atlasbound handoff keep --help says what it takes', 'a reply: {"now":"<text>","next":["<text>"],"kept":["<text>"],"drop":[{"k":1,"why":"<text>"}]}']);
});

test('a record of the wrong shape names its field and shows that kind\'s record, each field a placeholder of its type', () => {
  const repo = makeRepo();
  const ab = (...args) => run(helpWorld().bin, [...args, '--target', repo]);
  const id = ab('decisionbook', 'new', JSON.stringify({ title: 'Round once', why: 'off', success: 'ok', kind: 'bug', level: 'micro' })).out.split(' ')[0];
  const bad = ab('decisionbook', 'add', id, JSON.stringify([{ t: 'decision', key: 'a.b' }, { t: 'item', kind: 'step', order: 1 }]));
  assert.match(bad.err, /^atlasbound: record-invalid: nothing written: record 1 of 2: decision\.value is not str, /);
  assert.ok(bad.err.includes('\n  a decision record: {"t":"decision","key":"<word>","value":"<text>","why":"<text>","by":"<text>"} (optional: '), bad.err);
  assert.match(bad.err, /\n {2}a step record: \{"t":"item","kind":"step","order":1,"file":"<text>","change":"<text>","verify":"<text>"\}/);
});
