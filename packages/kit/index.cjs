// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// @atlasbound/kit, the public entry: the only file another package can reach; `io` is created once per process by the composition root.
const { createValidate } = require('./contracts/validate.cjs');
const { traced } = require('./run/traced.cjs');
const { createFs, scratch } = require('./io/fs.cjs');
const { createGit } = require('./io/git.cjs');
const { createTrace } = require('./io/trace.cjs');
const { createTracker } = require('./io/tracker.cjs');

module.exports = {
  hash: require('./base/hash.cjs'),
  canonical: require('./base/canonical.cjs'),
  sign: require('./base/sign.cjs'),
  errors: require('./base/errors.cjs'),
  paths: require('./base/paths.cjs'),
  glob: require('./base/glob.cjs'),
  createValidate,
  codes: require('./contracts/codes.cjs'),
  trace: require('./contracts/trace.cjs'),
  host: require('./contracts/host.cjs'),
  traced,
  lock: require('./run/lock.cjs'),
  child: require('./run/child.cjs'),
  person: require('./run/person.cjs'),
  store: require('./run/store.cjs'),
  scripts: require('./run/scripts.cjs'),
  said: { ...require('./text/said.cjs'), ...require('./text/said-words.cjs') },
  repo: require('./repo/file-role.cjs'),
  text: { lines: require('./base/text.cjs'), safe: require('./text/safe.cjs'), secrets: require('./text/secrets.cjs'),
    shell: { ...require('./text/shell.cjs'), ...require('./text/shell-named.cjs') } },
  debug: { load: require('./debug/load.cjs'), render: require('./debug/render.cjs') },
  io: { createFs, scratch, createGit, createTrace, createTracker, clock: require('./io/clock.cjs'), env: require('./io/env.cjs'),
    proc: { ...require('./io/proc.cjs'), ...require('./io/ps.cjs') } },
  get testing() {
    return { ...require('./testing/fake-io.cjs'), ...require('./testing/trash.cjs') };
  },
};
