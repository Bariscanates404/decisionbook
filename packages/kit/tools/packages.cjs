// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The one reader of packages/*/owners.json for every dev tool: a directory holding an owners.json is a package. Sorted, so kit's
// generators emit the same rules on every machine. Dev only.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
// The numbers every tool shares are kit's own data: the width of a line, a file's slack, the length of a why and of a test title.
const CAPS = require('../owners.json').caps;

function loadPackages(root = ROOT) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'node_modules' && fs.existsSync(path.join(root, e.name, 'owners.json')))
    .map((e) => e.name).sort()
    .map((name) => ({ name, dir: path.join(root, name), owners: JSON.parse(fs.readFileSync(path.join(root, name, 'owners.json'), 'utf8')) }));
}

/** A package's `files`, walked: what a tarball carries of it, tests and dev tools left out by the manifest itself. */
function shippedOf(dir, entries = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).files || []) {
  return entries.flatMap((entry) => {
    const at = path.join(dir, entry);
    if (!fs.existsSync(at)) return [];
    return fs.statSync(at).isDirectory() ? shippedOf(at, fs.readdirSync(at)).map((inner) => path.join(entry, inner)) : [entry];
  });
}

/** The value after a flag on a dev tool's command line, or undefined. */
const flagOf = (name, argv = process.argv.slice(2)) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);

/** The ONE switch of the rules a tree does not meet yet: kit's owners.json says `report`, and each tool then counts and does not fail. */
const reportOnly = (all) => all.some((p) => p.name === 'kit' && p.owners.newRules === 'report');

/** A file may grow to its budget plus the slack, never past the cap every file has. */
const roomOf = (budget) => Math.max(budget, Math.min(CAPS.file, Math.ceil(budget * (1 + CAPS.slack / 100))));

module.exports = { ROOT, CAPS, loadPackages, shippedOf, flagOf, reportOnly, roomOf };
