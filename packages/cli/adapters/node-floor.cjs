// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE door: the bin's first code, on a Node maybe too old to parse any other file, so it stays ES5 and loads nothing of ours; release.json
// is the one floor, and a tarball's manifest holds it four folders up (<package>/lib/node_modules/@atlasbound/cli).
var fs = require('fs');

var CLI = __dirname + '/..';
var manifest = CLI + (fs.existsSync(CLI + '/release.json') ? '/release.json' : '/../../../../package.json');
var found = fs.existsSync(manifest) && /"engines"\s*:\s*\{[^}]*"node"\s*:\s*"([^"]*)"/.exec(fs.readFileSync(manifest, 'utf8'));
var floor = found ? found[1] : null;
var need = /\d+/.exec(floor);
var have = process.versions.node;
if (need && parseInt(have, 10) < Number(need[0])) {
  var line = 'AtlasBound needs Node ' + need[0] + ' or newer; this is Node ' + have + '. Install it from https://nodejs.org, then run it again.';
  var hookRow = process.argv[2] === 'hook';
  process[hookRow ? 'stdout' : 'stderr'].write((hookRow ? JSON.stringify({ systemMessage: 'atlasbound: no verdict formed: ' + line }) : line) + '\n');
  process.exit(hookRow ? 0 : 1);
}

exports.floor = floor; // not `{ floor: floor }`: a minifier may shorten that to ES2015 shorthand, which a very old Node cannot parse
