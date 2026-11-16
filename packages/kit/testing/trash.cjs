// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// a test world leaves with ONE rename into one trash directory, never file by file: test churn is what feeds the host's file daemons.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** trash(dir) -> where it went, or null when it is already gone. Nothing is unlinked here; whoever owns the host empties the trash. */
function trash(dir) {
  if (!fs.existsSync(dir)) return null;
  const home = path.join(os.tmpdir(), 'atlasbound-test-trash');
  fs.mkdirSync(home, { recursive: true });
  const moved = path.join(home, `${process.pid}-${path.basename(dir)}`);
  fs.renameSync(dir, moved);
  return moved;
}

module.exports = { trash };
