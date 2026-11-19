// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// An extra module is its own package and nothing else: no file of the cli changes. A toy package brings its module row in its manifest
// (`module`) beside a verb, a hook and an answer; the cli lists it, routes it and wires it only when a person names it, says which
// package is missing when a second one of the row is not here, and knows nothing of it once the package that brings the row is gone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, writeFake, makeRepo, run, readSettings, traceRows } = require('./support.cjs');

const TOY_ROW = { name: 'toy', title: 'a toy module', packages: ['toy', 'toy-two'], what: 'atlasbound toy', loses: 'you lose the toy verb',
  words: ['toy', 'second'] };
const TOY = {
  manifest: { module: TOY_ROW, verbs: [{ words: ['toy'], call: 'hello', noWords: true, what: 'say hello from the toy module' }],
    hooks: [{ event: 'SessionStart', matcher: null, handler: 'start', timeout: 10 }], provides: { toyWord: 'word' } },
  body: '{ hello: () => ({ out: { hi: 1 }, text: "toy says hi\\n" }), handlers: { start: () => ({}) }, word: "toy" }',
};
const hooksOf = (repo) => JSON.stringify(readSettings(repo).hooks.SessionStart ?? []);

test('a toy module is listed, routed and wired from the row its own package brings, and only when a person names it', () => {
  const world = makeWorld({ own: true });
  writeFake(world.dir, 'toy', TOY);
  const repo = makeRepo();
  assert.match(run(world.bin, ['help', '--all']).out, /atlasbound toy +say hello from the toy module/);
  const plain = run(world.bin, ['setup', '--target', repo], { plain: true });
  assert.equal(plain.code, 0, plain.err);
  assert.match(plain.out, /^ {2}toy is installed and not wired: a plain setup leaves it off; atlasbound setup --with toy wires it$/m);
  assert.doesNotMatch(hooksOf(repo), /toy/, 'a plain setup wires no module an add-on brings');
  assert.equal(run(world.bin, ['toy', '--target', repo]).out, 'atlasbound toy: module toy: off (by choice): you lose the toy verb; atlasbound modules on toy turns it back on\n');
  assert.equal(run(world.bin, ['setup', '--with', 'toy', '--target', repo]).code, 0);
  assert.match(hooksOf(repo), /hook SessionStart/, 'named, its hook row is wired');
  const said = run(world.bin, ['toy', '--target', repo]);
  assert.equal(said.code, 0, said.err);
  assert.equal(said.out, 'toy says hi\n');
  assert.match(run(world.bin, ['modules', '--target', repo]).out, /^ {2}toy +on +a toy module$/m);
  const view = JSON.parse(run(world.bin, ['debug', 'doctor', '--target', repo]).out);
  assert.ok(view.capabilities.some((c) => c.what === 'answer toyWord' && c.state === 'answers'), 'its answer is promised and answers');
  // a verb of the row whose package is not here names the module and the missing package, in the row's own words
  const second = run(world.bin, ['second', '--target', repo]);
  assert.equal(second.code, 1);
  assert.match(second.err, /^atlasbound: package-not-installed: toy-two: module toy, second: you lose the toy verb \(/);
  // the package that brings the row gone, nothing of the module is left: no line, no verb, no name
  fs.rmSync(path.join(world.dir, 'node_modules', '@atlasbound', 'toy'), { recursive: true });
  assert.match(run(world.bin, ['toy', '--target', repo]).err, /^atlasbound: verb-unknown: toy /);
  assert.match(run(world.bin, ['second', '--target', repo]).err, /^atlasbound: verb-unknown: second /);
  assert.doesNotMatch(run(world.bin, ['help', '--all']).out, /atlasbound toy/);
  assert.doesNotMatch(run(world.bin, ['modules', '--target', repo]).out, /toy/);
  assert.match(run(world.bin, ['setup', '--with', 'toy', '--target', repo]).err, /^atlasbound: module-refused: no module is called toy; the modules are handoff or decisionbook /);
});

test('a row that takes a name the open data holds, or does not read, is left out and doctor names the package that brought it', () => {
  const world = makeWorld({ own: true });
  writeFake(world.dir, 'thief', { manifest: { module: { ...TOY_ROW, name: 'thief', packages: ['thief', 'decisionbook'] } } });
  writeFake(world.dir, 'torn', { manifest: { module: { name: 'torn', packages: 'torn' } } });
  const repo = makeRepo();
  assert.equal(run(world.bin, ['setup', '--target', repo]).code, 0);
  assert.doesNotMatch(run(world.bin, ['modules', '--target', repo]).out, /thief|torn/);
  const doctor = run(world.bin, ['doctor', '--target', repo]);
  assert.equal(doctor.code, 1);
  assert.match(doctor.out, /^ {2}manifest-invalid @atlasbound\/thief: module$/m);
  assert.match(doctor.out, /^ {2}manifest-invalid @atlasbound\/torn: module$/m);
  assert.match(doctor.out, /^ {2}module decisionbook: on$/m, 'the open module it reached for is untouched');
});

test('a package verb\'s cli.verb row counts the characters sent, argv and the JSON on stdin, and the ones printed back', () => {
  const world = makeWorld({ own: true });
  writeFake(world.dir, 'toy', { manifest: { verbs: [{ words: ['toy'], call: 'echo', stdin: 0, what: 'print back the JSON on standard input' }] },
    body: '{ echo: (io, args) => ({ out: { got: args.rest[0] }, text: "toy got " + args.rest[0] + "\\n" }) }' });
  const repo = makeRepo();
  assert.equal(run(world.bin, ['setup', '--target', repo]).code, 0); // the worlds' setup names each module an add-on brings
  const json = '{"a":[1,2,3]}';
  const sizes = (argv) => {
    const said = run(world.bin, argv, { input: `${json}\n` });
    assert.equal(said.code, 0, said.err);
    return [traceRows(repo).findLast((r) => r.step === 'cli.verb').n, { inChars: `${argv.join(' ')} ${json}`.length, outChars: said.out.length }];
  };
  const [plain, plainSent] = sizes(['toy', '--target', repo]);
  assert.deepEqual(plain, plainSent);
  assert.equal(plain.outChars, `toy got ${json}\n`.length);
  const [asJson, jsonSent] = sizes(['toy', '--json', '--target', repo]);
  assert.deepEqual(asJson, jsonSent, 'with --json the characters printed are the JSON\'s');
});
