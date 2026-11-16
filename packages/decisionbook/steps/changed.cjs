// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
const { hash: { sha256 } } = require('@atlasbound/kit');
const { isGuarded } = require('../core/gate.cjs');
const store = require('./store.cjs');

function guardedPolicy(io) {
  const { config, unreadable } = store.readPolicy(io);
  if (unreadable) return { off: 'policy-unreadable' };
  return config.protect.length + config.danger.length ? { config } : { off: 'gate-off' };
}

async function changedNow(io, config) {
  const keys = [...new Set((await io.git.statusZ()).flatMap((row) => [row.key, row.from]))].filter((key) => key && isGuarded(config, key));
  return Object.fromEntries(keys.map((key) => [key, io.fs.readText(key)]).map(([key, text]) => [key, text === null ? null : sha256(text)]));
}

const trackedNow = async (io) => (await io.git.lsFiles()).map((row) => row.key).filter(Boolean);

module.exports = { guardedPolicy, changedNow, trackedNow };
