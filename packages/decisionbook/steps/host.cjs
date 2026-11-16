// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The file an event names is the one the disk writes (kit's placeAt, the one place every gate reads), never the spelling: a
// case variant, `..`, a link or a hard link of a guarded file is no other path to a rung.
const { paths: { resolveFrom }, host: { WRITE_TOOLS } } = require('@atlasbound/kit');
const { isGuarded } = require('../core/gate.cjs');
const { guardedPolicy, trackedNow } = require('./changed.cjs');

/** The tracked files the policy guards: what a second name of a file is looked for among. */
async function guardedFiles(io) {
  const { config } = guardedPolicy(io);
  return config ? (await trackedNow(io)).filter((key) => isGuarded(config, key)) : [];
}

async function eventFile(event, io) {
  const input = event.tool_input || {};
  const given = input.file_path || input.notebook_path || '';
  return given ? io.fs.placeAt(event.cwd ? resolveFrom(event.cwd, given) : given, () => guardedFiles(io)) : null;
}

const writeTarget = async (event, io) => (Object.hasOwn(WRITE_TOOLS, event.tool_name) ? eventFile(event, io) : null);

// a folder a wired package declares the person's ({ dir, what, why, lowering, holds }; null: none), and how a person makes a file there
const guardOf = (io) => (typeof io.guarded === 'function' ? io.guarded() : null);
const guardWay = (io) => (typeof io.guardedWay === 'function' ? io.guardedWay() : null) || '';
// where a prompt's research goes first, in the words of the package whose answers it means; none where no such package is installed
const researchWhere = async (io, text) => (typeof io.research === 'function' ? await io.research(text) : null) || '';

module.exports = { eventFile, writeTarget, guardOf, guardWay, researchWhere };
