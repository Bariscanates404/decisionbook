// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// What a first run says in a world of every open package and nothing else, through the real bin: nothing of an add-on (no module line, no package
// name, nothing lost, no install hint; a module only an add-on has is unknown like any other word), and a file of the person's
// own where a command of ours would go is kept and is no fault of the wiring.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, makeRepo, run, exitSaid, setupRepo } = require('./support.cjs');

const world = makeWorld({ real: ['handoff'] });
// what the open package must never say where no add-on is installed: a word of one, a package that is not here, a place to install from
const ADD_ON = /add-on|not installed: (?!none$)|not installed$|@atlasbound\//im;

test('setup, status, modules and doctor say nothing of an add-on that is not installed', () => {
  const repo = makeRepo();
  const said = [['setup'], ['status'], ['modules'], ['doctor'], ['debug', 'doctor']].map((words) => {
    const res = run(world.bin, [...words, '--target', repo], { plain: true });
    assert.equal(res.code, 0, exitSaid(res, words.join(' ')));
    return res.out.replaceAll(repo, '<repo>').replaceAll(world.dir, '<install>');
  });
  said.forEach((out) => assert.doesNotMatch(out, ADD_ON));
  assert.match(said[0], /^ {2}modules on: handoff, decisionbook \(atlasbound modules lists them\)$/m);
  assert.match(said[1], /^not installed: none\n {2}module handoff: on\n {2}module decisionbook: on\n$/m);
  assert.deepEqual(said[2].split('\n').slice(1, 3).map((line) => line.trim().split(/\s+/)[0]), ['handoff', 'decisionbook'], 'modules: one row each');
  assert.deepEqual(said[3].split('\n').slice(1, 3), ['  module handoff: on', '  module decisionbook: on'], 'doctor opens with the modules that are here');
  assert.deepEqual(JSON.parse(said[4]).modules.map((m) => m.name), ['handoff', 'decisionbook']);
});

test('the ignore block leaves to git only paths a wired package declares its team commits; with none, nothing of the store', () => {
  const block = (repo) => fs.readFileSync(path.join(repo, '.gitignore'), 'utf8').split('\n').filter((line) => /^!?\.atlasbound/.test(line));
  assert.deepEqual(block(setupRepo(world).repo), ['.atlasbound/*']);
  const toy = makeWorld({ real: ['handoff'], fakes: { notebook: { manifest: { teamFiles: ['.atlasbound/notebook'] } } } });
  const { repo } = setupRepo(toy);
  assert.deepEqual(block(repo), ['.atlasbound/*', '!.atlasbound/notebook']);
  fs.mkdirSync(path.join(repo, '.atlasbound', 'notebook'));
  fs.writeFileSync(path.join(repo, '.atlasbound', 'notebook', 'page.md'), 'ours\n');
  const gone = run(toy.bin, ['uninstall', '--purge', '--target', repo]);
  assert.equal(gone.code, 0, gone.err);
  assert.match(gone.out, /kept \.atlasbound\/notebook: the team's file, setup did not write it/);
  assert.equal(fs.readFileSync(path.join(repo, '.atlasbound', 'notebook', 'page.md'), 'utf8'), 'ours\n');
});

test('a module only an add-on has is unknown here, in the words any unknown module gets, and nothing is written', () => {
  const repo = makeRepo();
  assert.equal(run(world.bin, ['setup', '--target', repo]).code, 0);
  const state = () => fs.readFileSync(path.join(repo, '.atlasbound', 'cli', 'installed.json'), 'utf8');
  const before = state();
  const on = run(world.bin, ['modules', 'on', 'extra', '--target', repo]);
  const withIt = run(world.bin, ['setup', '--with', 'extra', '--target', repo]);
  assert.equal(on.code, 1);
  assert.match(on.err, /^atlasbound: module-refused: no module is called extra; the modules are handoff or decisionbook /);
  assert.equal(on.err, withIt.err, 'one sentence for both ways of asking');
  assert.equal(on.err, run(world.bin, ['modules', 'on', 'nope', '--target', repo]).err.replace('nope', 'extra'), 'as any unknown module');
  assert.equal(state(), before);
  assert.doesNotMatch(run(world.bin, ['help', '--all']).out, ADD_ON);
});

test('a command file of the person\'s own stops setup before it writes anything; moved away, setup wires and doctor is clean', () => {
  const repo = makeRepo({ '.claude/commands/resume-handoff.md': 'my own resume\n' });
  const setup = run(world.bin, ['setup', '--target', repo]);
  assert.equal(setup.code, 1);
  assert.match(setup.err, /^atlasbound: file-foreign: \.claude\/commands\/resume-handoff\.md \(a file of yours .* so setup wrote nothing at all/m);
  assert.equal(fs.readFileSync(path.join(repo, '.claude', 'commands', 'resume-handoff.md'), 'utf8'), 'my own resume\n');
  assert.deepEqual(fs.readdirSync(path.join(repo, '.claude', 'commands')), ['resume-handoff.md'], 'no command of ours beside it');
  fs.renameSync(path.join(repo, '.claude', 'commands', 'resume-handoff.md'), path.join(repo, '.claude', 'commands', 'my-resume.md'));
  assert.equal(run(world.bin, ['setup', '--target', repo]).code, 0);
  assert.doesNotMatch(run(world.bin, ['doctor', '--target', repo]).out, /NOT wired|^fix: /m);
});

test('the person\'s own resume.md, the name of a command the host has itself, is never touched and never named', () => {
  const repo = makeRepo({ '.claude/commands/resume.md': 'my own resume\n' });
  const setup = run(world.bin, ['setup', '--target', repo]);
  assert.equal(setup.code, 0, exitSaid(setup, 'setup'));
  const doctor = run(world.bin, ['doctor', '--target', repo]);
  assert.equal(doctor.code, 0, exitSaid(doctor, 'doctor'));
  assert.doesNotMatch(`${setup.out}${doctor.out}`, /commands\/resume\.md|your own file|file-foreign/);
  assert.ok(fs.existsSync(path.join(repo, '.claude', 'commands', 'resume-handoff.md')), 'ours is written beside it, under its own name');
  assert.equal(run(world.bin, ['uninstall', '--target', repo]).code, 0);
  assert.equal(fs.readFileSync(path.join(repo, '.claude', 'commands', 'resume.md'), 'utf8'), 'my own resume\n');
  assert.equal(fs.existsSync(path.join(repo, '.claude', 'commands', 'resume-handoff.md')), false);
});

test('hook rows a 0.25.0 setup wrote are drift: doctor names atlasbound update, and update wires this version\'s rows', () => {
  const repo = makeRepo();
  assert.equal(run(world.bin, ['setup', '--target', repo]).code, 0);
  const file = path.join(repo, '.claude', 'settings.local.json');
  const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  // 0.25.0's row form: `[ -x node ] && [ -f bin ] && exec <node> <bin> hook <event>; echo '<gone>'`, from this row's own parts
  const old = (command) => command.replace(/^if (\[ -x "[^"]+" \] && \[ -f "[^"]+" \]); then (exec [^;]+); elif .*; else (echo '[^']*'); fi$/,
    '$1 && $2; $3');
  const rows = Object.values(settings.hooks).flatMap((list) => list.flatMap((entry) => entry.hooks));
  rows.forEach((row) => { row.command = old(row.command); });
  assert.ok(rows.length && rows.every((row) => !row.command.startsWith('if ')), 'every row in the 0.25.0 form');
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  const drifted = run(world.bin, ['doctor', '--target', repo]);
  assert.match(drifted.out, /^ {2}decisionbook +installed +NOT wired /m, drifted.out);
  assert.match(drifted.out, /^fix: atlasbound update \(it wires this repository for the installed version; atlasbound setup where it was never set up\)$/m, drifted.out);
  assert.equal(run(world.bin, ['update', '--target', repo]).code, 0);
  assert.doesNotMatch(run(world.bin, ['doctor', '--target', repo]).out, /NOT wired|not wired|^fix: /m);
});
