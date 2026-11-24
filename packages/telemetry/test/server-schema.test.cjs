// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The server validates a report with a schema generated from the open descriptors. A word added to a descriptor without its `schema`
// raised, or a descriptor changed without the server's schema generated again, would make the server refuse what this client sends:
// where the server's module stands beside the packages (the product's own repository), its generator says whether both are in step.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GENERATOR = path.join(__dirname, '..', '..', '..', 'cloud', 'server', 'modules', 'telemetry', 'build-schema.cjs');
const here = fs.existsSync(GENERATOR);

test('the server\'s generated schema is the open descriptors\' as they stand: every changed word list raised its schema', { skip: !here && 'no server module beside the packages' }, () => {
  const checked = spawnSync(process.execPath, [GENERATOR, '--check'], { encoding: 'utf8' });
  assert.equal(checked.status, 0, `${checked.stderr.split('\n').find((line) => line.startsWith('Error')) ?? 'the generated schema is stale'}`
    + ': raise the descriptor\'s schema where its words changed, then run node cloud/server/modules/telemetry/build-schema.cjs');
});
