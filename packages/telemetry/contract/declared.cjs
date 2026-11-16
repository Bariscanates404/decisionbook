// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The telemetry words the packages of this tree declare (packages/*/contracts/telemetry.json), read as data from outside, as the cli hands
// them on an install (io.packageData): every package's here, or only those the npm package atlasbound ships.
const fs = require('node:fs');
const path = require('node:path');
const { io: kitIo, testing: { memoryFs, fixedClock } } = require('@atlasbound/kit');
const telemetry = require('@atlasbound/telemetry');

const PACKAGES = path.join(__dirname, '..', '..');
const FILE = 'contracts/telemetry.json';
const SHIPPED = ['cli', 'decisionbook', 'handoff', 'kit', 'telemetry'];

/** `{ name, text }` of every package here that declares its words; `shipped` keeps only those of the npm package. */
function declaredHere({ shipped = false } = {}) {
  return fs.readdirSync(PACKAGES).filter((name) => fs.existsSync(path.join(PACKAGES, name, FILE)))
    .filter((name) => !shipped || SHIPPED.includes(name))
    .map((name) => ({ name, text: fs.readFileSync(path.join(PACKAGES, name, FILE), 'utf8') }));
}
/** io.packageData over those rows: the one file every package may declare, nothing else. */
const packageDataOf = (rows) => (rel) => (rel === FILE ? rows : []);

/** The rules a preview judges by over these words, as telemetry's public preview returns them (an empty trace: nothing to fold). */
async function rulesOver(rows) {
  const [fs2, clock] = [memoryFs({}), fixedClock()];
  const trace = kitIo.createTrace({ fs: fs2, clock }).forPackage(telemetry.PKG, telemetry.vocabulary);
  const io = { fs: fs2, clock, home: memoryFs({}), trace, env: { get: () => null }, packageData: packageDataOf(rows) };
  return (await telemetry.preview(io, { run: 'rules', version: '1.0.0' })).rules;
}

/** telemetry's wall under those rules (filled by a test's before hook), the cap as the caller gives it. */
const redactUnder = (rules) => (raw, { cap } = {}) => telemetry.redact(raw, { rules, cap });

module.exports = { FILE, declaredHere, packageDataOf, rulesOver, redactUnder };
