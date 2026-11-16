#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// dev-only: run a package's black-box suite, optionally against another implementation directory.
// Usage: node kit/tools/contract.cjs <package> [--impl <dir>]. The same file is the --require preload: it resolves @atlasbound/<package> to
// <dir>/index.cjs.
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const { CONTRACT_NAME: NAME, CONTRACT_IMPL: IMPL } = process.env;

if (require.main !== module) {
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function resolved(request, ...rest) {
    return request === `@atlasbound/${NAME}` ? path.join(IMPL, 'index.cjs') : resolve.call(this, request, ...rest);
  };
} else {
  const [name, , impl] = process.argv.slice(2);
  const dir = path.join(__dirname, '..', '..', name, 'contract');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.cjs')).map((f) => path.join(dir, f));
  const preload = impl ? ['--require', __filename] : [];
  const env = { ...process.env, CONTRACT_NAME: name, CONTRACT_IMPL: impl ? path.resolve(impl) : '' };
  const res = spawnSync(process.execPath, [...preload, '--test', ...files], { stdio: 'inherit', env });
  process.exit(res.status === null ? 1 : res.status);
}
