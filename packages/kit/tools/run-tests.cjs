#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// dev only, never shipped: the ONE way the packages' tests run. `unit [name...]`: the unit files of the named packages
// but the slow-listed ones, for the commit hook (a name that is no package means every package); `all`: every test file, for check.
// Both at --test-concurrency=10, --test-timeout=120000. Then, at a normal load (at most 2 per CPU), every file is held to its time budget
// (unit 1 s, other 10 s, × load/CPUs): a slower file is red unless owners.json `slow` names it (that list only shrinks).
// `all` also holds each package's real-bin spawns (kit/testing/fake-io.cjs countSpawn) to its caps.spawns. A time the reporter does not
// give is said, never counted as fast; a run ended by a signal or without the reporter's summary is red. A file owners.json `alone`
// names runs after the rest, one at a time. KIT_TEST_TIME=said
// (test-time.cjs), set only by the release's own check, judges no time; any other value is refused.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, loadPackages } = require('./packages.cjs');
const { SPAWNS_VAR } = require('../testing/fake-io.cjs');
const { TIME_VAR, TIME_SAID, timesOf, timeVerdict } = require('./test-time.cjs');

const TOPS = { unit: ['test/unit'], all: ['test', 'test/unit', 'contract'] };

const suiteFiles = (dir, top) => {
  const at = path.join(dir, top);
  return fs.existsSync(at) ? fs.readdirSync(at).filter((n) => n.endsWith('.test.cjs')).sort().map((n) => path.join(at, n)) : [];
};

function chosen(tier, names) {
  const all = loadPackages(ROOT);
  const named = names.length && names.every((n) => all.some((p) => p.name === n));
  const kept = (p, file) => tier === 'all' || !(p.owners.slow || []).includes(path.relative(p.dir, file)); // the hook leaves a slow file to check
  return (named ? all.filter((p) => names.includes(p.name)) : all)
    .map((p) => ({ ...p, files: TOPS[tier].flatMap((top) => suiteFiles(p.dir, top)).filter((f) => kept(p, f)) }));
}

const loadFactor = () => Math.max(1, os.loadavg()[0] / os.cpus().length);

function spawnErrors(packages, spawnsFile) {
  const lines = fs.existsSync(spawnsFile) ? fs.readFileSync(spawnsFile, 'utf8').split('\n').filter(Boolean) : [];
  const counts = new Map(packages.map((p) => [p.name, lines.filter((file) => fs.realpathSync(file).startsWith(`${fs.realpathSync(p.dir)}${path.sep}`)).length]));
  process.stdout.write(`tests: real-bin spawns ${[...counts].map(([name, n]) => `${name} ${n}`).join(', ')}\n`);
  return packages.flatMap((p) => {
    const n = counts.get(p.name);
    const cap = p.owners.caps.spawns;
    if (cap === undefined) return n ? [`${p.name}: ${n} real-bin spawns and no caps.spawns in its owners.json: give it a ceiling with a why`] : [];
    return n > cap ? [`${p.name}: ${n} real-bin spawns > caps.spawns ${cap}: share one world per file, or raise it with a why`] : [];
  });
}

function report(ms, factor) {
  if (!ms.size) return process.stdout.write('tests: no per-file time from the reporter: the time budget was not measured\n');
  const top = [...ms].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([file, took]) => `${path.relative(ROOT, file)} ${(took / 1000).toFixed(1)} s`);
  return process.stdout.write(`tests: ${ms.size} files timed, load factor ${factor.toFixed(2)}; slowest: ${top.join(', ')}\n`);
}

function runTests([tier = 'all', ...names]) {
  if (!TOPS[tier]) {
    process.stderr.write(`run-tests: unknown tier ${tier}; use unit or all\n`);
    process.exit(2);
  }
  const time = process.env[TIME_VAR];
  if (time !== undefined && time !== TIME_SAID) {
    process.stderr.write(`run-tests: ${TIME_VAR} is ${TIME_SAID} or unset, never ${JSON.stringify(time)}\n`);
    process.exit(2);
  }
  const packages = chosen(tier, names);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-tests-'));
  const spawnsFile = path.join(tmp, 'spawns');
  const before = loadFactor();
  const files = packages.flatMap((p) => p.files);
  if (!files.length) return process.stdout.write(`tests: no test file in ${[tier, ...names].join(' ')}\n`); // node --test with none runs every test under cwd
  // a file owners.json `alone` names measures wall-clock time: it runs after the others, one file at a time, so it waits for
  // no core our own tests hold
  const alone = packages.flatMap((p) => p.files.filter((f) => (p.owners.alone || []).includes(path.relative(p.dir, f))));
  const runs = [[files.filter((f) => !alone.includes(f)), 10], [alone, 1]].filter(([some]) => some.length).map(([some, at], i) => {
    const junitFile = path.join(tmp, `junit-${i}.xml`);
    const reporters = ['--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=junit', `--test-reporter-destination=${junitFile}`];
    const res = spawnSync(process.execPath, ['--test', `--test-concurrency=${at}`, '--test-timeout=120000', ...reporters, ...some], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, [SPAWNS_VAR]: spawnsFile } });
    return { res, junit: fs.existsSync(junitFile) ? fs.readFileSync(junitFile, 'utf8') : '' };
  });
  const factor = Math.max(before, loadFactor());
  const ms = new Map(runs.flatMap(({ junit }) => [...timesOf(junit)]));
  report(ms, factor);
  const count = (key) => runs.reduce((n, { junit }) => n + Number((junit.match(new RegExp(`<!-- ${key} (\\d+) -->`)) || [0, 0])[1]), 0);
  process.stdout.write(`tests: ${count('tests')} run, ${count('pass')} passed, ${count('fail')} failed, ${count('skipped')} skipped; ${alone.length} file(s) alone after the rest\n`);
  // a run ended by a signal, or one whose reporter wrote no summary, finished no test that can be counted: never green
  const ended = runs.filter(({ res }) => res.status === null).map(({ res }) => `the test run was ended by ${res.signal || 'an error'} before it finished`);
  const summary = runs.every(({ junit }) => junit.includes('</testsuites>')) ? [] : ['the test run left no summary (junit): no test result can be counted'];
  // above a normal load, a file's time says more about the machine than the test: said, not judged
  const timed = timeVerdict(packages, ms, factor, time === TIME_SAID);
  timed.lines.forEach((line) => process.stdout.write(`${line}\n`));
  const errors = [...ended, ...summary, ...timed.errors, ...(tier === 'all' ? spawnErrors(packages, spawnsFile) : [])];
  fs.rmSync(tmp, { recursive: true, force: true });
  if (errors.length) process.stderr.write(`tests FAILED:\n  ${errors.join('\n  ')}\n`);
  process.exit(runs.map(({ res }) => res.status).find((status) => status) || (errors.length ? 1 : 0));
}

runTests(process.argv.slice(2));
