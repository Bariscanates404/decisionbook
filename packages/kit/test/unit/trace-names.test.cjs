// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// a two-way lock over the real tree. Every steps/ and run/ file of a package
// writes records under its own name: a step of its package is the file's name, or starts with it and a `.` or `-`.
// Or its owners.json `traceAs` says in one line under which records its work shows. A file with its name may still say so for the part that runs
// outside its step (a fresh run measures that; this lock cannot). A reason for no file, or an empty one, is stale.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPackages } = require('../../tools/packages.cjs');

// The steps every package declares in its own telemetry words (contracts/telemetry.json), read as
// data.
const WORDS = 'contracts/telemetry.json';
const declaredSteps = (p) => (fs.existsSync(path.join(p.dir, WORDS)) ? JSON.parse(fs.readFileSync(path.join(p.dir, WORDS), 'utf8')).steps ?? {} : {});
const LAYERS = ['steps', 'run'];

const named = (steps, base) => steps.some((s) => s === base || s.replace(/[._]/g, '-') === base || s.startsWith(`${base}.`) || s.startsWith(`${base}-`));
const filesOf = (dir) => LAYERS.flatMap((layer) => (fs.existsSync(path.join(dir, layer)) ? fs.readdirSync(path.join(dir, layer)).filter((f) => f.endsWith('.cjs')).map((f) => `${layer}/${f}`) : []));
function placedFiles(p) {
  const steps = Object.keys(declaredSteps(p));
  return filesOf(p.dir).map((file) => ({ at: `${p.name}/${file}`, own: named(steps, path.basename(file, '.cjs')), why: (p.owners.traceAs || {})[file] }));
}
const packages = loadPackages();
const held = packages; // every package found, so decisionbook and handoff are held too (their owners.json traceAs)

test('every steps/ and run/ file writes records of its own name, or its owners.json traceAs says where its work shows', () => {
  // the packages every tree holds; any other is held where it is on disk
  const must = ['kit', 'cli', 'decisionbook', 'handoff'];
  assert.ok(must.every((name) => held.some((p) => p.name === name)), 'the lock must see kit, cli, decisionbook and handoff, or it locks nothing there');
  const silent = held.flatMap(placedFiles).filter((f) => !f.own && !(typeof f.why === 'string' && f.why.trim())).map((f) => f.at);
  assert.deepEqual(silent, [], 'trace it under its name through kit traced(), or add one line to its package\'s owners.json traceAs');
});

test('no traceAs line is stale: each names a steps/ or run/ file that is there, in one non-empty line', () => {
  const stale = held.flatMap((p) => {
    const rows = placedFiles(p);
    return Object.entries(p.owners.traceAs || {}).filter(([file, why]) => !rows.some((r) => r.at === `${p.name}/${file}`) || !why.trim() || why.includes('\n')).map(([file]) => `${p.name}/${file}`);
  });
  assert.deepEqual(stale, []);
});
